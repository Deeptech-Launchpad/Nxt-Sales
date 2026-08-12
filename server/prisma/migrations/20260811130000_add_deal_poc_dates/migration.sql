-- Two nullable date fields on Deal, placed alongside poc/proposalShared.
-- Additive, no default, so every existing deal row is unaffected (both
-- columns simply start empty).

ALTER TABLE "Deal" ADD COLUMN "pocReceivedDate" TIMESTAMP(3);
ALTER TABLE "Deal" ADD COLUMN "pocDeliveredDate" TIMESTAMP(3);
