// Authentification par JWT. Le rôle est relu en base à chaque requête,
// pour qu'un changement de rôle par l'admin prenne effet tout de suite.
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');

// Utilisateur non connecté : il a le rôle « visiteur »
const ANONYMOUS = { id: null, username: null, displayName: null, role: 'visiteur' };

function bearerToken(req) {
  const header = req.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Renseigne req.user (anonyme si pas de token)
async function attachUser(req, res, next) {
  req.user = ANONYMOUS;

  const token = bearerToken(req);
  if (!token) return next();

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return res.status(401).json({ error: 'token_invalide' });
  }

  const { rows } = await query(
    `SELECT u.id, u.username, u.display_name AS "displayName", r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND u.active`,
    [payload.sub]
  );
  if (!rows[0]) {
    return res.status(401).json({ error: 'utilisateur_inactif' });
  }

  req.user = rows[0];
  next();
}

// Refuse les visiteurs anonymes
function checkLoggedIn(req, res, next) {
  if (req.user.id === null) {
    return res.status(401).json({ error: 'non_connecte' });
  }
  next();
}

// Pour les routes protégées : utiliser `router.use(requireAuth)` ou `router.get(path, requireAuth, handler)`
const requireAuth = [attachUser, checkLoggedIn];

// À utiliser après requireAuth. Les rôles sont comparés par leur nom.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'acces_refuse' });
    }
    next();
  };
}

module.exports = { attachUser, requireAuth, requireRole };
