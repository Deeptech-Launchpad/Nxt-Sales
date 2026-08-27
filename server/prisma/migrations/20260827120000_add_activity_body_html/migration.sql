-- Stores the email exactly as it was sent/received, so the CRM viewer can show
-- the real formatting instead of flattening it to plain text.
--
-- Purely additive: one nullable TEXT column. "body" is untouched and every
-- existing row keeps its current value, with bodyHtml simply NULL until a send
-- or a sync fills it in.
ALTER TABLE "Activity" ADD COLUMN "bodyHtml" TEXT;
