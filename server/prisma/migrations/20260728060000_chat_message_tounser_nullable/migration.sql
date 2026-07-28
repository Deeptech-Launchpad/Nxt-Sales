-- Team Chat (Update 3 / E3): a group message has no single recipient, so
-- toUserId can no longer be required. Purely relaxes a constraint — no
-- existing row's data changes, and every existing 1:1 message keeps its
-- toUserId exactly as it was. Safe to run any number of times.

ALTER TABLE "ChatMessage" ALTER COLUMN "toUserId" DROP NOT NULL;
