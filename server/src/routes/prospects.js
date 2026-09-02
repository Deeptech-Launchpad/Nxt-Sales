const router = require('express').Router()
const { PrismaClient } = require('@prisma/client')
const auth = require('../middleware/authMiddleware')
const prisma = new PrismaClient()

const STATUSES = ['New', 'Ready for Outreach', 'Contacted', 'Replied', 'Follow-up Required', 'Interested', 'Not Interested', 'Closed']
const CHANNELS = ['Email', 'LinkedIn', 'Email + LinkedIn']
const clean = value => typeof value === 'string' ? value.trim() : value
const shape = body => ({
  firstName: clean(body.firstName) || '', lastName: clean(body.lastName) || null,
  jobTitle: clean(body.jobTitle) || null, companyName: clean(body.companyName) || null,
  email: clean(body.email)?.toLowerCase() || null, emailStatus: clean(body.emailStatus) || 'Unverified',
  linkedinUrl: clean(body.linkedinUrl) || null, linkedinStatus: clean(body.linkedinStatus) || null,
  channel: CHANNELS.includes(body.channel) ? body.channel : (body.linkedinUrl && body.email ? 'Email + LinkedIn' : body.linkedinUrl ? 'LinkedIn' : 'Email'),
  status: STATUSES.includes(body.status) ? body.status : 'New', ownerId: body.ownerId || null,
  ownerName: clean(body.ownerName) || null,
})

router.get('/', auth, async (req, res) => {
  try {
    const { search = '', company, jobTitle, channel, status, owner, lastContacted, page = 1, limit = 25 } = req.query
    const where = { createdById: req.user.id }
    const AND = []
    if (search) AND.push({ OR: ['firstName','lastName','jobTitle','companyName','email'].map(field => ({ [field]: { contains: search, mode: 'insensitive' } })) })
    if (company) AND.push({ companyName: { equals: company, mode: 'insensitive' } })
    if (jobTitle) AND.push({ jobTitle: { contains: jobTitle, mode: 'insensitive' } })
    if (channel) AND.push({ channel })
    if (status) AND.push({ status })
    if (owner) AND.push({ ownerId: owner })
    if (lastContacted) {
      const days = Number(lastContacted)
      if (days > 0) AND.push({ lastContacted: { gte: new Date(Date.now() - days * 86400000) } })
      if (lastContacted === 'never') AND.push({ lastContacted: null })
    }
    if (AND.length) where.AND = AND
    const skip = (Math.max(1, Number(page)) - 1) * Number(limit)
    const [prospects, total, facets] = await Promise.all([
      prisma.prospect.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take: Number(limit) }),
      prisma.prospect.count({ where }),
      prisma.prospect.findMany({ where: { createdById: req.user.id }, select: { companyName: true, jobTitle: true, ownerId: true, ownerName: true } }),
    ])
    res.json({ prospects, total, page: Number(page), facets })
  } catch (error) { console.error(error); res.status(500).json({ message: 'Unable to load prospects.' }) }
})

router.get('/:id', auth, async (req, res) => {
  const prospect = await prisma.prospect.findFirst({ where: { id: req.params.id, createdById: req.user.id }, include: { activities: { orderBy: { createdAt: 'desc' } } } })
  if (!prospect) return res.status(404).json({ message: 'Prospect not found.' })
  res.json(prospect)
})

router.post('/', auth, async (req, res) => {
  try {
    const data = shape(req.body)
    if (!data.firstName) return res.status(400).json({ message: 'First name is required.' })
    const prospect = await prisma.prospect.create({ data: { ...data, createdById: req.user.id, activities: { create: { type: 'added', title: 'Contact added', createdBy: req.user.name || req.user.email } } } })
    res.status(201).json(prospect)
  } catch (error) { res.status(500).json({ message: 'Unable to create prospect.' }) }
})

router.put('/:id', auth, async (req, res) => {
  try {
    const current = await prisma.prospect.findFirst({ where: { id: req.params.id, createdById: req.user.id } })
    if (!current) return res.status(404).json({ message: 'Prospect not found.' })
    const data = shape(req.body)
    const changed = data.status !== current.status
    const prospect = await prisma.prospect.update({ where: { id: current.id }, data })
    if (changed) await prisma.prospectActivity.create({ data: { prospectId: current.id, type: 'status', title: `Status changed to ${data.status}`, createdBy: req.user.name || req.user.email } })
    res.json(prospect)
  } catch (error) { res.status(500).json({ message: 'Unable to update prospect.' }) }
})

