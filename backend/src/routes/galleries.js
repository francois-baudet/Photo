const router = require('express').Router();
const { attachUser, requireAuth, requireRole } = require('../middlewares/auth');
const { VISIBILITIES, listGalleries, createGallery } = require('../services/galleries');

// GET /api/galleries : galeries visibles pour le rôle courant (anonyme = visiteur)
router.get('/', attachUser, async (req, res) => {
  const galleries = await listGalleries(req.user.role);
  res.json({ galleries });
});

// POST /api/galleries : créer une galerie (membres et admins)
router.post('/', requireAuth, requireRole('admin', 'membre'), async (req, res) => {
  const { title, visibility } = req.body || {};
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) {
    return res.status(400).json({ error: 'titre_invalide' });
  }
  if (!VISIBILITIES.includes(visibility)) {
    return res.status(400).json({ error: 'visibilite_invalide' });
  }
  const gallery = await createGallery({
    ownerId: req.user.id,
    title: title.trim(),
    visibility,
  });
  res.status(201).json({ gallery });
});

// TODO : dépôt de photos (RAW), miniatures et aperçus, métadonnées

module.exports = router;
