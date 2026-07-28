-- Team Chat E5 (file sharing) + E6 (read receipts, CRM record attach).
-- Purely additive — no existing column or row touched. Safe to run any
-- number of times.

ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachments" JSONB;
ALTER TABLE "ChatMessage" ADD COLUMN IF NOT EXISTS "attachedRecord" JSONB;

CREATE TABLE IF NOT EXISTS "ChatMessageReceipt" (
    "id"          TEXT NOT NULL,
    "messageId"   TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "readAt"      TIMESTAMP(3),

    CONSTRAINT "ChatMessageReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessageReceipt_messageId_userId_key" ON "ChatMessageReceipt"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "ChatMessageReceipt_userId_idx" ON "ChatMessageReceipt"("userId");

DO $$ BEGIN
  ALTER TABLE "ChatMessageReceipt" ADD CONSTRAINT "ChatMessageReceipt_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMessageReceipt" ADD CONSTRAINT "ChatMessageReceipt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
