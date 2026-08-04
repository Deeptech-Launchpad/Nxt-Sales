// Dynamic Custom Fields — validation, shaping, and read/write helpers shared
// by the single-record Company/Deal create/update routes and (eventually)
// bulk import. Kept in one module so every write path validates/shapes a
// value identically, and every read path flattens values the same way.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const VALID_TYPES = [
  'text', 'textarea', 'number', 'email', 'phone', 'date', 'checkbox',
  'dropdown', 'multiselect', 'url', 'currency', 'percentage',
]

class CustomFieldValidationError extends Error {
  constructor(errors) {
    super('Custom field validation failed.')
    this.errors = errors // [{ key, message }]
  }
}

function isBlank(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
}

async function getFieldDefinitions(entity, { includeDisabled = false } = {}) {
  return prisma.customFieldDefinition.findMany({
    where: { entity, ...(includeDisabled ? {} : { enabled: true }) },
    orderBy: { order: 'asc' },
  })
}

// Dropdown/multiselect values are validated against the SAME DropdownOption
// table + fieldKey convention (`<entity>.custom.<key>`) built-in dropdowns
// already use — see server/src/constants/dropdownFields.js for the built-in
// half of this convention.
async function validDropdownValues(entity, key) {
  const fieldKey = `${entity.toLowerCase()}.custom.${key}`
  const options = await prisma.dropdownOption.findMany({ where: { fieldKey, enabled: true }, select: { value: true } })
  return new Set(options.map(o => o.value))
}

// Pure, synchronous shaping of ONE field's value — no DB access. `validValues`
// is only consulted for dropdown/multiselect (pass a Set, or omit/undefined
// for every other type). Returns a shaped row, or throws a plain
// {key, message} object (not CustomFieldValidationError — callers collect
// these into an array and wrap once) on a bad value.
function shapeOneFieldValue(def, raw, validValues) {
  if (isBlank(raw)) {
    if (def.required) throw { key: def.key, message: `${def.label} is required.` }
    return { fieldId: def.id, key: def.key, clear: true }
  }

  const row = { fieldId: def.id, key: def.key }
  switch (def.type) {
    case 'number': case 'currency': case 'percentage': {
      const n = Number(raw)
      if (Number.isNaN(n)) throw { key: def.key, message: `${def.label} must be a number.` }
      row.numberValue = n
      break
    }
    case 'date': {
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) throw { key: def.key, message: `${def.label} must be a valid date.` }
      row.dateValue = d
      break
    }
    case 'checkbox':
      row.boolValue = raw === true || raw === 'true' || raw === 1 || raw === '1'
      break
    case 'multiselect': {
      const list = (Array.isArray(raw) ? raw : [raw]).map(String)
      const invalid = list.filter(v => !validValues.has(v))
      if (invalid.length) throw { key: def.key, message: `${def.label}: "${invalid.join(', ')}" is not a valid option.` }
      row.listValue = list
      break
    }
    case 'dropdown': {
      const value = String(raw)
      if (!validValues.has(value)) throw { key: def.key, message: `${def.label}: "${value}" is not a valid option.` }
      row.textValue = value
      break
    }
    default: // text, textarea, email, phone, url
      row.textValue = String(raw).trim()
  }
  return row
}

// Validates + type-coerces raw `{ key: value }` input against active
// definitions for `entity`, returning shaped rows ready for
// writeCustomFieldValues. Throws CustomFieldValidationError (caller maps to
// 400) on any bad value — always call this BEFORE writing the Company/Deal
// row itself, so a validation failure never leaves a half-created record.
// A key not submitted at all is left untouched (matches how the existing
// built-in-field PUT routes treat `undefined` as "don't change this field");
// Create flows work correctly here because CustomFieldsSection (client)
// submits every currently-active field, blank or not, same as
// CreateCompanyModal already does for built-in fields.
//
// Single-record use only — fetches definitions/dropdown values itself, one
// query per choice-type field. For bulk import (many rows), use
// shapeCustomFieldInputSync with pre-fetched data instead, or this
// reintroduces the exact per-row-query timeout the bulk import route's
// duplicate-lookup already had to be fixed for once.
async function validateAndShapeCustomFieldInput(entity, rawCustomFields = {}) {
  if (!rawCustomFields || typeof rawCustomFields !== 'object') return []
  const definitions = await getFieldDefinitions(entity)
  const errors = []
  const shaped = []

  for (const def of definitions) {
    const raw = rawCustomFields[def.key]
    if (raw === undefined) continue
    try {
      const validValues = (def.type === 'dropdown' || def.type === 'multiselect')
        ? await validDropdownValues(entity, def.key)
        : undefined
      shaped.push(shapeOneFieldValue(def, raw, validValues))
    } catch (e) {
      errors.push(e)
    }
  }

  if (errors.length) throw new CustomFieldValidationError(errors)
  return shaped
}

