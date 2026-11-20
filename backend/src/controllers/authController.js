const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const { setSessionCookie, clearSessionCookie } = require('../middlewares/auth');

const USER_SELECT = `
  SELECT u.id, u.username, u.display_name AS "displayName", r.name AS role
    FROM users u JOIN roles r ON r.id = u.role_id`;

function sessionToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '12h' });
}

// POST /api/auth/login  { username, password }
async function login(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'identifiant_ou_mot_de_passe_manquant' });
  }

  const { rows } = await query(
    `SELECT u.id, u.password_hash, u.display_name AS "displayName", u.username, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.username = $1 AND u.active`,
    [username.trim()]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'identifiants_invalides' });
  }

  const token = sessionToken(user.id);
  setSessionCookie(res, token);
  res.json({
    token,
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
  });
}

// POST /api/auth/logout
function logout(req, res) {
  clearSessionCookie(res);
  res.status(204).end();
}

// POST /api/auth/register  { token, username, password, displayName }
// Création de compte par invitation uniquement.
async function register(req, res) {
  const { token, username, password, displayName } = req.body || {};
  if (typeof token !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'champs_manquants' });
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'identifiant_invalide' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'mot_de_passe_trop_court' });
  }
  const name = (typeof displayName === 'string' && displayName.trim()) || username;

  const { rows: invites } = await query(
    `SELECT id, role_id FROM invitations
      WHERE token = $1 AND used_at IS NULL AND expires_at > now()`,
    [token]
  );
  const invite = invites[0];
  if (!invite) {
    return res.status(400).json({ error: 'invitation_invalide' });
  }

  const hash = await bcrypt.hash(password, 10);
  let userId;
  try {
    const { rows } = await query(
      `INSERT INTO users (username, display_name, password_hash, role_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [username, name, hash, invite.role_id]
    );
    userId = rows[0].id;
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'identifiant_deja_pris' });
    throw err;
  }
  await query('UPDATE invitations SET used_at = now() WHERE id = $1', [invite.id]);

  res.status(201).json({ id: userId });
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ user: req.user });
}

module.exports = { login, logout, register, me, USER_SELECT };
