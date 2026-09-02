const router = require('express').Router()
const { PrismaClient, Prisma } = require('@prisma/client')
const auth = require('../middleware/authMiddleware')
const prisma = new PrismaClient()

const STATUSES = ['New', 'Not Contacted', 'Draft', 'Ready', 'Ready for Outreach', 'Sent', 'Contacted', 'Follow-up Due', 'Follow-up Required', 'Replied', 'Interested', 'Meeting Booked', 'Not Interested', 'Bounced', 'Closed']
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

const MARKET_OFFERS = [
  { id: 'uk-product-data', countries: ['United Kingdom', 'UK', 'Ireland'], name: 'UK Product Data Growth', market: 'UK & Ireland', service: 'Product data and digital commerce', value: 'Improve catalogue quality and accelerate digital channel readiness.', cta: 'Book a 20-minute discovery call' },
  { id: 'anz-commerce', countries: ['Australia', 'New Zealand'], name: 'ANZ Commerce Acceleration', market: 'Australia & New Zealand', service: 'E-commerce enablement', value: 'Remove product-content bottlenecks and launch richer digital experiences.', cta: 'Review a tailored readiness assessment' },
  { id: 'global-data', countries: [], name: 'Global Product Data Advisory', market: 'Global', service: 'Product data and commerce operations', value: 'Turn fragmented product information into consistent, sales-ready customer experiences.', cta: 'Schedule a short introduction' },
]
const list = value => Array.isArray(value) ? value.filter(Boolean) : []
const splitContact = value => {
  if (value && typeof value === 'object') return {
    firstName: value.firstName || value.name?.split(/\s+/)[0] || '', lastName: value.lastName || value.name?.split(/\s+/).slice(1).join(' ') || '',
    jobTitle: value.jobTitle || value.role || '', department: value.department || value.function || '', seniority: value.seniority || '',
    email: value.email || '', linkedinUrl: value.linkedinUrl || value.linkedin || '', phone: value.phone || '', country: value.country || '',
  }
  const text = String(value || '').trim(); const parts = text.split(/\s+(?:-|–|—|\|)\s+/)
  const names = (parts.shift() || '').split(/\s+/)
  return { firstName: names.shift() || '', lastName: names.join(' '), jobTitle: parts.join(' - '), department: '', seniority: '', email: '', linkedinUrl: '', phone: '', country: '' }
}
const offerFor = country => MARKET_OFFERS.find(o => o.countries.some(c => c.toLowerCase() === String(country || '').toLowerCase())) || MARKET_OFFERS.at(-1)