// Bulk-safe variant — takes PRE-FETCHED `definitions` (getFieldDefinitions,
// called once outside any loop) and `dropdownValuesByFieldKey`
// (Map<"<entity>.custom.<key>", Set<value>>, also pre-fetched once). Does
// ZERO database queries itself, so validating N import rows costs the same
// two queries total regardless of N — the same discipline that fixed
// /companies/bulk's duplicate-lookup timeout, extended to this second
// concern. Returns { shaped, errors } instead of throwing, since a bulk
// import row failure should skip that ONE row (existing `failed++`/
// `errors.push(...)` pattern), not abort the whole batch.
function shapeCustomFieldInputSync(entity, definitions, rawCustomFields, dropdownValuesByFieldKey) {
  const errors = []
  const shaped = []
  if (!rawCustomFields || typeof rawCustomFields !== 'object') return { shaped, errors }

  for (const def of definitions) {
    const raw = rawCustomFields[def.key]
    if (raw === undefined) continue
    try {
      const validValues = (def.type === 'dropdown' || def.type === 'multiselect')
        ? (dropdownValuesByFieldKey.get(`${entity.toLowerCase()}.custom.${def.key}`) || new Set())
        : undefined
      shaped.push(shapeOneFieldValue(def, raw, validValues))
    } catch (e) {
      errors.push(e)
    }
  }
  return { shaped, errors }
}

// Pre-fetches every DropdownOption value for the given choice-type
// definitions in ONE query, keyed by fieldKey — the bulk-import counterpart
// to validDropdownValues, called once instead of once per row.
async function bulkFetchDropdownValues(entity, definitions) {
  const choiceDefs = definitions.filter(d => d.type === 'dropdown' || d.type === 'multiselect')
  const map = new Map()
  if (!choiceDefs.length) return map
  const fieldKeys = choiceDefs.map(d => `${entity.toLowerCase()}.custom.${d.key}`)
  const options = await prisma.dropdownOption.findMany({ where: { fieldKey: { in: fieldKeys }, enabled: true } })
  for (const o of options) {
    if (!map.has(o.fieldKey)) map.set(o.fieldKey, new Set())
    map.get(o.fieldKey).add(o.value)
  }
  return map
}

// Single-record write path, bounded by the number of custom fields on that
// record (expected single digits). `client` defaults to the module-level
// PrismaClient and wraps the writes in their own transaction; pass an
// interactive transaction (`prisma.$transaction(async tx => ...)`) as
// `client` to make these writes atomic WITH the Company/Deal create/update
// call itself — an interactive tx client has no `$transaction` of its own,
// so in that case the writes just run inside the caller's transaction.
async function writeCustomFieldValues(recordId, shapedRows, client) {
  if (!shapedRows.length) return
  const run = (db) => Promise.all(shapedRows.map(row => {
    if (row.clear) {
      return db.customFieldValue.deleteMany({ where: { fieldId: row.fieldId, recordId } })
    }
    const data = {
      textValue: row.textValue ?? null, numberValue: row.numberValue ?? null,
      dateValue: row.dateValue ?? null, boolValue: row.boolValue ?? null, listValue: row.listValue ?? null,
    }
    return db.customFieldValue.upsert({
      where: { fieldId_recordId: { fieldId: row.fieldId, recordId } },
      create: { fieldId: row.fieldId, recordId, ...data },
      update: data,
    })
  }))

  if (client) return run(client)
  await prisma.$transaction(tx => run(tx))
}

function valueOf(v) {
  if (v.listValue !== null && v.listValue !== undefined) return v.listValue
  if (v.numberValue !== null && v.numberValue !== undefined) return Number(v.numberValue)
  if (v.dateValue !== null && v.dateValue !== undefined) return v.dateValue
  if (v.boolValue !== null && v.boolValue !== undefined) return v.boolValue
  return v.textValue
}

// List/detail read path — ONE query for the whole page of records (never
// per-record — the exact N+1 shape that caused the bulk-import timeout this
// same codebase already fixed once), flattened onto each record as
// `custom.<key>` properties matching the `c[f.key]` convention
// editColumnsFields/renderCompanyCell already use uniformly for built-ins.
async function attachCustomFieldValues(entity, records) {
  if (!records.length) return records
  const ids = records.map(r => r.id)
  const values = await prisma.customFieldValue.findMany({
    where: { recordId: { in: ids }, field: { entity } },
    include: { field: true },
  })
  const byRecord = new Map()
  for (const v of values) {
    if (!byRecord.has(v.recordId)) byRecord.set(v.recordId, {})
    byRecord.get(v.recordId)[`custom.${v.field.key}`] = valueOf(v)
  }
  for (const r of records) Object.assign(r, byRecord.get(r.id) || {})
  return records
}

module.exports = {
  VALID_TYPES,
  CustomFieldValidationError,
  getFieldDefinitions,
  validateAndShapeCustomFieldInput,
  shapeCustomFieldInputSync,
  bulkFetchDropdownValues,
  writeCustomFieldValues,
  attachCustomFieldValues,
}
