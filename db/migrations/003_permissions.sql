-- 003 : droits configurables. Le code vérifie des permissions, pas des noms de rôles.

CREATE TABLE permissions (
  id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code  text NOT NULL UNIQUE,
  label text NOT NULL
);

CREATE TABLE role_permissions (
  role_id       integer NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id integer NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

INSERT INTO permissions (code, label) VALUES
  ('gallery:create', 'Créer une galerie'),
  ('photo:upload',   'Déposer des photos'),
  ('contest:join',   'Participer à un concours'),
  ('score:member',   'Noter comme membre'),
  ('score:jury',     'Noter comme juré'),
  ('contest:manage', 'Gérer les concours'),
  ('post:manage',    'Gérer les billets'),
  ('invite:create',  'Créer des invitations'),
  ('user:manage',    'Gérer les utilisateurs'),
  ('role:manage',    'Gérer les rôles et les droits'),
  ('settings:manage','Gérer les réglages');

-- Admin : tous les droits
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin';

-- Membre
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('gallery:create', 'photo:upload', 'contest:join', 'score:member')
 WHERE r.name = 'membre';

-- Jury : notation des concours
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('score:jury')
 WHERE r.name = 'jury';

-- Visiteur : aucun droit d'action

-- Réglages de départ
INSERT INTO settings (key, value) VALUES
  ('club_name', '"Club photo"'),
  ('metadata_fields', '["camera","lens","iso","aperture","shutter","focal_length","date"]');
