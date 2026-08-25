#!/usr/bin/env node
// One-time correction script — NOT part of the app, not wired into any route.
//
// Purpose: the live server has 14,000+ companies whose ownerId was set wrong
// by an old import bug (everything defaulted to the importing user). The
// import route itself is backfill-only (server/src/routes/companies.js,
// POST /bulk) so a normal re-import can never fix an already-set ownerId —
// and re-importing risks duplicate Notes/Tasks (that route creates a new
// Activity for every row with a Notes/Task value, with no dedupe). This
// script updates ONLY the ownerId column, driven by the same Excel file's
// Lead Owner column, using the exact same company-matching logic as the real
// import (see buildDupLookup in companies.js) — and touches nothing else:
// no other Company field, no Notes/Tasks/Meetings/Deals/Emails/Activities.
//
// Usage:
//   node scripts/fix-lead-owner.js <path-to-file.xlsx>              (dry run — report only)
//   node scripts/fix-lead-owner.js <path-to-file.xlsx> --commit     (actually writes)
//   node scripts/fix-lead-owner.js <path-to-file.xlsx> --commit --out ./output
//
// Always run without --commit first, review the printed summary and the
// JSON report it writes, and only re-run with --commit once that looks right.

const path = require('path')
const fs   = require('fs')

// ── xlsx: reused from the client's already-installed copy, not a new server
// dependency (client/ already ships it for the browser-side import flow —
// see client/src/utils/exportUtils.js's parseRawFile). SheetJS's readFile
// auto-detects format from content, so this handles .xlsx/.xls/.csv alike.
let XLSX
try {
  XLSX = require(path.join(__dirname, '..', '..', 'client', 'node_modules', 'xlsx'))
} catch (e) {
  console.error(
    '\nCould not load the "xlsx" package from client/node_modules.\n' +
    'This script deliberately reuses the copy client/ already has (see\n' +
    'client/src/utils/exportUtils.js) instead of adding a new server dependency.\n' +
    'If client/node_modules/xlsx is missing on this machine, either run\n' +
    '`npm install` inside client/ first, or temporarily run\n' +
    '`npm install xlsx --no-save` inside server/ (does not touch package.json)\n' +
    'just for this one run.\n'
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

if (!filePath) {
  console.error('Usage: node scripts/fix-lead-owner.js <path-to-file.xlsx> [--commit] [--out <dir>]')
  process.exit(1)
}
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

// ── Header handling — same normalization + alias set as
// client/src/components/modals/ImportModal.jsx's COMPANY_TEMPLATE_HEADER_ALIASES,
// trimmed to just the columns this script actually reads. Only kept the
// entries relevant to company matching + Lead Owner.
function normalizeHeader(h) {
  return String(h || '').replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/gi, '').toLowerCase()
}
const HEADER_ALIASES = {
  companyname: 'name',
  email:       'email',
  cophoneno:   'phone', phonenumber: 'phone', phone: 'phone',
  companyurl:  'domain', website: 'domain',
  leadowner:   'leadOwner',
}
function readCol(row, targetKey) {
  for (const rawHeader of Object.keys(row)) {
    if (HEADER_ALIASES[normalizeHeader(rawHeader)] === targetKey) {
      return String(row[rawHeader] ?? '').trim()
    }
  }
  return ''
}

// ── Company matching — byte-for-byte the same as buildDupLookup/find() in
// server/src/routes/companies.js: name (case-insensitive) > email
// (case-insensitive) > phone > domain, first hit wins. Domain is
// intentionally NOT lowercased here — the real import doesn't either, so
// matching this exactly (not a "corrected" version of it) is what "same
// matching logic as the import process" means.
function buildDupLookup(existingCompanies) {
  const byName = new Map(), byEmail = new Map(), byPhone = new Map(), byDomain = new Map()
  for (const co of existingCompanies) {
    byName.set(co.name.toLowerCase(), co)
    if (co.email)  byEmail.set(co.email.toLowerCase(), co)
    if (co.phone)  byPhone.set(co.phone, co)
    if (co.domain) byDomain.set(co.domain, co)
  }
  return {
    find(name, email, phone, domain) {
      return byName.get(String(name).trim().toLowerCase())
        || (email  && byEmail.get(String(email).toLowerCase().trim()))
        || (phone  && byPhone.get(String(phone).trim()))
        || (domain && byDomain.get(String(domain).trim()))
        || null
    },
  }
}

const normalizeOwnerName = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ')

// Runs several company.update calls concurrently instead of one-by-one for
// 14k+ rows, capped so it doesn't hammer the DB — same discipline as the
// email sync's CONCURRENCY pattern elsewhere in this codebase.
async function runWithConcurrency(items, limit, worker) {
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++]
        await worker(item)
      }
    })
  )
}

