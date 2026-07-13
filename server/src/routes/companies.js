const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const { getImportFields } = require('../utils/importFields')

const prisma = new PrismaClient()

// ── helpers ───────────────────────────────────────────────
// Normalize a multi-value field: array or single scalar → trimmed, de-duped list.
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

// ── GET /api/companies ─────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { search, view, owners, leadStatuses, createDate, page = 1, limit = 100 } = req.query

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
        { name:     { contains: search, mode: 'insensitive' } },
        { email:    { contains: search, mode: 'insensitive' } },
        { website:  { contains: search, mode: 'insensitive' } },
      ]
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { owner: { select: { id: true, name: true, email: true } } },
      }),
      prisma.company.count({ where }),
    ])

    res.json({ companies, total, page: Number(page) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── GET /api/companies/import-fields (before /:id so it isn't captured) ────────
router.get('/import-fields', auth, (req, res) => res.json(getImportFields('Company')))

// ── POST /api/companies/check-duplicates — bulk pre-import duplicate preview ──
// Read-only: creates/modifies nothing. For each row, checks the same fields as
// single-company duplicate detection (name/email/phone/website) plus domain,
// and reports the matching existing company, if any, so the Import modal can
// preview and let the user skip/remove duplicate rows before anything is created.
router.post('/check-duplicates', auth, async (req, res) => {
  try {
    const { companies } = req.body
    if (!Array.isArray(companies)) return res.status(400).json({ message: 'companies array required.' })

    const results = []
    for (const c of companies) {
      const name = c.name ? String(c.name).trim() : ''
      if (!name) { results.push({ isDuplicate: false, existing: null }); continue }

      const dupConditions = [{ name: { equals: name, mode: 'insensitive' } }]
      if (c.email)   dupConditions.push({ email: String(c.email).toLowerCase().trim() })
      if (c.phone)   dupConditions.push({ phone: String(c.phone).trim() })
      if (c.website) dupConditions.push({ website: String(c.website).trim() })
      if (c.domain)  dupConditions.push({ domain: String(c.domain).trim() })

      const existing = await prisma.company.findFirst({ where: { OR: dupConditions } })
      results.push({
        isDuplicate: !!existing,
        existing: existing ? { id: existing.id, name: existing.name } : null,
      })
    }

    res.json({ results })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── POST /api/companies/bulk (import) ─────────────────────────────────────────
router.post('/bulk', auth, async (req, res) => {
  try {
    const { companies } = req.body
    if (!Array.isArray(companies) || companies.length === 0) {
      return res.status(400).json({ message: 'No companies provided.' })
    }

    let created = 0, failed = 0
    const errors = []
    const num = (v, float) => {
      if (v === undefined || v === null || v === '') return null
      const n = float ? parseFloat(v) : parseInt(v)
      return Number.isFinite(n) ? n : null
    }

    for (const c of companies) {
      try {
        if (!c.name || !String(c.name).trim()) { errors.push('Missing company name — row skipped'); failed++; continue }
        const newCompany = await prisma.company.create({
          data: {
            name:                  String(c.name).trim(),
            email:                 c.email ? String(c.email).toLowerCase().trim() : null,
            emails:                c.email ? [String(c.email).toLowerCase().trim()] : null,
            phone:                 c.phone || null,
            phones:                c.phone ? [String(c.phone).trim()] : null,
            mobile:                c.mobile || null,
            website:               c.website || null,
            domain:                c.domain || null,
            industry:              c.industry || null,
            industryType:          c.industryType || null,
            companyType:           c.companyType || null,
            leadType:              c.leadType || null,
            employeeCount:         num(c.employeeCount, false),
            revenue:               num(c.revenue, true),
            country:               c.country || null,
            city:                  c.city || null,
            stateRegion:           c.stateRegion || null,
            postalCode:            c.postalCode || null,
            timeZone:              c.timeZone || null,
            originalTrafficSource: c.originalTrafficSource || null,
            linkedinUrl:           c.linkedinUrl || null,
            description:           c.description || null,
            lifecycleStage:        c.lifecycleStage || 'Lead',
            leadStatus:            c.leadStatus || null,
            status:                'Lead',
            ownerId:               req.user.id,
          },
        })
        created++

        // If the import row has a Notes column, save it as a Note Activity —
        // reusing the same Activity table manual notes use (Company → Activities
        // → Notes), not the Company's own unrelated `notes` column.
        const noteText = c.notes || c['Notes']
        if (noteText && String(noteText).trim()) {
          await prisma.activity.create({
            data: {
              type:      'note',
              companyId: newCompany.id,
              userId:    req.user.id,
              title:     'Imported Note',
              body:      String(noteText).trim(),
            },
          }).catch(e => console.error(`Import note creation failed for ${newCompany.id}:`, e.message))
        }
      } catch (rowErr) {
        failed++
        errors.push(`${c.name || 'unknown'}: ${rowErr.message}`)
      }
    }

    res.json({ created, failed, errors })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── GET /api/companies/:id ────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params
    const company = await prisma.company.findUnique({
      where: { id },
      include: { owner: { select: { id: true, name: true, email: true } } },
    })

    if (!company) return res.status(404).json({ message: 'Company not found.' })
    res.json(company)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// ── POST /api/companies ───────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { name, email, phone, website, industry, employeeCount, revenue, lifecycleStage, leadStatus, status, ownerId,
            domain, companyType, city, stateRegion, postalCode, timeZone, description, linkedinUrl, industryType, leadType, originalTrafficSource, country, mobile, emails, phones } = req.body
    if (!name) return res.status(400).json({ message: 'Company name is required.' })

    const emailList = cleanArr(emails, email)
    const phoneList = cleanArr(phones, phone)
    const primaryEmail = emailList[0] ? emailList[0].toLowerCase() : null
    const primaryPhone = phoneList[0] || null

    // Duplicate check — name (always) + email + phone + website (when provided)
    const dupConditions = [{ name: { equals: name.trim(), mode: 'insensitive' } }]
    if (primaryEmail) dupConditions.push({ email: primaryEmail })
    if (primaryPhone) dupConditions.push({ phone: primaryPhone })
    if (website && website.trim()) dupConditions.push({ website: website.trim() })

    const existing = await prisma.company.findFirst({ where: { OR: dupConditions } })
    if (existing) {
      return res.status(409).json({
        message: 'A company with this name, email, phone, or website already exists.',
        duplicate: true,
        existing: { id: existing.id, name: existing.name },
      })
    }

    const company = await prisma.company.create({
      data: {
        name:            name.trim(),
        email:           primaryEmail,
        emails:          emailList.length ? emailList : null,
        phone:           primaryPhone,
        phones:          phoneList.length ? phoneList : null,
        website:         website  || null,
        industry:        industry || null,
        employeeCount:   employeeCount ? parseInt(employeeCount) : null,
        revenue:         revenue  ? parseFloat(revenue) : null,
        lifecycleStage:  lifecycleStage || 'Lead',
        leadStatus:      leadStatus || null,
        status:          status    || 'Lead',
        ownerId:         ownerId   || req.user.id,
        domain:                domain                || null,
        companyType:           companyType           || null,
        city:                  city                  || null,
        stateRegion:           stateRegion           || null,
        postalCode:            postalCode            || null,
        timeZone:              timeZone              || null,
        description:           description           || null,
        linkedinUrl:           linkedinUrl           || null,
        industryType:          industryType          || null,
        leadType:              leadType              || null,
        originalTrafficSource: originalTrafficSource || null,
        country:               country               || null,
        mobile:                mobile                || null,
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    })
    res.status(201).json(company)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// ── PUT /api/companies/:id ────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { name, email, phone, website, industry, employeeCount, revenue, lifecycleStage, leadStatus, status, ownerId,
            domain, companyType, city, stateRegion, postalCode, timeZone, description, linkedinUrl, industryType, leadType, originalTrafficSource, country, mobile, emails, phones } = req.body

    // Recompute the multi-value lists + primary only when arrays were sent.
    const emailList = emails !== undefined ? cleanArr(emails, email) : null
    const phoneList = phones !== undefined ? cleanArr(phones, phone) : null

    const company = await prisma.company.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(emailList ? { email: emailList[0] ? emailList[0].toLowerCase() : null, emails: emailList.length ? emailList : null }
                      : (email !== undefined && { email: email ? email.toLowerCase().trim() : null })),
        ...(phoneList ? { phone: phoneList[0] || null, phones: phoneList.length ? phoneList : null }
                      : (phone !== undefined && { phone: phone || null })),
        ...(website !== undefined && { website: website || null }),
        ...(industry !== undefined && { industry: industry || null }),
        ...(employeeCount !== undefined && { employeeCount: employeeCount ? parseInt(employeeCount) : null }),
        ...(revenue !== undefined && { revenue: revenue ? parseFloat(revenue) : null }),
        ...(lifecycleStage !== undefined && { lifecycleStage: lifecycleStage || 'Lead' }),
        ...(leadStatus !== undefined && { leadStatus: leadStatus || null }),
        ...(status !== undefined && { status: status || 'Lead' }),
        ...(ownerId !== undefined && { ownerId: ownerId || null }),
        ...(domain !== undefined && { domain: domain || null }),
        ...(companyType !== undefined && { companyType: companyType || null }),
        ...(city !== undefined && { city: city || null }),
        ...(stateRegion !== undefined && { stateRegion: stateRegion || null }),
        ...(postalCode !== undefined && { postalCode: postalCode || null }),
        ...(timeZone !== undefined && { timeZone: timeZone || null }),
        ...(description !== undefined && { description: description || null }),
        ...(linkedinUrl !== undefined && { linkedinUrl: linkedinUrl || null }),
        ...(industryType !== undefined && { industryType: industryType || null }),
        ...(leadType !== undefined && { leadType: leadType || null }),
        ...(originalTrafficSource !== undefined && { originalTrafficSource: originalTrafficSource || null }),
        ...(country !== undefined && { country: country || null }),
        ...(mobile !== undefined && { mobile: mobile || null }),
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    })

    res.json(company)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// ── DELETE /api/companies/:id ─────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params
    await prisma.company.delete({ where: { id } })
    res.json({ message: 'Company deleted.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

module.exports = router
