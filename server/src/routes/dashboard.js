const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const { scoreCompany } = require('../utils/leadScoring')
const { processFollowUpEnrollment, STEPS } = require('../jobs/followUpSequences')

const prisma = new PrismaClient()

// GET /api/dashboard/next-actions — a compact, explainable priority queue.
// Scores are derived from CRM facts (pipeline progress, engagement, overdue
// work and data readiness), so every recommendation can show why it ranked.
router.get('/next-actions', auth, async (req, res) => {
  try {
    const recentCutoff = new Date(Date.now() - 45 * 86400000)
    const companies = await prisma.company.findMany({
      where: {
        deletedAt: null,
        OR: [
          { deals: { some: { stage: { notIn: ['Won', 'Lost'] } } } },
          { activities: { some: { createdAt: { gte: recentCutoff } } } },
          { activities: { some: { type: 'task', taskStatus: { not: 'completed' }, dueDate: { lte: new Date() } } } },
          { createdAt: { gte: recentCutoff } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 160,
      include: {
        deals: { where: { stage: { notIn: ['Won', 'Lost'] } }, orderBy: { updatedAt: 'desc' } },
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
        followUpEnrollments: { where: { userId: req.user.id, status: 'active' }, take: 1 },
      },
    })

    const actions = companies
      .map(company => {
        const result = scoreCompany(company)
        const enrollment = company.followUpEnrollments[0]
        return {
          company: { id: company.id, name: company.name, email: company.email, industry: company.industry },
          score: result.score,
          temperature: result.temperature,
          signals: result.signals,
          action: result.action,
          deal: result.bestDeal ? { id: result.bestDeal.id, title: result.bestDeal.title, stage: result.bestDeal.stage, value: result.bestDeal.value, currency: result.bestDeal.currency } : null,
          sequence: enrollment ? { id: enrollment.id, currentStep: enrollment.currentStep, totalSteps: STEPS.length, nextRunAt: enrollment.nextRunAt } : null,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    res.json({ actions, generatedAt: new Date(), methodology: 'CRM activity, engagement, pipeline progress and urgency' })
  } catch (err) {
    console.error('[Dashboard] next-actions error:', err.message)
    res.status(500).json({ message: 'Unable to build the priority queue.' })
  }
})

router.post('/follow-up-sequences', auth, async (req, res) => {
  try {
    const { companyId } = req.body
    const company = await prisma.company.findFirst({ where: { id: companyId, deletedAt: null }, select: { id: true } })
    if (!company) return res.status(404).json({ message: 'Company not found.' })

    const existing = await prisma.followUpEnrollment.findFirst({ where: { companyId, userId: req.user.id, status: 'active' } })
    if (existing) return res.status(409).json({ message: 'A follow-up sequence is already active for this company.', sequence: existing })

    const enrollment = await prisma.followUpEnrollment.create({
      data: { companyId, userId: req.user.id, nextRunAt: new Date() },
    })
    const processed = await processFollowUpEnrollment(enrollment.id)
    res.status(201).json({ sequence: processed, message: 'Follow-up plan started. The first action is in your task list.' })
  } catch (err) {
    console.error('[Dashboard] follow-up start error:', err.message)
    res.status(500).json({ message: 'Unable to start the follow-up plan.' })
  }
})

router.patch('/follow-up-sequences/:id/cancel', auth, async (req, res) => {
  try {
    const existing = await prisma.followUpEnrollment.findFirst({ where: { id: req.params.id, userId: req.user.id, status: 'active' } })
    if (!existing) return res.status(404).json({ message: 'Active follow-up plan not found.' })
    const sequence = await prisma.followUpEnrollment.update({ where: { id: existing.id }, data: { status: 'cancelled', completedAt: new Date() } })
    res.json({ sequence })
  } catch (err) {
    res.status(500).json({ message: 'Unable to cancel the follow-up plan.' })
  }
})

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
    const remarksValues = req.query.remarksValues
      ? (Array.isArray(req.query.remarksValues) ? req.query.remarksValues : String(req.query.remarksValues).split(','))
        .map(value => String(value).trim())
        .filter(Boolean)
      : []
    const remarksWhere = remarksValues.length
      ? { company: { deletedAt: null, remarks: { in: remarksValues, mode: 'insensitive' } } }
      : {}
    const scoped = (extra = {}) => ({ ...dateWhere, ...remarksWhere, ...extra })
    const dateFilterActive = Object.keys(dateWhere).length > 0

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
    const undatedDeals = dateFilterActive ? await prisma.deal.count({ where: { ...remarksWhere, openDate: null } }) : 0

    res.json({
      filter: (dateFilterActive || remarksValues.length) ? {
        ...(dateFilterActive && { year, month: Number.isFinite(month) ? month : null }),
        ...(remarksValues.length && { remarks: remarksValues }),
      } : null,
      undatedDeals,
      totalDeals,
      activeDeals,
      wonDeals,
      lostDeals,
      pocDeals,
      proposalSharedDeals,
      wonClientsThisMonth,
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
