const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// GET /api/dashboard/stats — the 6 KPI widgets (Update 6). Every number is a
// DB-side count, never a full-table fetch — the old Dashboard computed its 3
// deal cards by shipping the entire /deals list to the browser, which doesn't
// scale; this replaces that pattern rather than extending it further.
router.get('/stats', auth, async (req, res) => {
  try {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfTomorrow = new Date(startOfToday.getTime() + 86400000)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      totalCompanies,
      dealsInProgress,
      wonClientsThisMonth,
      callsFromActivities,
      callsFromCallLog,
      followUpsDueToday,
      tasksOverdue,
    ] = await Promise.all([
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.deal.count({ where: { stage: { notIn: ['Won', 'Lost'] } } }),
      prisma.deal.count({ where: { stage: 'Won', updatedAt: { gte: startOfMonth } } }),
      prisma.activity.count({ where: { type: 'call', createdAt: { gte: startOfToday, lt: startOfTomorrow } } }),
      prisma.callLog.count({ where: { callDate: { gte: startOfToday, lt: startOfTomorrow } } }),
      prisma.activity.count({ where: { type: 'task', dueDate: { gte: startOfToday, lt: startOfTomorrow }, taskStatus: { not: 'completed' } } }),
      prisma.activity.count({ where: { type: 'task', dueDate: { lt: startOfToday }, taskStatus: { not: 'completed' } } }),
    ])

    res.json({
      totalCompanies,
      dealsInProgress,
      wonClientsThisMonth,
      callsToday: callsFromActivities + callsFromCallLog,
      followUpsDueToday,
      tasksOverdue,
    })
  } catch (err) {
    console.error('[Dashboard] stats error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
