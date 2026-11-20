// Fichiers photo : miniature, aperçu, RAW. Contrôle de visibilité via la galerie.
const router = require('express').Router();
const { query } = require('../db/pool');
const { attachUser, requireAuth, hasPermission } = require('../middlewares/auth');
const { canView, loadGallery } = require('./galleries');
const photos = require('../services/photos');

const KINDS = { thumb: 'thumb_path', preview: 'preview_path', raw: 'raw_path' };

// GET /api/photos/mine : mes photos, pour les inscrire à un concours
router.get('/mine', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.title, g.title AS "galleryTitle", p.thumb_path IS NOT NULL AS "hasThumb"
       FROM photos p JOIN galleries g ON g.id = p.gallery_id
      WHERE p.owner_id = $1 ORDER BY p.id DESC`,
    [req.user.id]
  );
  res.json({
    photos: rows.map(p => ({
      id: p.id,
      title: p.title,
      galleryTitle: p.galleryTitle,
      thumbUrl: p.hasThumb ? `/api/photos/${p.id}/thumb` : null,
    })),
  });
});

// GET /api/photos/:id/info : métadonnées affichées (réglages du dashboard), selon la visibilité de la galerie
router.get('/:id/info', attachUser, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'introuvable' });

  const { rows } = await query(
    `SELECT p.gallery_id, p.title, m.data
       FROM photos p LEFT JOIN photo_metadata m ON m.photo_id = p.id
      WHERE p.id = $1`,
    [id]
  );
  const photo = rows[0];
  if (!photo) return res.status(404).json({ error: 'introuvable' });
  const gallery = await loadGallery(photo.gallery_id);
  if (!gallery || !(await canView(gallery, req.user))) return res.status(404).json({ error: 'introuvable' });

  const fields = await photos.visibleFields();
  res.json({ title: photo.title, metadata: photos.displayMetadata(photo.data || {}, fields) });
});

// GET /api/photos/:id/:kind  (kind = thumb | preview | raw)
router.get('/:id/:kind', attachUser, async (req, res) => {
  const id = Number(req.params.id);
  const column = KINDS[req.params.kind];
  if (!Number.isInteger(id) || !column) return res.status(404).json({ error: 'introuvable' });

  const { rows } = await query(
    `SELECT p.gallery_id, p.owner_id, p.${column} AS file FROM photos p WHERE p.id = $1`,
    [id]
  );
  const photo = rows[0];
  if (!photo || !photo.file) return res.status(404).json({ error: 'introuvable' });

  const gallery = await loadGallery(photo.gallery_id);
  if (!gallery) return res.status(404).json({ error: 'introuvable' });

  if (req.params.kind === 'raw') {
    // Le RAW n'est téléchargeable que par le propriétaire de la galerie ou un gestionnaire
    const allowed = gallery.owner_id === req.user.id || req.user.permissions.includes('user:manage');
    if (!allowed) return res.status(403).json({ error: 'acces_refuse' });
  } else if (!(await canView(gallery, req.user))) {
    return res.status(404).json({ error: 'introuvable' });
  }

  res.set('Cache-Control', req.params.kind === 'raw' ? 'private, no-store' : 'private, max-age=3600');
  res.sendFile(photos.absolutePath(photo.file), err => {
    if (err && !res.headersSent) res.status(404).json({ error: 'fichier_introuvable' });
  });
});

// POST /api/photos/:id/rotate  { direction: "cw" | "ccw" }  (propriétaire ou gestionnaire)
router.post('/:id/rotate', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'introuvable' });
  const direction = req.body && req.body.direction;
  if (direction !== 'cw' && direction !== 'ccw') return res.status(400).json({ error: 'sens_invalide' });

  const { rows } = await query(
    'SELECT owner_id, preview_path, thumb_path FROM photos WHERE id = $1', [id]);
  const photo = rows[0];
  if (!photo) return res.status(404).json({ error: 'introuvable' });
  if (photo.owner_id !== req.user.id && !hasPermission(req.user, 'user:manage')) {
    return res.status(403).json({ error: 'acces_refuse' });
  }
  if (!photo.preview_path) return res.status(400).json({ error: 'pas_d_apercu' });

  await photos.rotateFiles([photo.preview_path, photo.thumb_path], direction === 'cw' ? 90 : 270);
  const { rows: updated } = await query(
    'UPDATE photos SET version = version + 1 WHERE id = $1 RETURNING version', [id]);
  res.json({ ok: true, version: updated[0].version });
});

// DELETE /api/photos/:id : supprimer une photo (propriétaire ou gestionnaire des utilisateurs)
router.delete('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'introuvable' });

  const { rows } = await query(
    'SELECT owner_id, raw_path, preview_path, thumb_path FROM photos WHERE id = $1',
    [id]
  );
  const photo = rows[0];
  if (!photo) return res.status(404).json({ error: 'introuvable' });
  if (photo.owner_id !== req.user.id && !hasPermission(req.user, 'user:manage')) {
    return res.status(403).json({ error: 'acces_refuse' });
  }

  // Les métadonnées et les notes partent avec la photo (suppression en cascade)
  await query('DELETE FROM photos WHERE id = $1', [id]);
  await photos.deleteFiles([photo.raw_path, photo.preview_path, photo.thumb_path]);
  res.json({ ok: true });
});

module.exports = router;
