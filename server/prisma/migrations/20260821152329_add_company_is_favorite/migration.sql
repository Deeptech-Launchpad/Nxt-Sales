-- AddColumn isFavorite to Company
ALTER TABLE "Company" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- Create index on isFavorite for performance
CREATE INDEX "Company_isFavorite_idx" ON "Company"("isFavorite");
