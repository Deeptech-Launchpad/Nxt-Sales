-- Website and Mobile are no longer part of the Company workflow.
-- Company URL (the existing "domain" column) now covers duplicate
-- detection/search that "website" used to handle; Phones covers what
-- "mobile" used to handle for CallHippo matching.
ALTER TABLE "Company" DROP COLUMN IF EXISTS "website";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "mobile";
