const router = require('express').Router();

// Billets de la landing page : à implémenter (lecture publique, édition admin).
router.use((req, res) => res.status(501).json({ error: 'a_venir' }));

module.exports = router;
