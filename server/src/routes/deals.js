const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const { getImportFields } = require('../utils/importFields')
const {
  validateAndShapeCustomFieldInput, writeCustomFieldValues, attachCustomFieldValues,
  CustomFieldValidationError, getFieldDefinitions, shapeCustomFieldInputSync, bulkFetchDropdownValues,
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
  if (body.poc !== undefined) data.poc = !!body.poc
  if (body.proposalShared !== undefined) data.proposalShared = !!body.proposalShared
  if (body.pocReceivedDate !== undefined) data.pocReceivedDate = body.pocReceivedDate ? new Date(body.pocReceivedDate) : null
  if (body.pocDeliveredDate !== undefined) data.pocDeliveredDate = body.pocDeliveredDate ? new Date(body.pocDeliveredDate) : null
  return data
}

function buildDealWhere(query, userId) {
  const { companyId, view, search, country, clientType, stage, opportunityType, strategicImportance, expectedOutcome } = query
  const where = {}

  if (companyId) {
    where.companyId = companyId
  } else {
    where.OR = [{ companyId: null }, { company: { deletedAt: null } }]
    if (view === 'mine') {
      where.ownerId = userId
    }
  }

  if (country) {
    const list = Array.isArray(country) ? country : country.split(',')
    where.country = { in: list, mode: 'insensitive' }
  }
  if (clientType) {
    const list = Array.isArray(clientType) ? clientType : clientType.split(',')
    where.clientType = { in: list }
  }
  if (stage) {
    const list = Array.isArray(stage) ? stage : stage.split(',')
    where.stage = { in: list }
  }
  if (opportunityType) {
    const list = Array.isArray(opportunityType) ? opportunityType : opportunityType.split(',')
    where.opportunityType = { in: list }
  }
  if (strategicImportance) {
    const list = Array.isArray(strategicImportance) ? strategicImportance : strategicImportance.split(',')
    where.strategicImportance = { in: list }
  }
  if (expectedOutcome) {
    const list = Array.isArray(expectedOutcome) ? expectedOutcome : expectedOutcome.split(',')
    where.expectedOutcome = { in: list }
  }

  if (search && search.trim()) {
    const q = search.trim()
    const searchCondition = [
      { title: { contains: q, mode: 'insensitive' } },
      { companyName: { contains: q, mode: 'insensitive' } },
      { contactPerson: { contains: q, mode: 'insensitive' } },
      { contactEmail: { contains: q, mode: 'insensitive' } },
      { domainName: { contains: q, mode: 'insensitive' } },
    ]
    if (where.OR) {
      where.AND = [{ OR: searchCondition }]
    } else {
      where.OR = searchCondition
    }
  }

  return where
}

