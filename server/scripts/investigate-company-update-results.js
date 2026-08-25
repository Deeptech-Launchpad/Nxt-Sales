#!/usr/bin/env node
// READ-ONLY diagnostic — NOT part of the app, performs ZERO writes (no
// prisma.company.update, no prisma.activity.create, nothing). Written to
// investigate a discrepancy reported after running
// update-companies-from-excel.js: some companies visible in the live CRM
// with a matching Company URL still show blank fields the user says are
// filled in the source Excel.
//
// This independently re-derives, for EVERY row that matches an existing
// company by URL, a fresh per-field Excel-vs-CRM comparison — not trusting
// update-companies-from-excel.js's own classification, so a bug in that
// script's comparison logic would still show up here.
//
// Usage: node scripts/investigate-company-update-results.js <path-to-file.xlsx>

const path = require('path')
const fs   = require('fs')
let XLSX
try {
  XLSX = require(path.join(__dirname, '..', '..', 'client', 'node_modules', 'xlsx'))
} catch (e) {
  console.error('Could not load xlsx from client/node_modules.')
  process.exit(1)
}
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const filePath = process.argv.slice(2).find(a => !a.startsWith('--'))
if (!filePath || !fs.existsSync(filePath)) {
  console.error('Usage: node scripts/investigate-company-update-results.js <path-to-file.xlsx>')
  process.exit(1)
}

// ── Same header/split/normalize logic as update-companies-from-excel.js,
// copied verbatim (not imported) so this diagnostic can't accidentally
// change behavior in the real script, and so it independently re-derives
// the answer rather than trusting shared code that might itself be buggy.
function normalizeHeader(h) {
  return String(h || '').replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/gi, '').toLowerCase()
}
const HEADER_ALIASES = {
  sno: 'sNo', companyname: 'name', industry: 'industry', country: 'country',
  remarksstaticlessdatapartnership: 'remarks', remarks: 'remarks',
  companyurl: 'domain', website: 'domain', url: 'domain',
  endpdpurl: 'endPdpUrl', email: 'email',
  cophoneno: 'phone', phone: 'phone',
  contactperson: 'contactPersons', contactpersons: 'contactPersons',
  linkedprofile: 'linkedProfiles', linkedprofiles: 'linkedProfiles',
  cms: 'cms', notes: 'notes', note: 'notes',
}
function readCol(row, targetKey) {
  for (const rawHeader of Object.keys(row)) {
    if (HEADER_ALIASES[normalizeHeader(rawHeader)] === targetKey) {
      return String(row[rawHeader] ?? '').trim()
    }
  }
  return ''
}
function normalizeDomain(v) {
  if (!v) return ''
  return String(v).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
}
function splitMultiValue(v) {
  if (!v) return []
  const seen = new Set(); const out = []
  for (const raw of String(v).split(/\s+\/\s+/)) {
    const val = raw.trim()
    if (!val) continue
    const k = val.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k); out.push(val)
  }
  return out
}
function listsEqual(a, b) {
  const na = [...a].map(x => String(x).trim().toLowerCase()).sort()
  const nb = [...b].map(x => String(x).trim().toLowerCase()).sort()
  return na.length === nb.length && na.every((v, i) => v === nb[i])
}

const SCALAR_FIELDS = ['name', 'industry', 'country', 'remarks', 'endPdpUrl', 'cms']
const LIST_FIELDS   = ['email', 'phone', 'contactPersons', 'linkedProfiles']
const ALL_TRACKED_FIELDS = [...SCALAR_FIELDS, ...LIST_FIELDS]

