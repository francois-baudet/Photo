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
router.get('/users', requirePermission('user:manage'), async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.username, u.display_name AS "displayName", u.active,
            u.role_id AS "roleId", r.name AS role, u.created_at AS "createdAt"
       FROM users u JOIN roles r ON r.id = u.role_id
      ORDER BY u.username`
  );
  res.json({ users: rows });
});

router.post('/users', requirePermission('user:manage'), async (req, res) => {
  const { username, displayName, password, roleId } = req.body || {};
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return bad(res, 'identifiant_invalide');
  if (typeof password !== 'string' || password.length < 8) return bad(res, 'mot_de_passe_trop_court');
  if (!Number.isInteger(roleId)) return bad(res, 'role_invalide');
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO users (username, display_name, password_hash, role_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [username, (displayName || username).trim(), hash, roleId]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'identifiant_deja_pris' });
    if (err.code === '23503') return bad(res, 'role_invalide');
    throw err;
  }
});

router.patch('/users/:id', requirePermission('user:manage'), async (req, res) => {
  const id = Number(req.params.id);
  const { displayName, roleId, active, password } = req.body || {};
  const sets = [];
  const params = [];
  if (typeof displayName === 'string' && displayName.trim()) {
    params.push(displayName.trim()); sets.push(`display_name = $${params.length}`);
  }
  if (Number.isInteger(roleId)) {
    params.push(roleId); sets.push(`role_id = $${params.length}`);
  }
  if (typeof active === 'boolean') {
    params.push(active); sets.push(`active = $${params.length}`);
  }
  if (typeof password === 'string') {
    if (password.length < 8) return bad(res, 'mot_de_passe_trop_court');
    params.push(await bcrypt.hash(password, 10)); sets.push(`password_hash = $${params.length}`);
  }
  if (!sets.length) return bad(res, 'rien_a_modifier');

  params.push(id);
  try {
    const { rowCount } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    if (!rowCount) return res.status(404).json({ error: 'introuvable' });
  } catch (err) {
    if (err.code === '23503') return bad(res, 'role_invalide');
    throw err;
  }
  res.json({ ok: true });
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