// GET /api/deals/import-fields
router.get('/import-fields', auth, async (req, res) => {
  try {
    res.json(await getImportFields('Deal'))
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/deals/export
router.get('/export', auth, async (req, res) => {
  try {
    const where = buildDealWhere(req.query, req.user.id)
    const deals = await prisma.deal.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, ownerId: true } },
        owner:   { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    await attachCustomFieldValues('Deal', deals)
    res.json({ deals, total: deals.length })
  } catch (err) {
    console.error('Deal export error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/deals/check-duplicates
router.post('/check-duplicates', auth, async (req, res) => {
  try {
    const { deals } = req.body
    if (!Array.isArray(deals)) return res.status(400).json({ message: 'deals array required.' })

    const existingDeals = await prisma.deal.findMany({
      select: { id: true, title: true, companyName: true, contactEmail: true },
    })

    const byTitle = new Map()
    existingDeals.forEach(d => {
      if (d.title) byTitle.set(d.title.trim().toLowerCase(), d)
    })

    const results = deals.map(d => {
      const title = d.title ? String(d.title).trim() : ''
      if (!title) return { isDuplicate: false, existing: null }
      const existing = byTitle.get(title.toLowerCase())
      return { isDuplicate: !!existing, existing: existing ? { id: existing.id, title: existing.title } : null }
    })

    res.json({ results })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/deals/bulk
router.post('/bulk', auth, async (req, res) => {
  try {
    const { deals } = req.body
    if (!Array.isArray(deals) || deals.length === 0) {
      return res.status(400).json({ message: 'No deals provided.' })
    }

    let created = 0, updated = 0, unchanged = 0, failed = 0
    const errors = []
    const messages = []

    const customFieldDefs = await getFieldDefinitions('Deal')
    const dropdownValuesByFieldKey = await bulkFetchDropdownValues('Deal', customFieldDefs)
    const customFieldTouches = []

    const existingCompanies = await prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, domain: true },
    })
    const companyByName = new Map()
    existingCompanies.forEach(c => {
      if (c.name) companyByName.set(c.name.trim().toLowerCase(), c)
    })

    for (const d of deals) {
      try {
        if (!d.title || !String(d.title).trim()) {
          errors.push('Missing deal title — row skipped')
          failed++
          continue
        }

        let shapedCustomFields = []
        if (customFieldDefs.length) {
          const rawCustomFields = {}
          for (const k in d) if (k.startsWith('custom.') && d[k] !== '') rawCustomFields[k.slice(7)] = d[k]
          if (Object.keys(rawCustomFields).length) {
            const { shaped, errors: cfErrors } = shapeCustomFieldInputSync('Deal', customFieldDefs, rawCustomFields, dropdownValuesByFieldKey)
            if (cfErrors.length) {
              failed++
              errors.push(`${d.title}: ${cfErrors.map(e => e.message).join('; ')}`)
              continue
            }
            shapedCustomFields = shaped
          }
        }

        let matchedCompanyId = null
        if (d.companyName && String(d.companyName).trim()) {
          const cMatch = companyByName.get(String(d.companyName).trim().toLowerCase())
          if (cMatch) matchedCompanyId = cMatch.id
        }

        const valueNum = Number(d.value) || 0
        const currencyVal = ['USD', 'CAD', 'GBP', 'EUR', 'AUD'].includes(d.currency) ? d.currency : 'USD'
        const stageVal = d.stage || 'Discussion'

        const importBoolean = (v) => {
          if (typeof v === 'boolean') return v
          if (typeof v === 'number') return v !== 0
          return ['true', 'yes', 'y', '1'].includes(String(v || '').trim().toLowerCase())
        }

        const parseOptDate = (v) => (v && !isNaN(new Date(v).getTime())) ? new Date(v) : null

        const newDeal = await prisma.deal.create({
          data: {
            title: String(d.title).trim(),
            value: valueNum,
            currency: currencyVal,
            stage: stageVal,
            ownerId: req.user.id,
            companyId: matchedCompanyId,
            companyName: d.companyName || null,
            domainName: d.domainName || null,
            country: d.country || null,
            clientType: d.clientType || null,
            contactPerson: d.contactPerson || null,
            contactPhone: d.contactPhone || null,
            contactEmail: d.contactEmail || null,
            serviceRequirement: d.serviceRequirement || null,
            clientWebsiteUrl: d.clientWebsiteUrl || null,
            opportunityType: d.opportunityType || null,
            strategicImportance: d.strategicImportance || null,
            expectedOutcome: d.expectedOutcome || null,
            notes: d.notes || null,
            poc: importBoolean(d.poc),
            proposalShared: importBoolean(d.proposalShared),
            pocReceivedDate: parseOptDate(d.pocReceivedDate),
            pocDeliveredDate: parseOptDate(d.pocDeliveredDate),
          },
        })

        created++
        if (shapedCustomFields.length) {
          customFieldTouches.push({ recordId: newDeal.id, isNew: true, shaped: shapedCustomFields })
        }
      } catch (rowErr) {
        failed++
        errors.push(`${d.title || 'unknown'}: ${rowErr.message}`)
      }
    }

    if (customFieldTouches.length) {
      const toRow = (fieldId, recordId, r) => ({
        fieldId, recordId,
        textValue: r.textValue ?? null, numberValue: r.numberValue ?? null,
        dateValue: r.dateValue ?? null, boolValue: r.boolValue ?? null, listValue: r.listValue ?? null,
      })
      const newRows = customFieldTouches
        .filter(t => t.isNew)
        .flatMap(t => t.shaped.filter(r => !r.clear).map(r => toRow(r.fieldId, t.recordId, r)))
      if (newRows.length) {
        await prisma.customFieldValue.createMany({ data: newRows, skipDuplicates: true })
      }
    }

    res.json({ created, updated, unchanged, failed, errors, messages })
  } catch (err) {
    console.error(err)
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
    console.error('Deals list error:', err.message)
    res.json([])
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
