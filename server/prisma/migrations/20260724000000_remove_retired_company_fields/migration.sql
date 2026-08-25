-- Removes the 13 retired Company fields (Phase 3 of 3). These were already
-- hidden from Create/Edit Company, Edit Columns, and Export in the previous
-- two phases; this drops the underlying columns themselves.
ALTER TABLE "Company" DROP COLUMN IF EXISTS "industryType";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "companyType";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "leadType";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "employeeCount";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "revenue";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "city";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "stateRegion";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "postalCode";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "timeZone";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "originalTrafficSource";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "description";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "lifecycleStage";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "linkedinUrl";
