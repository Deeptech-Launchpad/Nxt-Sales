-- Email module: Company → Company Email Address → Conversation Thread → Messages.
--
-- matchedCompanyEmail: which of the company's saved addresses a conversation
--   belongs to. Required for the address-level grouping — without it every
--   conversation collapses into one merged timeline.
-- ccEmail / attachments: captured during sync so the thread view can show the
--   full recipient list and attachment names without a live Gmail round-trip
--   each time a conversation is opened.
--
-- All additive and idempotent — no existing column or row is modified.
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "matchedCompanyEmail" TEXT;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "ccEmail" TEXT;
ALTER TABLE "Activity" ADD COLUMN IF NOT EXISTS "attachments" JSONB;

-- threadId: the conversation drawer loads a whole thread by id.
-- matchedCompanyEmail: the conversation list groups by address.
CREATE INDEX IF NOT EXISTS "Activity_threadId_idx" ON "Activity"("threadId");
CREATE INDEX IF NOT EXISTS "Activity_matchedCompanyEmail_idx" ON "Activity"("matchedCompanyEmail");
