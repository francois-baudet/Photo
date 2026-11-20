-- 006 : un concours peut n'avoir aucun juré (seuls les membres notent)
ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_jury_count_check;
ALTER TABLE contests ADD CONSTRAINT contests_jury_count_check CHECK (jury_count >= 0);
