const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const { getImportFields } = require('../utils/importFields')
const {
  validateAndShapeCustomFieldInput, writeCustomFieldValues, attachCustomFieldValues,
  CustomFieldValidationError, getFieldDefinitions, shapeCustomFieldInputSync, bulkFetchDropdownValues,
} = require('../utils/customFieldValues')

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

// In-memory duplicate index for bulk import/preview — replaces a `findFirst`
// DB round trip per row (the original approach, fine for a handful of rows
// but a 10,000+ row import made 10,000+ sequential queries, slow enough to
// exceed the reverse-proxy's timeout). Same match semantics as the old
// `OR: [name, email, phone, domain]` query: name is checked first, then
// email/phone/domain, so a row with a conflicting signal across two
// different existing companies resolves deterministically instead of
// whatever order the database happened to return (that order was never
// guaranteed anyway — this is a reasonable, stable replacement for it).
function buildDupLookup(existingCompanies) {
  const byName = new Map(), byEmail = new Map(), byPhone = new Map(), byDomain = new Map()
  const index = (co) => {
    byName.set(co.name.toLowerCase(), co)
    if (co.email)  byEmail.set(co.email.toLowerCase(), co)
    if (co.phone)  byPhone.set(co.phone, co)
    if (co.domain) byDomain.set(co.domain, co)
  }
  existingCompanies.forEach(index)
  return {
    find(name, email, phone, domain) {
      return byName.get(String(name).trim().toLowerCase())
        || (email  && byEmail.get(String(email).toLowerCase().trim()))
        || (phone  && byPhone.get(String(phone).trim()))
        || (domain && byDomain.get(String(domain).trim()))
        || null
    },
    // Call after creating/updating a company mid-batch so a later row in the
    // SAME import that duplicates it is still caught — matching the original
    // per-row-query behavior, where every row saw all earlier writes.
    index,
  }
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

// linkedProfiles is a JSONB array — Prisma's query builder can't do a
// contains-over-array-elements match, so this runs the same
// jsonb_array_elements_text pattern already used by /email-conflicts,
// guarded against JSON null the same way (see that endpoint's comment).
async function companyIdsWithLinkedProfileMatch(search) {
  const rows = await prisma.$queryRaw`
    SELECT id FROM "Company"
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof("linkedProfiles") = 'array' THEN "linkedProfiles" ELSE '[]'::jsonb END
      ) AS p
      WHERE p ILIKE ${'%' + search + '%'}
    )
  `
  return rows.map(r => r.id)
}

// Resolves a `customFilters` query param (JSON-encoded {key: value}, e.g.
// `{"gstStatus":"Filed"}`) to matching Company ids — same precedent as
// companyIdsWithLinkedProfileMatch above, but AND-ing across every filter
// key (an id must match ALL specified custom fields, not any one of them),
// so each key gets its own single query (one per ACTIVE FILTER, not per
// row — a UI filter bar has a handful of active filters at most, nowhere
// near import-sized row counts, so this is not the N+1 shape that bulk
// import had to be fixed for). Returns null if no filters were given (the
// caller then leaves `where.id` untouched) or [] if a filter can't match
// anything (unknown key, or the intersection is empty).
async function companyIdsWithCustomFieldMatch(customFiltersJson) {
  let filters
  try { filters = JSON.parse(customFiltersJson) } catch { return null }
  if (!filters || typeof filters !== 'object') return null
  const keys = Object.keys(filters)
  if (!keys.length) return null

  const defs = await prisma.customFieldDefinition.findMany({ where: { entity: 'Company', key: { in: keys } } })
  const byKey = new Map(defs.map(d => [d.key, d]))

  let matched = null
  for (const [key, value] of Object.entries(filters)) {
    const def = byKey.get(key)
    if (!def) return [] // filtering on an unknown/removed field can never match anything
    const rows = await prisma.customFieldValue.findMany({
      where: { fieldId: def.id, OR: [{ textValue: String(value) }, { listValue: { array_contains: [String(value)] } }] },
      select: { recordId: true },
    })
    const ids = new Set(rows.map(r => r.recordId))
    matched = matched === null ? ids : new Set([...matched].filter(id => ids.has(id)))
    if (matched.size === 0) break
  }
  return [...matched]
}

// Shared filter builder — used by both the paginated list and the export
// endpoint so "export with applied filters" always matches the on-screen list.
async function buildCompanyWhere(query, userId) {
  const { search, view, owners, leadStatuses, createDate, customFilters } = query
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
    const linkedProfileIds = await companyIdsWithLinkedProfileMatch(search)
    where.OR = [
      { name:   { contains: search, mode: 'insensitive' } },
      { email:  { contains: search, mode: 'insensitive' } },
      { domain: { contains: search, mode: 'insensitive' } },
      { phone:  { contains: search, mode: 'insensitive' } },
      ...(linkedProfileIds.length ? [{ id: { in: linkedProfileIds } }] : []),
    ]
  }

  // Custom fields (Dynamic Custom Fields) are filterable via this dedicated
  // param, deliberately NOT blended into the free-text `search` above — that
  // would mean an extra per-custom-field subquery on every keystroke, the
  // same N-subqueries-per-search shape that risks the timeout bulk import
  // already hit once. `where.id` combines with `where.OR` (search) as an
  // implicit AND at the top level — both conditions must hold when present.
  if (customFilters) {
    const ids = await companyIdsWithCustomFieldMatch(customFilters)
    if (ids !== null) where.id = { in: ids }
  }

  return where
}

