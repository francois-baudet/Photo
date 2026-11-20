const router = require('express').Router();
const { login, logout, register, me, changePassword } = require('../controllers/authController');
const { requireAccount } = require('../middlewares/auth');

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/logout
router.post('/logout', logout);

// POST /api/auth/register : création de compte avec une invitation
router.post('/register', register);

// GET /api/auth/me (accessible même si le changement de mot de passe est requis)
router.get('/me', requireAccount, me);

// POST /api/auth/change-password (idem)
router.post('/change-password', requireAccount, changePassword);

module.exports = router;
