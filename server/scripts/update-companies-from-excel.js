#!/usr/bin/env node
// One-time update script — NOT part of the app, not wired into any route.
//
// Purpose: 262 companies already exist in the live CRM; a separate Excel
// file (the enriched version of a prior "skipped rows" report) has the
// complete/current data for those same companies. This updates EXISTING
// Company records only — matched STRICTLY by Company URL (never by Company
// Name, since names may legitimately differ between the sheet and the CRM).
//
// It NEVER creates a company, NEVER deletes a company, and NEVER touches
// Deals/Tasks/Meetings/Emails/CallLogs/CustomFieldValues. The only writes
// this script performs are:
//   - prisma.company.update(...)   for the matched company's own fields
//   - prisma.activity.create(...)  ONE 'note' Activity per matched row that
//     has non-blank Notes text (explicitly approved — see below)
//
// Matching: Company URL only, normalized the same way the live Create
// Company duplicate pre-check does (server/src/routes/companies.js,
// normalizeDomain) — strips protocol/www/trailing slash, case-insensitive.
//   - Normalized URL matches exactly ONE existing company -> matched
//   - Matches ZERO companies                                -> unmatched, skipped
//   - Matches MORE THAN ONE company (shared/ambiguous domain) -> ambiguous, skipped
//   - Row has no usable URL at all                          -> invalid, skipped
//
// Update behavior: for a matched company, each of the fields below is
// overwritten with the Excel value ONLY IF that Excel cell is non-blank —
// a blank Excel cell always preserves whatever is already in the CRM. This
// is intentionally NOT the "only fill currently-blank fields" backfill rule
// the real bulk importer uses; this Excel is meant to be the authoritative,
// current data for these specific companies.
//
// Fields updated (confirmed against the Company schema + companies.js):
//   name, industry, country, remarks, endPdpUrl, cms,
//   email/emails (multi), phone/phones (multi),
//   contactPersons (multi), linkedProfiles (multi)
// Fields deliberately NEVER touched:
//   domain      — this is the matching key; left exactly as stored
//   leadStatus  — not present in this file
//   ownerId (Lead Owner) — not present in this file
//   Custom Fields — not present in this file
//   Company.notes (legacy unused scalar column) — the real Notes feature is
//     the Activity write described above, not this column
//
// Multi-value cells in THIS file are separated by " / " (space-slash-space),
// e.g. "+14052360076 / +18005224074" — different from the app's own import
// template ("/" for email/phone/contact, "^" for linked profiles). Splitting
// only on a slash that has whitespace on both sides is safe for LinkedIn
// URLs too, since "https://..." never has spaces around its slashes.
//
// Usage:
//   node scripts/update-companies-from-excel.js <path-to-file.xlsx> --userId <id>              (dry run)
//   node scripts/update-companies-from-excel.js <path-to-file.xlsx> --userId <id> --commit      (writes)
//   node scripts/update-companies-from-excel.js <path-to-file.xlsx> --userId <id> --commit --out ./output
//
// --userId must be an existing user id — every imported Notes Activity needs
// an author (Activity.userId is required).
//
// Always run without --commit first, review the printed summary and the
// JSON/CSV report it writes, and only re-run with --commit once that looks right.

const path = require('path')
const fs   = require('fs')

// ── xlsx: reused from the client's already-installed copy, not a new server
// dependency — same approach as scripts/add-notes-from-excel.js.
let XLSX
try {
  XLSX = require(path.join(__dirname, '..', '..', 'client', 'node_modules', 'xlsx'))
} catch (e) {
  console.error(
    '\nCould not load the "xlsx" package from client/node_modules.\n' +
    'This script deliberately reuses the copy client/ already has instead of\n' +
    'adding a new server dependency. If client/node_modules/xlsx is missing\n' +
    'on this machine, either run `npm install` inside client/ first, or\n' +
    'temporarily run `npm install xlsx --no-save` inside server/ (does not\n' +
    'touch package.json) just for this one run.\n'
  )
  process.exit(1)
}

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── CLI args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const filePath = args.find(a => !a.startsWith('--'))
const commit = args.includes('--commit')
const outIdx = args.indexOf('--out')
const outDir = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : path.join(__dirname, 'output')
const userIdIdx = args.indexOf('--userId')
const userId = userIdIdx !== -1 && args[userIdIdx + 1] ? args[userIdIdx + 1] : null

