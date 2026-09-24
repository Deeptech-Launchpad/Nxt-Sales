-- Persist the one-time Gmail historical-sync completion flag per mailbox,
-- replacing the in-memory Set in gmailAutoSync.js. Without this, every
-- process restart re-triggered a full ("in:anywhere") historical resync of
-- every connected mailbox, contributing to the 2026-09-24 Gmail API quota
-- exhaustion. Null = never completed one; a non-null timestamp = when it
-- last completed.
ALTER TABLE "EmailAccount" ADD COLUMN "historicalSyncAt" TIMESTAMP(3);

-- One-time backfill: every Gmail mailbox already connected as of this
-- migration has already had extensive historical sync coverage over the
-- preceding weeks (repeated full "in:anywhere" resyncs on every restart, per
-- the diagnosed issue), so mark them all as already done. This is what makes
-- the fix take effect starting with the very next restart, with zero further
-- full resyncs, instead of one more before the benefit kicks in.
UPDATE "EmailAccount" SET "historicalSyncAt" = NOW() WHERE "provider" = 'gmail' AND "historicalSyncAt" IS NULL;
