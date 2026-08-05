-- Deal: replace closeDate with a currency-aware value. Additive currency
-- column (safe default, no data loss); closeDate is dropped since it's no
-- longer a supported field anywhere in the app.

ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "Deal" DROP COLUMN IF EXISTS "closeDate";
