#!/usr/bin/env node
// One-time import script — NOT part of the app, not wired into any route.
//
// Purpose: ~600 companies already exist in the live CRM; a separate Excel
// file has Company Name / Company URL / Notes for a subset of them. This
// adds each row's Notes text as a new Activity (type 'note') on the
// EXISTING matching company — the same Activity-based Notes feature the UI
// already shows on Company Detail (see NoteModal.jsx / ActivityFeed.jsx),
// not the unused legacy Company.notes scalar column. It NEVER creates a
// company, NEVER updates any Company field (name/email/phone/domain/owner/
// etc.), and never touches Tasks/Meetings/Deals/Emails or any other
// Activity. The only write this script ever performs is
// prisma.activity.create({ type: 'note', ... }).
//
// Matching (deliberately stricter than the real import's buildDupLookup):
// each row is matched by Company Name AND Company URL independently, then
// the two signals must agree before anything is written:
//   - Both point to the same one company                  -> matched (both)
//   - Only Name resolves to exactly one company (URL blank
//     or not found in the DB)                              -> matched (name-only)
//   - Only URL resolves to exactly one company (name spelled
//     differently in the sheet)                             -> matched (domain-only)
//   - Name and URL each resolve, but to DIFFERENT companies -> conflict, skipped
//   - Name (or URL) alone is ambiguous — more than one company
//     shares that exact name/domain — and the other signal
//     doesn't disambiguate it                                -> ambiguous, skipped
//   - Neither resolves                                       -> unmatched, skipped
// Every non-"matched (both)" row is called out explicitly in the report so
// it can be reviewed before trusting --commit, given a known prior finding
// in this database that some companies share a generic/placeholder name.
//
// Usage:
//   node scripts/add-notes-from-excel.js <path-to-file.xlsx> --userId <id>              (dry run)
//   node scripts/add-notes-from-excel.js <path-to-file.xlsx> --userId <id> --commit      (writes)
//   node scripts/add-notes-from-excel.js <path-to-file.xlsx> --userId <id> --commit --out ./output
//
// --userId must be an existing user id — every note needs an author
// (Activity.userId is required), so this is never guessed/defaulted.
//
// Always run without --commit first, review the printed summary and the
// JSON report it writes, and only re-run with --commit once that looks right.

const path = require('path')
const fs   = require('fs')

// ── xlsx: reused from the client's already-installed copy, not a new server
// dependency — same approach as scripts/fix-lead-owner.js.
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
// Some source files have no header row at all — column A/B/C are Company
// Name/URL/Notes directly, with row 1 already real data (confirmed by
// inspecting the actual file before running this). Passing --no-header
// reads by fixed column position instead of matching header text, and
// treats every row (including the first) as data — nothing is skipped as
// a header. Default (no flag) behavior — matching header text via
// HEADER_ALIASES, skipping row 1 as the header — is unchanged.
const noHeader = args.includes('--no-header')

if (!filePath) {
  console.error('Usage: node scripts/add-notes-from-excel.js <path-to-file.xlsx> --userId <id> [--commit] [--out <dir>] [--no-header]')
  process.exit(1)
}
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}
if (!userId) {
  console.error('Missing --userId <id>. Every imported note needs an author (Activity.userId is required).')
  console.error('Pass the id of the user these notes should be attributed to.')
  process.exit(1)
}

