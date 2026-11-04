-- Warm leads: the new statuses' counters on a run summary (2026-10-31).
-- Additive: four new columns with a default of 0; no existing column is changed.
ALTER TABLE "MarketingWarmLeadRun" ADD COLUMN IF NOT EXISTS "earlySignal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketingWarmLeadRun" ADD COLUMN IF NOT EXISTS "existingCustomer" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketingWarmLeadRun" ADD COLUMN IF NOT EXISTS "activeOpportunity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketingWarmLeadRun" ADD COLUMN IF NOT EXISTS "doNotContact" INTEGER NOT NULL DEFAULT 0;
