const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient, Prisma } = require('@prisma/client')
const { VALID_TYPES } = require('../utils/customFieldValues')

const prisma = new PrismaClient()

const VALID_ENTITIES = ['Company', 'Deal', 'Task', 'Meeting']
const ENTITY_LIST_LABEL = VALID_ENTITIES.join(', ')

// Real scalar columns on the target Prisma model — a custom field's `key`
// can never collide with one of these (Built-in fields are structurally
// protected: they're never CustomFieldDefinition rows, and a custom field
// can never impersonate/shadow one). Task and Meeting aren't real Prisma
// models — they're Activity rows discriminated by `type` — so both map to
// the actual Activity model here while every other lookup in this file
// keeps using the literal 'Task'/'Meeting' string for the
// CustomFieldDefinition.entity column and the custom.<key> convention.
function builtInColumnNames(entity) {
  const modelName = (entity === 'Task' || entity === 'Meeting') ? 'Activity' : entity
  const model = Prisma.dmmf.datamodel.models.find(m => m.name === modelName)
  return new Set(model ? model.fields.filter(f => f.kind === 'scalar').map(f => f.name) : [])
}

// "GST Number" -> "gstNumber". Only used to auto-generate `key` from `label`
// at creation — key is immutable after that, so this never runs again for
// an existing field.
function slugifyToCamelCase(label) {
  const words = String(label || '').trim().split(/[^a-zA-Z0-9]+/).filter(Boolean)
  if (!words.length) return ''
  return words.map((w, i) => {
    const lower = w.toLowerCase()
    return i === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
  }).join('')
}

// GET /api/custom-fields/:entity — enabled definitions, for every non-admin
// consumer (forms, Edit Columns, import merge).
router.get('/:entity', auth, async (req, res) => {
  try {
    const { entity } = req.params
    if (!VALID_ENTITIES.includes(entity)) return res.status(400).json({ message: `entity must be one of: ${ENTITY_LIST_LABEL}.` })
    const fields = await prisma.customFieldDefinition.findMany({ where: { entity, enabled: true }, orderBy: { order: 'asc' } })
    res.json(fields)
  } catch (err) {
    console.error('[CustomFields] list error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/custom-fields/:entity/all — every definition including disabled,
// for the Settings → Custom Fields management screen.
router.get('/:entity/all', auth, async (req, res) => {
  try {
    const { entity } = req.params
    if (!VALID_ENTITIES.includes(entity)) return res.status(400).json({ message: `entity must be one of: ${ENTITY_LIST_LABEL}.` })
    const fields = await prisma.customFieldDefinition.findMany({ where: { entity }, orderBy: { order: 'asc' } })
    res.json(fields)
  } catch (err) {
    console.error('[CustomFields] admin list error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/custom-fields — create a new field definition.
router.post('/', auth, async (req, res) => {
  try {
    const { entity, label, type, required, helpText } = req.body
    let { key } = req.body

    if (!VALID_ENTITIES.includes(entity)) return res.status(400).json({ message: `entity must be one of: ${ENTITY_LIST_LABEL}.` })
    if (!label?.trim()) return res.status(400).json({ message: 'label is required.' })
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ message: `type must be one of: ${VALID_TYPES.join(', ')}.` })

    key = (key || slugifyToCamelCase(label)).trim()
    if (!key || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) {
      return res.status(400).json({ message: 'Could not derive a valid field key from that label — try a different label or a shorter, letters-only key.' })
    }
    if (builtInColumnNames(entity).has(key)) {
      return res.status(409).json({ message: `"${key}" is already a built-in ${entity} field and can't be used as a custom field key.` })
    }

    const max = await prisma.customFieldDefinition.aggregate({ where: { entity }, _max: { order: true } })
    const created = await prisma.customFieldDefinition.create({
      data: {
        entity, key, label: label.trim(), type,
        required: !!required, helpText: helpText?.trim() || null,
        order: (max._max.order ?? -1) + 1,
        createdById: req.user.id,
      },
    })
    res.status(201).json(created)
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'A field with this key already exists for this entity.' })
    }
    console.error('[CustomFields] create error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// PATCH /api/custom-fields/reorder — declared before /:id so Express doesn't
// capture "reorder" as an id. Structurally identical to dropdowns.js's
// PATCH /reorder.
router.patch('/reorder', auth, async (req, res) => {
  try {
    const { orderedIds } = req.body
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ message: 'orderedIds must be a non-empty array.' })
    }
    await prisma.$transaction(
      orderedIds.map((id, index) => prisma.customFieldDefinition.update({ where: { id }, data: { order: index } }))
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('[CustomFields] reorder error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// PATCH /api/custom-fields/:id — edits label/helpText/required/enabled only.
// `key` is never accepted here, under any circumstance — renaming the label
// never touches it, so every downstream consumer keyed by `key` (values,
// DropdownOption's fieldKey convention, the custom.<key> API/column
// convention) keeps working across any number of label renames. `type` is
// additionally only editable while no value has been stored yet — mirrors
// the existing rule that DropdownOption.value is immutable once created.
router.patch('/:id', auth, async (req, res) => {
  try {
    const { label, helpText, required, enabled, type } = req.body
    const data = {}
    if (label !== undefined) {
      if (!label.trim()) return res.status(400).json({ message: 'label cannot be empty.' })
      data.label = label.trim()
    }
    if (helpText !== undefined) data.helpText = helpText?.trim() || null
    if (required !== undefined) data.required = !!required
    if (enabled !== undefined) data.enabled = !!enabled

    if (type !== undefined) {
      if (!VALID_TYPES.includes(type)) return res.status(400).json({ message: `type must be one of: ${VALID_TYPES.join(', ')}.` })
      const valueCount = await prisma.customFieldValue.count({ where: { fieldId: req.params.id } })
      if (valueCount > 0) {
        return res.status(409).json({ message: 'This field already has stored values — its type can no longer be changed.' })
      }
      data.type = type
    }

    const updated = await prisma.customFieldDefinition.update({ where: { id: req.params.id }, data })
    res.json(updated)
  } catch (err) {
    console.error('[CustomFields] update error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// DELETE /api/custom-fields/:id — hard-delete only if no record currently
// stores a value for this field; otherwise disable instead so existing
// records never end up with a silently-orphaned reference.
router.delete('/:id', auth, async (req, res) => {
  try {
    const field = await prisma.customFieldDefinition.findUnique({ where: { id: req.params.id } })
    if (!field) return res.status(404).json({ message: 'Not found.' })

    const valueCount = await prisma.customFieldValue.count({ where: { fieldId: field.id } })
    if (valueCount > 0) {
      return res.status(409).json({ message: 'This field has stored values on existing records. Disable it instead of deleting.' })
    }

    await prisma.customFieldDefinition.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('[CustomFields] delete error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
