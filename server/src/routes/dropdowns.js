const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const { BUILT_IN_DROPDOWN_FIELDS } = require('../constants/dropdownFields')

const prisma = new PrismaClient()

// Update 2 — centralized, admin-managed dropdown values. Replaces hardcoded
// arrays across Company/Deal forms, filters, and Bulk Import. Any logged-in
// user can manage these today (no stricter role gate exists elsewhere in the
// app yet), so this only requires `auth`, same as every other route here.

const LEAD_OWNER_FIELD_KEY = 'company.ownerId'

// Lead Owner is NOT a curated DropdownOption list like every other managed
// field — it must always exactly mirror the live set of active users, with
// no possibility of drifting (a manually-disabled row, a stale cached label
// after a rename, a deleted row hiding someone who's still active). So its
// options are computed live from the User table on every read instead of
// being sourced from the DropdownOption table at all. "Unassigned" is a
// permanent, synthetic first entry (value: '') that is never a real row —
// nothing to delete means it can never be removed, satisfying "this should
// never be removed" trivially and for every environment (including a fresh
// production DB) with no seeding required.
async function getLeadOwnerOptions() {
  const users = await prisma.user.findMany({
    where: { status: 'active' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  return [
    { id: 'unassigned', fieldKey: LEAD_OWNER_FIELD_KEY, value: '', label: 'Unassigned', order: -1, enabled: true, protected: true },
    ...users.map((u, i) => ({ id: u.id, fieldKey: LEAD_OWNER_FIELD_KEY, value: u.id, label: u.name, order: i, enabled: true })),
  ]
}

// GET /api/dropdowns/fields — every field this system can manage: the 9
// built-in ones (BUILT_IN_DROPDOWN_FIELDS) plus every active custom field
// whose type is dropdown/multiselect (Dynamic Custom Fields). Declared before
// /:fieldKey so Express doesn't capture "fields" as a fieldKey.
router.get('/fields', auth, async (req, res) => {
  try {
    const customDropdownFields = await prisma.customFieldDefinition.findMany({
      where: { enabled: true, type: { in: ['dropdown', 'multiselect'] } },
      orderBy: { order: 'asc' },
    })
    const fields = [
      ...BUILT_IN_DROPDOWN_FIELDS.map(f => ({ fieldKey: f.fieldKey, label: f.label, group: f.fieldKey.split('.')[0] === 'company' ? 'Company' : 'Deal' })),
      ...customDropdownFields.map(f => ({ fieldKey: `${f.entity.toLowerCase()}.custom.${f.key}`, label: f.label, group: f.entity, custom: true })),
    ]
    res.json(fields)
  } catch (err) {
    console.error('[Dropdowns] fields list error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/dropdowns/:fieldKey — enabled options, ordered. Used by every
// consuming form/filter/import mapper.
router.get('/:fieldKey', auth, async (req, res) => {
  try {
    if (req.params.fieldKey === LEAD_OWNER_FIELD_KEY) {
      return res.json(await getLeadOwnerOptions())
    }
    const options = await prisma.dropdownOption.findMany({
      where: { fieldKey: req.params.fieldKey, enabled: true },
      orderBy: { order: 'asc' },
    })
    res.json(options)
  } catch (err) {
    console.error('[Dropdowns] list error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/dropdowns — admin view: every fieldKey, including disabled values,
// grouped for the management screen.
router.get('/', auth, async (req, res) => {
  try {
    const rows = await prisma.dropdownOption.findMany({
      where: { fieldKey: { not: LEAD_OWNER_FIELD_KEY } },
      orderBy: [{ fieldKey: 'asc' }, { order: 'asc' }],
    })
    const grouped = {}
    for (const row of rows) {
      if (!grouped[row.fieldKey]) grouped[row.fieldKey] = []
      grouped[row.fieldKey].push(row)
    }
    grouped[LEAD_OWNER_FIELD_KEY] = await getLeadOwnerOptions()
    res.json(grouped)
  } catch (err) {
    console.error('[Dropdowns] admin list error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/dropdowns — append a new value to a fieldKey.
router.post('/', auth, async (req, res) => {
  try {
    const { fieldKey, value, label } = req.body
    if (!fieldKey || !value?.trim()) {
      return res.status(400).json({ message: 'fieldKey and value are required.' })
    }
    if (fieldKey === LEAD_OWNER_FIELD_KEY) {
      return res.status(400).json({ message: 'Lead Owner always reflects active users automatically and cannot be edited here.' })
    }
    const max = await prisma.dropdownOption.aggregate({
      where: { fieldKey },
      _max: { order: true },
    })
    const created = await prisma.dropdownOption.create({
      data: {
        fieldKey,
        value: value.trim(),
        label: (label || value).trim(),
        order: (max._max.order ?? -1) + 1,
      },
    })
    res.status(201).json(created)
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'That value already exists for this field.' })
    }
    console.error('[Dropdowns] create error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// PATCH /api/dropdowns/reorder — bulk-update order for one fieldKey's values.
// Declared before /:id so Express doesn't capture "reorder" as an id.
router.patch('/reorder', auth, async (req, res) => {
  try {
    const { orderedIds } = req.body
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ message: 'orderedIds must be a non-empty array.' })
    }
    const leadOwnerRow = await prisma.dropdownOption.findFirst({ where: { id: { in: orderedIds }, fieldKey: LEAD_OWNER_FIELD_KEY } })
    if (leadOwnerRow) {
      return res.status(400).json({ message: 'Lead Owner always reflects active users automatically and cannot be edited here.' })
    }
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.dropdownOption.update({ where: { id }, data: { order: index } })
      )
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[Dropdowns] reorder error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// PATCH /api/dropdowns/:id — edit label and/or enabled state. `value` itself
// is immutable once created: renaming it would silently orphan every
// Company/Deal record that already stored the old string.
router.patch('/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.dropdownOption.findUnique({ where: { id: req.params.id } })
    if (existing?.fieldKey === LEAD_OWNER_FIELD_KEY) {
      return res.status(400).json({ message: 'Lead Owner always reflects active users automatically and cannot be edited here.' })
    }
    const { label, enabled } = req.body
    const data = {}
    if (label !== undefined) data.label = label.trim()
    if (enabled !== undefined) data.enabled = !!enabled
    const updated = await prisma.dropdownOption.update({ where: { id: req.params.id }, data })
    res.json(updated)
  } catch (err) {
    console.error('[Dropdowns] update error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/dropdowns/:id/usage — read-only usage count the frontend calls
// before confirming a disable (PATCH enabled:false), so the confirmation can
// show the real number of existing records affected instead of a generic
// warning. Disabling a value doesn't corrupt data (a stale value already
// degrades gracefully wherever it's shown/edited), so this is a soft warning,
// not a hard block like DELETE below.
router.get('/:id/usage', auth, async (req, res) => {
  try {
    const option = await prisma.dropdownOption.findUnique({ where: { id: req.params.id } })
    if (!option) return res.status(404).json({ message: 'Not found.' })
    const count = await countValueUsage(option.fieldKey, option.value)
    res.json({ count })
  } catch (err) {
    console.error('[Dropdowns] usage error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// DELETE /api/dropdowns/:id — hard-delete only if no Company/Deal row
// currently stores this value; otherwise force a disable instead so existing
// records never end up displaying an unrecognized, orphaned value.
router.delete('/:id', auth, async (req, res) => {
  try {
    const option = await prisma.dropdownOption.findUnique({ where: { id: req.params.id } })
    if (!option) return res.status(404).json({ message: 'Not found.' })
    if (option.fieldKey === LEAD_OWNER_FIELD_KEY) {
      return res.status(400).json({ message: 'Lead Owner always reflects active users automatically and cannot be edited here.' })
    }

    const inUse = await isValueInUse(option.fieldKey, option.value)
    if (inUse) {
      return res.status(409).json({
        message: 'This value is still in use on existing records. Disable it instead of deleting.',
      })
    }

    await prisma.dropdownOption.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('[Dropdowns] delete error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// Matches a custom-field-backed dropdown key, e.g. "company.custom.gstStatus"
// -> { entity: 'Company', key: 'gstStatus' }. The literal ".custom." segment
// can never appear in a real Prisma column name, so this can't collide with
// a built-in fieldKey.
function parseCustomFieldKey(fieldKey) {
  const m = /^(company|deal)\.custom\.(.+)$/.exec(fieldKey)
  if (!m) return null
  return { entity: m[1] === 'company' ? 'Company' : 'Deal', key: m[2] }
}

// Counts real usage of a dropdown value across every place it's stored:
// built-in fields check their real Company/Deal column(s) via
// BUILT_IN_DROPDOWN_FIELDS (unchanged behavior from the old USAGE_LOOKUP,
// just registry-driven, and correctly following `extraUsage` — e.g.
// company.country's count also includes deal.country, since both share the
// same dropdown list); custom fields are checked against CustomFieldValue.
// An unrecognized fieldKey defensively returns 0, same as before.
async function countValueUsage(fieldKey, value) {
  const builtIn = BUILT_IN_DROPDOWN_FIELDS.find(f => f.fieldKey === fieldKey)
  if (builtIn) {
    const targets = [{ model: builtIn.model, column: builtIn.column }, ...(builtIn.extraUsage || [])]
    let total = 0
    for (const t of targets) total += await prisma[t.model].count({ where: { [t.column]: value } })
    return total
  }

  const custom = parseCustomFieldKey(fieldKey)
  if (custom) {
    const field = await prisma.customFieldDefinition.findUnique({
      where: { entity_key: { entity: custom.entity, key: custom.key } },
    })
    if (!field) return 0
    return prisma.customFieldValue.count({
      where: { fieldId: field.id, OR: [{ textValue: value }, { listValue: { array_contains: [value] } }] },
    })
  }

  return 0
}

async function isValueInUse(fieldKey, value) {
  return (await countValueUsage(fieldKey, value)) > 0
}

module.exports = router
