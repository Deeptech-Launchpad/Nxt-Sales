const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const SWEEP_INTERVAL_MS = 15 * 60 * 1000
const STEPS = [
  { label: 'Personal check-in', waitDays: 2, priority: 'high' },
  { label: 'Share value or a useful sample', waitDays: 3, priority: 'medium' },
  { label: 'Decision follow-up', waitDays: 5, priority: 'high' },
  { label: 'Final keep-the-door-open note', waitDays: null, priority: 'medium' },
]

const addDays = (date, days) => new Date(date.getTime() + days * 86400000)

async function processFollowUpEnrollment(id) {
  const enrollment = await prisma.followUpEnrollment.findUnique({
    where: { id },
    include: {
      company: { include: { deals: { orderBy: { updatedAt: 'desc' }, take: 1 } } },
    },
  })
  if (!enrollment || enrollment.status !== 'active') return null

  const since = enrollment.lastRunAt || enrollment.createdAt
  const [reply, activeTask] = await Promise.all([
    prisma.activity.findFirst({
      where: { companyId: enrollment.companyId, type: 'email', direction: 'inbound', createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.activity.findFirst({
      where: {
        companyId: enrollment.companyId,
        type: 'task',
        taskStatus: { not: 'completed' },
        body: { contains: `[sequence:${enrollment.id}:step:${enrollment.currentStep}]` },
      },
    }),
  ])

  const latestDealClosed = /^(won|lost)$/i.test(String(enrollment.company.deals[0]?.stage || '').trim())
  if (reply || latestDealClosed) {
    return prisma.followUpEnrollment.update({
      where: { id },
      data: { status: reply ? 'replied' : 'completed', completedAt: new Date() },
    })
  }

  const step = STEPS[enrollment.currentStep]
  if (!step) {
    return prisma.followUpEnrollment.update({ where: { id }, data: { status: 'completed', completedAt: new Date() } })
  }

  const now = new Date()
  if (!activeTask) {
    await prisma.activity.create({
      data: {
        type: 'task',
        userId: enrollment.userId,
        assignedToId: enrollment.userId,
        companyId: enrollment.companyId,
        title: `${step.label} · ${enrollment.company.name}`,
        body: `Suggested follow-up ${enrollment.currentStep + 1} of ${STEPS.length}. Review the latest conversation, personalise the message, then contact the customer. [sequence:${enrollment.id}:step:${enrollment.currentStep}]`,
        dueDate: now,
        priority: step.priority,
        taskStatus: 'not_started',
      },
    })
  }

  const nextStep = enrollment.currentStep + 1
  const finished = nextStep >= STEPS.length
  return prisma.followUpEnrollment.update({
    where: { id },
    data: {
      currentStep: nextStep,
      lastRunAt: now,
      nextRunAt: finished ? now : addDays(now, step.waitDays),
      ...(finished ? { status: 'completed', completedAt: now } : {}),
    },
  })
}

async function processDueFollowUps() {
  try {
    const due = await prisma.followUpEnrollment.findMany({
      where: { status: 'active', nextRunAt: { lte: new Date() } },
      orderBy: { nextRunAt: 'asc' },
      take: 50,
      select: { id: true },
    })
    for (const enrollment of due) await processFollowUpEnrollment(enrollment.id)
    if (due.length) console.log(`[Follow-up] Processed ${due.length} due sequence(s).`)
  } catch (err) {
    console.error('[Follow-up] Sequence sweep failed:', err.message)
  }
}

function startFollowUpSequenceSweep() {
  processDueFollowUps()
  setInterval(processDueFollowUps, SWEEP_INTERVAL_MS)
}

module.exports = { startFollowUpSequenceSweep, processDueFollowUps, processFollowUpEnrollment, STEPS }
