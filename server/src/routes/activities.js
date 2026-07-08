const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// GET /api/activities?contactId=xxx&type=xxx or companyId=xxx&type=xxx
router.get('/', auth, async (req, res) => {
  try {
    const { contactId, companyId, type } = req.query
    if (!contactId && !companyId) return res.status(400).json({ message: 'contactId or companyId required' })

    const where = {}
    if (contactId) where.contactId = contactId
    if (companyId) where.companyId = companyId
    if (type && type !== 'all') where.type = type

    const activities = await prisma.activity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    res.json(activities)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// POST /api/activities
router.post('/', auth, async (req, res) => {
  try {
    const {
      type, contactId, companyId,
      title, body,
      toEmail, fromEmail, subject, emailStatus,
      direction, duration, outcome,
      startTime, endTime, meetingStatus, location, participants,
      dueDate, priority, taskStatus, assignedToId,
      meetLink,
    } = req.body

    if (!type || (!contactId && !companyId)) return res.status(400).json({ message: 'type and contactId or companyId required' })

    const activity = await prisma.activity.create({
      data: {
        type,
        ...(contactId && { contactId }),
        ...(companyId && { companyId }),
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
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    res.status(201).json(activity)
  } catch (err) {
    console.error('Activity POST error:', err.message, err.code)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// PUT /api/activities/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { body, title, taskStatus, outcome, meetingStatus, emailStatus } = req.body
    const updated = await prisma.activity.update({
      where: { id: req.params.id },
      data: { body, title, taskStatus, outcome, meetingStatus, emailStatus },
    })
    res.json(updated)
  } catch (err) {
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
