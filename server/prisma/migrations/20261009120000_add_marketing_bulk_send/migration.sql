-- Marketing AI Agent bulk email sent through NXT Sales (routes/marketingBulk.js).
-- Additive: one new table; no existing table is changed.
CREATE TABLE "MarketingBulkSend" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "senderUserId" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error" TEXT,
  "sentAt" TIMESTAMP(3),
  "activityId" TEXT,
  "messageId" TEXT,
  "threadId" TEXT,
  "fromEmail" TEXT,
  "tracked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingBulkSend_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketingBulkSend_idempotencyKey_key" ON "MarketingBulkSend"("idempotencyKey");
CREATE INDEX "MarketingBulkSend_campaignId_idx" ON "MarketingBulkSend"("campaignId");
