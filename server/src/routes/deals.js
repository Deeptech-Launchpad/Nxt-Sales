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
  // Nullable dates — empty string/null clears it, otherwise parse to a Date.
  if (body.pocReceivedDate !== undefined) data.pocReceivedDate = body.pocReceivedDate ? new Date(body.pocReceivedDate) : null
  if (body.pocDeliveredDate !== undefined) data.pocDeliveredDate = body.pocDeliveredDate ? new Date(body.pocDeliveredDate) : null
  // Deal Open Date - the business date the deal opened (NOT createdAt).
  if (body.openDate !== undefined) data.openDate = body.openDate ? new Date(body.openDate) : null
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

// POST /api/deals/bulk — Deal bulk import (Update 1).
//
// Mirrors companies.js's /bulk contract so the client import flow is the same
// shape: { deals: [...] } in, { created, failed, errors } out. Deliberately
// simpler than the Company importer in one respect — Deal has no natural
// duplicate key (two genuine deals can share a title and a company), so rows
// are always CREATED, never merged into an existing deal. That avoids silently
// overwriting a real deal because it happened to share a title.
//
// Declared before any /:id-shaped route so "bulk" is never captured as an id.
router.post('/bulk', auth, async (req, res) => {
  try {
    const { deals } = req.body
    if (!Array.isArray(deals) || deals.length === 0) {
      return res.status(400).json({ message: 'No deals provided.' })
    }

    // Company can be linked by id, or resolved by name so a spreadsheet can
    // reference companies the way a human writes them. Loaded once rather than
    // queried per row — the same N+1 mistake the Company importer had to fix.
    const companies = await prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
    })
    const byName = new Map(companies.map(c => [c.name.trim().toLowerCase(), c.id]))
    const validIds = new Set(companies.map(c => c.id))

    let created = 0, failed = 0
    const errors = []

    for (let i = 0; i < deals.length; i++) {
      const row = deals[i] || {}
      const rowNo = i + 2 // +2 = 1-based, plus the header row, matching the sheet
      try {
        const title = String(row.title || '').trim()
        if (!title) { failed++; errors.push(`Row ${rowNo}: Title is required.`); continue }

        const data = buildDealData({ ...row, title })

        // Resolve the company link: an explicit valid id wins, otherwise match
        // on companyName. An unmatched name is NOT an error — Deal.companyId is
        // nullable, so the deal is created unlinked and reported.
        let companyId = null
        if (row.companyId && validIds.has(row.companyId)) companyId = row.companyId
        else if (row.companyName) companyId = byName.get(String(row.companyName).trim().toLowerCase()) || null
        data.companyId = companyId
        if (!companyId && row.companyName) {
          errors.push(`Row ${rowNo}: No company matched "${row.companyName}" — deal imported without a company link.`)
        }

        // Every deal needs an owner; the importing user owns rows that don't
        // name one (ownerId is required on the model).
        data.ownerId = req.user.id

        await prisma.deal.create({ data })
        created++
      } catch (e) {
        failed++
        errors.push(`Row ${rowNo}: ${e.message}`)
      }
    }

    res.json({ created, failed, total: deals.length, errors: errors.slice(0, 100) })
  } catch (err) {
    console.error('[Deals] bulk import error:', err.message)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// GET /api/deals/export — every deal matching the caller's scope, unpaginated,
// for the Export menu. Mirrors companies.js's /export.
router.get('/export', auth, async (req, res) => {
  try {
    const { view } = req.query
    const where = view === 'mine' ? { ownerId: req.user.id } : {}
    const deals = await prisma.deal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { id: true, name: true } },
        owner:   { select: { id: true, name: true, email: true } },
      },
    })
    res.json({ deals, total: deals.length })
  } catch (err) {
    console.error('[Deals] export error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/deals
// No params → EVERY deal visible to the current user (global "All Deals"
// dashboard) — matches Companies' own default-unfiltered list. ?view=mine
// → only deals the current user owns (Deal.ownerId), same opt-in-scoping
// pattern as company.js's buildCompanyWhere (view === 'mine'), instead of
// this route unconditionally restricting to the current user by default.
// ?companyId=… → all deals for that company (Company details page).
router.get('/', auth, async (req, res) => {
  try {
    const { companyId, view } = req.query
    // Dashboard listing (no explicit companyId) hides deals whose linked
    // company is in the Recycle Bin — it should behave as if that company no
    // longer exists. Deals with no company at all (companyId: null) are unaffected.
    const where = companyId
      ? { companyId }
      : {
          ...(view === 'mine' && { ownerId: req.user.id }),
          OR: [{ companyId: null }, { company: { deletedAt: null } }],
        }
    const deals = await prisma.deal.findMany({
      where,
      include: {
        // company.ownerId is the linked company's Lead Owner — exposed for
        // display (and any other page still keying off it), separate from
        // this route's own Deal.ownerId-based ?view=mine filter above.
        // owner (the Deal's own owner) is now included so the client can
        // show the correct owner initials per row — All Deals can show
        // deals belonging to any user, not just the one viewing the page.
        company: { select: { id: true, name: true, ownerId: true } },
        owner:   { select: { id: true, name: true } },
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
