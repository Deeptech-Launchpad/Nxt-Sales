-- Two independent flags on Deal, unrelated to and never affecting `stage`.
-- Additive, non-nullable with a false default, so every existing deal row
-- is unaffected.

ALTER TABLE "Deal" ADD COLUMN "poc" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Deal" ADD COLUMN "proposalShared" BOOLEAN NOT NULL DEFAULT false;
