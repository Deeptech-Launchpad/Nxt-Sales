-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "companyId" TEXT,
ALTER COLUMN "contactId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "employeeCount" INTEGER,
    "revenue" DOUBLE PRECISION,
    "lifecycleStage" TEXT NOT NULL DEFAULT 'Lead',
    "leadStatus" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Lead',
    "notes" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Company_email_idx" ON "Company"("email");

-- CreateIndex
CREATE INDEX "Company_ownerId_idx" ON "Company"("ownerId");

-- CreateIndex
CREATE INDEX "Activity_companyId_idx" ON "Activity"("companyId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
