-- Dynamic Custom Fields architecture: metadata-driven, not a JSON blob and
-- not one table per field. Purely additive — two new tables only, no changes
-- to Company/Deal columns. Safe to run any number of times.

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomFieldDefinition" (
    "id"          TEXT NOT NULL,
    "entity"      TEXT NOT NULL,
    "key"         TEXT NOT NULL,
    "label"       TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "required"    BOOLEAN NOT NULL DEFAULT false,
    "order"       INTEGER NOT NULL DEFAULT 0,
    "enabled"     BOOLEAN NOT NULL DEFAULT true,
    "helpText"    TEXT,
    "createdById" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomFieldValue" (
    "id"          TEXT NOT NULL,
    "fieldId"     TEXT NOT NULL,
    "recordId"    TEXT NOT NULL,
    "textValue"   TEXT,
    "numberValue" DECIMAL(18,4),
    "dateValue"   TIMESTAMP(3),
    "boolValue"   BOOLEAN,
    "listValue"   JSONB,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomFieldDefinition_entity_key_key" ON "CustomFieldDefinition"("entity", "key");
CREATE INDEX IF NOT EXISTS "CustomFieldDefinition_entity_enabled_order_idx" ON "CustomFieldDefinition"("entity", "enabled", "order");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomFieldValue_fieldId_recordId_key" ON "CustomFieldValue"("fieldId", "recordId");
CREATE INDEX IF NOT EXISTS "CustomFieldValue_recordId_idx" ON "CustomFieldValue"("recordId");
CREATE INDEX IF NOT EXISTS "CustomFieldValue_fieldId_textValue_idx" ON "CustomFieldValue"("fieldId", "textValue");
CREATE INDEX IF NOT EXISTS "CustomFieldValue_fieldId_numberValue_idx" ON "CustomFieldValue"("fieldId", "numberValue");
CREATE INDEX IF NOT EXISTS "CustomFieldValue_fieldId_dateValue_idx" ON "CustomFieldValue"("fieldId", "dateValue");
CREATE INDEX IF NOT EXISTS "CustomFieldValue_fieldId_boolValue_idx" ON "CustomFieldValue"("fieldId", "boolValue");

-- AddForeignKey
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
