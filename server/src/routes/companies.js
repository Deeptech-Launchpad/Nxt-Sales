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

// Split a "/"-separated import cell into a clean, de-duped list — the bulk
// import template uses "/" so a single cell can carry multiple Emails, Phone
// numbers, or Contact Persons for one company.
function splitMulti(v) {
  if (!v) return []
  return cleanArr(String(v).split('/'))
}

// Linked Profile uses "^" instead of "/" — LinkedIn URLs contain "/" naturally
// (e.g. https://www.linkedin.com/in/name), so splitting on "/" would break a
// single URL into fragments. "^" never appears in a URL, so it splits cleanly.
function splitCaret(v) {
  if (!v) return []
  return cleanArr(String(v).split('^'))
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

// Shared filter builder — used by both the paginated list and the export
// endpoint so "export with applied filters" always matches the on-screen list.
function buildCompanyWhere(query, userId) {
  const { search, view, owners, leadStatuses, createDate } = query
  // Companies in the Recycle Bin are archived — excluded from every normal
  // list/search/export view. Only the dedicated Recycle Bin routes look past this.
  const where = { deletedAt: null }

  if (view === 'mine')       where.ownerId = userId
  if (view === 'unassigned') where.ownerId = null

  if (owners) {
    const ownerList     = owners.split(',')
    const hasUnassigned = ownerList.includes('unassigned')
    const realOwners    = ownerList.filter(o => o !== 'unassigned')

    if (hasUnassigned && realOwners.length > 0) {
      const ownerOr = [{ ownerId: { in: realOwners } }, { ownerId: null }]
      where.OR = where.OR ? [...where.OR, ...ownerOr] : ownerOr
    } else if (hasUnassigned) {
      where.ownerId = null
    } else {
      where.ownerId = { in: realOwners }
    }
  }

  if (leadStatuses) where.leadStatus = { in: leadStatuses.split(',') }

  if (createDate) {
    const range = dateRangeFor(createDate)
    if (range) where.createdAt = { gte: range[0], lte: range[1] }
  }

  if (search) {
    where.OR = [
      { name:   { contains: search, mode: 'insensitive' } },
      { email:  { contains: search, mode: 'insensitive' } },
      { domain: { contains: search, mode: 'insensitive' } },
    ]
  }

  return where
}

// ── GET /api/companies ─────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query
    const where = buildCompanyWhere(req.query, req.user.id)

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

// ── GET /api/companies/export (before /:id) ─────────────────────────────────
// Returns EVERY company matching the current filters/search — no pagination —
// so Export always captures the full filtered set, not just the visible page.
router.get('/export', auth, async (req, res) => {
  try {
    const where = buildCompanyWhere(req.query, req.user.id)
    const companies = await prisma.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, name: true, email: true } } },
    })
    res.json({ companies, total: companies.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── POST /api/companies/check-duplicates — bulk pre-import duplicate preview ──
// Read-only: creates/modifies nothing. For each row, checks the same fields as
// single-company duplicate detection (name/email/phone/domain), and reports
// the matching existing company, if any, so the Import modal can preview and
// let the user skip/remove duplicate rows before anything is created.
router.post('/check-duplicates', auth, async (req, res) => {
  try {
    const { companies } = req.body
    if (!Array.isArray(companies)) return res.status(400).json({ message: 'companies array required.' })

    const results = []
    for (const c of companies) {
      const name = c.name ? String(c.name).trim() : ''
      if (!name) { results.push({ isDuplicate: false, existing: null }); continue }

      const dupConditions = [{ name: { equals: name, mode: 'insensitive' } }]
      if (c.email)  dupConditions.push({ email: String(c.email).toLowerCase().trim() })
      if (c.phone)  dupConditions.push({ phone: String(c.phone).trim() })
      if (c.domain) dupConditions.push({ domain: String(c.domain).trim() })

      // Recycle-Binned companies are archived — they must never block a new
      // company from being created/imported with the same identity.
      const existing = await prisma.company.findFirst({ where: { deletedAt: null, OR: dupConditions } })
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

    let created = 0, updated = 0, unchanged = 0, failed = 0
    const errors = []
    const messages = []
    // "Blank" = nothing meaningfully entered yet — used to decide which fields
    // a duplicate-matched row is allowed to fill in below.
    const isBlank = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

    // Lead Owner is the same single-owner field Companies always had (ownerId,
    // a real system user) — the import column is a name, matched case-
    // insensitively against real users. No match falls back to the importing
    // user, same as the previous always-import-as-me default.
    const allUsers = await prisma.user.findMany({ select: { id: true, name: true } })
    const userIdByName = new Map(allUsers.map(u => [u.name.toLowerCase().trim(), u.id]))

    for (const c of companies) {
      try {
        if (!c.name || !String(c.name).trim()) { errors.push('Missing company name — row skipped'); failed++; continue }

        // Multi-value columns (Email, Co. Phone no., Contact Person) use "/" as
        // the separator in the standard template — split into arrays exactly
        // like manually clicking "Add Another". Linked Profile uses "^" instead,
        // since LinkedIn URLs already contain "/".
        const emailList         = splitMulti(c.email)
        const phoneList         = splitMulti(c.phone)
        const contactPersonList = splitMulti(c.contactPersons)
        const linkedProfileList = splitCaret(c.linkedProfiles)

        const leadOwnerName = c.leadOwnerName ? String(c.leadOwnerName).trim() : ''
        const matchedOwnerId = leadOwnerName ? userIdByName.get(leadOwnerName.toLowerCase()) : null

        // Duplicate detection during bulk import — same fields/logic as
        // /check-duplicates and the single-company create route. A row that
        // matches an existing company (by name, email, phone, or domain) is
        // never turned into a second company — instead it backfills any
        // currently-blank fields on the match (see below).
        const dupConditions = [{ name: { equals: String(c.name).trim(), mode: 'insensitive' } }]
        if (emailList[0])  dupConditions.push({ email: emailList[0].toLowerCase() })
        if (phoneList[0])  dupConditions.push({ phone: phoneList[0] })
        if (c.domain && String(c.domain).trim()) dupConditions.push({ domain: String(c.domain).trim() })
        // Recycle-Binned companies are archived — never block a fresh import row.
        const existingDup = await prisma.company.findFirst({ where: { deletedAt: null, OR: dupConditions } })
        if (existingDup) {
          // Backfill only — a matched row fills in fields the existing company
          // doesn't have yet; anything already filled in is left untouched, so
          // re-importing a spreadsheet to add newly-tracked columns (e.g. CMS,
          // Remarks) can never overwrite data a user already entered.
          const data = {}
          const setIfBlank = (key, newVal) => { if (isBlank(existingDup[key]) && !isBlank(newVal)) data[key] = newVal }

          setIfBlank('domain',                c.domain || null)
          setIfBlank('industry',              c.industry || null)
          setIfBlank('country',               c.country || null)
          setIfBlank('leadStatus',            c.leadStatus || null)
          setIfBlank('endPdpUrl',             c.endPdpUrl || null)
          setIfBlank('cms',                   c.cms || null)
          setIfBlank('remarks',               c.remarks || null)
          setIfBlank('ownerId',               matchedOwnerId || null)

          // Email/Phone: scalar + array are one unit — only fill when the
          // company has NEITHER, so any existing email/phone is left as-is.
          if (isBlank(existingDup.email) && isBlank(existingDup.emails) && emailList.length) {
            data.email = emailList[0].toLowerCase()
            data.emails = emailList
          }
          if (isBlank(existingDup.phone) && isBlank(existingDup.phones) && phoneList.length) {
            data.phone = phoneList[0]
            data.phones = phoneList
          }
          if (isBlank(existingDup.contactPersons) && contactPersonList.length) data.contactPersons = contactPersonList
          if (isBlank(existingDup.linkedProfiles) && linkedProfileList.length) data.linkedProfiles = linkedProfileList

          const filledKeys = Object.keys(data)
          if (filledKeys.length) {
            await prisma.company.update({ where: { id: existingDup.id }, data })
          }

          // Notes/Task are additive Activity records (not Company columns), so
          // they still get added for a matched row, same as a fresh import.
          const noteText = c.notes
          if (noteText && String(noteText).trim()) {
            await prisma.activity.create({
              data: { type: 'note', companyId: existingDup.id, userId: req.user.id, title: 'Imported Note', body: String(noteText).trim() },
            }).catch(e => console.error(`Import note creation failed for ${existingDup.id}:`, e.message))
          }
          const taskText = c.task
          if (taskText && String(taskText).trim()) {
            await prisma.activity.create({
              data: { type: 'task', companyId: existingDup.id, userId: req.user.id, title: String(taskText).trim(), taskStatus: 'not_started' },
            }).catch(e => console.error(`Import task creation failed for ${existingDup.id}:`, e.message))
          }

          if (filledKeys.length) {
            updated++
            messages.push(`${c.name}: matched existing company "${existingDup.name}" — filled ${filledKeys.length} missing field(s), existing data unchanged.`)
          } else {
            unchanged++
            messages.push(`${c.name}: matched existing company "${existingDup.name}" — no missing fields to fill, nothing changed.`)
          }
          continue
        }

        const newCompany = await prisma.company.create({
          data: {
            name:                  String(c.name).trim(),
            email:                 emailList[0] ? emailList[0].toLowerCase() : null,
            emails:                emailList.length ? emailList : null,
            phone:                 phoneList[0] || null,
            phones:                phoneList.length ? phoneList : null,
            domain:                c.domain || null,
            industry:              c.industry || null,
            country:               c.country || null,
            leadStatus:            c.leadStatus || null,
            status:                'Lead',
            ownerId:               matchedOwnerId || req.user.id,
            endPdpUrl:             c.endPdpUrl || null,
            cms:                   c.cms || null,
            remarks:               c.remarks || null,
            contactPersons:        contactPersonList.length ? contactPersonList : null,
            linkedProfiles:        linkedProfileList.length ? linkedProfileList : null,
          },
        })
        created++

        // If the import row has a Notes/Task column, save it as an Activity —
        // reusing the same Activity table manual Notes/Tasks use (Company →
        // Activities), not new scalar Company columns.
        const noteText = c.notes
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
        const taskText = c.task
        if (taskText && String(taskText).trim()) {
          await prisma.activity.create({
            data: {
              type:       'task',
              companyId:  newCompany.id,
              userId:     req.user.id,
              title:      String(taskText).trim(),
              taskStatus: 'not_started',
            },
          }).catch(e => console.error(`Import task creation failed for ${newCompany.id}:`, e.message))
        }
      } catch (rowErr) {
        failed++
        errors.push(`${c.name || 'unknown'}: ${rowErr.message}`)
      }
    }

    res.json({ created, updated, unchanged, failed, errors, messages })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── GET /api/companies/recycle-bin — list soft-deleted companies ─────────
// Must be registered before /:id so "recycle-bin" isn't captured as an :id param.
router.get('/recycle-bin', auth, async (req, res) => {
  try {
    const { search } = req.query
    const where = {
      deletedAt: { not: null },
      ...(search && {
        OR: [
          { name:   { contains: search, mode: 'insensitive' } },
          { email:  { contains: search, mode: 'insensitive' } },
          { domain: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }
    const companies = await prisma.company.findMany({
      where,
      orderBy: { deletedAt: 'desc' },
      include: { owner: { select: { id: true, name: true, email: true } } },
    })
    res.json({ companies, total: companies.length })
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

    // A Recycle-Binned company behaves as if it no longer exists to every
    // normal view — including direct-link access to its detail page.
    if (!company || company.deletedAt) return res.status(404).json({ message: 'Company not found.' })
    res.json(company)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// ── POST /api/companies ───────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { name, email, phone, industry, leadStatus, status, ownerId,
            domain, country, emails, phones,
            endPdpUrl, cms, remarks, contactPersons, linkedProfiles } = req.body
    if (!name) return res.status(400).json({ message: 'Company name is required.' })

    const emailList = cleanArr(emails, email)
    const phoneList = cleanArr(phones, phone)
    const contactPersonList = cleanArr(contactPersons)
    const linkedProfileList = cleanArr(linkedProfiles)
    const primaryEmail = emailList[0] ? emailList[0].toLowerCase() : null
    const primaryPhone = phoneList[0] || null

    // Duplicate check — name (always) + email + phone + Company URL/domain (when provided)
    const dupConditions = [{ name: { equals: name.trim(), mode: 'insensitive' } }]
    if (primaryEmail) dupConditions.push({ email: primaryEmail })
    if (primaryPhone) dupConditions.push({ phone: primaryPhone })
    if (domain && domain.trim()) dupConditions.push({ domain: domain.trim() })

    // Recycle-Binned companies are archived — never block creating a new one.
    const existing = await prisma.company.findFirst({ where: { deletedAt: null, OR: dupConditions } })
    if (existing) {
      return res.status(409).json({
        message: 'A company with this name, email, phone, or company URL already exists.',
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
        industry:        industry || null,
        leadStatus:      leadStatus || null,
        status:          status    || 'Lead',
        ownerId:         ownerId   || req.user.id,
        domain:                domain                || null,
        country:               country               || null,
        endPdpUrl:             endPdpUrl             || null,
        cms:                   cms                   || null,
        remarks:               remarks               || null,
        contactPersons:        contactPersonList.length ? contactPersonList : null,
        linkedProfiles:        linkedProfileList.length ? linkedProfileList : null,
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

    // A Recycle-Binned company behaves as if it no longer exists to every
    // normal operation — editing must go through restore first, same as the
    // detail view already 404s.
    const existingRecord = await prisma.company.findUnique({ where: { id }, select: { deletedAt: true } })
    if (!existingRecord || existingRecord.deletedAt) return res.status(404).json({ message: 'Company not found.' })

    const { name, email, phone, industry, leadStatus, status, ownerId,
            domain, country, emails, phones,
            endPdpUrl, cms, remarks, contactPersons, linkedProfiles } = req.body

    // Recompute the multi-value lists + primary only when arrays were sent.
    const emailList = emails !== undefined ? cleanArr(emails, email) : null
    const phoneList = phones !== undefined ? cleanArr(phones, phone) : null
    const contactPersonList = contactPersons !== undefined ? cleanArr(contactPersons) : null
    const linkedProfileList = linkedProfiles !== undefined ? cleanArr(linkedProfiles) : null

    const company = await prisma.company.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(emailList ? { email: emailList[0] ? emailList[0].toLowerCase() : null, emails: emailList.length ? emailList : null }
                      : (email !== undefined && { email: email ? email.toLowerCase().trim() : null })),
        ...(phoneList ? { phone: phoneList[0] || null, phones: phoneList.length ? phoneList : null }
                      : (phone !== undefined && { phone: phone || null })),
        ...(industry !== undefined && { industry: industry || null }),
        ...(leadStatus !== undefined && { leadStatus: leadStatus || null }),
        ...(status !== undefined && { status: status || 'Lead' }),
        ...(ownerId !== undefined && { ownerId: ownerId || null }),
        ...(domain !== undefined && { domain: domain || null }),
        ...(country !== undefined && { country: country || null }),
        ...(endPdpUrl !== undefined && { endPdpUrl: endPdpUrl || null }),
        ...(cms !== undefined && { cms: cms || null }),
        ...(remarks !== undefined && { remarks: remarks || null }),
        ...(contactPersonList && { contactPersons: contactPersonList.length ? contactPersonList : null }),
        ...(linkedProfileList && { linkedProfiles: linkedProfileList.length ? linkedProfileList : null }),
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    })

    res.json(company)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// ── DELETE /api/companies/bulk — must be registered before /:id so "bulk"
// isn't swallowed as an :id param. Soft delete: moves companies to the
// Recycle Bin (deletedAt set) instead of removing them immediately. ───────
router.delete('/bulk', auth, async (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids array required.' })
    const { count } = await prisma.company.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date() },
    })
    res.json({ message: `${count} compan${count === 1 ? 'y' : 'ies'} moved to Recycle Bin.`, count })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// ── POST /api/companies/recycle-bin/restore ───────────────────────────────
// Restores each id unless an ACTIVE company already exists with the same
// name/email/phone/domain — in that case the row stays in the bin and the
// conflict is reported back so the user can decide, rather than silently
// overwriting or merging anything.
router.post('/recycle-bin/restore', auth, async (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids array required.' })

    const restored = []
    const conflicts = []

    for (const id of ids) {
      const company = await prisma.company.findUnique({ where: { id } })
      if (!company || !company.deletedAt) continue // not in the bin — skip

      const dupConditions = [{ name: { equals: company.name, mode: 'insensitive' } }]
      if (company.email)  dupConditions.push({ email: company.email })
      if (company.phone)  dupConditions.push({ phone: company.phone })
      if (company.domain) dupConditions.push({ domain: company.domain })

      const conflict = await prisma.company.findFirst({ where: { deletedAt: null, OR: dupConditions } })
      if (conflict) {
        conflicts.push({ id: company.id, name: company.name, conflictWith: { id: conflict.id, name: conflict.name } })
        continue
      }

      await prisma.company.update({ where: { id }, data: { deletedAt: null } })
      restored.push({ id: company.id, name: company.name })
    }

    res.json({ restored, conflicts })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// ── POST /api/companies/recycle-bin/permanent-delete ──────────────────────
// Hard-deletes — only companies already in the bin can be targeted here, so
// this can never bypass the Recycle Bin as a shortcut for normal delete.
router.post('/recycle-bin/permanent-delete', auth, async (req, res) => {
  try {
    const { ids } = req.body
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: 'ids array required.' })
    const { count } = await prisma.company.deleteMany({ where: { id: { in: ids }, deletedAt: { not: null } } })
    res.json({ message: `${count} compan${count === 1 ? 'y' : 'ies'} permanently deleted.`, count })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// ── DELETE /api/companies/:id — soft delete (single). Not currently wired to
// any UI, kept consistent with the bulk route's Recycle Bin behavior. ─────
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params
    const { count } = await prisma.company.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } })
    if (!count) return res.status(404).json({ message: 'Company not found.' })
    res.json({ message: 'Company moved to Recycle Bin.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

module.exports = router
