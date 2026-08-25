-- Canonical company-email matching support.
--
-- Purely additive: four new nullable columns and two unique indexes. No
-- existing column is altered or dropped, and no row is rewritten, so this is
-- safe to apply to a live database and trivially reversible.

-- Completes the canonical email record (Bcc was never stored).
ALTER TABLE "Activity" ADD COLUMN "bccEmail" TEXT;

-- Which connected mailbox a synced message came from. Company association is
-- mailbox-agnostic, so this is what preserves per-user provenance.
ALTER TABLE "Activity" ADD COLUMN "mailboxEmail" TEXT;

-- 'address' (explicit company address matched) or 'domain' (secondary rule).
ALTER TABLE "Activity" ADD COLUMN "matchBasis" TEXT;

-- The RFC 5322 Message-ID header. Globally unique, unlike Gmail's internal
-- message id, so it is what prevents the same real email being stored twice
-- when more than one connected mailbox contains it.
ALTER TABLE "Activity" ADD COLUMN "rfcMessageId" TEXT;

-- Duplicate prevention at the DATABASE level, not just in application code.
-- Verified zero existing duplicates for messageId before adding this; NULLs are
-- exempt from UNIQUE in Postgres, so the many non-email activities (all with
-- messageId NULL) are unaffected.
CREATE UNIQUE INDEX "Activity_messageId_key"    ON "Activity"("messageId");
CREATE UNIQUE INDEX "Activity_rfcMessageId_key" ON "Activity"("rfcMessageId");
