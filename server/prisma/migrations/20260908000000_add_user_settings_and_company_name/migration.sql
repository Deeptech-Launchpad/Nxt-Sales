-- Adds the two User columns the Manage -> Settings page needs.
--
-- Both are nullable with no default and no backfill, so this is additive only:
-- every existing row keeps working unchanged, and every existing query keeps
-- returning the same data. `settings` holds the per-user preference document
-- (notifications / security / appearance) that server/src/routes/settings.js
-- reads and writes; `companyName` is the workspace name shown on the Account
-- tab.
--
-- IF NOT EXISTS so re-running against a database that already has either
-- column is a no-op rather than an error.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "settings" JSONB;