// ── GET /api/companies ─────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query
    const where = await buildCompanyWhere(req.query, req.user.id)

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { owner: { select: { id: true, name: true, email: true } } },
      }),
      prisma.company.count({ where }),
    ])
    await attachCustomFieldValues('Company', companies)

    res.json({ companies, total, page: Number(page) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── GET /api/companies/import-fields (before /:id so it isn't captured) ────────
router.get('/import-fields', auth, async (req, res) => {
  try {
    res.json(await getImportFields('Company'))
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
  }
})

// ── GET /api/companies/export (before /:id) ─────────────────────────────────
// Returns EVERY company matching the current filters/search — no pagination —
// so Export always captures the full filtered set, not just the visible page.
router.get('/export', auth, async (req, res) => {
  try {
    const where = await buildCompanyWhere(req.query, req.user.id)
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

// ── POST /api/companies/email-conflicts ───────────────────────────────────────
// Read-only: creates/modifies nothing. Given a set of email addresses, reports
// which OTHER companies already hold any of them.
//
// Why this exists: an email address can only ever be attached to one company's
// conversation history — Email Sync stores one Activity row per Gmail message,
// so whichever company claims a message first keeps it. Two companies sharing an
// address therefore silently starve whichever was created second. Surfacing the
// clash at save time is what stops that being discovered later as "sync is
// broken". Deliberately advisory: the caller is warned, never blocked, because
// legitimately shared addresses (a consultant serving two clients, a shared
// info@ at a parent company) do occur and the user is the right judge.
//
// Matching covers BOTH the primary `email` column and the `emails` JSONB array,
// case-insensitively, and is done in Postgres rather than by scanning rows in
// JS — this is called on a debounce while typing, against a table that holds
// thousands of companies in production.
router.post('/email-conflicts', auth, async (req, res) => {
  try {
    const { emails, excludeCompanyId } = req.body
    const addrs = [...new Set(
      (Array.isArray(emails) ? emails : [])
        .filter(e => typeof e === 'string')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean)
    )]
    if (addrs.length === 0) return res.json({ conflicts: [] })

    // Recycle-Binned companies are archived and never block anything.
    const rows = await prisma.$queryRaw`
      SELECT id, name, email, emails
      FROM "Company"
      WHERE "deletedAt" IS NULL
        AND (
          lower(email) = ANY(${addrs}::text[])
          OR EXISTS (
            -- The CASE is load-bearing: the emails column is nullable JSONB and
            -- some rows hold JSON null (not SQL NULL), which COALESCE does not
            -- catch. jsonb_array_elements_text errors with "cannot extract
            -- elements from a scalar" on those, so anything that is not an
            -- array is normalised to an empty array before expansion.
            SELECT 1
            FROM jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(emails) = 'array' THEN emails ELSE '[]'::jsonb END
            ) AS e
            WHERE lower(e) = ANY(${addrs}::text[])
          )
        )
    `

    // address → the other companies holding it
    const byAddress = new Map(addrs.map(a => [a, []]))
    for (const row of rows) {
      if (excludeCompanyId && row.id === excludeCompanyId) continue
      const held = new Set(
        [row.email, ...(Array.isArray(row.emails) ? row.emails : [])]
          .filter(v => typeof v === 'string')
          .map(v => v.trim().toLowerCase())
      )
      for (const a of addrs) {
        if (held.has(a)) byAddress.get(a).push({ id: row.id, name: row.name })
      }
    }

    const conflicts = [...byAddress.entries()]
      .filter(([, companies]) => companies.length > 0)
      .map(([email, companies]) => ({ email, companies }))

    res.json({ conflicts })
  } catch (err) {
    console.error('[Company email-conflicts] error:', err.message)
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

    // One bulk pre-fetch + in-memory lookup instead of a `findFirst` DB round
    // trip per row — a large import (thousands of rows) previously issued one
    // sequential query per row, slow enough to exceed the reverse-proxy's
    // response timeout. Recycle-Binned companies are archived — excluded here
    // exactly as the old per-row query excluded them, so they never block a
    // new company from being created/imported with the same identity.
    const dupLookup = buildDupLookup(await prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, email: true, phone: true, domain: true },
    }))

    const results = companies.map(c => {
      const name = c.name ? String(c.name).trim() : ''
      if (!name) return { isDuplicate: false, existing: null }
      const existing = dupLookup.find(name, c.email, c.phone, c.domain)
      return { isDuplicate: !!existing, existing: existing ? { id: existing.id, name: existing.name } : null }
    })

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
    // insensitively and whitespace-normalized against real users. Each row
    // keeps the owner named in the file: blank/"Unassigned" -> no owner,
    // a real match -> that user, an unrecognized name -> the row fails
    // validation instead of silently falling back to the importing user.
    const normalizeOwnerName = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ')
    const allUsers = await prisma.user.findMany({ select: { id: true, name: true } })
    const userIdByName = new Map(allUsers.map(u => [normalizeOwnerName(u.name), u.id]))

    // One bulk pre-fetch + in-memory lookup instead of a `findFirst` DB round
    // trip per row (see buildDupLookup) — the prior per-row query made a
    // large import (thousands of rows) slow enough to exceed the reverse-
    // proxy's response timeout. Select every field the backfill logic below
    // reads via `existingDup[key]`.
    const dupLookup = buildDupLookup(await prisma.company.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, email: true, emails: true, phone: true, phones: true,
        domain: true, industry: true, country: true, leadStatus: true, endPdpUrl: true,
        cms: true, remarks: true, ownerId: true, contactPersons: true, linkedProfiles: true,
      },
    }))

    // Custom field values (Dynamic Custom Fields) — same "one bulk prefetch,
    // no per-row query" discipline as dupLookup above. Import rows carry
    // custom field values as flat `custom.<key>` properties (matching the
    // convention every other consumer of the unified field list uses), not
    // the nested `customFields: {...}` shape the single-record routes take.
    // Validated/shaped per row below via shapeCustomFieldInputSync (zero DB
    // queries); actual writes are batched ONCE after the whole loop finishes
    // — see below.
    const customFieldDefs = await getFieldDefinitions('Company')
    const dropdownValuesByFieldKey = await bulkFetchDropdownValues('Company', customFieldDefs)
    const customFieldTouches = [] // { recordId, isNew, shaped }

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
        const normalizedLeadOwner = leadOwnerName ? normalizeOwnerName(leadOwnerName) : ''
        let matchedOwnerId = null
        if (normalizedLeadOwner && normalizedLeadOwner !== 'unassigned') {
          matchedOwnerId = userIdByName.get(normalizedLeadOwner) || null
          if (!matchedOwnerId) {
            failed++
            errors.push(`${c.name}: Lead Owner "${leadOwnerName}" does not match any existing user — row skipped`)
            continue
          }
        }

        // Custom field values for this row, validated/shaped with zero DB
        // queries (pre-fetched defs/dropdown-values above) — a bad value
        // fails just this row, matching every other row-level failure here.
        let shapedCustomFields = []
        if (customFieldDefs.length) {
          const rawCustomFields = {}
          for (const k in c) if (k.startsWith('custom.') && c[k] !== '') rawCustomFields[k.slice(7)] = c[k]
          if (Object.keys(rawCustomFields).length) {
            const { shaped, errors: cfErrors } = shapeCustomFieldInputSync('Company', customFieldDefs, rawCustomFields, dropdownValuesByFieldKey)
            if (cfErrors.length) {
              failed++
              errors.push(`${c.name}: ${cfErrors.map(e => e.message).join('; ')}`)
              continue
            }
            shapedCustomFields = shaped
          }
        }

        // Duplicate detection during bulk import — same fields/logic as
        // /check-duplicates and the single-company create route. A row that
        // matches an existing company (by name, email, phone, or domain) is
        // never turned into a second company — instead it backfills any
        // currently-blank fields on the match (see below). Recycle-Binned
        // companies are archived — excluded from dupLookup's pre-fetch above,
        // so they never block a fresh import row.
        const existingDup = dupLookup.find(c.name, emailList[0], phoneList[0], c.domain && String(c.domain).trim())
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
          setIfBlank('ownerId',               matchedOwnerId)

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
            // Keep the in-memory dup index in sync so a LATER row in this same
            // import that duplicates this company (e.g. matches it by a field
            // just filled in above) is still caught, same as when every row
            // queried the database directly.
            Object.assign(existingDup, data)
            dupLookup.index(existingDup)
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

          if (shapedCustomFields.length) customFieldTouches.push({ recordId: existingDup.id, isNew: false, shaped: shapedCustomFields })

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
            ownerId:               matchedOwnerId,
            endPdpUrl:             c.endPdpUrl || null,
            cms:                   c.cms || null,
            remarks:               c.remarks || null,
            contactPersons:        contactPersonList.length ? contactPersonList : null,
            linkedProfiles:        linkedProfileList.length ? linkedProfileList : null,
          },
        })
        created++
        // Index this new company so a LATER row in this same import that
        // duplicates it is caught, same as when every row queried the DB directly.
        dupLookup.index(newCompany)
        if (shapedCustomFields.length) customFieldTouches.push({ recordId: newCompany.id, isNew: true, shaped: shapedCustomFields })

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

    // Batched custom-field write — exactly two queries total (one prefetch,
    // one/two createMany) regardless of import size, never one per row. New
    // companies can never already have a value, so those touches write
    // directly; backfilled companies respect the same "only fill currently-
    // blank fields, never overwrite" rule the built-in fields already follow
    // above — checked here via one bulk prefetch of current values, not a
    // query per row.
    if (customFieldTouches.length) {
      const toRow = (fieldId, recordId, r) => ({
        fieldId, recordId,
        textValue: r.textValue ?? null, numberValue: r.numberValue ?? null,
        dateValue: r.dateValue ?? null, boolValue: r.boolValue ?? null, listValue: r.listValue ?? null,
      })

      const newRows = customFieldTouches
        .filter(t => t.isNew)
        .flatMap(t => t.shaped.filter(r => !r.clear).map(r => toRow(r.fieldId, t.recordId, r)))
      if (newRows.length) {
        await prisma.customFieldValue.createMany({ data: newRows, skipDuplicates: true })
      }

      const backfillTouches = customFieldTouches.filter(t => !t.isNew)
      if (backfillTouches.length) {
        const fieldIds  = [...new Set(backfillTouches.flatMap(t => t.shaped.map(r => r.fieldId)))]
        const recordIds = [...new Set(backfillTouches.map(t => t.recordId))]
        const current = await prisma.customFieldValue.findMany({
          where: { fieldId: { in: fieldIds }, recordId: { in: recordIds } },
        })
        const currentByKey = new Map(current.map(v => [`${v.fieldId}:${v.recordId}`, v]))
        const isRowBlank = (v) => !v || (
          v.textValue == null && v.numberValue == null && v.dateValue == null &&
          v.boolValue == null && (v.listValue == null || (Array.isArray(v.listValue) && v.listValue.length === 0))
        )

        const backfillRows = []
        for (const t of backfillTouches) {
          for (const r of t.shaped) {
            if (r.clear) continue // nothing to backfill for an explicit blank
            if (!isRowBlank(currentByKey.get(`${r.fieldId}:${t.recordId}`))) continue // already has a value — never overwrite
            backfillRows.push(toRow(r.fieldId, t.recordId, r))
          }
        }
        if (backfillRows.length) {
          await prisma.customFieldValue.createMany({ data: backfillRows, skipDuplicates: true })
        }
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
    const linkedProfileIds = search ? await companyIdsWithLinkedProfileMatch(search) : []
    const where = {
      deletedAt: { not: null },
      ...(search && {
        OR: [
          { name:   { contains: search, mode: 'insensitive' } },
          { email:  { contains: search, mode: 'insensitive' } },
          { domain: { contains: search, mode: 'insensitive' } },
          { phone:  { contains: search, mode: 'insensitive' } },
          ...(linkedProfileIds.length ? [{ id: { in: linkedProfileIds } }] : []),
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
    await attachCustomFieldValues('Company', [company])
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
            endPdpUrl, cms, remarks, contactPersons, linkedProfiles, customFields } = req.body
    if (!name) return res.status(400).json({ message: 'Company name is required.' })

    // Validate custom fields BEFORE any write, so a bad value never leaves a
    // half-created record — this is a new, separate write path appended
    // after the existing fixed-field logic below, never merged into it.
    let shapedCustomFields
    try {
      shapedCustomFields = await validateAndShapeCustomFieldInput('Company', customFields)
    } catch (e) {
      if (e instanceof CustomFieldValidationError) return res.status(400).json({ message: 'Invalid custom field value(s).', errors: e.errors })
      throw e
    }

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

    const company = await prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
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
      await writeCustomFieldValues(created.id, shapedCustomFields, tx)
      return created
    })
    await attachCustomFieldValues('Company', [company])
    res.status(201).json(company)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: err.message || 'Server error.' })
  }
})

