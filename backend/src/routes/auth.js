const router = require('express').Router();
const { login } = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

// POST /api/auth/login
router.post('/login', login);

// GET /api/auth/me : utilisateur connecté
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
