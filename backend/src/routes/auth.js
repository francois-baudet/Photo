const router = require('express').Router();
const { login, logout, register, me } = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/logout
router.post('/logout', logout);

// POST /api/auth/register : création de compte avec une invitation
router.post('/register', register);

// GET /api/auth/me
router.get('/me', requireAuth, me);

module.exports = router;
