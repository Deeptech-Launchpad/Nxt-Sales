const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const { getImportFields } = require('../utils/importFields')

const prisma = new PrismaClient()

// Normalize a multi-value field: accept an array or a single scalar, fall back
// to a legacy single value, then trim / drop blanks / de-dupe (case-insensitive).
function cleanArr(a, fallback) {
  let list = Array.isArray(a) ? a.slice() : (a ? [a] : [])
  if (!list.length && fallback) list = [fallback]
  const seen = new Set()
  const out = []
  for (const raw of list) {
    const v = String(raw || '').trim()
    if (!v) continue
    const k = v.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(v)
  }
  return out
}

// GET /api/contacts/import-fields — dynamic import template/mapping fields
// (declared before /:id so it isn't captured as an id param)
router.get('/import-fields', auth, (req, res) => res.json(getImportFields('Contact')))

// ── helpers ───────────────────────────────────────────────
function dateRangeFor(key) {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const map   = {
    today:        [today, new Date(today.getTime() + 86400000 - 1)],
    yesterday:    [new Date(today.getTime() - 86400000), new Date(today.getTime() - 1)],
    tomorrow:     [new Date(today.getTime() + 86400000), new Date(today.getTime() + 172800000 - 1)],
    this_week:    [new Date(today.setDate(today.getDate() - today.getDay())), new Date(today.getTime() + 7 * 86400000 - 1)],
    last_7:       [new Date(now.getTime() - 7  * 86400000), now],
    last_14:      [new Date(now.getTime() - 14 * 86400000), now],
    last_30:      [new Date(now.getTime() - 30 * 86400000), now],
    last_60:      [new Date(now.getTime() - 60 * 86400000), now],
    last_90:      [new Date(now.getTime() - 90 * 86400000), now],
    last_180:     [new Date(now.getTime() - 180 * 86400000), now],
    last_365:     [new Date(now.getTime() - 365 * 86400000), now],
  }
  return map[key] || null
}

