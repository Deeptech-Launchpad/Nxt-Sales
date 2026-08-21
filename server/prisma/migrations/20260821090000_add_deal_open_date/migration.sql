-- Deal Open Date: the business date a deal actually opened, as opposed to
-- createdAt (when the row was entered into the CRM). Powers the Deals
-- Dashboard month/year filter, which must report on business date.
--
-- Purely additive: one nullable column, no default, no change to any
-- existing column or row. Existing deals start with it empty.

ALTER TABLE "Deal" ADD COLUMN "openDate" TIMESTAMP(3);

-- The dashboard filters by month/year on this column.
CREATE INDEX "Deal_openDate_idx" ON "Deal"("openDate");
