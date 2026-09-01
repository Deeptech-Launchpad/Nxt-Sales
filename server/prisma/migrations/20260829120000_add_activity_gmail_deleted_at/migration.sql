-- Marks an Activity whose underlying Gmail message is confirmed gone from the
-- mailbox it was synced from. Purely additive: nullable column, no data is
-- read, moved or removed by this migration, and every existing row keeps
-- NULL (= still present in Gmail) until a reconcile run says otherwise.
ALTER TABLE "Activity" ADD COLUMN "gmailDeletedAt" TIMESTAMP(3);

-- The reconcile and every read path filter on this, almost always alongside
-- type='email'. Partial index keeps it tiny: only the rows actually marked.
CREATE INDEX "Activity_gmailDeletedAt_idx" ON "Activity"("gmailDeletedAt") WHERE "gmailDeletedAt" IS NOT NULL;
