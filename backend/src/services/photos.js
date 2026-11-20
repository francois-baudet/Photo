// Import des photos : fichier RAW ou JPEG sur disque, métadonnées (exiftool),
// aperçu 1200 px et miniature 300 px (sharp).
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sharp = require('sharp');
const config = require('../config');
const { query } = require('../db/pool');

const execFileP = promisify(execFile);

// Racine du stockage : tout chemin en base est relatif à cette racine
const ROOT = path.resolve(config.storageDir);
const PREVIEW_WIDTH = 1200;
const THUMB_WIDTH = 300;

// Formats acceptés : RAW des marques courantes + DNG (Adobe, DxO) + JPEG
const ACCEPTED_EXTENSIONS = new Set([
  '.nef', '.nrw',           // Nikon
  '.cr2', '.cr3', '.crw',   // Canon
  '.arw', '.sr2', '.srf',   // Sony
  '.raf',                   // Fujifilm
  '.dng',                   // Adobe / DxO
  '.orf', '.rw2', '.pef',   // Olympus, Panasonic, Pentax
  '.jpg', '.jpeg',
]);
const JPEG_EXTENSIONS = new Set(['.jpg', '.jpeg']);

class PhotoError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

async function ensureStorage() {
  for (const dir of ['raw', 'previews', 'thumbs']) {
    await fs.mkdir(path.join(ROOT, dir), { recursive: true });
  }
}

function absolutePath(relative) {
  return path.join(ROOT, relative);
}

function isAccepted(filename) {
  return ACCEPTED_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

// Métadonnées complètes lues par exiftool (toutes marques, RAW et DNG inclus)
async function readMetadata(file) {
  try {
    const { stdout } = await execFileP(
      'exiftool', ['-j', '-s', '-api', 'largefilesupport=1', file],
      { maxBuffer: 20 * 1024 * 1024 }
    );
    const [meta] = JSON.parse(stdout);
    delete meta.SourceFile;
    return meta || {};
  } catch {
    return {};
  }
}

// Aperçu JPEG embarqué dans le RAW (le plus grand disponible)
async function extractEmbeddedJpeg(file) {
  for (const tag of ['-PreviewImage', '-JpgFromRaw', '-ThumbnailImage']) {
    try {
      const { stdout } = await execFileP('exiftool', ['-b', tag, file], {
        encoding: 'buffer',
        maxBuffer: 100 * 1024 * 1024,
      });
      if (stdout && stdout.length > 10 * 1024) return stdout;
    } catch {
      // balise absente : on essaie la suivante
    }
  }
  return null;
}

// Valeurs prêtes à afficher pour les champs choisis dans le dashboard admin
const DISPLAY_FIELDS = {
  camera: m => [m.Make, m.Model].filter(Boolean).join(' ') || null,
  lens: m => m.LensModel || m.Lens || null,
  iso: m => m.ISO ?? null,
  aperture: m => (m.FNumber ? `f/${m.FNumber}` : null),
  shutter: m => m.ExposureTime ?? null,
  focal_length: m => m.FocalLength ?? null,
  date: m => m.DateTimeOriginal || m.CreateDate || null,
};

function displayMetadata(meta, fields) {
  const out = {};
  for (const field of fields) {
    if (DISPLAY_FIELDS[field]) out[field] = DISPLAY_FIELDS[field](meta);
  }
  return out;
}

// Importe un fichier déjà écrit par multer dans storage/raw
async function importPhoto({ galleryId, ownerId, file }) {
  if (!isAccepted(file.originalname)) {
    await fs.rm(file.path, { force: true });
    throw new PhotoError('format_non_accepte');
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const title = path.parse(file.originalname).name;
  const rawRelative = path.relative(ROOT, file.path);
  const meta = await readMetadata(file.path);

  let source = await extractEmbeddedJpeg(file.path);
  if (!source && JPEG_EXTENSIONS.has(ext)) source = await fs.readFile(file.path);

  const { rows } = await query(
    `INSERT INTO photos (gallery_id, owner_id, title, raw_path)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [galleryId, ownerId, title, rawRelative]
  );
  const photoId = rows[0].id;

  await query(
    `INSERT INTO photo_metadata (photo_id, data) VALUES ($1, $2)`,
    [photoId, JSON.stringify(meta)]
  );

  if (source) {
    const previewRelative = `previews/${photoId}.jpg`;
    const thumbRelative = `thumbs/${photoId}.jpg`;
    await sharp(source).rotate()
      .resize({ width: PREVIEW_WIDTH, height: PREVIEW_WIDTH, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(absolutePath(previewRelative));
    await sharp(source).rotate()
      .resize({ width: THUMB_WIDTH, height: THUMB_WIDTH, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(absolutePath(thumbRelative));
    await query(
      'UPDATE photos SET preview_path = $1, thumb_path = $2 WHERE id = $3',
      [previewRelative, thumbRelative, photoId]
    );
  }

  return { id: photoId, title, hasPreview: Boolean(source) };
}

// Métadonnées affichées, selon les réglages du dashboard admin
async function visibleFields() {
  const { rows } = await query("SELECT value FROM settings WHERE key = 'metadata_fields'");
  return rows[0] ? rows[0].value : [];
}

// Supprime les fichiers (chemins relatifs à la racine du stockage) ; ignore ceux qui n'existent plus
async function deleteFiles(relativePaths) {
  for (const rel of relativePaths.filter(Boolean)) {
    await fs.rm(absolutePath(rel), { force: true }).catch(() => {});
  }
}

// Fait pivoter l'aperçu et la miniature stockés (le RAW d'origine n'est pas modifié)
async function rotateFiles(relativePaths, angle) {
  for (const rel of relativePaths.filter(Boolean)) {
    const file = absolutePath(rel);
    const buffer = await sharp(file).rotate(angle).toBuffer();
    await fs.writeFile(file, buffer);
  }
}

module.exports = {
  PhotoError,
  deleteFiles,
  rotateFiles,
  ROOT,
  ensureStorage,
  absolutePath,
  importPhoto,
  displayMetadata,
  visibleFields,
};
