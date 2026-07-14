const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const STAGES = ['Discussion', 'Pilot', 'Proposal', 'Qualified', 'Negotiation', 'Won', 'Lost']

// Extended Deal fields (Update 9). Value/stage are the pre-existing columns,
// reused as "Estimated Deal Value (USD)" / "Deal Stage" rather than adding
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
  if (body.stage !== undefined) data.stage = body.stage || 'Discussion'
  if (body.notes !== undefined) data.notes = body.notes || null
  if (body.contactId !== undefined) data.contactId = body.contactId || null
  if (body.companyId !== undefined) data.companyId = body.companyId || null
  if (body.closeDate !== undefined) data.closeDate = body.closeDate ? new Date(body.closeDate) : null
  return data
}

// GET /api/deals
// No params → the logged-in user's deals (global Deals dashboard, unchanged).
// ?companyId=… → all deals for that company (Company details page).
router.get('/', auth, async (req, res) => {
  try {
    const { companyId } = req.query
    const where = companyId ? { companyId } : { ownerId: req.user.id }
    const deals = await prisma.deal.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, company: true } },
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(deals)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/deals
router.post('/', auth, async (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ message: 'Title is required.' })
    const deal = await prisma.deal.create({
      data: { ...buildDealData(req.body), ownerId: req.user.id },
    })
    res.status(201).json(deal)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// PUT /api/deals/:id
router.put('/:id', auth, async (req, res) => {
  try {
    await prisma.deal.updateMany({ where: { id: req.params.id, ownerId: req.user.id }, data: buildDealData(req.body) })
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } })
    res.json(deal)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// DELETE /api/deals/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await prisma.deal.deleteMany({ where: { id: req.params.id, ownerId: req.user.id } })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