// Company-first workspace. Company remains the source of truth; saved Prospect
// rows add outreach identity/state without recreating the account record.
router.get('/workspace/companies', auth, async (req, res) => {
  try {
    const { page = 1, limit = 25, search = '', country, industry, owner, channel, status } = req.query
    const take = Math.min(100, Math.max(10, Number(limit) || 25)); const currentPage = Math.max(1, Number(page) || 1)
    const where = { deletedAt: null }
    if (search) where.OR = ['name','email','domain','industry','country'].map(field => ({ [field]: { contains: search, mode: 'insensitive' } }))
    if (country) where.country = { equals: country, mode: 'insensitive' }
    if (industry) where.industry = { equals: industry, mode: 'insensitive' }
    if (owner) where.ownerId = owner
    if (channel === 'Email') where.email = { not: null }
    if (channel === 'LinkedIn') where.linkedProfiles = { not: Prisma.DbNull }
    if (channel === 'Manual') { where.email = null; where.linkedProfiles = { equals: Prisma.DbNull } }
    if (status) {
      const matching = await prisma.prospect.findMany({ where: { createdById: req.user.id, status }, select: { companyName: true }, distinct: ['companyName'] })
      where.name = { in: matching.map(x => x.companyName).filter(Boolean), mode: 'insensitive' }
    }
    const [companies, total, countries, industries, owners, companyTotal, contactAggregate, statusGroups] = await Promise.all([
      prisma.company.findMany({ where, include: { owner: { select: { id: true, name: true, email: true } } }, orderBy: { updatedAt: 'desc' }, skip: (currentPage - 1) * take, take }),
      prisma.company.count({ where }),
      prisma.company.findMany({ where: { deletedAt: null, country: { not: null } }, distinct: ['country'], select: { country: true }, orderBy: { country: 'asc' } }),
      prisma.company.findMany({ where: { deletedAt: null, industry: { not: null } }, distinct: ['industry'], select: { industry: true }, orderBy: { industry: 'asc' } }),
      prisma.user.findMany({ where: { companies: { some: { deletedAt: null } } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.company.count({ where: { deletedAt: null } }),
      prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Company" c CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(c."contactPersons") = 'array' THEN c."contactPersons" ELSE '[]'::jsonb END) person WHERE c."deletedAt" IS NULL AND BTRIM(person) NOT IN ('', '--')`,
      prisma.prospect.groupBy({ by: ['status'], where: { createdById: req.user.id }, _count: { _all: true } }),
    ])
    const prospects = companies.length ? await prisma.prospect.findMany({ where: { createdById: req.user.id, companyName: { in: companies.map(c => c.name), mode: 'insensitive' } }, include: { activities: { orderBy: { createdAt: 'desc' }, take: 10 } }, orderBy: { updatedAt: 'desc' } }) : []
    const normalized = companies.map(company => {
      const saved = prospects.filter(p => String(p.companyName || '').toLowerCase() === company.name.toLowerCase())
      const savedKeys = new Set(saved.map(p => `${p.firstName} ${p.lastName || ''}`.trim().toLowerCase()))
      const imported = list(company.contactPersons).map((raw, i) => ({ ...splitContact(raw), sourceIndex: i })).filter(c => c.firstName && c.firstName !== '--').filter(c => !savedKeys.has(`${c.firstName} ${c.lastName}`.trim().toLowerCase())).map((c, i) => {
        const linked = list(company.linkedProfiles).filter(x => x && x !== '--'); const emails = list(company.emails).filter(x => x && x !== '--')
        const email = c.email || emails[c.sourceIndex] || (company.contactPersons?.length === 1 ? company.email : '') || ''
        const linkedinUrl = c.linkedinUrl || linked[c.sourceIndex] || (company.contactPersons?.length === 1 ? linked[0] : '') || ''
        return { ...c, email, linkedinUrl, emailSource: email && !c.email ? 'Company record' : 'Contact record', linkedinSource: linkedinUrl && !c.linkedinUrl ? 'Company record' : 'Contact record', id: `company:${company.id}:${i}`, companyId: company.id, companyName: company.name, country: c.country || company.country || '', status: 'Not Contacted', ownerId: company.ownerId, ownerName: company.owner?.name || '', emailStatus: email ? 'Available' : 'Missing', linkedinStatus: linkedinUrl ? 'Available' : 'Unavailable', channel: email && linkedinUrl ? 'Email + LinkedIn' : linkedinUrl ? 'LinkedIn' : email ? 'Email' : 'Manual', activities: [], transient: true }
      })
      const contacts = [...saved.map(p => ({ ...p, companyId: company.id, country: company.country || '', transient: false })), ...imported]
      const lastActivity = contacts.flatMap(c => c.activities || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0] || null
      return { ...company, contacts, offer: offerFor(company.country), lastActivity }
    })
    const statusCount = name => statusGroups.filter(x => [].concat(name).includes(x.status)).reduce((sum,x)=>sum+x._count._all,0)
    const metrics = { companies: companyTotal, decisionMakers: Number(contactAggregate[0]?.count || 0), ready: statusCount(['Ready','Ready for Outreach']), sent: statusCount(['Sent','Contacted']), followUps: statusCount(['Follow-up Due','Follow-up Required']), replies: statusCount(['Replied','Interested','Meeting Booked']), meetings: statusCount('Meeting Booked') }
    res.json({ companies: normalized, metrics, offers: MARKET_OFFERS, total, page: currentPage, limit: take, facets: { countries: countries.map(x => x.country), industries: industries.map(x => x.industry), owners } })
  } catch (error) { console.error(error); res.status(500).json({ message: 'Unable to load company outreach workspace.' }) }
})

router.post('/workspace/contact', auth, async (req, res) => {
  try {
    const company = await prisma.company.findFirst({ where: { id: req.body.companyId, deletedAt: null }, include: { owner: true } })
    if (!company) return res.status(404).json({ message: 'Company not found.' })
    const data = shape({ ...req.body, companyName: company.name, ownerId: req.body.ownerId || company.ownerId, ownerName: req.body.ownerName || company.owner?.name, status: req.body.status || 'Not Contacted' })
    if (!data.firstName) return res.status(400).json({ message: 'Contact name is required.' })
    const existing = req.body.prospectId && !String(req.body.prospectId).startsWith('company:') ? await prisma.prospect.findFirst({ where: { id: req.body.prospectId, createdById: req.user.id } }) : null
    const prospect = existing
      ? await prisma.prospect.update({ where: { id: existing.id }, data })
      : await prisma.prospect.create({ data: { ...data, createdById: req.user.id, activities: { create: { type: 'added', title: 'Contact linked from company workspace', createdBy: req.user.name || req.user.email } } } })
    res.status(existing ? 200 : 201).json(prospect)
  } catch (error) { console.error(error); res.status(500).json({ message: 'Unable to save company contact.' }) }
})

router.post('/:id/follow-up', auth, async (req, res) => {
  const prospect = await prisma.prospect.findFirst({ where: { id: req.params.id, createdById: req.user.id } })
  if (!prospect) return res.status(404).json({ message: 'Prospect not found.' })
  const when = new Date(req.body.followUpAt)
  if (Number.isNaN(when.getTime())) return res.status(400).json({ message: 'A valid follow-up date is required.' })
  await prisma.$transaction([
    prisma.prospect.update({ where: { id: prospect.id }, data: { status: 'Follow-up Due' } }),
    prisma.prospectActivity.create({ data: { prospectId: prospect.id, type: 'scheduled', title: 'Follow-up scheduled', detail: when.toISOString(), createdBy: req.user.name || req.user.email } }),
  ])
  res.json({ success: true, followUpAt: when })
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
