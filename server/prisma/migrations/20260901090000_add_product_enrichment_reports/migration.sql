CREATE TABLE "ProductEnrichmentReport" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "preparedFor" TEXT,
  "preparedBy" TEXT,
  "reportDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "projectName" TEXT,
  "executiveSummary" TEXT,
  "nextSteps" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Draft',
  "products" JSONB NOT NULL,
  "branding" JSONB,
  "pdfPath" TEXT,
  "pageCount" INTEGER,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductEnrichmentReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProductEnrichmentReport_ownerId_updatedAt_idx" ON "ProductEnrichmentReport"("ownerId", "updatedAt");
CREATE INDEX "ProductEnrichmentReport_status_idx" ON "ProductEnrichmentReport"("status");
CREATE INDEX "ProductEnrichmentReport_clientName_idx" ON "ProductEnrichmentReport"("clientName");
ALTER TABLE "ProductEnrichmentReport" ADD CONSTRAINT "ProductEnrichmentReport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
