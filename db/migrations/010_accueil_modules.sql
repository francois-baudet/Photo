-- 010 : page d'accueil modulaire. Chaque module occupe une zone de la grille (x, y, w, h en cases).

-- Évènements du club, affichés par le module calendrier
CREATE TABLE events (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       text NOT NULL,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  location    text,
  created_by  integer NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Modules de la page d'accueil. params : réglages propres au type (titre, nombre, intervalle…)
CREATE TABLE home_modules (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type        text NOT NULL CHECK (type IN ('calendrier', 'carrousel', 'billet', 'billets', 'texte')),
  enabled     boolean NOT NULL DEFAULT true,
  x           integer NOT NULL CHECK (x >= 0),
  y           integer NOT NULL CHECK (y >= 0),
  w           integer NOT NULL CHECK (w >= 1),
  h           integer NOT NULL CHECK (h >= 1),
  params      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Grille de la page d'accueil : nombre de colonnes et hauteur d'une case (px)
INSERT INTO settings (key, value) VALUES ('home_grid', '{"columns": 12, "rowHeight": 80}')
ON CONFLICT (key) DO NOTHING;

-- Disposition de départ, proche de l'ancienne page : billets à gauche, carrousel à droite, calendrier dessous
INSERT INTO home_modules (type, x, y, w, h, params) VALUES
  ('billets',    0, 0, 6, 6, '{"titre": "Actualités", "nombre": 3}'),
  ('carrousel',  6, 0, 6, 6, '{"titre": "Dernières photos", "nombre": 8, "intervalle": 6}'),
  ('calendrier', 0, 6, 12, 5, '{"titre": "Agenda", "nombre": 5}');
