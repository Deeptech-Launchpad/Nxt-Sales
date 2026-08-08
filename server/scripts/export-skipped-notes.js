#!/usr/bin/env node
// One-time REPORT-ONLY script — NOT part of the app, not wired into any
// route. Companion to add-notes-from-excel.js: after that script's
// --commit run, this re-derives exactly which rows it skipped (unmatched
// or conflict) and writes them to a readable .xlsx so they can be reviewed
// and added manually. This script NEVER writes to the database — it only
// ever calls prisma.company.findMany (a read) to redo the same matching
// decision, and writes a spreadsheet file to disk. No Company, Activity,
// or any other table is created/updated/deleted by this script.
//
// Uses the exact same matching logic as add-notes-from-excel.js (byName/
// byDomain maps, normalizeDomain, name+domain-must-agree rule) so the rows
// this reports as skipped are guaranteed to be the same set that import
// actually skipped — not a re-derived approximation.
//
// Usage:
//   node scripts/export-skipped-notes.js <path-to-file.xlsx> [--no-header] [--out <dir>]

const path = require('path')
const fs   = require('fs')

let XLSX
try {
  XLSX = require(path.join(__dirname, '..', '..', 'client', 'node_modules', 'xlsx'))
} catch (e) {
  console.error(
    '\nCould not load the "xlsx" package from client/node_modules.\n' +
    'Same note as add-notes-from-excel.js: this reuses the copy client/\n' +
    'already has. If missing, run `npm install` inside client/ first, or\n' +
    'temporarily `npm install xlsx --no-save` inside server/.\n'
  )
  process.exit(1)
}

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── CLI args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const filePath = args.find(a => !a.startsWith('--'))
const outIdx = args.indexOf('--out')
const outDir = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1] : path.join(__dirname, 'output')
const noHeader = args.includes('--no-header')

if (!filePath) {
  console.error('Usage: node scripts/export-skipped-notes.js <path-to-file.xlsx> [--no-header] [--out <dir>]')
  process.exit(1)
}
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

// ── Header handling — identical to add-notes-from-excel.js ───────────────
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

// Identical to add-notes-from-excel.js's normalizeDomain.
function normalizeDomain(v) {
  if (!v) return ''
  return String(v).trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
}

async function main() {
  console.log('\nSkipped-rows report (READ-ONLY — no data is written to the database)')
  console.log(`Source file: ${filePath}\n`)

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

  const getField = noHeader
    ? { name: r => String(r[0] ?? '').trim(), domain: r => String(r[1] ?? '').trim(), notes: r => String(r[2] ?? '').trim() }
    : { name: r => readCol(r, 'name'), domain: r => readCol(r, 'domain'), notes: r => readCol(r, 'notes') }

  const existingCompanies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, domain: true },
  })

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

  // Only the rows this report cares about — everything else (matched,
  // blank-notes, invalid) is out of scope here.
  const skipped = [] // { row, name, domain, notes, reason, detail }

  rows.forEach((row, i) => {
    const rowIndex = i + (noHeader ? 1 : 2)
    const name = getField.name(row)
    const domainRaw = getField.domain(row)
    const domainKey = normalizeDomain(domainRaw)
    const notes = getField.notes(row)

    if (!name && !domainKey) return // invalid row — not unmatched or conflict, out of scope

    const nameCandidates   = name      ? (byName.get(name.toLowerCase()) || []) : []
    const domainCandidates = domainKey ? (byDomain.get(domainKey) || [])        : []

    if (nameCandidates.length === 1 && domainCandidates.length === 1) {
      if (nameCandidates[0].id !== domainCandidates[0].id) {
        skipped.push({
          row: rowIndex, name, domain: domainRaw, notes,
          reason: 'conflict',
          detail: `Name matches "${nameCandidates[0].name}", but URL matches a different company: "${domainCandidates[0].name}"`,
        })
      }
      return // agreeing match — not skipped, out of scope
    }
    if (nameCandidates.length === 1 && domainCandidates.length === 0) return // name-only match — not skipped
    if (domainCandidates.length === 1 && nameCandidates.length === 0) return // domain-only match — not skipped
    if (nameCandidates.length === 0 && domainCandidates.length === 0) {
      skipped.push({ row: rowIndex, name, domain: domainRaw, notes, reason: 'unmatched', detail: 'No existing company matched this name or URL.' })
      return
    }
    // Ambiguous — name and/or domain matched more than one company.
    skipped.push({
      row: rowIndex, name, domain: domainRaw, notes,
      reason: 'ambiguous',
      detail: `${nameCandidates.length} compan${nameCandidates.length === 1 ? 'y' : 'ies'} share this name, ${domainCandidates.length} share this URL — could not resolve to exactly one.`,
    })
  })

  const unmatchedCount = skipped.filter(s => s.reason === 'unmatched').length
  const conflictCount  = skipped.filter(s => s.reason === 'conflict').length
  const ambiguousCount = skipped.filter(s => s.reason === 'ambiguous').length

  fs.mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = path.join(outDir, `skipped-notes-${stamp}.xlsx`)

  const sheetRows = skipped.map(s => ({
    'Row':           s.row,
    'Company Name':  s.name,
    'Company URL':   s.domain,
    'Notes':         s.notes,
    'Reason':        s.reason,
    'Detail':        s.detail,
  }))
  const sheet = XLSX.utils.json_to_sheet(sheetRows)
  sheet['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 35 }, { wch: 60 }, { wch: 12 }, { wch: 60 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Skipped rows')
  XLSX.writeFile(workbook, outPath)

  console.log('── Summary ──────────────────────────────────────────')
  console.log(`Total skipped rows in report: ${skipped.length}`)
  console.log(`  unmatched:  ${unmatchedCount}`)
  console.log(`  conflict:   ${conflictCount}`)
  console.log(`  ambiguous:  ${ambiguousCount}`)
  console.log(`\nReport written to: ${outPath}`)
}

main()
  .catch(err => { console.error('\nFatal error:', err); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
