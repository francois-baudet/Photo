const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');

// POST /api/auth/login  { username, password }
async function login(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'identifiant_ou_mot_de_passe_manquant' });
  }

  const { rows } = await query(
    `SELECT u.id, u.username, u.display_name AS "displayName",
            u.password_hash, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.username = $1 AND u.active`,
    [username]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'identifiants_invalides' });
  }

  const token = jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '12h' });
  res.json({
    token,
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
  });
}

module.exports = { login };
