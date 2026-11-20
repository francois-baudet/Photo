const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const { setSessionCookie, clearSessionCookie } = require('../middlewares/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sessionToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '12h' });
}

// Adresse optionnelle : '' ou absente -> null. Renvoie undefined si invalide.
function normalizeEmail(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const email = value.trim();
  if (email.length > 254 || !EMAIL_RE.test(email)) return undefined;
  return email;
}

// POST /api/auth/login  { username, password }
async function login(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'identifiant_ou_mot_de_passe_manquant' });
  }

  const { rows } = await query(
    `SELECT u.id, u.username, u.email, u.password_hash, u.display_name AS "displayName",
            u.must_change_password AS "mustChangePassword", r.name AS role
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
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  });
}

// POST /api/auth/logout
function logout(req, res) {
  clearSessionCookie(res);
  res.status(204).end();
}

// POST /api/auth/register  { token, username, password, displayName, email? }
// Création de compte par invitation uniquement.
async function register(req, res) {
  const { token, username, password, displayName, email } = req.body || {};
  if (typeof token !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'champs_manquants' });
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'identifiant_invalide' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'mot_de_passe_trop_court' });
  }
  const mail = normalizeEmail(email);
  if (mail === undefined) return res.status(400).json({ error: 'email_invalide' });
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
      `INSERT INTO users (username, display_name, email, password_hash, role_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [username, name, mail, hash, invite.role_id]
    );
    userId = rows[0].id;
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: err.constraint === 'users_email_unique' ? 'email_deja_utilise' : 'identifiant_deja_pris' });
    }
    throw err;
  }
  await query('UPDATE invitations SET used_at = now() WHERE id = $1', [invite.id]);

  res.status(201).json({ id: userId });
}

// GET /api/auth/me
async function me(req, res) {
  res.json({ user: req.user });
}

// POST /api/auth/change-password  { currentPassword, newPassword }
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'champs_manquants' });
  }
  if (newPassword.length < 8) return res.status(400).json({ error: 'mot_de_passe_trop_court' });
  if (newPassword === currentPassword) return res.status(400).json({ error: 'mot_de_passe_identique' });

  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    return res.status(400).json({ error: 'mot_de_passe_actuel_incorrect' });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await query(
    'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
    [hash, req.user.id]
  );
  res.json({ ok: true });
}

module.exports = { login, logout, register, me, changePassword, normalizeEmail, EMAIL_RE };