async function main() {
  console.log(`\nLead Owner correction — ${commit ? 'COMMIT (will write changes)' : 'DRY RUN (no changes will be written)'}`)
  console.log(`Source file: ${filePath}\n`)

  // ── Parse the file ────────────────────────────────────────────────────
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  if (rows.length === 0) {
    console.error('No data rows found in the file.')
    process.exit(1)
  }
  console.log(`Parsed ${rows.length} row(s).\n`)

  // ── Pre-fetch, once — same "one bulk query, no per-row round trip"
  // discipline as the real import route.
  const [existingCompanies, users] = await Promise.all([
    prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, email: true, phone: true, domain: true, ownerId: true },
    }),
    prisma.user.findMany({ select: { id: true, name: true, status: true } }),
  ])
  const dupLookup = buildDupLookup(existingCompanies)
  const activeUserIdByName = new Map(
    users.filter(u => u.status === 'active').map(u => [normalizeOwnerName(u.name), u.id])
  )
  const userNameById = new Map(users.map(u => [u.id, u.name]))
  const deactivatedNameSet = new Set(
    users.filter(u => u.status !== 'active').map(u => normalizeOwnerName(u.name))
  )

  const toUpdate          = [] // { id, companyName, oldOwnerId, newOwnerId, leadOwnerText }
  const skipped           = [] // already correct — no-op
  const unmatchedUsers    = [] // Lead Owner text didn't resolve to any active user
  const unmatchedCompanies = [] // row didn't match any existing company
  const blankLeadOwner    = [] // Lead Owner cell was empty — never inferred as Unassigned
  const invalidRows       = [] // row had no company name at all

  for (const row of rows) {
    const name  = readCol(row, 'name')
    if (!name) { invalidRows.push({ row }); continue }

    const emailRaw = readCol(row, 'email')
    const phoneRaw = readCol(row, 'phone')
    const domain   = readCol(row, 'domain')
    // Multi-value cells use "/" as a separator in the template (e.g. two
    // emails in one cell) — matching only needs the first, same as the
    // real import's emailList[0]/phoneList[0].
    const email = emailRaw ? emailRaw.split('/')[0].trim() : ''
    const phone = phoneRaw ? phoneRaw.split('/')[0].trim() : ''

    const existing = dupLookup.find(name, email, phone, domain)
    if (!existing) { unmatchedCompanies.push({ name, email, phone, domain }); continue }

    const leadOwnerText = readCol(row, 'leadOwner')
    if (!leadOwnerText) {
      blankLeadOwner.push({ id: existing.id, companyName: existing.name })
      continue
    }

    const normalized = normalizeOwnerName(leadOwnerText)
    let newOwnerId
    if (normalized === 'unassigned') {
      newOwnerId = null
    } else {
      const matchedId = activeUserIdByName.get(normalized)
      if (matchedId === undefined) {
        unmatchedUsers.push({
          id: existing.id,
          companyName: existing.name,
          leadOwnerText,
          note: deactivatedNameSet.has(normalized) ? 'matches a DEACTIVATED user' : 'no matching user',
        })
        continue
      }
      newOwnerId = matchedId
    }

    if (existing.ownerId === newOwnerId) {
      skipped.push({ id: existing.id, companyName: existing.name, ownerId: existing.ownerId })
      continue
    }

    toUpdate.push({
      id: existing.id,
      companyName: existing.name,
      oldOwnerId: existing.ownerId,
      oldOwnerName: existing.ownerId ? (userNameById.get(existing.ownerId) || existing.ownerId) : 'Unassigned',
      newOwnerId,
      newOwnerName: newOwnerId ? (userNameById.get(newOwnerId) || newOwnerId) : 'Unassigned',
      leadOwnerText,
    })
  }

  // ── Apply (only in --commit mode) ───────────────────────────────────────
  if (commit && toUpdate.length) {
    console.log(`Writing ${toUpdate.length} ownerId update(s)...`)
    let written = 0, writeErrors = []
    await runWithConcurrency(toUpdate, 10, async (u) => {
      try {
        await prisma.company.update({ where: { id: u.id }, data: { ownerId: u.newOwnerId } })
        written++
      } catch (e) {
        writeErrors.push({ id: u.id, companyName: u.companyName, error: e.message })
      }
    })
    console.log(`Wrote ${written}/${toUpdate.length} update(s).${writeErrors.length ? ` ${writeErrors.length} FAILED — see report.` : ''}\n`)
    if (writeErrors.length) toUpdate.writeErrors = writeErrors // attached for the report below
  }

  // ── Report ───────────────────────────────────────────────────────────
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.join(outDir, `lead-owner-fix-${commit ? 'commit' : 'dryrun'}-${stamp}.json`)
  fs.writeFileSync(reportPath, JSON.stringify({
    runAt: new Date().toISOString(),
    mode: commit ? 'commit' : 'dry-run',
    sourceFile: filePath,
    summary: {
      totalRows: rows.length,
      updated: toUpdate.length,
      skipped: skipped.length,
      unmatchedUsers: unmatchedUsers.length,
      unmatchedCompanies: unmatchedCompanies.length,
      blankLeadOwner: blankLeadOwner.length,
      invalidRows: invalidRows.length,
    },
    updated: toUpdate,
    writeErrors: toUpdate.writeErrors || [],
    skipped,
    unmatchedUsers,
    unmatchedCompanies,
    blankLeadOwner,
    invalidRows,
  }, null, 2))

  console.log('── Summary ──────────────────────────────────────────')
  console.log(`Total rows parsed:      ${rows.length}`)
  console.log(`${commit ? 'Updated' : 'Would update'}:          ${toUpdate.length}`)
  console.log(`Already correct/skip:   ${skipped.length}`)
  console.log(`Unmatched users:        ${unmatchedUsers.length}`)
  console.log(`Unmatched companies:    ${unmatchedCompanies.length}`)
  console.log(`Blank Lead Owner:       ${blankLeadOwner.length}`)
  console.log(`Invalid rows (no name): ${invalidRows.length}`)
  console.log(`\nFull detail written to: ${reportPath}`)
  if (!commit) {
    console.log('\nThis was a DRY RUN — nothing was written. Review the report above,')
    console.log('then re-run with --commit to actually apply the ownerId updates.')
  }
}

main()
  .catch(err => { console.error('\nFatal error:', err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
