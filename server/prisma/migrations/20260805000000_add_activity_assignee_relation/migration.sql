-- Give Activity.assignedToId a real FK relation + index, matching the same
-- pattern Company.ownerId already uses (nullable -> SET NULL on delete, so
-- deleting a user never blocks on their past task/meeting assignments, it
-- just unassigns them). Column already exists and is fully clean (verified
-- zero orphaned/non-null values before writing this migration) -- this is
-- purely additive constraint + index, no data changes.

ALTER TABLE "Activity" ADD CONSTRAINT "Activity_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Activity_assignedToId_idx" ON "Activity"("assignedToId");
