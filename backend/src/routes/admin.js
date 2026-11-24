// Dashboard admin : utilisateurs, rôles et droits, invitations, visibilité, réglages.
// Chaque route exige une permission précise (voir db/migrations/003_permissions.sql).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const router = require('express').Router();
const config = require('../config');
const { query, withTransaction } = require('../db/pool');
const { requireAuth, requirePermission } = require('../middlewares/auth');

const VISIBILITIES = ['public', 'membres', 'concours', 'jury', 'admin'];
const SETTINGS_KEYS = ['club_name', 'metadata_fields'];
const PROTECTED_ROLES = ['admin', 'visiteur'];

const bad = (res, error) => res.status(400).json({ error });

router.use(requireAuth);

// ---------- Utilisateurs ----------
const { normalizeEmail } = require('../controllers/authController');

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const TEMP_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

// Mot de passe provisoire lisible, communiqué une seule fois à l'administrateur
function temporaryPassword() {
  return Array.from(crypto.randomBytes(12), b => TEMP_CHARS[b % TEMP_CHARS.length]).join('');
}

const USER_COLUMNS = `u.id, u.username, u.display_name AS "displayName", u.email, u.active,
            u.role_id AS "roleId", r.name AS role, u.must_change_password AS "mustChangePassword",
            u.created_at AS "createdAt"`;

// Traduit une violation d'unicité (identifiant ou e-mail déjà pris)
function userConflict(err, res) {
  if (err.code !== '23505') return false;
  res.status(409).json({ error: err.constraint === 'users_email_unique' ? 'email_deja_utilise' : 'identifiant_deja_pris' });
  return true;
}

router.get('/users', requirePermission('user:manage'), async (req, res) => {
  const { rows } = await query(
    `SELECT ${USER_COLUMNS} FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.username`
  );
  res.json({ users: rows });
});