// ── Header handling — same normalization approach as fix-lead-owner.js /
// ImportModal.jsx's COMPANY_TEMPLATE_HEADER_ALIASES.
function normalizeHeader(h) {
  return String(h || '').replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/gi, '').toLowerCase()
}
const HEADER_ALIASES = {
  companyname: 'name',
  companyurl:  'domain', website: 'domain', url: 'domain',
  notes:       'notes', note: 'notes',
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
// duplicate pre-check (server/src/routes/companies.js, normalizeDomain) so
// a pasted "https://www.example.com/" matches a stored "example.com".
function normalizeDomain(v) {
  if (!v) return ''
  return String(v).trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
}

async function main() {
  console.log(`\nNotes import — ${commit ? 'COMMIT (will write changes)' : 'DRY RUN (no changes will be written)'}`)
  console.log(`Source file: ${filePath}`)
  console.log(`Notes will be attributed to userId: ${userId}\n`)

  // ── Parse the file ────────────────────────────────────────────────────
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = noHeader
    ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    : XLSX.utils.sheet_to_json(ws, { defval: '' })
  if (rows.length === 0) {
    console.error('No data rows found in the file.')
    process.exit(1)
  }
  console.log(`Mode: ${noHeader ? 'no-header (positional: column A=name, B=URL, C=notes)' : 'header-matched'}`)
  console.log(`Parsed ${rows.length} row(s).\n`)

  // Field getter — abstracts the header-matched vs. positional cases behind
  // one interface so the matching logic below never needs to branch on mode.
  const getField = noHeader
    ? { name: r => String(r[0] ?? '').trim(), domain: r => String(r[1] ?? '').trim(), notes: r => String(r[2] ?? '').trim() }
    : { name: r => readCol(r, 'name'), domain: r => readCol(r, 'domain'), notes: r => readCol(r, 'notes') }

  // ── Pre-fetch, once ──────────────────────────────────────────────────
  const [existingCompanies, author] = await Promise.all([
    prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, domain: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, status: true } }),
  ])
  if (!author) {
    console.error(`No user found with id "${userId}". Aborting — refusing to guess an author for these notes.`)
    process.exit(1)
  }
  console.log(`Notes will be created by: ${author.name}${author.status !== 'active' ? ` (status: ${author.status})` : ''}\n`)

  // byName/byDomain map to ARRAYS (not first-hit-wins) so a name or domain
  // shared by more than one company is visible as ambiguous, not silently
  // resolved to whichever company happened to be indexed last.
  const byName = new Map(), byDomain = new Map()
  for (const co of existingCompanies) {
    const nameKey = co.name.toLowerCase()
    if (!byName.has(nameKey)) byName.set(nameKey, [])
    byName.get(nameKey).push(co)
    const domainKey = normalizeDomain(co.domain)
    if (domainKey) {
      if (!byDomain.has(domainKey)) byDomain.set(domainKey, [])
      byDomain.get(domainKey).push(co)
    }
  }

  const toCreate          = [] // { rowIndex, companyId, companyName, matchedBy, notes }
  const invalidRows       = [] // no name and no domain at all
  const blankNotes        = [] // matched fine, but Notes cell was empty — nothing to add
  const unmatched         = [] // neither name nor domain resolved to any company
  const ambiguous         = [] // name and/or domain resolved to MORE THAN ONE company, unresolved
  const conflicts         = [] // name resolves to one company, domain to a DIFFERENT company

  rows.forEach((row, i) => {
    // +2 in header-matched mode (1-based + header row skipped); +1 in
    // no-header mode (1-based only, row 0 IS the first real data row) —
    // both match the row number a user would see in Excel.
    const rowIndex = i + (noHeader ? 1 : 2)
    const name = getField.name(row)
    const domainRaw = getField.domain(row)
    const domainKey = normalizeDomain(domainRaw)
    const notes = getField.notes(row)

    if (!name && !domainKey) { invalidRows.push({ rowIndex, name, domain: domainRaw }); return }

    const nameCandidates   = name      ? (byName.get(name.toLowerCase()) || []) : []
    const domainCandidates = domainKey ? (byDomain.get(domainKey) || [])        : []

    let match = null
    let matchedBy = null

    if (nameCandidates.length === 1 && domainCandidates.length === 1) {
      if (nameCandidates[0].id === domainCandidates[0].id) {
        match = nameCandidates[0]; matchedBy = 'name+domain'
      } else {
        conflicts.push({
          rowIndex, name, domain: domainRaw,
          nameMatch: { id: nameCandidates[0].id, name: nameCandidates[0].name },
          domainMatch: { id: domainCandidates[0].id, name: domainCandidates[0].name },
        })
        return
      }
    } else if (nameCandidates.length === 1 && domainCandidates.length === 0) {
      match = nameCandidates[0]; matchedBy = domainKey ? 'name-only (URL not found in DB)' : 'name-only (no URL in row)'
    } else if (domainCandidates.length === 1 && nameCandidates.length === 0) {
      match = domainCandidates[0]; matchedBy = 'domain-only (name not found in DB)'
    } else if (nameCandidates.length === 0 && domainCandidates.length === 0) {
      unmatched.push({ rowIndex, name, domain: domainRaw })
      return
    } else {
      // nameCandidates.length > 1, or domainCandidates.length > 1, and the
      // other signal didn't narrow it to exactly one shared company.
      ambiguous.push({
        rowIndex, name, domain: domainRaw,
        nameCandidates: nameCandidates.map(c => ({ id: c.id, name: c.name })),
        domainCandidates: domainCandidates.map(c => ({ id: c.id, name: c.name })),
      })
      return
    }

    if (!notes) { blankNotes.push({ rowIndex, companyId: match.id, companyName: match.name, matchedBy }); return }

    toCreate.push({ rowIndex, companyId: match.id, companyName: match.name, matchedBy, notes })
  })

  // Visibility only — more than one Excel row landed on the same company.
  // Each still becomes its own separate note (no dedup), same as the real
  // bulk-import route's existing Notes behavior; just surfaced so it's not
  // a silent surprise if it wasn't intended.
  const rowsPerCompany = new Map()
  for (const u of toCreate) rowsPerCompany.set(u.companyId, (rowsPerCompany.get(u.companyId) || 0) + 1)
  const companiesWithMultipleRows = [...rowsPerCompany.entries()]
    .filter(([, count]) => count > 1)
    .map(([companyId, count]) => ({ companyId, companyName: toCreate.find(u => u.companyId === companyId).companyName, rowCount: count }))

  // ── Apply (only in --commit mode) ───────────────────────────────────────
  if (commit && toCreate.length) {
    console.log(`Writing ${toCreate.length} note(s)...`)
    let written = 0
    const writeErrors = []
    for (const u of toCreate) {
      try {
        await prisma.activity.create({
          data: { type: 'note', companyId: u.companyId, userId: author.id, title: 'Imported Note', body: u.notes },
        })
        written++
      } catch (e) {
        writeErrors.push({ rowIndex: u.rowIndex, companyId: u.companyId, companyName: u.companyName, error: e.message })
      }
    }
    console.log(`Wrote ${written}/${toCreate.length} note(s).${writeErrors.length ? ` ${writeErrors.length} FAILED — see report.` : ''}\n`)
    if (writeErrors.length) toCreate.writeErrors = writeErrors
  }

  // ── Report ───────────────────────────────────────────────────────────
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(outDir, `add-notes-${commit ? 'commit' : 'dryrun'}-${stamp}.json`)
  fs.writeFileSync(reportPath, JSON.stringify({
    runAt: new Date().toISOString(),
    mode: commit ? 'commit' : 'dry-run',
    sourceFile: filePath,
    authorUserId: author.id,
    authorUserName: author.name,
    summary: {
      totalRows: rows.length,
      toCreate: toCreate.length,
      matchedByBoth: toCreate.filter(u => u.matchedBy === 'name+domain').length,
      matchedByNameOnly: toCreate.filter(u => u.matchedBy.startsWith('name-only')).length,
      matchedByDomainOnly: toCreate.filter(u => u.matchedBy.startsWith('domain-only')).length,
      companiesWithMultipleRows: companiesWithMultipleRows.length,
      blankNotes: blankNotes.length,
      unmatched: unmatched.length,
      ambiguous: ambiguous.length,
      conflicts: conflicts.length,
      invalidRows: invalidRows.length,
    },
    toCreate,
    writeErrors: toCreate.writeErrors || [],
    companiesWithMultipleRows,
    blankNotes,
    unmatched,
    ambiguous,
    conflicts,
    invalidRows,
  }, null, 2))

  console.log('── Summary ──────────────────────────────────────────')
  console.log(`Total rows parsed:                    ${rows.length}`)
  console.log(`${commit ? 'Notes written' : 'Notes that WOULD be written'}:              ${toCreate.length}`)
  console.log(`  matched by name + URL agreeing:      ${toCreate.filter(u => u.matchedBy === 'name+domain').length}`)
  console.log(`  matched by name only:                ${toCreate.filter(u => u.matchedBy.startsWith('name-only')).length}`)
  console.log(`  matched by URL only:                 ${toCreate.filter(u => u.matchedBy.startsWith('domain-only')).length}`)
  console.log(`  companies receiving >1 note:          ${companiesWithMultipleRows.length}`)
  console.log(`Matched but Notes cell was blank:       ${blankNotes.length}`)
  console.log(`Unmatched (no company found at all):    ${unmatched.length}`)
  console.log(`AMBIGUOUS (name/URL shared by >1 company, unresolved — SKIPPED): ${ambiguous.length}`)
  console.log(`CONFLICT (name and URL point to different companies — SKIPPED):  ${conflicts.length}`)
  console.log(`Invalid rows (no name and no URL):      ${invalidRows.length}`)

  if (conflicts.length) {
    console.log('\n── Conflicts (need a manual decision, nothing was changed for these) ──')
    conflicts.slice(0, 20).forEach(c => {
      console.log(`  row ${c.rowIndex}: name "${c.name}" -> ${c.nameMatch.name} (${c.nameMatch.id}), URL "${c.domain}" -> ${c.domainMatch.name} (${c.domainMatch.id})`)
    })
    if (conflicts.length > 20) console.log(`  ...and ${conflicts.length - 20} more — see the full report file.`)
  }
  if (ambiguous.length) {
    console.log('\n── Ambiguous rows (need a manual decision, nothing was changed for these) ──')
    ambiguous.slice(0, 20).forEach(a => {
      console.log(`  row ${a.rowIndex}: name "${a.name}" (${a.nameCandidates.length} DB match(es)), URL "${a.domain}" (${a.domainCandidates.length} DB match(es))`)
    })
    if (ambiguous.length > 20) console.log(`  ...and ${ambiguous.length - 20} more — see the full report file.`)
  }

  console.log(`\nFull detail written to: ${reportPath}`)
  if (!commit) {
    console.log('\nThis was a DRY RUN — nothing was written. Review the report above,')
    console.log('then re-run with --commit to actually create the notes.')
  }
}

main()
  .catch(err => { console.error('\nFatal error:', err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
