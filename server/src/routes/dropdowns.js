const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const { BUILT_IN_DROPDOWN_FIELDS } = require('../constants/dropdownFields')

const prisma = new PrismaClient()

// Update 2 — centralized, admin-managed dropdown values. Replaces hardcoded
// arrays across Company/Deal forms, filters, and Bulk Import. Any logged-in
// user can manage these today (no stricter role gate exists elsewhere in the
// app yet), so this only requires `auth`, same as every other route here.

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
    const rows = await prisma.dropdownOption.findMany({ orderBy: [{ fieldKey: 'asc' }, { order: 'asc' }] })
    const grouped = {}
    for (const row of rows) {
      if (!grouped[row.fieldKey]) grouped[row.fieldKey] = []
      grouped[row.fieldKey].push(row)
    }
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

// DELETE /api/dropdowns/:id — hard-delete only if no Company/Deal row
// currently stores this value; otherwise force a disable instead so existing
// records never end up displaying an unrecognized, orphaned value.
router.delete('/:id', auth, async (req, res) => {
  try {
    const option = await prisma.dropdownOption.findUnique({ where: { id: req.params.id } })
    if (!option) return res.status(404).json({ message: 'Not found.' })

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

// Checks real usage before a hard delete: built-in fields are checked against
// their real Company/Deal column(s) via BUILT_IN_DROPDOWN_FIELDS (unchanged
// behavior from the old USAGE_LOOKUP, just registry-driven); custom fields
// are checked against CustomFieldValue. An unrecognized fieldKey defensively
// returns false, same as before.
async function isValueInUse(fieldKey, value) {
  const builtIn = BUILT_IN_DROPDOWN_FIELDS.find(f => f.fieldKey === fieldKey)
  if (builtIn) {
    const targets = [{ model: builtIn.model, column: builtIn.column }, ...(builtIn.extraUsage || [])]
    for (const t of targets) {
      const count = await prisma[t.model].count({ where: { [t.column]: value } })
      if (count > 0) return true
    }
    return false
  }

  const custom = parseCustomFieldKey(fieldKey)
  if (custom) {
    const field = await prisma.customFieldDefinition.findUnique({
      where: { entity_key: { entity: custom.entity, key: custom.key } },
    })
    if (!field) return false
    const count = await prisma.customFieldValue.count({
      where: { fieldId: field.id, OR: [{ textValue: value }, { listValue: { array_contains: [value] } }] },
    })
    return count > 0
  }

  return false
}

module.exports = router
