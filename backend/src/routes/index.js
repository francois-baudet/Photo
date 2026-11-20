// Point d'entrée des routes API, toutes préfixées par /api
const router = require('express').Router();
const { query } = require('../db/pool');

router.use('/auth', require('./auth'));
router.use('/galleries', require('./galleries'));
router.use('/photos', require('./photos'));
router.use('/contests', require('./contests'));
router.use('/posts', require('./posts'));
router.use('/admin', require('./admin'));

// GET /api/site : réglages publics (nom du club)
router.get('/site', async (req, res) => {
  const { rows } = await query("SELECT value FROM settings WHERE key = 'club_name'");
  res.json({ clubName: rows[0] ? rows[0].value : 'Club photo' });
});

module.exports = router;
