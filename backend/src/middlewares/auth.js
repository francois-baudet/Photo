// Authentification : session par cookie HttpOnly (navigateur) ou en-tête Authorization Bearer (API).
// Le rôle et les permissions sont relus en base à chaque requête : un changement fait par l'admin
// prend effet tout de suite.
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');

const COOKIE_NAME = 'photo_session';
const COOKIE_MAX_AGE = 12 * 60 * 60; // secondes

// Utilisateur non connecté : rôle « visiteur », sans identifiant
const ANONYMOUS = { id: null, username: null, displayName: null, email: null, role: 'visiteur', permissions: [], mustChangePassword: false };

function readCookie(req, name) {
  const header = req.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function tokenFromRequest(req) {
  const header = req.get('Authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return readCookie(req, COOKIE_NAME);
}

function setSessionCookie(res, token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE}`,
  ];
  if (config.cookieSecure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// Renseigne req.user (anonyme si pas de session valide)
async function attachUser(req, res, next) {
  req.user = ANONYMOUS;

  const token = tokenFromRequest(req);
  if (!token) return next();

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'session_invalide' });
  }

  const { rows } = await query(
    `SELECT u.id, u.username, u.display_name AS "displayName", u.email, u.must_change_password AS "mustChangePassword",
            r.id AS "roleId", r.name AS role,
            COALESCE(
              (SELECT array_agg(p.code ORDER BY p.code)
                 FROM role_permissions rp
                 JOIN permissions p ON p.id = rp.permission_id
                WHERE rp.role_id = r.id),
              '{}') AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND u.active`,
    [payload.sub]
  );
  if (!rows[0]) {
    clearSessionCookie(res);
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

// Pour les routes protégées : router.use(requireAuth) ou router.get(path, requireAuth, handler)
// Tant que le mot de passe provisoire n'est pas changé, seules les routes de compte sont accessibles
function blockIfMustChange(req, res, next) {
  if (req.user.mustChangePassword) {
    return res.status(403).json({ error: 'changement_mot_de_passe_requis' });
  }
  next();
}

const requireAuth = [attachUser, checkLoggedIn, blockIfMustChange];
// Pour les routes de compte (profil, changement de mot de passe) : accessibles même si le changement est requis
const requireAccount = [attachUser, checkLoggedIn];

function hasPermission(user, code) {
  return Array.isArray(user.permissions) && user.permissions.includes(code);
}

// Exige toutes les permissions listées. À utiliser après requireAuth.
function requirePermission(...codes) {
  return (req, res, next) => {
    if (!codes.every(code => hasPermission(req.user, code))) {
      return res.status(403).json({ error: 'acces_refuse' });
    }
    next();
  };
}

module.exports = {
  ANONYMOUS,
  attachUser,
  requireAuth,
  requireAccount,
  requirePermission,
  hasPermission,
  setSessionCookie,
  clearSessionCookie,
};
