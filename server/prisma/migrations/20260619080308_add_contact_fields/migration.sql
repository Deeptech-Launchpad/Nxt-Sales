-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_ownerId_fkey";

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "leadStatus" TEXT,
ADD COLUMN     "lifecycleStage" TEXT NOT NULL DEFAULT 'Lead',
ALTER COLUMN "ownerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
