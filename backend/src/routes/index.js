// Point d'entrée des routes API, toutes préfixées par /api
const router = require('express').Router();

router.use('/auth', require('./auth'));
router.use('/galleries', require('./galleries'));
router.use('/contests', require('./contests'));
router.use('/posts', require('./posts'));
router.use('/admin', require('./admin'));

module.exports = router;
