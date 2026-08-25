-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "callLogId" TEXT,
ADD COLUMN     "recordingUrl" TEXT;

-- AlterTable
ALTER TABLE "CallLog" ADD COLUMN     "companyId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Activity_callLogId_key" ON "Activity"("callLogId");

-- CreateIndex
CREATE INDEX "CallLog_companyId_idx" ON "CallLog"("companyId");

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

