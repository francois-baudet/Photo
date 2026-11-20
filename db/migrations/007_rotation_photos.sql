-- 007 : numéro de version des fichiers photo (incrémenté à chaque rotation, pour éviter le cache navigateur)
ALTER TABLE photos ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 0;
