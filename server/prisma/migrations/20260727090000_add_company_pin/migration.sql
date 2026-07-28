-- Update 5: Pin/Star important companies. Additive, nullable-safe default —
-- zero risk to existing rows. Safe to run any number of times.

ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Company_isPinned_idx" ON "Company"("isPinned");
