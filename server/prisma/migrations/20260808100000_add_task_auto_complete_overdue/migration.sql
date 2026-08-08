-- Opt-in per-task auto-complete: when true, a background sweep marks the
-- task completed once its dueDate has passed. Additive, non-nullable with
-- a false default, so every existing row is unaffected and no task is ever
-- auto-completed unless this is explicitly turned on for it.
-- Also adds a dueDate index for the new Today/Overdue/Upcoming bucket
-- queries on the Tasks dashboard.

ALTER TABLE "Activity" ADD COLUMN "autoCompleteOverdue" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Activity_dueDate_idx" ON "Activity"("dueDate");
