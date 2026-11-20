// Galeries et dépôt de photos
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const router = require('express').Router();
const { query } = require('../db/pool');
const { attachUser, requireAuth, requirePermission, hasPermission } = require('../middlewares/auth');
const photos = require('../services/photos');

const VISIBILITIES = ['public', 'membres', 'concours', 'jury', 'admin'];
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 Mo par fichier RAW
const MAX_FILES = 50;

// Vérifie qu'un rôle (par son nom) voit un niveau de visibilité
async function roleSees(visibility, roleName) {
  const { rows } = await query(
    `SELECT 1 FROM visibility_access va JOIN roles r ON r.id = va.role_id
      WHERE va.visibility = $1 AND r.name = $2`,
    [visibility, roleName]
  );
  return rows.length > 0;
}

// Le propriétaire voit toujours sa galerie ; les autres selon la visibilité de leur rôle
async function canView(gallery, user) {
  if (user.id !== null && gallery.owner_id === user.id) return true;
  return roleSees(gallery.visibility, user.role);
}

// Écriture : propriétaire de la galerie, ou gestionnaire des utilisateurs
function canEdit(gallery, user) {
  return gallery.owner_id === user.id || hasPermission(user, 'user:manage');
}

async function loadGallery(id) {
  if (!Number.isInteger(id)) return null;
  const { rows } = await query('SELECT * FROM galleries WHERE id = $1', [id]);
  return rows[0] || null;
}

// Dépôt : propriétaire ou gestionnaire ; et, pour une galerie de concours, les membres invités
// tant que le concours n'est pas clos.
async function canUploadTo(gallery, user) {
  if (canEdit(gallery, user)) return true;
  if (gallery.kind !== 'concours' || user.id === null) return false;
  const { rows } = await query(
    `SELECT c.status,
            EXISTS (SELECT 1 FROM contest_members m WHERE m.contest_id = c.id AND m.user_id = $2) AS member
       FROM contests c WHERE c.gallery_id = $1`,
    [gallery.id, user.id]
  );
  return Boolean(rows[0] && rows[0].member && rows[0].status !== 'clos');
}

// GET /api/galleries : galeries visibles pour le rôle courant (anonyme = visiteur)
router.get('/', attachUser, async (req, res) => {
  const { rows } = await query(
    `SELECT g.id, g.title, g.visibility, g.kind, u.display_name AS author,
            c.id AS "contestId",
            (SELECT COUNT(*)::int FROM photos p WHERE p.gallery_id = g.id) AS "photoCount"
       FROM galleries g
       JOIN users u ON u.id = g.owner_id
       LEFT JOIN contests c ON c.gallery_id = g.id
       JOIN visibility_access va ON va.visibility = g.visibility
       JOIN roles r ON r.id = va.role_id AND r.name = $1
      WHERE g.kind = 'classique'
      ORDER BY g.created_at DESC`,
    [req.user.role]
  );
  res.json({ galleries: rows });
});

// POST /api/galleries  { title, visibility }
router.post('/', requireAuth, requirePermission('gallery:create'), async (req, res) => {
  const { title, visibility } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) {
    return res.status(400).json({ error: 'titre_invalide' });
  }
  if (!VISIBILITIES.includes(visibility)) {
    return res.status(400).json({ error: 'visibilite_invalide' });
  }
  const { rows } = await query(
    `INSERT INTO galleries (title, owner_id, visibility) VALUES ($1, $2, $3)
     RETURNING id, title, visibility`,
    [title.trim(), req.user.id, visibility]
  );
  res.status(201).json({ gallery: rows[0] });
});