// ── GET /api/contacts ─────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { search, view, owners, leadStatuses, createDate, lastActivityDate, page = 1, limit = 100 } = req.query

    const where = {}

    // Tab view filter
    if (view === 'mine')       where.ownerId = req.user.id
    if (view === 'unassigned') where.ownerId = null

    // Owner filter (comma-separated IDs — 'unassigned' maps to null)
    if (owners) {
      const ownerList    = owners.split(',')
      const hasUnassigned = ownerList.includes('unassigned')
      const realOwners   = ownerList.filter(o => o !== 'unassigned')

      if (hasUnassigned && realOwners.length > 0) {
        // merge with any existing OR from search
        const ownerOr = [{ ownerId: { in: realOwners } }, { ownerId: null }]
        where.OR = where.OR ? [...where.OR, ...ownerOr] : ownerOr
      } else if (hasUnassigned) {
        where.ownerId = null
      } else {
        where.ownerId = { in: realOwners }
      }
    }

    // Lead status filter (comma-separated values)
    if (leadStatuses) where.leadStatus = { in: leadStatuses.split(',') }

    // Create date filter
    if (createDate) {
      const range = dateRangeFor(createDate)
      if (range) where.createdAt = { gte: range[0], lte: range[1] }
    }

    // Search
    if (search) {
      where.OR = [
        { name:    { contains: search, mode: 'insensitive' } },
        { email:   { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { owner: { select: { id: true, name: true, email: true } } },
      }),
      prisma.contact.count({ where }),
    ])

    res.json({ contacts, total, page: Number(page) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── POST /api/contacts ────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { firstName, lastName, name, email, phone, company, jobTitle, lifecycleStage, leadStatus, status, ownerId, linkedinUrl, industry, country, emails, phones } = req.body

    const emailList  = cleanArr(emails, email)
    const phoneList  = cleanArr(phones, phone)
    const primaryEmail = (emailList[0] || '').toLowerCase()
    const primaryPhone = phoneList[0] || null
    if (!primaryEmail) return res.status(400).json({ message: 'Email is required.' })

    // Duplicate check — primary email (always) + primary phone (when provided)
    const dupConditions = [{ email: primaryEmail }]
    if (primaryPhone) dupConditions.push({ phone: primaryPhone })

    const existing = await prisma.contact.findFirst({ where: { OR: dupConditions } })
    if (existing) {
      return res.status(409).json({
        message: 'A contact with this email or phone already exists.',
        duplicate: true,
        existing: { id: existing.id, name: existing.name, email: existing.email },
      })
    }

    const contactName = name || `${firstName || ''} ${lastName || ''}`.trim() || primaryEmail

    const contact = await prisma.contact.create({
      data: {
        firstName:     firstName  || null,
        lastName:      lastName   || null,
        name:          contactName,
        email:         primaryEmail,
        emails:        emailList.length ? emailList : null,
        phone:         primaryPhone,
        phones:        phoneList.length ? phoneList : null,
        company:       company    || null,
        jobTitle:      jobTitle   || null,
        lifecycleStage: lifecycleStage || 'Lead',
        leadStatus:    leadStatus || null,
        status:        status     || 'Lead',
        ownerId:       ownerId || req.user.id,
        linkedinUrl:   linkedinUrl || null,
        industry:      industry || null,
        country:       country || null,
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    })
    res.status(201).json(contact)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// ── POST /api/contacts/bulk (import) ─────────────────────
router.post('/bulk', auth, async (req, res) => {
  try {
    const { contacts } = req.body
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ message: 'No contacts provided.' })
    }

    let created = 0, failed = 0
    const errors = []

    for (const c of contacts) {
      try {
        if (!c.email) { errors.push(`Missing email — row skipped`); failed++; continue }
        const contactName = c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.email

        await prisma.contact.create({
          data: {
            firstName:      c.firstName      || null,
            lastName:       c.lastName       || null,
            name:           contactName,
            email:          String(c.email).toLowerCase().trim(),
            emails:         [String(c.email).toLowerCase().trim()],
            phone:          c.phone          || null,
            phones:         c.phone ? [String(c.phone).trim()] : null,
            company:        c.company        || c.companyName   || null,
            jobTitle:       c.jobTitle       || c['Job Title']  || null,
            lifecycleStage: c.lifecycleStage || c['Lifecycle Stage'] || 'Lead',
            leadStatus:     c.leadStatus     || c['Lead Status'] || null,
            linkedinUrl:    c.linkedinUrl    || c['LinkedIn URL'] || null,
            industry:       c.industry       || c['Industry'] || null,
            country:        c.country        || c['Country'] || null,
            status:         'Lead',
            ownerId:        req.user.id,
          },
        })
        created++
      } catch (rowErr) {
        failed++
        errors.push(`${c.email || 'unknown'}: ${rowErr.message}`)
      }
    }

    res.json({ created, failed, errors })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── GET /api/contacts/:id ─────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id },
      include: { deals: true, owner: { select: { id: true, name: true, email: true } } },
    })
    if (!contact) return res.status(404).json({ message: 'Contact not found.' })
    res.json(contact)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── PUT /api/contacts/:id ─────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const { firstName, lastName, name, email, phone, company, jobTitle, lifecycleStage, leadStatus, status, notes, linkedinUrl, industry, country, emails, phones } = req.body

    // Recompute the multi-value lists + primary only when arrays were sent.
    const emailList = emails !== undefined ? cleanArr(emails, email) : null
    const phoneList = phones !== undefined ? cleanArr(phones, phone) : null

    const updated = await prisma.contact.update({
      where: { id: req.params.id },
      data: {
        firstName, lastName, name, company, jobTitle, lifecycleStage, leadStatus, status, notes, linkedinUrl, industry, country,
        ...(emailList ? { email: (emailList[0] || '').toLowerCase() || null, emails: emailList.length ? emailList : null }
                      : (email !== undefined && { email: email ? String(email).toLowerCase().trim() : null })),
        ...(phoneList ? { phone: phoneList[0] || null, phones: phoneList.length ? phoneList : null }
                      : (phone !== undefined && { phone: phone || null })),
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    })
    res.json(updated)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── DELETE /api/contacts/:id ──────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    await prisma.contact.delete({ where: { id: req.params.id } })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

module.exports = router