// ── PATCH /api/companies/:id/pin — toggle Pin/Star (Update 5) ────────────
router.patch('/:id/pin', auth, async (req, res) => {
  try {
    const { id } = req.params
    const existing = await prisma.company.findUnique({ where: { id }, select: { deletedAt: true, isPinned: true } })
    if (!existing || existing.deletedAt) return res.status(404).json({ message: 'Company not found.' })

    const company = await prisma.company.update({
      where: { id },
      data: { isPinned: !existing.isPinned },
      select: { id: true, isPinned: true },
    })
    res.json(company)
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error.' })
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
            endPdpUrl, cms, remarks, contactPersons, linkedProfiles, customFields } = req.body

    // Validate custom fields BEFORE any write — new, separate write path
    // appended after the existing fixed-field logic, never merged into it.
    let shapedCustomFields
    try {
      shapedCustomFields = await validateAndShapeCustomFieldInput('Company', customFields)
    } catch (e) {
      if (e instanceof CustomFieldValidationError) return res.status(400).json({ message: 'Invalid custom field value(s).', errors: e.errors })
      throw e
    }

    // Recompute the multi-value lists + primary only when arrays were sent.
    const emailList = emails !== undefined ? cleanArr(emails, email) : null
    const phoneList = phones !== undefined ? cleanArr(phones, phone) : null
    const contactPersonList = contactPersons !== undefined ? cleanArr(contactPersons) : null
    const linkedProfileList = linkedProfiles !== undefined ? cleanArr(linkedProfiles) : null

    const company = await prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({
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
      await writeCustomFieldValues(id, shapedCustomFields, tx)
      return updated
    })
    await attachCustomFieldValues('Company', [company])

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