// GET /api/galleries/:id : détail et photos (métadonnées selon les réglages)
router.get('/:id', attachUser, async (req, res) => {
  const gallery = await loadGallery(Number(req.params.id));
  if (!gallery || !(await canView(gallery, req.user))) {
    return res.status(404).json({ error: 'introuvable' });
  }

  const fields = await photos.visibleFields();
  const { rows } = await query(
    `SELECT p.id, p.title, p.owner_id, p.version, p.preview_path IS NOT NULL AS "hasPreview", m.data
       FROM photos p LEFT JOIN photo_metadata m ON m.photo_id = p.id
      WHERE p.gallery_id = $1
      ORDER BY p.created_at`,
    [gallery.id]
  );
  const editable = canEdit(gallery, req.user);
  const uploadable = await canUploadTo(gallery, req.user);
  const { rows: contest } = await query('SELECT id FROM contests WHERE gallery_id = $1', [gallery.id]);

  res.json({
    gallery: {
      id: gallery.id,
      title: gallery.title,
      visibility: gallery.visibility,
      kind: gallery.kind,
      contestId: contest[0] && gallery.kind === 'concours' ? contest[0].id : null,
      canEdit: editable,
      canUpload: uploadable && hasPermission(req.user, 'photo:upload'),
    },
    photos: rows.map(p => ({
      id: p.id,
      title: p.title,
      thumbUrl: p.hasPreview ? `/api/photos/${p.id}/thumb?v=${p.version}` : null,
      previewUrl: p.hasPreview ? `/api/photos/${p.id}/preview?v=${p.version}` : null,
      rawUrl: editable ? `/api/photos/${p.id}/raw` : null,
      canRotate: req.user.id !== null && (p.owner_id === req.user.id || hasPermission(req.user, 'user:manage')),
      canDelete: req.user.id !== null && (p.owner_id === req.user.id || hasPermission(req.user, 'user:manage')),
      metadata: photos.displayMetadata(p.data || {}, fields),
    })),
  });
});

// PATCH /api/galleries/:id  { title?, visibility? }
router.patch('/:id', requireAuth, async (req, res) => {
  const gallery = await loadGallery(Number(req.params.id));
  if (!gallery) return res.status(404).json({ error: 'introuvable' });
  if (!canEdit(gallery, req.user)) return res.status(403).json({ error: 'acces_refuse' });

  const { title, visibility } = req.body || {};
  if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.trim().length > 120)) {
    return res.status(400).json({ error: 'titre_invalide' });
  }
  if (visibility !== undefined && !VISIBILITIES.includes(visibility)) {
    return res.status(400).json({ error: 'visibilite_invalide' });
  }
  await query(
    'UPDATE galleries SET title = COALESCE($1, title), visibility = COALESCE($2, visibility) WHERE id = $3',
    [title ? title.trim() : null, visibility || null, gallery.id]
  );
  res.json({ ok: true });
});

// DELETE /api/galleries/:id : supprimer une galerie et ses photos (propriétaire ou gestionnaire)
// Une galerie de concours supprime aussi le concours et ses notes.
router.delete('/:id', requireAuth, async (req, res) => {
  const gallery = await loadGallery(Number(req.params.id));
  if (!gallery) return res.status(404).json({ error: 'introuvable' });
  if (!canEdit(gallery, req.user)) return res.status(403).json({ error: 'acces_refuse' });

  const { rows: files } = await query(
    'SELECT raw_path, preview_path, thumb_path FROM photos WHERE gallery_id = $1',
    [gallery.id]
  );
  await query('DELETE FROM galleries WHERE id = $1', [gallery.id]);
  await photos.deleteFiles(files.flatMap(f => [f.raw_path, f.preview_path, f.thumb_path]));
  res.json({ ok: true });
});

// ---------- Dépôt de photos ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(photos.ROOT, 'raw')),
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

// POST /api/galleries/:id/photos  (multipart, champ « files », RAW ou JPEG)
router.post(
  '/:id/photos',
  requireAuth,
  requirePermission('photo:upload'),
  async (req, res, next) => {
    const gallery = await loadGallery(Number(req.params.id));
    if (!gallery) return res.status(404).json({ error: 'introuvable' });
    if (!(await canUploadTo(gallery, req.user))) return res.status(403).json({ error: 'acces_refuse' });
    req.gallery = gallery;
    next();
  },
  (req, res, next) => {
    upload.array('files', MAX_FILES)(req, res, err => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'fichier_trop_volumineux' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: 'trop_de_fichiers' });
      next(err);
    });
  },
  async (req, res) => {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'aucun_fichier' });

    const imported = [];
    const rejected = [];
    for (const file of files) {
      try {
        imported.push(await photos.importPhoto({
          galleryId: req.gallery.id,
          ownerId: req.user.id,
          file,
        }));
      } catch (err) {
        if (err instanceof photos.PhotoError) {
          rejected.push({ name: file.originalname, error: err.code });
        } else {
          console.error(err);
          rejected.push({ name: file.originalname, error: 'traitement_echoue' });
        }
      }
    }
    res.status(201).json({ imported, rejected });
  }
);

module.exports = router;
module.exports.canView = canView;
module.exports.loadGallery = loadGallery;
