-- 005 : donne une galerie de type « concours » à chaque concours créé avant la migration 004,
-- puis rend le lien obligatoire.
DO $$
DECLARE
  c record;
  gid integer;
BEGIN
  FOR c IN SELECT id, title, created_by FROM contests WHERE gallery_id IS NULL LOOP
    INSERT INTO galleries (title, owner_id, visibility, kind)
    VALUES (c.title, c.created_by, 'concours', 'concours')
    RETURNING id INTO gid;
    UPDATE contests SET gallery_id = gid WHERE id = c.id;
  END LOOP;
END $$;

ALTER TABLE contests ALTER COLUMN gallery_id SET NOT NULL;
