const router = require('express').Router();
const { requireAuth, requireRole } = require('../middlewares/auth');

// Dashboard admin : réglages, rôles, droits de visibilité, invitations.
// Réservé au rôle admin. À implémenter.
router.use(requireAuth, requireRole('admin'));
router.use((req, res) => res.status(501).json({ error: 'a_venir' }));

module.exports = router;
