-- 009 : qui peut déposer des photos dans une galerie, et droit de téléchargement des fichiers.

-- « proprietaire » : le propriétaire et les gestionnaires (comportement d'origine)
-- « membres »      : tout utilisateur qui voit la galerie et a le droit photo:upload
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS upload_access text NOT NULL DEFAULT 'proprietaire'
  CHECK (upload_access IN ('proprietaire', 'membres'));

-- Téléchargement des fichiers d'une galerie : membres et administrateurs (modifiable par l'admin)
INSERT INTO permissions (code, label) VALUES
  ('photo:download', 'Télécharger les fichiers des galeries')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'photo:download'
 WHERE r.name IN ('admin', 'membre')
ON CONFLICT DO NOTHING;
