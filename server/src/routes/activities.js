const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const {
  validateAndShapeCustomFieldInput, writeCustomFieldValues, attachCustomFieldValues,
  CustomFieldValidationError,
} = require('../utils/customFieldValues')
const { getImportFields } = require('../utils/importFields')
const prisma = new PrismaClient()

// GET /api/activities/import-fields?type=task|meeting — built-in + custom
// field list for the Tasks/Meetings dashboards' Edit Columns menu, same
// pattern as GET /companies/import-fields and GET /deals/import-fields.
// Declared before /:id-shaped routes further down are ever reached (this
// router has none at this exact path, but keeping it near the top mirrors
// where companies.js/deals.js declare theirs).
router.get('/import-fields', auth, async (req, res) => {
  const entity = req.query.type === 'meeting' ? 'Meeting' : req.query.type === 'task' ? 'Task' : null
  if (!entity) return res.status(400).json({ message: 'type must be "task" or "meeting".' })
  res.json(await getImportFields(entity))
})

// Task and Meeting are Activity rows (type: 'task'/'meeting'), not separate
// Prisma models — this maps a row's `type` to the CustomFieldDefinition
// `entity` string the generic custom-fields utilities key on. null for any
// other activity type (note/call/email), which don't support custom fields.
function entityForType(type) {
  if (type === 'task') return 'Task'
  if (type === 'meeting') return 'Meeting'
  return null
}

