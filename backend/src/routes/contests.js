const router = require('express').Router();
const { requireAuth } = require('../middlewares/auth');

// Routes concours : à implémenter (création, invitations, notes, classements).
// Pour l'instant, toute route répond 501.
router.use(requireAuth);
router.use((req, res) => res.status(501).json({ error: 'a_venir' }));

module.exports = router;
