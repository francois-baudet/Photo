-- 002 : données de départ (rôles et visibilités). Modifiables ensuite par l'admin.

INSERT INTO roles (name, label) VALUES
  ('admin',    'Administrateur'),
  ('membre',   'Membre'),
  ('jury',     'Jury'),
  ('visiteur', 'Visiteur');

INSERT INTO visibility_access (visibility, role_id)
SELECT v.visibility, r.id
  FROM (VALUES
    ('public',   'admin'),
    ('public',   'membre'),
    ('public',   'jury'),
    ('public',   'visiteur'),
    ('membres',  'admin'),
    ('membres',  'membre'),
    ('membres',  'jury'),
    ('concours', 'admin'),
    ('concours', 'membre'),
    ('concours', 'jury'),
    ('jury',     'admin'),
    ('jury',     'jury'),
    ('admin',    'admin')
  ) AS v(visibility, role_name)
  JOIN roles r ON r.name = v.role_name;
