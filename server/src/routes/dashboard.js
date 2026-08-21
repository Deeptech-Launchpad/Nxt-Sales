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
      todayTasks,
    ] = await Promise.all([
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.deal.count({ where: { stage: { notIn: ['Won', 'Lost'] } } }),
      prisma.deal.count({ where: { stage: 'Won', updatedAt: { gte: startOfMonth } } }),
      prisma.activity.count({ where: { type: 'call', createdAt: { gte: startOfToday, lt: startOfTomorrow } } }),
      prisma.callLog.count({ where: { callDate: { gte: startOfToday, lt: startOfTomorrow } } }),
      prisma.activity.count({ where: { type: 'task', dueDate: { gte: startOfToday, lt: startOfTomorrow }, taskStatus: { not: 'completed' } } }),
      prisma.activity.count({ where: { type: 'task', dueDate: { lt: startOfToday }, taskStatus: { not: 'completed' } } }),
      // Small preview list (not just the count above) for the dashboard's
      // "Today Tasks" panel — soonest-due first, capped so this stays a
      // lightweight preview rather than a full second Tasks page.
      prisma.activity.findMany({
        where: { type: 'task', dueDate: { gte: startOfToday, lt: startOfTomorrow }, taskStatus: { not: 'completed' } },
        orderBy: { dueDate: 'asc' },
        take: 6,
        select: {
          id: true, title: true, dueDate: true,
          company: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      }),
    ])

    res.json({
      totalCompanies,
      dealsInProgress,
      wonClientsThisMonth,
      callsToday: callsFromActivities + callsFromCallLog,
      followUpsDueToday,
      tasksOverdue,
      todayTasks,
    })
  } catch (err) {
    console.error('[Dashboard] stats error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/dashboard/deal-stats — every metric on the dedicated Deals
// Dashboard. Same discipline as /stats above: each figure is a DB-side count,
// never a full /deals fetch shipped to the browser (the Main Dashboard used to
// derive its deal cards that way, which is exactly what this replaces).
//
// `stageBreakdown` and `recent` are small grouped/limited reads so the page can
// show a stage chart and a recent list without a second round trip.
router.get('/deal-stats', auth, async (req, res) => {
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Month/Year filter — scoped on Deal.openDate ("Deal Open Date", the
    // business date the deal opened), deliberately NOT createdAt (when the row
    // was entered) and never any Company date. `year` alone filters a whole
    // year; `month` (1-12) narrows it. Deals with no openDate set are excluded
    // while a filter is active, since they cannot be placed in a period —
    // that count is returned as `undatedDeals` so the UI can say so rather
    // than letting them silently vanish.
    const year  = parseInt(req.query.year, 10)
    const month = parseInt(req.query.month, 10)
    let dateWhere = {}
    if (Number.isFinite(year)) {
      const from = Number.isFinite(month) && month >= 1 && month <= 12
        ? new Date(year, month - 1, 1)
        : new Date(year, 0, 1)
      const to = Number.isFinite(month) && month >= 1 && month <= 12
        ? new Date(year, month, 1)
        : new Date(year + 1, 0, 1)
      dateWhere = { openDate: { gte: from, lt: to } }
    }
    const scoped = (extra = {}) => ({ ...dateWhere, ...extra })
    const filterActive = Object.keys(dateWhere).length > 0

    const [
      totalDeals,
      activeDeals,
      wonDeals,
      lostDeals,
      pocDeals,
      proposalSharedDeals,
      wonClientsThisMonth,
      dealsWithoutCompany,
      stageGroups,
      valueAgg,
      recent,
    ] = await Promise.all([
      prisma.deal.count({ where: scoped() }),
      prisma.deal.count({ where: scoped({ stage: { notIn: ['Won', 'Lost'] } }) }),
      prisma.deal.count({ where: scoped({ stage: 'Won' }) }),
      prisma.deal.count({ where: scoped({ stage: 'Lost' }) }),
      prisma.deal.count({ where: scoped({ poc: true }) }),
      prisma.deal.count({ where: scoped({ proposalShared: true }) }),
      prisma.deal.count({ where: scoped({ stage: 'Won', updatedAt: { gte: startOfMonth } }) }),
      prisma.deal.count({ where: scoped({ companyId: null }) }),
      prisma.deal.groupBy({ by: ['stage'], where: scoped(), _count: { _all: true } }),
      prisma.deal.aggregate({ where: scoped(), _sum: { value: true } }),
      prisma.deal.findMany({
        where: scoped(),
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true, title: true, stage: true, value: true, currency: true, createdAt: true, openDate: true,
          company: { select: { id: true, name: true } },
        },
      }),
    ])

    // Deals with no Deal Open Date - reported so a filtered view can say why
    // the numbers are smaller instead of appearing to lose records.
    const undatedDeals = filterActive ? await prisma.deal.count({ where: { openDate: null } }) : 0

    res.json({
      filter: filterActive ? { year, month: Number.isFinite(month) ? month : null } : null,
      undatedDeals,
      totalDeals,
      activeDeals,
      wonDeals,
      lostDeals,
      pocDeals,
      proposalSharedDeals,
      wonClientsThisMonth,
      // Surfaced so the dashboard can explain a deals-vs-companies gap rather
      // than leaving it looking like a bug: a Deal's companyId is nullable, so
      // these deals can never appear under any company.
      dealsWithoutCompany,
      totalValue: valueAgg._sum.value || 0,
      stageBreakdown: stageGroups
        .map(g => ({ stage: g.stage || '(none)', count: g._count._all }))
        .sort((a, b) => b.count - a.count),
      recent,
    })
  } catch (err) {
    console.error('[Dashboard] deal-stats error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
