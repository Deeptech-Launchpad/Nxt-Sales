-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "clientType" TEXT,
ADD COLUMN     "clientWebsiteUrl" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "domainName" TEXT,
ADD COLUMN     "expectedOutcome" TEXT,
ADD COLUMN     "opportunityType" TEXT,
ADD COLUMN     "serviceRequirement" TEXT,
ADD COLUMN     "strategicImportance" TEXT,
ALTER COLUMN "stage" SET DEFAULT 'Discussion';

