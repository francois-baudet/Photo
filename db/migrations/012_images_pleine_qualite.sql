-- 012 : images en pleine qualité (hors visiteurs).
--  - full_path : JPEG complet extrait d'un RAW, créé à la première demande (NULL pour les JPEG d'origine)
--  - rotation  : rotation cumulée appliquée à l'image en pleine qualité (0, 90, 180 ou 270)
ALTER TABLE photos ADD COLUMN IF NOT EXISTS full_path text;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS rotation integer NOT NULL DEFAULT 0
  CHECK (rotation IN (0, 90, 180, 270));
