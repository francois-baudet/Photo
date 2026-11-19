const { query } = require('../db/pool');

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

module.exports = { listGalleries };