if (!filePath) {
  console.error('Usage: node scripts/update-companies-from-excel.js <path-to-file.xlsx> --userId <id> [--commit] [--out <dir>]')
  process.exit(1)
}
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}
if (!userId) {
  console.error('Missing --userId <id>. Every imported Notes Activity needs an author (Activity.userId is required).')
  console.error('Pass the id of the user these notes should be attributed to.')
  process.exit(1)
}

// ── Header handling — same normalization approach as add-notes-from-excel.js /
// fix-lead-owner.js / ImportModal.jsx's COMPANY_TEMPLATE_HEADER_ALIASES.
function normalizeHeader(h) {
  return String(h || '').replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/gi, '').toLowerCase()
}
// One-time exclusion, confirmed with the user after reviewing the dry run
// against the real 262-row file (2026-08-10): these 2 companies' Excel
// Company Name cell holds a mangled-domain artifact, not a real name
// ("Securetoolsforworkingatheight", "Business"), which would replace a
// better existing name with a worse one. Every OTHER field for these two
// companies still updates normally — only the `name` change is suppressed.
const SKIP_NAME_UPDATE_FOR = new Set([
  'cmsk2ayu501d6lnv26pz68k7y', // Secure Tools for Working at Height
  'cmsk2aywf01f2lnv26lcteds7', // methven.business.site
])

const HEADER_ALIASES = {
  sno:            'sNo',
  companyname:    'name',
  industry:       'industry',
  country:        'country',
  // "Remarks \nStatic / Less data / Partnership" normalizes to this
  remarksstaticlessdatapartnership: 'remarks',
  remarks:        'remarks',
  companyurl:     'domain', website: 'domain', url: 'domain',
  endpdpurl:      'endPdpUrl',
  email:          'email',
  cophoneno:      'phone', phone: 'phone',
  contactperson:  'contactPersons', contactpersons: 'contactPersons',
  linkedprofile:  'linkedProfiles', linkedprofiles: 'linkedProfiles',
  cms:            'cms',
  notes:          'notes', note: 'notes',
}
function readCol(row, targetKey) {
  for (const rawHeader of Object.keys(row)) {
    if (HEADER_ALIASES[normalizeHeader(rawHeader)] === targetKey) {
      return String(row[rawHeader] ?? '').trim()
    }
  }
  return ''
}

// Company URL comparison — same normalization as the live Create Company
// duplicate pre-check (server/src/routes/companies.js, normalizeDomain).
function normalizeDomain(v) {
  if (!v) return ''
  return String(v).trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
}

// Splits on a slash ONLY when it has whitespace on both sides — safe for
// "https://..." (no surrounding whitespace there), matches this file's own
// " / " multi-value convention (confirmed by inspecting real rows: phone
// numbers, contact persons, and LinkedIn URLs all use " / " between entries).
// Also de-dupes case-insensitively, same discipline as companies.js's cleanArr.
function splitMultiValue(v) {
  if (!v) return []
  const seen = new Set()
  const out = []
  for (const raw of String(v).split(/\s+\/\s+/)) {
    const val = raw.trim()
    if (!val) continue
    const k = val.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(val)
  }
  return out
}

