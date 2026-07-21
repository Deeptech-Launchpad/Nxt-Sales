ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Company_deletedAt_idx" ON "Company"("deletedAt");
