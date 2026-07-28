const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Update 2 — centralized, admin-managed dropdown values. Replaces hardcoded
// arrays across Company/Deal forms, filters, and Bulk Import. Any logged-in
// user can manage these today (no stricter role gate exists elsewhere in the
// app yet), so this only requires `auth`, same as every other route here.

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

// Company/Deal fields this system currently manages, mapped to every
// table + column that stores that value, so a delete can check real usage
// before allowing a hard removal. 'company.country' lists both — it's a
// single shared list (CreateDealModal reuses the same managed values as
// Company), so either table's usage must block a hard delete.
const USAGE_LOOKUP = {
  'company.industry':   [{ model: 'company', column: 'industry' }],
  'company.country':    [{ model: 'company', column: 'country' }, { model: 'deal', column: 'country' }],
  'company.leadStatus':  [{ model: 'company', column: 'leadStatus' }],
  'deal.stage':                [{ model: 'deal', column: 'stage' }],
  'deal.clientType':           [{ model: 'deal', column: 'clientType' }],
  'deal.serviceRequirement':   [{ model: 'deal', column: 'serviceRequirement' }],
  'deal.opportunityType':      [{ model: 'deal', column: 'opportunityType' }],
  'deal.strategicImportance':  [{ model: 'deal', column: 'strategicImportance' }],
  'deal.expectedOutcome':      [{ model: 'deal', column: 'expectedOutcome' }],
}

async function isValueInUse(fieldKey, value) {
  const targets = USAGE_LOOKUP[fieldKey]
  if (!targets) return false
  for (const t of targets) {
    const count = await prisma[t.model].count({ where: { [t.column]: value } })
    if (count > 0) return true
  }
  return false
}

module.exports = router
