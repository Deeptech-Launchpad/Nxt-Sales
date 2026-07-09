const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// GET /api/notifications
// READ-ONLY. Derives notification source rows from the existing Activity table
// for the logged-in user — no schema change, no data modified. The client turns
// these into notifications and tracks read/cleared state locally.
//   - meetings: upcoming meetings in the next 24h (for 1-hour-before reminders)
//   - emails:   recent inbound emails in the last 7 days (for new-email alerts)
//   - opens:    the user's sent emails opened by the recipient in the last 7 days
router.get('/', auth, async (req, res) => {
  try {
    const now     = new Date()
    const in24h   = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const weekAgo = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000)

    const relations = {
      contact: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
    }

    const [meetings, emails, opens] = await Promise.all([
      prisma.activity.findMany({
        where: {
          userId: req.user.id,
          type: 'meeting',
          startTime: { gte: now, lte: in24h },
        },
        orderBy: { startTime: 'asc' },
        include: relations,
      }),
      prisma.activity.findMany({
        where: {
          userId: req.user.id,
          type: 'email',
          direction: 'inbound',
          createdAt: { gte: weekAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: relations,
      }),
      prisma.activity.findMany({
        where: {
          userId: req.user.id,
          type: 'email',
          direction: 'outbound',
          openCount: { gt: 0 },
          lastOpenedAt: { gte: weekAgo },
        },
        orderBy: { lastOpenedAt: 'desc' },
        take: 50,
        select: {
          id: true, subject: true, toEmail: true, openCount: true,
          firstOpenedAt: true, lastOpenedAt: true, contactId: true, companyId: true,
          contact: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
        },
      }),
    ])

    res.json({ meetings, emails, opens })
  } catch (err) {
    console.error('[Notifications] error:', err.message)
    res.status(500).json({ message: 'Failed to load notifications.' })
  }
})

module.exports = router
