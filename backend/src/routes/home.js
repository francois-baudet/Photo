// Page d'accueil modulaire.
//  - Grille : nombre de colonnes et hauteur d'une case (réglage « home_grid »).
//  - Modules : chacun occupe une zone (x, y, w, h en cases) et a ses propres réglages (params).
//    Types : calendrier, carrousel (dernières photos visibles), billet (un billet choisi),
//    billets (liste récente), texte (libre).
//  - Évènements : alimentent le calendrier (permission post:manage).
// Règles : aucun module ne sort de la grille, et deux modules activés ne se chevauchent jamais.
const router = require('express').Router();
const { query } = require('../db/pool');
const { attachUser, requireAuth, requirePermission } = require('../middlewares/auth');

const TYPES = ['calendrier', 'carrousel', 'billet', 'billets', 'texte'];
const DEFAULT_GRID = { columns: 12, rowHeight: 80 };
const MAX_ROWS = 60;

const bad = (res, error) => res.status(400).json({ error });
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

async function loadGrid() {
  const { rows } = await query("SELECT value FROM settings WHERE key = 'home_grid'");
  const v = rows[0] ? rows[0].value : {};
  return {
    columns: isInt(v.columns, 1, 24) ? v.columns : DEFAULT_GRID.columns,
    rowHeight: isInt(v.rowHeight, 40, 200) ? v.rowHeight : DEFAULT_GRID.rowHeight,
  };
}

async function loadModules() {
  const { rows } = await query(
    'SELECT id, type, enabled, x, y, w, h, params FROM home_modules ORDER BY y, x, id'
  );
  return rows;
}

// Réglages propres à chaque type. Renvoie { params } ou { error }.
function checkParams(type, input) {
  const p = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  if (p.titre !== undefined && p.titre !== null) {
    if (typeof p.titre !== 'string' || p.titre.length > 80) return { error: 'titre_module_invalide' };
    if (p.titre.trim()) out.titre = p.titre.trim();
  }
  const nombre = (min, max, def) => {
    const n = p.nombre === undefined ? def : p.nombre;
    if (!isInt(n, min, max)) return { error: 'nombre_invalide' };
    out.nombre = n;
    return null;
  };
  switch (type) {
    case 'calendrier': {
      const err = nombre(1, 10, 5); if (err) return err;
      break;
    }
    case 'carrousel': {
      const err = nombre(1, 20, 8); if (err) return err;
      const intervalle = p.intervalle === undefined ? 6 : p.intervalle;
      if (!isInt(intervalle, 3, 60)) return { error: 'intervalle_invalide' };
      out.intervalle = intervalle;
      break;
    }
    case 'billets': {
      const err = nombre(1, 10, 3); if (err) return err;
      break;
    }
    case 'billet': {
      if (p.postId !== undefined && p.postId !== null && !isInt(p.postId, 1, 2147483647)) {
        return { error: 'billet_invalide' };
      }
      out.postId = p.postId ?? null; // null : le dernier billet publié
      break;
    }
    case 'texte': {
      if (p.contenu !== undefined && (typeof p.contenu !== 'string' || p.contenu.length > 5000)) {
        return { error: 'contenu_invalide' };
      }
      out.contenu = p.contenu || '';
      break;
    }
  }
  return { params: out };
}

