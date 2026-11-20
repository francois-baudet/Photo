-- 004 : un concours est une galerie de type « concours ».
-- Les photos d'un concours sont déposées dans sa galerie ; la table de liaison disparaît.

-- Type de galerie
ALTER TABLE galleries ADD COLUMN kind text NOT NULL DEFAULT 'classique'
  CHECK (kind IN ('classique', 'concours'));

-- L'ancien lien galerie -> concours (jamais utilisé) est remplacé par contests.gallery_id
ALTER TABLE galleries DROP COLUMN IF EXISTS contest_id;

-- Photos des concours : désormais dans la galerie du concours
DROP TABLE IF EXISTS contest_photos;

-- Chaque concours a sa galerie
ALTER TABLE contests ADD COLUMN gallery_id integer UNIQUE REFERENCES galleries(id) ON DELETE CASCADE;
