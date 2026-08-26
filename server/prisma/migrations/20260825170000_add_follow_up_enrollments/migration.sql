CREATE TABLE "FollowUpEnrollment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FollowUpEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FollowUpEnrollment_status_nextRunAt_idx" ON "FollowUpEnrollment"("status", "nextRunAt");
CREATE INDEX "FollowUpEnrollment_companyId_status_idx" ON "FollowUpEnrollment"("companyId", "status");
CREATE INDEX "FollowUpEnrollment_userId_status_idx" ON "FollowUpEnrollment"("userId", "status");

ALTER TABLE "FollowUpEnrollment" ADD CONSTRAINT "FollowUpEnrollment_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUpEnrollment" ADD CONSTRAINT "FollowUpEnrollment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
