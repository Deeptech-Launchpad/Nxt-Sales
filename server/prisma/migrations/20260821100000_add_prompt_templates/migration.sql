-- Editable AI prompt / email templates for the Email Tool.
-- Purely additive: one new table. The eight existing hardcoded templates are
-- seeded into it on first use, so no prompt is lost and none is duplicated.

CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "clientType" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'content',
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromptTemplate_clientType_templateKey_key" ON "PromptTemplate"("clientType", "templateKey");
CREATE INDEX "PromptTemplate_clientType_enabled_idx" ON "PromptTemplate"("clientType", "enabled");
