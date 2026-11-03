-- Warm leads evaluated by the Marketing AI Agent (routes/marketingWarmLeads.js).
-- Additive: two new tables; no existing table or column is changed.
CREATE TABLE IF NOT EXISTS "CompanyLeadEvaluation" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "classification" TEXT,
  "evaluationStatus" TEXT NOT NULL,
  "score" INTEGER,
  "confidence" TEXT,
  "summary" TEXT,
  "reasons" JSONB,
  "deepCheck" TEXT,
  "error" TEXT,
  "runId" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL,
  "evaluatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyLeadEvaluation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyLeadEvaluation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompanyLeadEvaluation_companyId_key" ON "CompanyLeadEvaluation"("companyId");
CREATE INDEX IF NOT EXISTS "CompanyLeadEvaluation_classification_idx" ON "CompanyLeadEvaluation"("classification");
CREATE INDEX IF NOT EXISTS "CompanyLeadEvaluation_evaluationStatus_idx" ON "CompanyLeadEvaluation"("evaluationStatus");

CREATE TABLE IF NOT EXISTS "MarketingWarmLeadRun" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "requestedBy" TEXT,
  "total" INTEGER NOT NULL DEFAULT 0,
  "processed" INTEGER NOT NULL DEFAULT 0,
  "warm" INTEGER NOT NULL DEFAULT 0,
  "cold" INTEGER NOT NULL DEFAULT 0,
  "insufficient" INTEGER NOT NULL DEFAULT 0,
  "failed" INTEGER NOT NULL DEFAULT 0,
  "approvedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingWarmLeadRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MarketingWarmLeadRun_createdAt_idx" ON "MarketingWarmLeadRun"("createdAt");
