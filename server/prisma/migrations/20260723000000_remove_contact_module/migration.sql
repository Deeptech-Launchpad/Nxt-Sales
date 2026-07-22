-- Contact module removal (Phase 4 — final step). Company is now the only
-- customer entity. Drop the FK columns before dropping the Contact table
-- itself so nothing is left referencing a table that no longer exists.
ALTER TABLE "Activity" DROP COLUMN IF EXISTS "contactId";
ALTER TABLE "Deal" DROP COLUMN IF EXISTS "contactId";
DROP TABLE IF EXISTS "Contact";
