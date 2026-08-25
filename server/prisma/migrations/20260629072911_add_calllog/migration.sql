-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "callhippoId" TEXT NOT NULL,
    "callDate" TIMESTAMP(3) NOT NULL,
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "direction" TEXT,
    "status" TEXT,
    "duration" INTEGER,
    "recordingUrl" TEXT,
    "agentName" TEXT,
    "agentId" TEXT,
    "analysisStatus" TEXT,
    "analysisResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_callhippoId_key" ON "CallLog"("callhippoId");

-- CreateIndex
CREATE INDEX "CallLog_callDate_idx" ON "CallLog"("callDate");

-- CreateIndex
CREATE INDEX "CallLog_analysisStatus_idx" ON "CallLog"("analysisStatus");
