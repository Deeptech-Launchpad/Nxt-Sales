const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// GET /api/activities?companyId=xxx&type=xxx — unchanged per-company feed,
// used by ActivityFeed.jsx on Company Detail. Returns a plain array, exactly
// as before — every existing caller depends on that shape.
//
// GET /api/activities?type=meeting|task&... (no companyId) — NEW global mode
// for the Meetings/Tasks dashboards. Restricted to these two types only (not
// email/note/call) to keep this change's blast radius tight. Paginated and
// filtered server-side — never a full-fetch-then-filter, since activities
// accumulate much faster per company than e.g. deals do. Returns
// { items, total, page, pages } — a different shape from the per-company
// mode above, consumed only by the new Tasks.jsx/Meetings.jsx pages.
router.get('/', auth, async (req, res) => {
  try {
    const { companyId, type } = req.query

    if (companyId) {
      const where = { companyId }
      if (type && type !== 'all') where.type = type

      const activities = await prisma.activity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      })
      return res.json(activities)
    }

    if (!['meeting', 'task'].includes(type)) {
      return res.status(400).json({ message: 'companyId is required, or type must be "meeting" or "task" for the global dashboard view.' })
    }

    const page  = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50))
    const { assignedToId, status, search } = req.query
    const statusField = type === 'meeting' ? 'meetingStatus' : 'taskStatus'
    const dateField    = type === 'meeting' ? 'startTime' : 'dueDate'

    const where = { type }
    if (assignedToId) where.assignedToId = assignedToId
    if (status) where[statusField] = status
    if (req.query.dateFrom || req.query.dateTo) {
      where[dateField] = {
        ...(req.query.dateFrom && { gte: new Date(req.query.dateFrom) }),
        ...(req.query.dateTo   && { lte: new Date(req.query.dateTo) }),
      }
    }
    if (search && search.trim()) {
      const q = search.trim()
      where.OR = [
        { title:   { contains: q, mode: 'insensitive' } },
        { company: { is: { name: { contains: q, mode: 'insensitive' } } } },
        { assignedTo: { is: { name: { contains: q, mode: 'insensitive' } } } },
      ]
    }

    const [items, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          company:    { select: { id: true, name: true } },
          user:       { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.activity.count({ where }),
    ])

    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/activities
router.post('/', auth, async (req, res) => {
  try {
    const {
      type, companyId,
      title, body,
      toEmail, fromEmail, subject, emailStatus,
      direction, duration, outcome,
      startTime, endTime, meetingStatus, location, participants,
      dueDate, priority, taskStatus, assignedToId,
      meetLink,
    } = req.body

    if (!type || !companyId) return res.status(400).json({ message: 'type and companyId required' })

    const activity = await prisma.activity.create({
      data: {
        type,
        companyId,
        userId: req.user.id,
        title:  title  || null,
        body:   body   || null,
        toEmail:      toEmail      || null,
        fromEmail:    fromEmail    || null,
        subject:      subject      || null,
        emailStatus:  emailStatus  || null,
        direction:    direction    || null,
        duration:     duration     ? Number(duration) : null,
        outcome:      outcome      || null,
        startTime:    startTime    ? new Date(startTime)  : null,
        endTime:      endTime      ? new Date(endTime)    : null,
        meetingStatus: meetingStatus || null,
        location:     location     || null,
        participants: participants  || null,
        dueDate:      dueDate      ? new Date(dueDate)   : null,
        priority:     priority     || null,
        taskStatus:   taskStatus   || 'not_started',
        assignedToId: assignedToId || null,
        meetLink:     meetLink     || null,
      },
      include: {
        user:       { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    })
    res.status(201).json(activity)
  } catch (err) {
    console.error('Activity POST error:', err.message, err.code)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// PUT /api/activities/:id — field whitelist extended to cover meeting/task
// edits (dueDate, priority, assignedToId, startTime, endTime, location,
// participants, meetLink) on top of the original set. Destructuring straight
// from req.body means an omitted field stays `undefined`, which Prisma
// treats as "don't touch" — a partial edit never clobbers untouched fields.
router.put('/:id', auth, async (req, res) => {
  try {
    const {
      body, title, taskStatus, outcome, meetingStatus, emailStatus,
      dueDate, priority, assignedToId, startTime, endTime, location, participants, meetLink,
    } = req.body
    const updated = await prisma.activity.update({
      where: { id: req.params.id },
      data: {
        body, title, taskStatus, outcome, meetingStatus, emailStatus,
        priority, location, participants, meetLink,
        ...(dueDate     !== undefined && { dueDate:     dueDate     ? new Date(dueDate)   : null }),
        ...(startTime   !== undefined && { startTime:   startTime   ? new Date(startTime) : null }),
        ...(endTime     !== undefined && { endTime:     endTime     ? new Date(endTime)   : null }),
        ...(assignedToId !== undefined && { assignedToId: assignedToId || null }),
      },
      include: {
        company:    { select: { id: true, name: true } },
        user:       { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    })
    res.json(updated)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// DELETE /api/activities/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await prisma.activity.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
