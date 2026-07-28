-- Team Chat (Update 3 / E4): @mentions. A join table, not a JSON array on
-- ChatMessage, so "messages mentioning me" stays an indexed query. Purely
-- additive — no existing table touched. Safe to run any number of times.

CREATE TABLE IF NOT EXISTS "ChatMention" (
    "id"        TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMention_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatMention_messageId_userId_key" ON "ChatMention"("messageId", "userId");
CREATE INDEX IF NOT EXISTS "ChatMention_userId_idx" ON "ChatMention"("userId");

DO $$ BEGIN
  ALTER TABLE "ChatMention" ADD CONSTRAINT "ChatMention_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMention" ADD CONSTRAINT "ChatMention_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