router.delete('/:id', auth, async (req, res) => {
  const found = await prisma.prospect.findFirst({ where: { id: req.params.id, createdById: req.user.id } })
  if (!found) return res.status(404).json({ message: 'Prospect not found.' })
  await prisma.prospect.delete({ where: { id: found.id } }); res.json({ success: true })
})

router.post('/bulk/import', auth, async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : []
  let created = 0; const errors = []
  for (let index = 0; index < rows.length; index++) {
    const data = shape(rows[index])
    if (!data.firstName) { errors.push(`Row ${index + 2}: First Name is required.`); continue }
    await prisma.prospect.create({ data: { ...data, createdById: req.user.id, activities: { create: { type: 'import', title: 'Contact imported', createdBy: req.user.name || req.user.email } } } }); created++
  }
  res.json({ created, failed: errors.length, errors })
})

router.post('/bulk/action', auth, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : []
  if (!ids.length) return res.status(400).json({ message: 'Select at least one prospect.' })
  if (req.body.action === 'delete') {
    const result = await prisma.prospect.deleteMany({ where: { id: { in: ids }, createdById: req.user.id } }); return res.json({ updated: result.count })
  }
  if (req.body.action === 'status' && STATUSES.includes(req.body.status)) {
    const valid = await prisma.prospect.findMany({ where: { id: { in: ids }, createdById: req.user.id }, select: { id: true } })
    await prisma.$transaction(valid.flatMap(p => [
      prisma.prospect.update({ where: { id: p.id }, data: { status: req.body.status } }),
      prisma.prospectActivity.create({ data: { prospectId: p.id, type: 'status', title: `Status changed to ${req.body.status}`, createdBy: req.user.name || req.user.email } }),
    ])); return res.json({ updated: valid.length })
  }
  res.status(400).json({ message: 'Unsupported bulk action.' })
})

router.post('/:id/activity', auth, async (req, res) => {
  const prospect = await prisma.prospect.findFirst({ where: { id: req.params.id, createdById: req.user.id } })
  if (!prospect) return res.status(404).json({ message: 'Prospect not found.' })
  const activity = await prisma.prospectActivity.create({ data: { prospectId: prospect.id, type: req.body.type || 'note', title: req.body.title || 'Activity recorded', detail: req.body.detail || null, createdBy: req.user.name || req.user.email } })
  res.status(201).json(activity)
})

router.post('/:id/email-sent', auth, async (req, res) => {
  const prospect = await prisma.prospect.findFirst({ where: { id: req.params.id, createdById: req.user.id } })
  if (!prospect) return res.status(404).json({ message: 'Prospect not found.' })
  await prisma.$transaction([
    prisma.prospect.update({ where: { id: prospect.id }, data: { status: 'Contacted', lastContacted: new Date() } }),
    prisma.prospectActivity.create({ data: { prospectId: prospect.id, type: 'email', title: 'Email sent', detail: req.body.subject || null, createdBy: req.user.name || req.user.email } }),
  ])
  res.json({ success: true })
})

router.get('/:id/draft', auth, async (req, res) => {
  const draft = await prisma.outreachDraft.findUnique({ where: { prospectId_userId: { prospectId: req.params.id, userId: req.user.id } } })
  res.json(draft || null)
})
router.put('/:id/draft', auth, async (req, res) => {
  const draft = await prisma.outreachDraft.upsert({ where: { prospectId_userId: { prospectId: req.params.id, userId: req.user.id } }, create: { prospectId: req.params.id, userId: req.user.id, subject: req.body.subject || '', htmlBody: req.body.htmlBody || '' }, update: { subject: req.body.subject || '', htmlBody: req.body.htmlBody || '' } })
  res.json(draft)
})
router.post('/:id/schedule', auth, async (req, res) => {
  const when = new Date(req.body.scheduledAt)
  if (!req.body.toEmail || !req.body.subject || !req.body.htmlBody || Number.isNaN(when.getTime()) || when <= new Date()) return res.status(400).json({ message: 'Recipient, subject, body, and a future send time are required.' })
  const item = await prisma.scheduledOutreach.create({ data: { prospectId: req.params.id, userId: req.user.id, toEmail: req.body.toEmail, subject: req.body.subject, htmlBody: req.body.htmlBody, scheduledAt: when } })
  await prisma.prospectActivity.create({ data: { prospectId: req.params.id, type: 'scheduled', title: 'Follow-up scheduled', detail: `Scheduled for ${when.toISOString()}`, createdBy: req.user.name || req.user.email } })
  res.status(201).json(item)
})

module.exports = router