async function main() {
  const wb = XLSX.readFile(filePath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
  console.log(`Sheet: ${wb.SheetNames[0]} | Parsed ${rows.length} row(s)\n`)

  // ── Header audit — every actual header in the file vs where it maps ────
  const rawHeaders = rows.length ? Object.keys(rows[0]) : []
  console.log('── Header mapping audit ──────────────────────────────')
  for (const h of rawHeaders) {
    const norm = normalizeHeader(h)
    const mapped = HEADER_ALIASES[norm]
    console.log(`  "${h}"  ->  normalized "${norm}"  ->  ${mapped ? `mapped to "${mapped}"` : 'UNMAPPED (ignored)'}`)
  }
  console.log(`\nFields the script tracks/compares/updates: ${ALL_TRACKED_FIELDS.join(', ')}`)
  console.log(`Fields deliberately excluded: domain (matching key only), leadStatus/ownerId/customFields (not present in this file), Company.notes scalar (legacy, unused)\n`)

  const existingCompanies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: {
      id: true, name: true, domain: true, email: true, emails: true,
      phone: true, phones: true, industry: true, country: true,
      endPdpUrl: true, cms: true, remarks: true,
      contactPersons: true, linkedProfiles: true,
    },
  })
  const byDomain = new Map()
  for (const co of existingCompanies) {
    const key = normalizeDomain(co.domain)
    if (!key) continue
    if (!byDomain.has(key)) byDomain.set(key, [])
    byDomain.get(key).push(co)
  }

  const detail = [] // one entry per matched row, full per-field breakdown
  let unmatchedCount = 0, ambiguousCount = 0, invalidCount = 0

  rows.forEach((row, i) => {
    const rowIndex = i + 2
    const sNo = readCol(row, 'sNo')
    const urlRaw = readCol(row, 'domain')
    const domainKey = normalizeDomain(urlRaw)
    if (!domainKey) { invalidCount++; return }
    const candidates = byDomain.get(domainKey) || []
    if (candidates.length === 0) { unmatchedCount++; return }
    if (candidates.length > 1) { ambiguousCount++; return }
    const company = candidates[0]

    const excelRaw = {
      name: readCol(row, 'name'), industry: readCol(row, 'industry'), country: readCol(row, 'country'),
      remarks: readCol(row, 'remarks'), endPdpUrl: readCol(row, 'endPdpUrl'), cms: readCol(row, 'cms'),
      email: splitMultiValue(readCol(row, 'email')), phone: splitMultiValue(readCol(row, 'phone')),
      contactPersons: splitMultiValue(readCol(row, 'contactPersons')), linkedProfiles: splitMultiValue(readCol(row, 'linkedProfiles')),
    }

    const fields = {}
    let anyNeedsUpdate = false
    let anyDifferentNonBlank = false // excel non-blank, crm non-blank, but DIFFERENT (conflict, not just fill)
    let anyFillFromBlank = false     // excel non-blank, crm blank/null

    for (const f of SCALAR_FIELDS) {
      const excelVal = excelRaw[f]
      const crmVal = company[f] || ''
      const isExcelBlank = !excelVal
      const equal = String(crmVal).trim() === excelVal
      const needsUpdate = !isExcelBlank && !equal
      if (needsUpdate) {
        anyNeedsUpdate = true
        if (!crmVal) anyFillFromBlank = true; else anyDifferentNonBlank = true
      }
      fields[f] = { excelValue: excelVal, crmValue: company[f] ?? null, isExcelBlank, needsUpdate }
    }
    for (const f of LIST_FIELDS) {
      const excelList = excelRaw[f]
      const crmList = f === 'email'
        ? ((company.emails && company.emails.length) ? company.emails : (company.email ? [company.email] : []))
        : f === 'phone'
        ? ((company.phones && company.phones.length) ? company.phones : (company.phone ? [company.phone] : []))
        : (company[f] || [])
      const isExcelBlank = excelList.length === 0
      const equal = listsEqual(excelList, crmList)
      const needsUpdate = !isExcelBlank && !equal
      if (needsUpdate) {
        anyNeedsUpdate = true
        if (crmList.length === 0) anyFillFromBlank = true; else anyDifferentNonBlank = true
      }
      fields[f] = { excelValue: excelList, crmValue: crmList, isExcelBlank, needsUpdate }
    }

    detail.push({
      rowIndex, sNo, excelUrl: urlRaw, companyId: company.id, companyName: company.name,
      anyNeedsUpdate, anyFillFromBlank, anyDifferentNonBlank, fields,
    })
  })

  // ── Aggregate per user's exact 6 questions ──────────────────────────
  const fullyIdenticalOrBlank = detail.filter(d => !d.anyNeedsUpdate)
  const fillFromBlankRows     = detail.filter(d => d.anyFillFromBlank)
  const differentValueRows    = detail.filter(d => d.anyDifferentNonBlank)
  const trulyNeedsUpdateRows  = detail.filter(d => d.anyNeedsUpdate)

  const fieldDiffTally = {}
  for (const d of detail) for (const f of ALL_TRACKED_FIELDS) if (d.fields[f].needsUpdate) fieldDiffTally[f] = (fieldDiffTally[f] || 0) + 1

  console.log('── Answers to your 6 questions ───────────────────────')
  console.log(`Total matched rows re-checked:                              ${detail.length}`)
  console.log(`1. Every tracked field already equal/blank (no update needed): ${fullyIdenticalOrBlank.length}`)
  console.log(`2. At least one field: Excel non-blank, CRM blank/null:        ${fillFromBlankRows.length}`)
  console.log(`3. At least one field: Excel non-blank, CRM non-blank, DIFFERENT: ${differentValueRows.length}`)
  console.log(`4. Per-field difference counts:                             ${JSON.stringify(fieldDiffTally)}`)
  console.log(`5. Unmapped Excel columns: see header audit above (should be none besides S No/Notes, which are handled separately, not ignored)`)
  console.log(`6. Fields compared/updated: ${ALL_TRACKED_FIELDS.join(', ')}`)
  console.log(`\nRows that ACTUALLY need an update by this independent re-check: ${trulyNeedsUpdateRows.length}`)
  console.log(`(For comparison: update-companies-from-excel.js's own dry run reported 76 toUpdate + 175 noChange = 251)`)

  // ── Full report ──────────────────────────────────────────────────────
  const outDir = path.join(__dirname, 'output')
  fs.mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const jsonPath = path.join(outDir, `investigate-noChange-${stamp}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify({
    runAt: new Date().toISOString(),
    sourceFile: filePath,
    headerAudit: rawHeaders.map(h => ({ header: h, normalized: normalizeHeader(h), mappedTo: HEADER_ALIASES[normalizeHeader(h)] || null })),
    trackedFields: ALL_TRACKED_FIELDS,
    summary: {
      totalMatchedRows: detail.length,
      fullyIdenticalOrBlank: fullyIdenticalOrBlank.length,
      fillFromBlankRows: fillFromBlankRows.length,
      differentValueRows: differentValueRows.length,
      trulyNeedsUpdateRows: trulyNeedsUpdateRows.length,
      fieldDiffTally,
      unmatchedCount, ambiguousCount, invalidCount,
    },
    // Full per-row, per-field detail for every matched row (this is the
    // "Excel row number / URL / Company ID / Company Name / per-field
    // excel value / crm value / needs update" report requested).
    detail,
  }, null, 2))

  const csvLines = ['Excel Row,S No,Excel URL,Company ID,Company Name,Any Needs Update,Fields Needing Update']
  for (const d of detail) {
    const needFields = ALL_TRACKED_FIELDS.filter(f => d.fields[f].needsUpdate)
    csvLines.push([d.rowIndex, d.sNo, d.excelUrl, d.companyId, d.companyName, d.anyNeedsUpdate, needFields.join(';')]
      .map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(','))
  }
  const csvPath = path.join(outDir, `investigate-noChange-${stamp}.csv`)
  fs.writeFileSync(csvPath, csvLines.join('\n'))

  console.log(`\nFull per-row per-field detail: ${jsonPath}`)
  console.log(`CSV summary: ${csvPath}`)

  if (trulyNeedsUpdateRows.length > 0) {
    console.log('\n── Rows this independent re-check thinks DO need an update ──')
    trulyNeedsUpdateRows.slice(0, 30).forEach(d => {
      const needFields = ALL_TRACKED_FIELDS.filter(f => d.fields[f].needsUpdate)
      console.log(`  row ${d.rowIndex} (${d.companyName}, ${d.excelUrl}): ${needFields.join(', ')}`)
    })
    if (trulyNeedsUpdateRows.length > 30) console.log(`  ...and ${trulyNeedsUpdateRows.length - 30} more — see JSON report.`)
  }
}

main().catch(err => { console.error('Fatal error:', err); process.exitCode = 1 }).finally(() => prisma.$disconnect())
