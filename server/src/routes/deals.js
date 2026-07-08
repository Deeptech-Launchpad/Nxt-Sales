const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const STAGES = ['New', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost']

// GET /api/deals
router.get('/', auth, async (req, res) => {
  try {
    const deals = await prisma.deal.findMany({
      where: { ownerId: req.user.id },
      include: { contact: { select: { id: true, name: true, company: true } } },
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
    const { title, value, stage, contactId, closeDate, notes } = req.body
    if (!title) return res.status(400).json({ message: 'Title is required.' })
    const deal = await prisma.deal.create({
      data: { title, value: Number(value) || 0, stage: stage || 'New', contactId, closeDate: closeDate ? new Date(closeDate) : null, notes, ownerId: req.user.id },
    })
    res.status(201).json(deal)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// PUT /api/deals/:id
router.put('/:id', auth, async (req, res) => {
  try {
    await prisma.deal.updateMany({ where: { id: req.params.id, ownerId: req.user.id }, data: req.body })
    res.json({ success: true })
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