// Vérifie que tous les modules tiennent dans la grille, et qu'aucun module activé ne chevauche un autre.
// Renvoie un code d'erreur ou null.
function layoutError(modules, columns) {
  for (const m of modules) {
    if (m.x + m.w > columns) return 'hors_grille';
    if (m.y + m.h > MAX_ROWS) return 'hors_grille';
  }
  const on = modules.filter(m => m.enabled);
  for (let i = 0; i < on.length; i++) {
    for (let j = i + 1; j < on.length; j++) {
      const a = on[i];
      const b = on[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return 'chevauchement';
    }
  }
  return null;
}

// Données d'un module pour la page publique
async function moduleData(m, user) {
  if (m.type === 'calendrier') {
    const { rows } = await query(
      `SELECT id, title, starts_at AS "startsAt", ends_at AS "endsAt", location
         FROM events
        WHERE starts_at >= date_trunc('month', now()) AND starts_at < now() + interval '6 months'
        ORDER BY starts_at LIMIT 200`
    );
    return { events: rows };
  }
  if (m.type === 'carrousel') {
    // Mêmes règles que la galerie : photos des galeries visibles pour le rôle courant, ou dont on est propriétaire
    const { rows } = await query(
      `SELECT p.id, p.title, g.title AS "galleryTitle"
         FROM photos p
         JOIN galleries g ON g.id = p.gallery_id AND g.kind = 'classique'
        WHERE p.preview_path IS NOT NULL
          AND (g.owner_id = $2 OR EXISTS (
                SELECT 1 FROM visibility_access va JOIN roles r ON r.id = va.role_id
                 WHERE va.visibility = g.visibility AND r.name = $1))
        ORDER BY p.created_at DESC
        LIMIT $3`,
      [user.role, user.id, m.params.nombre || 8]
    );
    return {
      photos: rows.map(p => ({
        id: p.id,
        title: p.title,
        galleryTitle: p.galleryTitle,
        thumbUrl: `/api/photos/${p.id}/thumb`,
        previewUrl: `/api/photos/${p.id}/preview`,
      })),
    };
  }
  if (m.type === 'billets') {
    const { rows } = await query(
      `SELECT p.id, p.title, p.body, p.published_at AS "publishedAt", u.display_name AS author
         FROM posts p JOIN users u ON u.id = p.author_id
        WHERE p.published
        ORDER BY p.published_at DESC NULLS LAST, p.id DESC
        LIMIT $1`,
      [m.params.nombre || 3]
    );
    return { posts: rows };
  }
  if (m.type === 'billet') {
    const { rows } = await query(
      `SELECT p.id, p.title, p.body, p.published_at AS "publishedAt", u.display_name AS author
         FROM posts p JOIN users u ON u.id = p.author_id
        WHERE p.published AND ($1::int IS NULL OR p.id = $1)
        ORDER BY p.published_at DESC NULLS LAST, p.id DESC
        LIMIT 1`,
      [m.params.postId ?? null]
    );
    return { post: rows[0] || null };
  }
  return {};
}

// GET /api/home : grille et modules activés, avec leurs données (public)
router.get('/', attachUser, async (req, res) => {
  const grid = await loadGrid();
  const modules = (await loadModules()).filter(m => m.enabled);
  const out = [];
  for (const m of modules) {
    out.push({ id: m.id, type: m.type, x: m.x, y: m.y, w: m.w, h: m.h, params: m.params, data: await moduleData(m, req.user) });
  }
  res.json({ grid, modules: out });
});

// ---------- Administration (settings:manage) ----------

// GET /api/home/manage : réglages bruts de tous les modules
router.get('/manage', requireAuth, requirePermission('settings:manage'), async (req, res) => {
  res.json({ grid: await loadGrid(), modules: await loadModules(), types: TYPES });
});

// PUT /api/home/grid  { columns, rowHeight }
router.put('/grid', requireAuth, requirePermission('settings:manage'), async (req, res) => {
  const { columns, rowHeight } = req.body || {};
  if (!isInt(columns, 1, 24)) return bad(res, 'colonnes_invalides');
  if (!isInt(rowHeight, 40, 200)) return bad(res, 'hauteur_invalide');
  const error = layoutError(await loadModules(), columns);
  if (error) return bad(res, error === 'hors_grille' ? 'grille_trop_etroite' : error);
  await query(
    `INSERT INTO settings (key, value) VALUES ('home_grid', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify({ columns, rowHeight })]
  );
  res.json({ ok: true });
});

// Lit et valide les champs de position d'un module (pour la création et la modification)
function readPosition(body, current) {
  const pick = (key) => (body[key] !== undefined ? body[key] : current[key]);
  const pos = { x: pick('x'), y: pick('y'), w: pick('w'), h: pick('h') };
  if (!isInt(pos.x, 0, 23) || !isInt(pos.y, 0, MAX_ROWS - 1)) return { error: 'position_invalide' };
  if (!isInt(pos.w, 1, 24) || !isInt(pos.h, 1, MAX_ROWS)) return { error: 'taille_invalide' };
  return { pos };
}

// POST /api/home/modules  { type, enabled?, x, y, w, h, params? }
router.post('/modules', requireAuth, requirePermission('settings:manage'), async (req, res) => {
  const body = req.body || {};
  if (!TYPES.includes(body.type)) return bad(res, 'type_inconnu');
  const { pos, error: posError } = readPosition(body, { x: 0, y: 0, w: 4, h: 4 });
  if (posError) return bad(res, posError);
  const { params, error: paramError } = checkParams(body.type, body.params);
  if (paramError) return bad(res, paramError);
  const enabled = body.enabled === undefined ? true : body.enabled;
  if (typeof enabled !== 'boolean') return bad(res, 'activation_invalide');

  const grid = await loadGrid();
  const modules = await loadModules();
  const error = layoutError([...modules, { ...pos, enabled }], grid.columns);
  if (error) return bad(res, error);

  const { rows } = await query(
    `INSERT INTO home_modules (type, enabled, x, y, w, h, params)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [body.type, enabled, pos.x, pos.y, pos.w, pos.h, JSON.stringify(params)]
  );
  res.status(201).json({ id: rows[0].id });
});

// PATCH /api/home/modules/:id  { enabled?, x?, y?, w?, h?, params? }
router.patch('/modules/:id', requireAuth, requirePermission('settings:manage'), async (req, res) => {
  const id = Number(req.params.id);
  const modules = await loadModules();
  const current = modules.find(m => m.id === id);
  if (!current) return res.status(404).json({ error: 'introuvable' });

  const body = req.body || {};
  const { pos, error: posError } = readPosition(body, current);
  if (posError) return bad(res, posError);
  const enabled = body.enabled === undefined ? current.enabled : body.enabled;
  if (typeof enabled !== 'boolean') return bad(res, 'activation_invalide');
  const { params, error: paramError } = checkParams(current.type, body.params !== undefined ? body.params : current.params);
  if (paramError) return bad(res, paramError);

  const grid = await loadGrid();
  const others = modules.filter(m => m.id !== id);
  const error = layoutError([...others, { ...pos, enabled, id }], grid.columns);
  if (error) return bad(res, error);

  await query(
    'UPDATE home_modules SET enabled = $1, x = $2, y = $3, w = $4, h = $5, params = $6 WHERE id = $7',
    [enabled, pos.x, pos.y, pos.w, pos.h, JSON.stringify(params), id]
  );
  res.json({ ok: true });
});

// DELETE /api/home/modules/:id
router.delete('/modules/:id', requireAuth, requirePermission('settings:manage'), async (req, res) => {
  await query('DELETE FROM home_modules WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---------- Évènements (post:manage) ----------

function readEvent(body) {
  const { title, startsAt, endsAt, location } = body || {};
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) return { error: 'titre_invalide' };
  if (typeof startsAt !== 'string' || Number.isNaN(Date.parse(startsAt))) return { error: 'date_invalide' };
  if (endsAt && (typeof endsAt !== 'string' || Number.isNaN(Date.parse(endsAt)) || Date.parse(endsAt) < Date.parse(startsAt))) {
    return { error: 'fin_invalide' };
  }
  if (location !== undefined && location !== null && (typeof location !== 'string' || location.length > 120)) {
    return { error: 'lieu_invalide' };
  }
  return { event: { title: title.trim(), startsAt, endsAt: endsAt || null, location: location || null } };
}

// GET /api/home/events : tous les évènements, du plus récent au plus ancien
router.get('/events', requireAuth, requirePermission('post:manage'), async (req, res) => {
  const { rows } = await query(
    `SELECT id, title, starts_at AS "startsAt", ends_at AS "endsAt", location
       FROM events ORDER BY starts_at DESC LIMIT 500`
  );
  res.json({ events: rows });
});

// POST /api/home/events  { title, startsAt, endsAt?, location? }
router.post('/events', requireAuth, requirePermission('post:manage'), async (req, res) => {
  const { event, error } = readEvent(req.body);
  if (error) return bad(res, error);
  const { rows } = await query(
    `INSERT INTO events (title, starts_at, ends_at, location, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [event.title, event.startsAt, event.endsAt, event.location, req.user.id]
  );
  res.status(201).json({ id: rows[0].id });
});

// PATCH /api/home/events/:id  (mêmes champs que la création)
router.patch('/events/:id', requireAuth, requirePermission('post:manage'), async (req, res) => {
  const { event, error } = readEvent(req.body);
  if (error) return bad(res, error);
  const { rowCount } = await query(
    `UPDATE events SET title = $1, starts_at = $2, ends_at = $3, location = $4 WHERE id = $5`,
    [event.title, event.startsAt, event.endsAt, event.location, Number(req.params.id)]
  );
  if (!rowCount) return res.status(404).json({ error: 'introuvable' });
  res.json({ ok: true });
});

// DELETE /api/home/events/:id
router.delete('/events/:id', requireAuth, requirePermission('post:manage'), async (req, res) => {
  await query('DELETE FROM events WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
});

module.exports = router;
