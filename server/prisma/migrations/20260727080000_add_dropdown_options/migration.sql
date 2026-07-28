-- Update 2: centralized, admin-managed dropdown values (Industry, Country,
-- Lead Status, and the Deal option fields), replacing hardcoded arrays.
-- Purely additive — a new table only, no changes to Company/Deal columns,
-- which keep storing plain strings. Safe to run any number of times.

CREATE TABLE IF NOT EXISTS "DropdownOption" (
    "id"        TEXT NOT NULL,
    "fieldKey"  TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "label"     TEXT NOT NULL,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "enabled"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DropdownOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DropdownOption_fieldKey_value_key" ON "DropdownOption"("fieldKey", "value");
CREATE INDEX IF NOT EXISTS "DropdownOption_fieldKey_idx" ON "DropdownOption"("fieldKey");
