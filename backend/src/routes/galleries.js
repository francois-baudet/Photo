const router = require('express').Router();
const { attachUser } = require('../middlewares/auth');
const { listGalleries } = require('../services/galleries');

// GET /api/galleries : galeries visibles pour le rôle courant (anonyme = visiteur)
router.get('/', attachUser, async (req, res) => {
  const galleries = await listGalleries(req.user.role);
  res.json({ galleries });
});

// TODO : dépôt de photos (RAW), miniatures et aperçus, métadonnées

module.exports = router;
