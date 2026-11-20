const { query } = require('../db/pool');

const VISIBILITIES = ['public', 'membres', 'concours', 'jury', 'admin'];

// Galeries visibles pour un rôle, selon la table visibility_access
async function listGalleries(roleName) {
  const { rows } = await query(
    `SELECT g.id, g.title, g.visibility,
            u.display_name AS author,
            (SELECT COUNT(*)::int FROM photos p WHERE p.gallery_id = g.id) AS "photoCount"
       FROM galleries g
       JOIN users u ON u.id = g.owner_id
       JOIN visibility_access va ON va.visibility = g.visibility
       JOIN roles r ON r.id = va.role_id AND r.name = $1
      ORDER BY g.created_at DESC`,
    [roleName]
  );
  return rows;
}

async function createGallery({ ownerId, title, visibility }) {
  const { rows } = await query(
    `INSERT INTO galleries (title, owner_id, visibility)
     VALUES ($1, $2, $3)
     RETURNING id, title, visibility`,
    [title, ownerId, visibility]
  );
  return rows[0];
}

module.exports = { VISIBILITIES, listGalleries, createGallery };