// Attaches custom.<key> values onto every task/meeting row in `records` —
// records may be a mixed bag of activity types (the per-company feed can
// be), so task and meeting rows are grouped and attached separately; every
// other type is left untouched.
async function attachTaskMeetingCustomFields(records) {
  const taskRecords    = records.filter(r => r.type === 'task')
  const meetingRecords = records.filter(r => r.type === 'meeting')
  await Promise.all([
    taskRecords.length    ? attachCustomFieldValues('Task', taskRecords)       : null,
    meetingRecords.length ? attachCustomFieldValues('Meeting', meetingRecords) : null,
  ])
  return records
}

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
      await attachTaskMeetingCustomFields(activities)
      return res.json(activities)
    }

    if (!['meeting', 'task'].includes(type)) {
      return res.status(400).json({ message: 'companyId is required, or type must be "meeting" or "task" for the global dashboard view.' })
    }

    const page  = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50))
    const { assignedToId, status, search, bucket, showCompleted } = req.query

    const where = { type }
    if (assignedToId) where.assignedToId = assignedToId
    const andConditions = []

    if (type === 'meeting') {
      // Unchanged meeting behavior — meetingStatus filter + startTime range,
      // exactly as before. The Today/Overdue/Upcoming bucket model below is
      // task-only; meetings keep their own scheduled/completed/cancelled
      // status, out of scope for this change.
      if (status) where.meetingStatus = status
      if (req.query.dateFrom || req.query.dateTo) {
        where.startTime = {
          ...(req.query.dateFrom && { gte: new Date(req.query.dateFrom) }),
          ...(req.query.dateTo   && { lte: new Date(req.query.dateTo) }),
        }
      }
    } else {
      // Today/Overdue/Upcoming replaces the old Pending/In Progress/
      // Completed status filter. taskStatus still exists in the DB as the
      // underlying complete/not-complete flag (no data migration needed,
      // no value removed) — it's just no longer offered as its own filter.
      // Completed tasks are excluded by default; showCompleted=true drops
      // that exclusion so a completed task still shows under its normal
      // date bucket instead of in a separate list.
      if (showCompleted !== 'true') where.taskStatus = { not: 'completed' }

      const now = new Date()
      const startOfToday    = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfTomorrow = new Date(startOfToday.getTime() + 86400000)

      if (bucket === 'today') {
        where.dueDate = { gte: startOfToday, lt: startOfTomorrow }
      } else if (bucket === 'overdue') {
        where.dueDate = { lt: startOfToday }
      } else if (bucket === 'upcoming') {
        // A task with no due date at all isn't overdue and isn't due today,
        // so it belongs here rather than being invisible in every bucket.
        andConditions.push({ OR: [{ dueDate: { gte: startOfTomorrow } }, { dueDate: null }] })
      }
    }

    if (search && search.trim()) {
      const q = search.trim()
      andConditions.push({
        OR: [
          { title:   { contains: q, mode: 'insensitive' } },
          { company: { is: { name: { contains: q, mode: 'insensitive' } } } },
          { assignedTo: { is: { name: { contains: q, mode: 'insensitive' } } } },
        ],
      })
    }
    if (andConditions.length) where.AND = andConditions

    const [items, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        // Bucketed task views read soonest-due-first; every other mode
        // (meetings, or tasks with no bucket selected) keeps the original
        // newest-first order.
        orderBy: (type === 'task' && bucket) ? { dueDate: 'asc' } : { createdAt: 'desc' },
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

    await attachTaskMeetingCustomFields(items)
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
      dueDate, priority, taskStatus, autoCompleteOverdue, assignedToId,
      meetLink, customFields,
    } = req.body

    if (!type || !companyId) return res.status(400).json({ message: 'type and companyId required' })

    // Validate BEFORE creating the activity, same discipline companies.js
    // uses — a bad custom field value should never leave a half-created
    // record behind. No-op (empty array) for any type other than task/meeting.
    const entity = entityForType(type)
    let shapedCustomFields = []
    if (entity && customFields) {
      try {
        shapedCustomFields = await validateAndShapeCustomFieldInput(entity, customFields)
      } catch (e) {
        if (e instanceof CustomFieldValidationError) return res.status(400).json({ message: 'Invalid custom field value(s).', errors: e.errors })
        throw e
      }
    }

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
        autoCompleteOverdue: !!autoCompleteOverdue,
        assignedToId: assignedToId || null,
        meetLink:     meetLink     || null,
      },
      include: {
        user:       { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    })
    if (shapedCustomFields.length) {
      await writeCustomFieldValues(activity.id, shapedCustomFields)
      await attachCustomFieldValues(entity, [activity])
    }
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
      dueDate, priority, autoCompleteOverdue, assignedToId, startTime, endTime, location, participants, meetLink,
      customFields,
    } = req.body

    // type is immutable (never accepted by this route) — fetch it up front
    // so custom fields can be validated BEFORE the update, same
    // validate-before-write discipline as POST above and companies.js.
    let shapedCustomFields = []
    let entity = null
    if (customFields) {
      const existing = await prisma.activity.findUnique({ where: { id: req.params.id }, select: { type: true } })
      entity = existing && entityForType(existing.type)
      if (entity) {
        try {
          shapedCustomFields = await validateAndShapeCustomFieldInput(entity, customFields)
        } catch (e) {
          if (e instanceof CustomFieldValidationError) return res.status(400).json({ message: 'Invalid custom field value(s).', errors: e.errors })
          throw e
        }
      }
    }

    const updated = await prisma.activity.update({
      where: { id: req.params.id },
      data: {
        body, title, taskStatus, outcome, meetingStatus, emailStatus,
        priority, location, participants, meetLink,
        ...(dueDate     !== undefined && { dueDate:     dueDate     ? new Date(dueDate)   : null }),
        ...(startTime   !== undefined && { startTime:   startTime   ? new Date(startTime) : null }),
        ...(endTime     !== undefined && { endTime:     endTime     ? new Date(endTime)   : null }),
        ...(assignedToId !== undefined && { assignedToId: assignedToId || null }),
        ...(autoCompleteOverdue !== undefined && { autoCompleteOverdue: !!autoCompleteOverdue }),
      },
      include: {
        company:    { select: { id: true, name: true } },
        user:       { select: { id: true, name: true, email: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    })
    if (shapedCustomFields.length) {
      await writeCustomFieldValues(updated.id, shapedCustomFields)
      await attachCustomFieldValues(entity, [updated])
    }
    res.json(updated)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// DELETE /api/activities/:id — CustomFieldValue.recordId is intentionally
// polymorphic with no FK (same reasoning as Company/Deal — see
// purgeRecycleBin.js), so deleting a task/meeting doesn't cascade to its
// custom field values automatically. Cleaned up in the same transaction so
// the two either both succeed or both roll back together, matching the
// existing Company/Deal delete pattern.
router.delete('/:id', auth, async (req, res) => {
  try {
    await prisma.$transaction([
      prisma.customFieldValue.deleteMany({ where: { recordId: req.params.id } }),
      prisma.activity.delete({ where: { id: req.params.id } }),
    ])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
