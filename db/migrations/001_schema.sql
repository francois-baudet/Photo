-- 001 : schéma initial

CREATE TABLE roles (
  id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  text NOT NULL UNIQUE,
  label text NOT NULL
);

CREATE TABLE users (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  password_hash text NOT NULL,
  role_id       integer NOT NULL REFERENCES roles(id),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Invitations : accès uniquement sur invitation
CREATE TABLE invitations (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token       text NOT NULL UNIQUE,
  role_id     integer NOT NULL REFERENCES roles(id),
  created_by  integer NOT NULL REFERENCES users(id),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

-- Quels rôles voient quel niveau de visibilité (modifiable par l'admin)
CREATE TABLE visibility_access (
  visibility text    NOT NULL CHECK (visibility IN ('public', 'membres', 'concours', 'jury', 'admin')),
  role_id    integer NOT NULL REFERENCES roles(id),
  PRIMARY KEY (visibility, role_id)
);

-- Concours (avant galleries, car une galerie peut y être rattachée)
CREATE TABLE contests (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title            text NOT NULL,
  jury_count       integer NOT NULL CHECK (jury_count >= 1),
  auto_notation    boolean NOT NULL DEFAULT false,
  notes_visibility text NOT NULL DEFAULT 'fin' CHECK (notes_visibility IN ('pendant', 'fin')),
  status           text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon', 'ouvert', 'clos')),
  created_by       integer NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contest_members (
  contest_id integer NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id    integer NOT NULL REFERENCES users(id),
  PRIMARY KEY (contest_id, user_id)
);

CREATE TABLE contest_jurors (
  contest_id integer NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id    integer NOT NULL REFERENCES users(id),
  PRIMARY KEY (contest_id, user_id)
);

CREATE TABLE galleries (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       text NOT NULL,
  owner_id    integer NOT NULL REFERENCES users(id),
  visibility  text NOT NULL CHECK (visibility IN ('public', 'membres', 'concours', 'jury', 'admin')),
  contest_id  integer REFERENCES contests(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fichiers sur disque (STORAGE_DIR) : la base ne stocke que les chemins
CREATE TABLE photos (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gallery_id   integer NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  owner_id     integer NOT NULL REFERENCES users(id),
  title        text,
  raw_path     text NOT NULL,
  preview_path text,
  thumb_path   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE photo_metadata (
  photo_id integer PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  data     jsonb NOT NULL
);

CREATE TABLE contest_photos (
  contest_id integer NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  photo_id   integer NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY (contest_id, photo_id)
);

-- Une note de 0 à 20 par photo et par votant (membre ou juré)
CREATE TABLE scores (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contest_id  integer NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  photo_id    integer NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  scorer_id   integer NOT NULL REFERENCES users(id),
  scorer_kind text NOT NULL CHECK (scorer_kind IN ('membre', 'jury')),
  value       numeric(4, 1) NOT NULL CHECK (value >= 0 AND value <= 20),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contest_id, photo_id, scorer_id)
);

-- Billets de la landing page
CREATE TABLE posts (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        text NOT NULL,
  body         text NOT NULL,
  author_id    integer NOT NULL REFERENCES users(id),
  published    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

-- Réglages du dashboard admin
CREATE TABLE settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);