// Création : mot de passe fourni ou généré ; le compte doit changer de mot de passe à la première connexion
router.post('/users', requirePermission('user:manage'), async (req, res) => {
  const { username, displayName, email, roleId, password } = req.body || {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) return bad(res, 'identifiant_invalide');
  const mail = normalizeEmail(email);
  if (mail === undefined) return bad(res, 'email_invalide');
  if (!Number.isInteger(roleId)) return bad(res, 'role_invalide');
  const given = typeof password === 'string' && password.length > 0;
  if (given && password.length < 8) return bad(res, 'mot_de_passe_trop_court');
  const clear = given ? password : temporaryPassword();
  try {
    const hash = await bcrypt.hash(clear, 10);
    const { rows } = await query(
      `INSERT INTO users (username, display_name, email, password_hash, role_id, must_change_password)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
      [username, (typeof displayName === 'string' && displayName.trim()) || username, mail, hash, roleId]
    );
    res.status(201).json({ id: rows[0].id, temporaryPassword: clear });
  } catch (err) {
    if (userConflict(err, res)) return;
    if (err.code === '23503') return bad(res, 'role_invalide');
    throw err;
  }
});

// Modification de tous les champs. Un mot de passe défini par l'administrateur oblige à le changer.
router.patch('/users/:id', requirePermission('user:manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'introuvable' });
  const body = req.body || {};
  const sets = [];
  const params = [];
  const set = (column, value) => { params.push(value); sets.push(`${column} = $${params.length}`); };

  if (body.username !== undefined) {
    if (typeof body.username !== 'string' || !USERNAME_RE.test(body.username)) return bad(res, 'identifiant_invalide');
    set('username', body.username);
  }
  if (body.displayName !== undefined) {
    if (typeof body.displayName !== 'string' || !body.displayName.trim()) return bad(res, 'nom_invalide');
    set('display_name', body.displayName.trim());
  }
  if (body.email !== undefined) {
    const mail = normalizeEmail(body.email);
    if (mail === undefined) return bad(res, 'email_invalide');
    set('email', mail);
  }
  if (body.roleId !== undefined) {
    if (!Number.isInteger(body.roleId)) return bad(res, 'role_invalide');
    set('role_id', body.roleId);
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return bad(res, 'valeur_invalide');
    set('active', body.active);
  }
  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < 8) return bad(res, 'mot_de_passe_trop_court');
    set('password_hash', await bcrypt.hash(body.password, 10));
    set('must_change_password', true);
  }
  if (!sets.length) return bad(res, 'rien_a_modifier');

  params.push(id);
  try {
    const { rowCount } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    if (!rowCount) return res.status(404).json({ error: 'introuvable' });
  } catch (err) {
    if (userConflict(err, res)) return;
    if (err.code === '23503') return bad(res, 'role_invalide');
    throw err;
  }
  res.json({ ok: true });
});

// Réinitialisation : mot de passe provisoire généré, à changer à la prochaine connexion
router.post('/users/:id/reset-password', requirePermission('user:manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'introuvable' });
  const clear = temporaryPassword();
  const hash = await bcrypt.hash(clear, 10);
  const { rowCount } = await query(
    'UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2',
    [hash, id]
  );
  if (!rowCount) return res.status(404).json({ error: 'introuvable' });
  res.json({ temporaryPassword: clear });
});

// ---------- Rôles et droits ----------
router.get('/permissions', requirePermission('role:manage'), async (req, res) => {
  const { rows } = await query('SELECT code, label FROM permissions ORDER BY code');
  res.json({ permissions: rows });
});

router.get('/roles', requirePermission('role:manage'), async (req, res) => {
  const { rows } = await query(
    `SELECT r.id, r.name, r.label,
            COALESCE(array_agg(p.code ORDER BY p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      GROUP BY r.id ORDER BY r.id`
  );
  res.json({ roles: rows });
});

router.post('/roles', requirePermission('role:manage'), async (req, res) => {
  const { name, label } = req.body || {};
  if (typeof name !== 'string' || !/^[a-z][a-z0-9_-]{1,31}$/.test(name)) return bad(res, 'nom_invalide');
  if (typeof label !== 'string' || !label.trim()) return bad(res, 'libelle_manquant');
  try {
    const { rows } = await query(
      'INSERT INTO roles (name, label) VALUES ($1, $2) RETURNING id', [name, label.trim()]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'role_existant' });
    throw err;
  }
});

router.patch('/roles/:id', requirePermission('role:manage'), async (req, res) => {
  const id = Number(req.params.id);
  const { label, permissions } = req.body || {};
  const { rows: found } = await query('SELECT name FROM roles WHERE id = $1', [id]);
  if (!found[0]) return res.status(404).json({ error: 'introuvable' });
  const isAdminRole = found[0].name === 'admin';

  if (typeof label === 'string' && label.trim()) {
    await query('UPDATE roles SET label = $1 WHERE id = $2', [label.trim(), id]);
  }

  if (Array.isArray(permissions)) {
    // Le rôle admin garde toujours tous ses droits, pour ne pas s'enfermer dehors
    if (isAdminRole) return bad(res, 'role_admin_protege');
    const { rows: known } = await query('SELECT id, code FROM permissions WHERE code = ANY($1)', [permissions]);
    if (known.length !== permissions.length) return bad(res, 'permission_inconnue');
    await withTransaction(async client => {
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      for (const p of known) {
        await client.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [id, p.id]);
      }
    });
  }
  res.json({ ok: true });
});

router.delete('/roles/:id', requirePermission('role:manage'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows: found } = await query('SELECT name FROM roles WHERE id = $1', [id]);
  if (!found[0]) return res.status(404).json({ error: 'introuvable' });
  if (PROTECTED_ROLES.includes(found[0].name)) return bad(res, 'role_protege');
  const { rows: used } = await query('SELECT count(*)::int AS n FROM users WHERE role_id = $1', [id]);
  if (used[0].n > 0) return bad(res, 'role_utilise');
  await query('DELETE FROM roles WHERE id = $1', [id]);
  res.json({ ok: true });
});

// ---------- Visibilité des galeries ----------
router.get('/visibility', requirePermission('role:manage'), async (req, res) => {
  const { rows } = await query('SELECT visibility, role_id AS "roleId" FROM visibility_access');
  const levels = VISIBILITIES.map(v => ({
    visibility: v,
    roleIds: rows.filter(r => r.visibility === v).map(r => r.roleId),
  }));
  res.json({ levels });
});

router.put('/visibility/:level', requirePermission('role:manage'), async (req, res) => {
  const level = req.params.level;
  const { roleIds } = req.body || {};
  if (!VISIBILITIES.includes(level)) return bad(res, 'visibilite_invalide');
  if (!Array.isArray(roleIds) || !roleIds.every(Number.isInteger)) return bad(res, 'roles_invalides');
  try {
    await withTransaction(async client => {
      await client.query('DELETE FROM visibility_access WHERE visibility = $1', [level]);
      for (const roleId of roleIds) {
        await client.query('INSERT INTO visibility_access (visibility, role_id) VALUES ($1, $2)', [level, roleId]);
      }
    });
  } catch (err) {
    if (err.code === '23503') return bad(res, 'role_invalide');
    throw err;
  }
  res.json({ ok: true });
});

// ---------- Invitations ----------
router.get('/invitations', requirePermission('invite:create'), async (req, res) => {
  const { rows } = await query(
    `SELECT i.id, i.token, r.name AS role, i.expires_at AS "expiresAt", i.used_at AS "usedAt"
       FROM invitations i JOIN roles r ON r.id = i.role_id
      ORDER BY i.id DESC LIMIT 50`
  );
  res.json({ invitations: rows });
});

router.post('/invitations', requirePermission('invite:create'), async (req, res) => {
  const { roleId } = req.body || {};
  if (!Number.isInteger(roleId)) return bad(res, 'role_invalide');
  const token = crypto.randomBytes(24).toString('hex');
  try {
    const { rows } = await query(
      `INSERT INTO invitations (token, role_id, created_by, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(days => $4))
       RETURNING expires_at AS "expiresAt"`,
      [token, roleId, req.user.id, config.invitationDays]
    );
    res.status(201).json({ token, path: `/pages/register.html?token=${token}`, expiresAt: rows[0].expiresAt });
  } catch (err) {
    if (err.code === '23503') return bad(res, 'role_invalide');
    throw err;
  }
});

router.delete('/invitations/:id', requirePermission('invite:create'), async (req, res) => {
  await query('DELETE FROM invitations WHERE id = $1 AND used_at IS NULL', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---------- Réglages ----------
router.get('/settings', requirePermission('settings:manage'), async (req, res) => {
  const { rows } = await query('SELECT key, value FROM settings');
  res.json({ settings: Object.fromEntries(rows.map(r => [r.key, r.value])) });
});

router.put('/settings/:key', requirePermission('settings:manage'), async (req, res) => {
  const key = req.params.key;
  if (!SETTINGS_KEYS.includes(key)) return bad(res, 'reglage_inconnu');
  const value = req.body ? req.body.value : undefined;
  if (value === undefined) return bad(res, 'valeur_manquante');
  if (key === 'metadata_fields' && (!Array.isArray(value) || !value.every(v => typeof v === 'string'))) {
    return bad(res, 'valeur_invalide');
  }
  if (key === 'club_name' && (typeof value !== 'string' || !value.trim())) return bad(res, 'valeur_invalide');
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
  res.json({ ok: true });
});

module.exports = router;
