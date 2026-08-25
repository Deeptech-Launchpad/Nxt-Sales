const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Import / Export for Calls, Inbox and Tasks (Update 5).
//
// Kept in one file, mounted at /api/data, rather than bolted onto
// callhippo.js / email.js / activities.js: the three share identical
// validate-then-create-only semantics, and the field lists below are
// purpose-built for import.
//
// They deliberately do NOT reuse utils/importFields.js's Task config — that
// list is also what drives the Tasks page's Edit Columns menu, and it excludes
// dueDate/taskStatus on purpose. Import needs those, so widening the shared
// config would have changed which columns the Tasks table offers.
//
// Safety rules that apply to every importer here:
//   * Rows are only ever CREATED. Nothing is updated or deleted, so an import
//     can never overwrite or remove an existing record.
//   * Every row is validated before any write; invalid rows are skipped and
//     reported with their spreadsheet row number rather than failing the batch.
//   * A row that references a company by name simply imports unlinked when no
//     match is found — reported, not fatal.

// ── Field definitions ─────────────────────────────────────────────────────
// `key` is what the client sends back; `label` is the spreadsheet header.
const FIELD_SETS = {
  tasks: {
    label: 'Tasks',
    required: ['title'],
    fields: [
      { key: 'title',       label: 'Task' },
      { key: 'body',        label: 'Description' },
      { key: 'companyName', label: 'Company Name' },
      { key: 'dueDate',     label: 'Due Date' },
      { key: 'taskStatus',  label: 'Status' },
      { key: 'assignedTo',  label: 'Assigned To' },
    ],
  },
  calls: {
    label: 'Calls',
    required: ['callDate'],
    fields: [
      { key: 'callDate',     label: 'Call Date' },
      { key: 'fromNumber',   label: 'From Number' },
      { key: 'toNumber',     label: 'To Number' },
      { key: 'direction',    label: 'Direction' },
      { key: 'status',       label: 'Status' },
      { key: 'duration',     label: 'Duration (seconds)' },
      { key: 'agentName',    label: 'Agent Name' },
      { key: 'recordingUrl', label: 'Recording URL' },
      { key: 'companyName',  label: 'Company Name' },
    ],
  },
  inbox: {
    label: 'Inbox',
    required: ['subject'],
    fields: [
      { key: 'subject',     label: 'Subject' },
      { key: 'fromEmail',   label: 'From' },
      { key: 'toEmail',     label: 'To' },
      { key: 'ccEmail',     label: 'Cc' },
      { key: 'direction',   label: 'Direction' },
      { key: 'body',        label: 'Body' },
      { key: 'companyName', label: 'Company Name' },
      { key: 'sentAt',      label: 'Date' },
    ],
  },
}

// GET /api/data/:entity/import-fields
router.get('/:entity/import-fields', auth, (req, res) => {
  const set = FIELD_SETS[req.params.entity]
  if (!set) return res.status(404).json({ message: 'Unknown module.' })
  res.json({ requiredKey: set.required[0], fields: set.fields })
})

// Shared helpers ------------------------------------------------------------
const str = (v) => (v === undefined || v === null ? '' : String(v).trim())

// Accepts real Date objects (SheetJS emits these), ISO strings, and common
// spreadsheet text dates. Returns null when unparseable so the caller can
// decide whether that's fatal for this field.
function parseDate(v) {
  if (!v) return null
  if (v instanceof Date && !isNaN(v)) return v
  const d = new Date(v)
  return isNaN(d) ? null : d
}

async function companyIndex() {
  const rows = await prisma.company.findMany({
    where: { deletedAt: null }, select: { id: true, name: true },
  })
  return new Map(rows.map(c => [c.name.trim().toLowerCase(), c.id]))
}

function resolveCompany(index, row, rowNo, warnings) {
  const name = str(row.companyName)
  if (!name) return null
  const id = index.get(name.toLowerCase()) || null
  if (!id) warnings.push(`Row ${rowNo}: no company matched "${name}" — imported without a company link.`)
  return id
}

