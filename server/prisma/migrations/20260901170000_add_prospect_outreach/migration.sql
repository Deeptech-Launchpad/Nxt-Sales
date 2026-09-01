CREATE TABLE "Prospect" (
  "id" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT,
  "jobTitle" TEXT,
  "companyName" TEXT,
  "email" TEXT,
  "emailStatus" TEXT NOT NULL DEFAULT 'Unverified',
  "linkedinUrl" TEXT,
  "linkedinStatus" TEXT,
  "channel" TEXT NOT NULL DEFAULT 'Email',
  "status" TEXT NOT NULL DEFAULT 'New',
  "ownerId" TEXT,
  "ownerName" TEXT,
  "lastContacted" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ProspectActivity" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProspectActivity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OutreachDraft" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subject" TEXT,
  "htmlBody" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutreachDraft_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ScheduledOutreach" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "htmlBody" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Scheduled',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduledOutreach_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Prospect_createdById_idx" ON "Prospect"("createdById");
CREATE INDEX "Prospect_status_idx" ON "Prospect"("status");
CREATE INDEX "Prospect_companyName_idx" ON "Prospect"("companyName");
CREATE INDEX "Prospect_ownerId_idx" ON "Prospect"("ownerId");
CREATE INDEX "Prospect_lastContacted_idx" ON "Prospect"("lastContacted");
CREATE INDEX "ProspectActivity_prospectId_createdAt_idx" ON "ProspectActivity"("prospectId", "createdAt");
CREATE UNIQUE INDEX "OutreachDraft_prospectId_userId_key" ON "OutreachDraft"("prospectId", "userId");
CREATE INDEX "ScheduledOutreach_userId_status_scheduledAt_idx" ON "ScheduledOutreach"("userId", "status", "scheduledAt");
ALTER TABLE "ProspectActivity" ADD CONSTRAINT "ProspectActivity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledOutreach" ADD CONSTRAINT "ScheduledOutreach_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