function listsEqual(a, b) {
  const na = [...a].map(x => String(x).trim().toLowerCase()).sort()
  const nb = [...b].map(x => String(x).trim().toLowerCase()).sort()
  return na.length === nb.length && na.every((v, i) => v === nb[i])
}

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  console.log(`\nCompany field update from Excel — ${commit ? 'COMMIT (will write changes)' : 'DRY RUN (no changes will be written)'}`)
  console.log(`Source file: ${filePath}`)
  console.log(`Notes will be attributed to userId: ${userId}\n`)

  // ── Parse the file ────────────────────────────────────────────────────
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  if (rows.length === 0) {
    console.error('No data rows found in the file.')
    process.exit(1)
  }
  console.log(`Sheet: ${wb.SheetNames[0]}`)
  console.log(`Parsed ${rows.length} row(s).\n`)

  // ── Pre-fetch, once ──────────────────────────────────────────────────
  const [existingCompanies, author, industryOpts, countryOpts] = await Promise.all([
    prisma.company.findMany({
      where: { deletedAt: null },
      select: {
        id: true, name: true, domain: true, email: true, emails: true,
        phone: true, phones: true, industry: true, country: true,
        endPdpUrl: true, cms: true, remarks: true,
        contactPersons: true, linkedProfiles: true,
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, status: true } }),
    prisma.dropdownOption.findMany({ where: { fieldKey: 'company.industry', enabled: true }, select: { value: true } }),
    prisma.dropdownOption.findMany({ where: { fieldKey: 'company.country', enabled: true }, select: { value: true } }),
  ])
  if (!author) {
    console.error(`No user found with id "${userId}". Aborting — refusing to guess an author for imported notes.`)
    process.exit(1)
  }
  console.log(`Notes will be created by: ${author.name}${author.status !== 'active' ? ` (status: ${author.status})` : ''}\n`)

  // Advisory only (matches BUILT_IN_DROPDOWN_FIELDS in dropdownFields.js) —
  // Industry/Country are not DB-enforced, so an unrecognized value is still
  // written, just flagged in the report for a human to review.
  const industrySet = new Set(industryOpts.map(o => o.value.toLowerCase()))
  const countrySet  = new Set(countryOpts.map(o => o.value.toLowerCase()))

  // byDomain maps to ARRAYS (not first-hit-wins) so a domain shared by more
  // than one company is visible as ambiguous, not silently resolved to
  // whichever company happened to be indexed last.
  const byDomain = new Map()
  for (const co of existingCompanies) {
    const key = normalizeDomain(co.domain)
    if (!key) continue
    if (!byDomain.has(key)) byDomain.set(key, [])
    byDomain.get(key).push(co)
  }

  const toUpdate            = [] // { rowIndex, sNo, companyId, companyName, excelUrl, changes }
  const noChange             = [] // matched, every non-blank Excel field already agrees
  const unmatched            = [] // URL didn't resolve to any existing company
  const ambiguous            = [] // URL resolved to MORE THAN ONE company
  const invalidUrl           = [] // row has no usable URL at all
  const dropdownAdvisories   = [] // { rowIndex, field, value } — not a known dropdown option, written anyway
  const notesToCreate        = [] // { rowIndex, sNo, companyId, companyName, notes }

  rows.forEach((row, i) => {
    const rowIndex = i + 2 // 1-based + header row skipped, matches what a user sees in Excel
    const sNo = readCol(row, 'sNo')
    const urlRaw = readCol(row, 'domain')
    const domainKey = normalizeDomain(urlRaw)

    if (!domainKey) { invalidUrl.push({ rowIndex, sNo, url: urlRaw }); return }

    const candidates = byDomain.get(domainKey) || []
    if (candidates.length === 0) { unmatched.push({ rowIndex, sNo, url: urlRaw }); return }
    if (candidates.length > 1) {
      ambiguous.push({ rowIndex, sNo, url: urlRaw, candidates: candidates.map(c => ({ id: c.id, name: c.name })) })
      return
    }
    const company = candidates[0]

    const nameVal       = readCol(row, 'name')
    const industryVal    = readCol(row, 'industry')
    const countryVal     = readCol(row, 'country')
    const remarksVal     = readCol(row, 'remarks')
    const endPdpUrlVal   = readCol(row, 'endPdpUrl')
    const cmsVal         = readCol(row, 'cms')
    const emailListVal   = splitMultiValue(readCol(row, 'email'))
    const phoneListVal   = splitMultiValue(readCol(row, 'phone'))
    const contactListVal = splitMultiValue(readCol(row, 'contactPersons'))
    const linkedListVal  = splitMultiValue(readCol(row, 'linkedProfiles'))
    const notesVal       = readCol(row, 'notes')

    const changes = {}
    const setScalarIfChanged = (field, excelVal) => {
      if (!excelVal) return // blank Excel cell -> preserve existing value, untouched
      const current = company[field] || ''
      if (String(current).trim() !== excelVal) changes[field] = { from: current || null, to: excelVal }
    }
    if (!SKIP_NAME_UPDATE_FOR.has(company.id)) setScalarIfChanged('name', nameVal)
    setScalarIfChanged('industry', industryVal)
    setScalarIfChanged('country', countryVal)
    setScalarIfChanged('remarks', remarksVal)
    setScalarIfChanged('endPdpUrl', endPdpUrlVal)
    setScalarIfChanged('cms', cmsVal)

    if (industryVal && !industrySet.has(industryVal.toLowerCase())) dropdownAdvisories.push({ rowIndex, field: 'industry', value: industryVal })
    if (countryVal && !countrySet.has(countryVal.toLowerCase())) dropdownAdvisories.push({ rowIndex, field: 'country', value: countryVal })

    const currentEmails = (company.emails && company.emails.length) ? company.emails : (company.email ? [company.email] : [])
    if (emailListVal.length && !listsEqual(emailListVal, currentEmails)) changes.email = { from: currentEmails, to: emailListVal }

    const currentPhones = (company.phones && company.phones.length) ? company.phones : (company.phone ? [company.phone] : [])
    if (phoneListVal.length && !listsEqual(phoneListVal, currentPhones)) changes.phone = { from: currentPhones, to: phoneListVal }

    const currentContacts = company.contactPersons || []
    if (contactListVal.length && !listsEqual(contactListVal, currentContacts)) changes.contactPersons = { from: currentContacts, to: contactListVal }

    const currentLinked = company.linkedProfiles || []
    if (linkedListVal.length && !listsEqual(linkedListVal, currentLinked)) changes.linkedProfiles = { from: currentLinked, to: linkedListVal }

    const entry = { rowIndex, sNo, companyId: company.id, companyName: company.name, excelUrl: urlRaw, changes }
    if (Object.keys(changes).length) toUpdate.push(entry)
    else noChange.push(entry)

    // Notes Activity — explicitly approved to run for every matched row with
    // non-blank Notes text, independent of whether any Company field changed.
    if (notesVal) notesToCreate.push({ rowIndex, sNo, companyId: company.id, companyName: company.name, notes: notesVal })
  })

  // Visibility only — more than one Excel row landed on the same company.
  const rowsPerCompany = new Map()
  for (const u of toUpdate) rowsPerCompany.set(u.companyId, (rowsPerCompany.get(u.companyId) || 0) + 1)
  const companiesWithMultipleRows = [...rowsPerCompany.entries()]
    .filter(([, count]) => count > 1)
    .map(([companyId, count]) => ({ companyId, companyName: toUpdate.find(u => u.companyId === companyId).companyName, rowCount: count }))

  // ── Apply (only in --commit mode) ───────────────────────────────────────
  const updateErrors = []
  const noteErrors = []
  if (commit) {
    if (toUpdate.length) {
      console.log(`Updating ${toUpdate.length} compan${toUpdate.length === 1 ? 'y' : 'ies'}...`)
      let written = 0
      for (const u of toUpdate) {
        try {
          const data = {}
          if (u.changes.name)           data.name = u.changes.name.to
          if (u.changes.industry)       data.industry = u.changes.industry.to
          if (u.changes.country)        data.country = u.changes.country.to
          if (u.changes.remarks)        data.remarks = u.changes.remarks.to
          if (u.changes.endPdpUrl)      data.endPdpUrl = u.changes.endPdpUrl.to
          if (u.changes.cms)            data.cms = u.changes.cms.to
          if (u.changes.email)          { data.email = u.changes.email.to[0].toLowerCase(); data.emails = u.changes.email.to }
          if (u.changes.phone)          { data.phone = u.changes.phone.to[0]; data.phones = u.changes.phone.to }
          if (u.changes.contactPersons) data.contactPersons = u.changes.contactPersons.to
          if (u.changes.linkedProfiles) data.linkedProfiles = u.changes.linkedProfiles.to
          await prisma.company.update({ where: { id: u.companyId }, data })
          written++
        } catch (e) {
          updateErrors.push({ rowIndex: u.rowIndex, companyId: u.companyId, companyName: u.companyName, error: e.message })
        }
      }
      console.log(`Updated ${written}/${toUpdate.length} compan${toUpdate.length === 1 ? 'y' : 'ies'}.${updateErrors.length ? ` ${updateErrors.length} FAILED — see report.` : ''}`)
    }
    if (notesToCreate.length) {
      console.log(`Writing ${notesToCreate.length} note(s)...`)
      let notesWritten = 0
      for (const n of notesToCreate) {
        try {
          await prisma.activity.create({
            data: { type: 'note', companyId: n.companyId, userId: author.id, title: 'Imported Note', body: n.notes },
          })
          notesWritten++
        } catch (e) {
          noteErrors.push({ rowIndex: n.rowIndex, companyId: n.companyId, companyName: n.companyName, error: e.message })
        }
      }
      console.log(`Wrote ${notesWritten}/${notesToCreate.length} note(s).${noteErrors.length ? ` ${noteErrors.length} FAILED — see report.` : ''}`)
    }
    console.log('')
  }

  // ── Report ───────────────────────────────────────────────────────────
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const base = `update-companies-${commit ? 'commit' : 'dryrun'}-${stamp}`
  const jsonPath = path.join(outDir, `${base}.json`)
  const csvPath = path.join(outDir, `${base}.csv`)

  fs.writeFileSync(jsonPath, JSON.stringify({
    runAt: new Date().toISOString(),
    mode: commit ? 'commit' : 'dry-run',
    sourceFile: filePath,
    authorUserId: author.id,
    authorUserName: author.name,
    summary: {
      totalRows: rows.length,
      toUpdate: toUpdate.length,
      noChange: noChange.length,
      unmatched: unmatched.length,
      ambiguous: ambiguous.length,
      invalidUrl: invalidUrl.length,
      companiesWithMultipleRows: companiesWithMultipleRows.length,
      notesToCreate: notesToCreate.length,
      dropdownAdvisories: dropdownAdvisories.length,
    },
    toUpdate,
    noChange,
    updateErrors,
    notesToCreate,
    noteErrors,
    companiesWithMultipleRows,
    unmatched,
    ambiguous,
    invalidUrl,
    dropdownAdvisories,
  }, null, 2))

  const csvLines = ['Excel Row,S No,Excel URL,Company ID,Company Name,Fields Changed,Change Detail']
  for (const u of toUpdate) {
    const fields = Object.keys(u.changes)
    const detail = fields.map(f => `${f}: "${JSON.stringify(u.changes[f].from)}" -> "${JSON.stringify(u.changes[f].to)}"`).join(' | ')
    csvLines.push([u.rowIndex, u.sNo, u.excelUrl, u.companyId, u.companyName, fields.join(';'), detail].map(csvEscape).join(','))
  }
  fs.writeFileSync(csvPath, csvLines.join('\n'))

  console.log('── Summary ──────────────────────────────────────────')
  console.log(`Total rows parsed:                      ${rows.length}`)
  console.log(`${commit ? 'Companies updated' : 'Companies that WOULD be updated'}:        ${toUpdate.length}`)
  console.log(`Matched, already up to date (no change): ${noChange.length}`)
  console.log(`Unmatched (URL not found in CRM):        ${unmatched.length}`)
  console.log(`AMBIGUOUS (URL shared by >1 company, SKIPPED): ${ambiguous.length}`)
  console.log(`Invalid/blank URL (SKIPPED):             ${invalidUrl.length}`)
  console.log(`Companies matched by >1 Excel row:       ${companiesWithMultipleRows.length}`)
  console.log(`${commit ? 'Notes written' : 'Notes that WOULD be written'}:              ${notesToCreate.length}`)
  console.log(`Advisory: values not in known dropdown list: ${dropdownAdvisories.length}`)
  if (updateErrors.length) console.log(`Company update FAILURES: ${updateErrors.length}`)
  if (noteErrors.length) console.log(`Note write FAILURES: ${noteErrors.length}`)

  if (ambiguous.length) {
    console.log('\n── Ambiguous URLs (need a manual decision, nothing was changed for these) ──')
    ambiguous.slice(0, 20).forEach(a => {
      console.log(`  row ${a.rowIndex}: URL "${a.url}" -> ${a.candidates.length} companies: ${a.candidates.map(c => `${c.name} (${c.id})`).join(', ')}`)
    })
    if (ambiguous.length > 20) console.log(`  ...and ${ambiguous.length - 20} more — see the full report file.`)
  }
  if (dropdownAdvisories.length) {
    console.log('\n── Dropdown advisories (written anyway — not a known option in Settings) ──')
    dropdownAdvisories.slice(0, 20).forEach(d => {
      console.log(`  row ${d.rowIndex}: ${d.field} = "${d.value}"`)
    })
    if (dropdownAdvisories.length > 20) console.log(`  ...and ${dropdownAdvisories.length - 20} more — see the full report file.`)
  }

  console.log(`\nFull detail written to: ${jsonPath}`)
  console.log(`Change list (CSV) written to: ${csvPath}`)
  if (!commit) {
    console.log('\nThis was a DRY RUN — nothing was written. Review the report above,')
    console.log('then re-run with --commit to actually update companies and write notes.')
  }
}

main()
  .catch(err => { console.error('\nFatal error:', err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
