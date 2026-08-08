const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const { getImportFields } = require('../utils/importFields')
const {
  validateAndShapeCustomFieldInput, writeCustomFieldValues, attachCustomFieldValues,
  CustomFieldValidationError,
} = require('../utils/customFieldValues')

const prisma = new PrismaClient()

const CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR', 'AUD']

// Extended Deal fields (Update 9). Value/stage are the pre-existing columns,
// reused as "Estimated Deal Value" / "Deal Stage" rather than adding
// duplicate columns.
const TEXT_FIELDS = [
  'country', 'companyName', 'domainName', 'clientType', 'contactPerson',
  'contactPhone', 'contactEmail', 'serviceRequirement', 'clientWebsiteUrl',
  'opportunityType', 'strategicImportance', 'expectedOutcome',
]

function buildDealData(body) {
  const data = {}
  for (const f of TEXT_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f] || null
  }
  if (body.title !== undefined) data.title = body.title
  if (body.value !== undefined) data.value = Number(body.value) || 0
  if (body.currency !== undefined) data.currency = CURRENCIES.includes(body.currency) ? body.currency : 'USD'
  if (body.stage !== undefined) data.stage = body.stage || 'Discussion'
  if (body.notes !== undefined) data.notes = body.notes || null
  if (body.companyId !== undefined) data.companyId = body.companyId || null
  // Independent of stage — explicit boolean coercion, not the TEXT_FIELDS
  // loop above (which does `body[f] || null` and would turn `false` into
  // `null`, silently breaking an unchecked checkbox).
  if (body.poc !== undefined) data.poc = !!body.poc
  if (body.proposalShared !== undefined) data.proposalShared = !!body.proposalShared
  return data
}

// GET /api/deals/import-fields (before /:id-shaped routes so a literal
// "import-fields" path segment is never captured as anything else — Deal has
// no /:id GET route today, but keeping the same convention as companies.js).
router.get('/import-fields', auth, async (req, res) => {
  try {
    res.json(await getImportFields('Deal'))
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/deals
// No params → the logged-in user's deals (global Deals dashboard, unchanged).
// ?companyId=… → all deals for that company (Company details page).
router.get('/', auth, async (req, res) => {
  try {
    const { companyId } = req.query
    // Dashboard listing (no explicit companyId) hides deals whose linked
    // company is in the Recycle Bin — it should behave as if that company no
    // longer exists. Deals with no company at all (companyId: null) are unaffected.
    const where = companyId
      ? { companyId }
      : { ownerId: req.user.id, OR: [{ companyId: null }, { company: { deletedAt: null } }] }
    const deals = await prisma.deal.findMany({
      where,
      include: {
        // ownerId is the linked company's Lead Owner — exposed so the client
        // can filter "My Deals" (deals on companies I'm the Lead Owner of),
        // which is a different scope than this route's own ownerId filter
        // above (deals I personally created/own).
        company: { select: { id: true, name: true, ownerId: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    await attachCustomFieldValues('Deal', deals)
    res.json(deals)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/deals
router.post('/', auth, async (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ message: 'Title is required.' })

    // Validate custom fields BEFORE any write — new, separate write path
    // appended after the existing fixed-field logic, never merged into it.
    let shapedCustomFields
    try {
      shapedCustomFields = await validateAndShapeCustomFieldInput('Deal', req.body.customFields)
    } catch (e) {
      if (e instanceof CustomFieldValidationError) return res.status(400).json({ message: 'Invalid custom field value(s).', errors: e.errors })
      throw e
    }

    const deal = await prisma.$transaction(async (tx) => {
      const created = await tx.deal.create({ data: { ...buildDealData(req.body), ownerId: req.user.id } })
      await writeCustomFieldValues(created.id, shapedCustomFields, tx)
      return created
    })
    await attachCustomFieldValues('Deal', [deal])
    res.status(201).json(deal)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// PUT /api/deals/:id
router.put('/:id', auth, async (req, res) => {
  try {
    let shapedCustomFields
    try {
      shapedCustomFields = await validateAndShapeCustomFieldInput('Deal', req.body.customFields)
    } catch (e) {
      if (e instanceof CustomFieldValidationError) return res.status(400).json({ message: 'Invalid custom field value(s).', errors: e.errors })
      throw e
    }

    const deal = await prisma.$transaction(async (tx) => {
      await tx.deal.updateMany({ where: { id: req.params.id, ownerId: req.user.id }, data: buildDealData(req.body) })
      await writeCustomFieldValues(req.params.id, shapedCustomFields, tx)
      return tx.deal.findUnique({ where: { id: req.params.id } })
    })
    if (deal) await attachCustomFieldValues('Deal', [deal])
    res.json(deal)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// DELETE /api/deals/:id — Deal has no soft-delete/Recycle Bin, this is an
// immediate hard delete. Cleans up any Custom Field values for this deal in
// the SAME transaction (CustomFieldValue.recordId is intentionally
// polymorphic with no database foreign key — see purgeRecycleBin.js for the
// other half of this data-integrity contract, including the periodic
// orphan-sweep safety net).
router.delete('/:id', auth, async (req, res) => {
  try {
    await prisma.$transaction([
      prisma.customFieldValue.deleteMany({ where: { recordId: req.params.id } }),
      prisma.deal.deleteMany({ where: { id: req.params.id, ownerId: req.user.id } }),
    ])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