// ── POST /api/data/tasks/bulk ─────────────────────────────────────────────
router.post('/tasks/bulk', auth, async (req, res) => {
  try {
    const rows = req.body.rows
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ message: 'No rows provided.' })

    const companies = await companyIndex()
    const users = await prisma.user.findMany({ where: { status: 'active' }, select: { id: true, name: true } })
    const byUser = new Map(users.map(u => [u.name.trim().toLowerCase(), u.id]))

    let created = 0, failed = 0
    const errors = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {}
      const rowNo = i + 2
      const title = str(row.title)
      if (!title) { failed++; errors.push(`Row ${rowNo}: Task title is required.`); continue }

      const due = row.dueDate ? parseDate(row.dueDate) : null
      if (row.dueDate && !due) { failed++; errors.push(`Row ${rowNo}: "${row.dueDate}" is not a valid Due Date.`); continue }

      const assignedName = str(row.assignedTo)
      const assignedToId = assignedName ? (byUser.get(assignedName.toLowerCase()) || null) : null
      if (assignedName && !assignedToId) errors.push(`Row ${rowNo}: no active user named "${assignedName}" — task left unassigned.`)

      try {
        await prisma.activity.create({
          data: {
            type: 'task',
            userId: req.user.id,
            companyId: resolveCompany(companies, row, rowNo, errors),
            title,
            body: str(row.body) || null,
            dueDate: due,
            taskStatus: str(row.taskStatus) || null,
            assignedToId,
          },
        })
        created++
      } catch (e) { failed++; errors.push(`Row ${rowNo}: ${e.message}`) }
    }
    res.json({ created, failed, total: rows.length, errors: errors.slice(0, 100) })
  } catch (err) {
    console.error('[DataTransfer] tasks import error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── POST /api/data/calls/bulk ─────────────────────────────────────────────
router.post('/calls/bulk', auth, async (req, res) => {
  try {
    const rows = req.body.rows
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ message: 'No rows provided.' })

    const companies = await companyIndex()
    let created = 0, failed = 0, skipped = 0
    const errors = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {}
      const rowNo = i + 2
      const when = parseDate(row.callDate)
      if (!when) { failed++; errors.push(`Row ${rowNo}: a valid Call Date is required.`); continue }

      // CallLog.callhippoId is unique and required. Imported rows aren't from
      // CallHippo, so they get a deterministic synthetic id derived from the
      // call itself — which also makes re-importing the same file a no-op
      // instead of silently creating duplicates.
      const key = ['import', when.toISOString(), str(row.fromNumber), str(row.toNumber)].join('|')
      try {
        const existing = await prisma.callLog.findUnique({ where: { callhippoId: key }, select: { id: true } })
        if (existing) { skipped++; errors.push(`Row ${rowNo}: already imported — skipped (no duplicate created).`); continue }

        const dur = row.duration === '' || row.duration === undefined ? null : Number(row.duration)
        await prisma.callLog.create({
          data: {
            callhippoId: key,
            callDate: when,
            fromNumber: str(row.fromNumber) || null,
            toNumber: str(row.toNumber) || null,
            direction: str(row.direction) || null,
            status: str(row.status) || null,
            duration: Number.isFinite(dur) ? Math.max(0, Math.floor(dur)) : null,
            agentName: str(row.agentName) || null,
            recordingUrl: str(row.recordingUrl) || null,
            companyId: resolveCompany(companies, row, rowNo, errors),
          },
        })
        created++
      } catch (e) { failed++; errors.push(`Row ${rowNo}: ${e.message}`) }
    }
    res.json({ created, failed, skipped, total: rows.length, errors: errors.slice(0, 100) })
  } catch (err) {
    console.error('[DataTransfer] calls import error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── POST /api/data/inbox/bulk ─────────────────────────────────────────────
// Imports historical email RECORDS (Activity type 'email') — the same thing
// "Log an email" creates. It does not send anything, and it never touches
// Gmail: messageId/threadId are left null so an imported row can never be
// mistaken for a real synced Gmail message or interfere with threading.
router.post('/inbox/bulk', auth, async (req, res) => {
  try {
    const rows = req.body.rows
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ message: 'No rows provided.' })

    const companies = await companyIndex()
    let created = 0, failed = 0
    const errors = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {}
      const rowNo = i + 2
      const subject = str(row.subject)
      if (!subject) { failed++; errors.push(`Row ${rowNo}: Subject is required.`); continue }

      const dir = str(row.direction).toLowerCase()
      if (dir && dir !== 'inbound' && dir !== 'outbound') {
        failed++; errors.push(`Row ${rowNo}: Direction must be "inbound" or "outbound" (got "${row.direction}").`); continue
      }
      const when = row.sentAt ? parseDate(row.sentAt) : null
      if (row.sentAt && !when) { failed++; errors.push(`Row ${rowNo}: "${row.sentAt}" is not a valid Date.`); continue }

      try {
        await prisma.activity.create({
          data: {
            type: 'email',
            userId: req.user.id,
            companyId: resolveCompany(companies, row, rowNo, errors),
            title: `Email – ${subject}`,
            subject,
            body: str(row.body) || null,
            fromEmail: str(row.fromEmail) || null,
            toEmail: str(row.toEmail) || null,
            ccEmail: str(row.ccEmail) || null,
            direction: dir || 'outbound',
            emailStatus: dir === 'inbound' ? 'received' : 'sent',
            ...(when && { createdAt: when }),
          },
        })
        created++
      } catch (e) { failed++; errors.push(`Row ${rowNo}: ${e.message}`) }
    }
    res.json({ created, failed, total: rows.length, errors: errors.slice(0, 100) })
  } catch (err) {
    console.error('[DataTransfer] inbox import error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── Exports ───────────────────────────────────────────────────────────────
// Unpaginated so Export always covers the whole module, not just the page on
// screen — same contract as /companies/export and /deals/export.
router.get('/tasks/export', auth, async (req, res) => {
  try {
    const rows = await prisma.activity.findMany({
      where: { type: 'task' },
      orderBy: { createdAt: 'desc' },
      include: { company: { select: { name: true } }, assignedTo: { select: { name: true } } },
    })
    res.json({ rows, total: rows.length })
  } catch (err) {
    console.error('[DataTransfer] tasks export error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

router.get('/calls/export', auth, async (req, res) => {
  try {
    const rows = await prisma.callLog.findMany({
      where: { OR: [{ companyId: null }, { company: { deletedAt: null } }] },
      orderBy: { callDate: 'desc' },
      include: { company: { select: { name: true } } },
    })
    res.json({ rows, total: rows.length })
  } catch (err) {
    console.error('[DataTransfer] calls export error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

router.get('/inbox/export', auth, async (req, res) => {
  try {
    const { direction } = req.query
    const rows = await prisma.activity.findMany({
      // Mirrors GET /api/email/inbox exactly: only company-associated mail is
      // exportable. An export that included unassigned rows would hand the
      // user a file full of the personal/internal email the Inbox itself
      // deliberately hides — the same leak by a different route.
      where: { type: 'email', companyId: { not: null }, ...(direction ? { direction } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { company: { select: { name: true } } },
    })
    res.json({ rows, total: rows.length })
  } catch (err) {
    console.error('[DataTransfer] inbox export error:', err.message)
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
