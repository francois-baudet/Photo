-- 011 : nouveaux types de modules d'accueil (liens utiles, résultats du concours).
-- Ne modifie aucune donnée : seule la liste des types autorisés change.
ALTER TABLE home_modules DROP CONSTRAINT IF EXISTS home_modules_type_check;
ALTER TABLE home_modules ADD CONSTRAINT home_modules_type_check
  CHECK (type IN ('calendrier', 'carrousel', 'billet', 'billets', 'texte', 'liens', 'resultats'));
