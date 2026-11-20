// Billets de la landing page : lecture publique des billets publiés, édition avec la permission post:manage.
const router = require('express').Router();
const { query } = require('../db/pool');
const { requireAuth, requirePermission } = require('../middlewares/auth');

const bad = (res, error) => res.status(400).json({ error });

// GET /api/posts : billets publiés (public)
router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.title, p.body, p.published_at AS "publishedAt", u.display_name AS author
       FROM posts p JOIN users u ON u.id = p.author_id
      WHERE p.published
      ORDER BY p.published_at DESC NULLS LAST, p.id DESC`
  );
  res.json({ posts: rows });
});

// GET /api/posts/manage : tous les billets, brouillons compris
router.get('/manage', requireAuth, requirePermission('post:manage'), async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.title, p.body, p.published, p.published_at AS "publishedAt", u.display_name AS author
       FROM posts p JOIN users u ON u.id = p.author_id
      ORDER BY p.id DESC`
  );
  res.json({ posts: rows });
});

// POST /api/posts  { title, body, published }
router.post('/', requireAuth, requirePermission('post:manage'), async (req, res) => {
  const { title, body, published = false } = req.body || {};
  if (typeof title !== 'string' || !title.trim()) return bad(res, 'titre_manquant');
  if (typeof body !== 'string') return bad(res, 'contenu_manquant');
  if (typeof published !== 'boolean') return bad(res, 'publication_invalide');
  const { rows } = await query(
    `INSERT INTO posts (title, body, author_id, published, published_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN now() ELSE NULL END)
     RETURNING id`,
    [title.trim(), body, req.user.id, published]
  );
  res.status(201).json({ id: rows[0].id });
});

// PATCH /api/posts/:id  { title?, body?, published? }
router.patch('/:id', requireAuth, requirePermission('post:manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: 'introuvable' });
  const { title, body, published } = req.body || {};
  if (title !== undefined && (typeof title !== 'string' || !title.trim())) return bad(res, 'titre_invalide');
  if (body !== undefined && typeof body !== 'string') return bad(res, 'contenu_invalide');
  if (published !== undefined && typeof published !== 'boolean') return bad(res, 'publication_invalide');

  const { rowCount } = await query(
    `UPDATE posts SET
        title = COALESCE($1, title),
        body = COALESCE($2, body),
        published = COALESCE($3, published),
        published_at = CASE
          WHEN $3 IS TRUE AND published_at IS NULL THEN now()
          WHEN $3 IS FALSE THEN NULL
          ELSE published_at END
      WHERE id = $4`,
    [title ? title.trim() : null, body ?? null, published ?? null, id]
  );
  if (!rowCount) return res.status(404).json({ error: 'introuvable' });
  res.json({ ok: true });
});

// DELETE /api/posts/:id
router.delete('/:id', requireAuth, requirePermission('post:manage'), async (req, res) => {
  await query('DELETE FROM posts WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
});

module.exports = router;
