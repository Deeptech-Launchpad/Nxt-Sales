-- AI/LLM usage tracking. Purely additive: one new table, no change to any
-- existing table or column, so nothing about existing data or behavior moves.
--
-- Token columns are populated ONLY from the usage metadata the AI provider
-- itself returns. hasUsageData records whether the provider actually supplied
-- counts, so a request with no metadata is still counted as a request while
-- contributing zero tokens (rather than being silently estimated).

CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "hasUsageData" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");
CREATE INDEX "AiUsage_userId_feature_idx" ON "AiUsage"("userId", "feature");
CREATE INDEX "AiUsage_userId_model_idx" ON "AiUsage"("userId", "model");

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
