// Phase 2 preparation — converts implicit DOMAIN-based company matches into
// EXPLICIT saved company email addresses.
//
// Why: company association currently falls back to matching an address's
// DOMAIN when no saved address matches. That works, but nobody ever asserted
// those links — they are implicit, unauditable, and would silently capture any
// future address at the same domain. Saving the addresses that are already
// being matched makes each link an explicit, human-owned fact, so the domain
// fallback can then be removed without losing a single correct mapping.
//
//   node scripts/backfill-company-emails.js              dry run (default)
//   node scripts/backfill-company-emails.js --apply      append the addresses
//   node scripts/backfill-company-emails.js --rollback   undo, using the manifest
//
// STRICTLY ADDITIVE. This script only ever APPENDS to Company.emails[]:
//   • Company.email (the primary) is never written
//   • no existing entry in Company.emails[] is ever removed or reordered
//   • an address already present (case-insensitively) is skipped, never duplicated
//   • no Activity row is read-modified, no Gmail call is made, nothing is deleted
//
// Rollback is manifest-driven: --apply records exactly which (company, address)
// pairs IT appended, and --rollback removes only those. An address that was
// already on the company before this ran can never be removed by it.
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const ROLLBACK = argv.includes('--rollback')
const MANIFEST = path.join(__dirname, '..', 'phase2-email-backfill-manifest.json')

// Addresses that are matched by domain today but are NOT client contacts and
// must never become a saved company address. Reviewed individually.
const EXCLUDE = new Map([
  ['postmaster@networkbuilding.com.au', 'bounce daemon, not a person'],
  ['junkemail@sayal.com',               'junk mailbox, not a client contact'],
])

const norm = (v) => String(v || '').trim().toLowerCase()

// ── rollback ────────────────────────────────────────────────────────────────
async function rollback() {
  if (!fs.existsSync(MANIFEST)) {
    console.log('No manifest found at', MANIFEST)
    console.log('Nothing to roll back — --apply has not been run (or the manifest was removed).')
    return
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  console.log(`Manifest from ${manifest.appliedAt} — ${manifest.added.length} address(es) were added\n`)

  let removed = 0, missing = 0, untouched = 0
  for (const entry of manifest.added) {
    const co = await prisma.company.findUnique({
      where: { id: entry.companyId }, select: { id: true, name: true, email: true, emails: true },
    })
    if (!co) { console.log(`  - company ${entry.companyId} no longer exists — skipped`); missing++; continue }
    const current = Array.isArray(co.emails) ? co.emails : []
    const target = norm(entry.address)
    if (!current.some(e => norm(e) === target)) {
      console.log(`  - ${co.name}: "${entry.address}" not present — nothing to remove`)
      untouched++
      continue
    }
    // Remove ONLY this address. Everything else keeps its exact value and order.
    const next = current.filter(e => norm(e) !== target)
    if (APPLY) {
      await prisma.company.update({ where: { id: co.id }, data: { emails: next.length ? next : null } })
    }
    console.log(`  ${APPLY ? 'REMOVED' : 'would remove'}  ${co.name}: "${entry.address}"  (${current.length} -> ${next.length})`)
    removed++
  }
  console.log(`\n${APPLY ? 'removed' : 'would remove'}: ${removed}   already absent: ${untouched}   company gone: ${missing}`)
  if (!APPLY) console.log('\nDRY RUN — re-run with:  --rollback --apply')
  else {
    fs.renameSync(MANIFEST, MANIFEST + '.rolledback.' + Date.now())
    console.log('Manifest archived; the backfill is fully undone.')
  }
}

// ── backfill ────────────────────────────────────────────────────────────────
async function backfill() {
  console.log(APPLY ? 'MODE: apply — addresses WILL be appended\n'
                    : 'MODE: dry run — nothing will be written\n')

  // The pairs come from the data itself: the address recorded on each row that
  // was matched by domain. That value IS the address to save — not the
  // company's domain field, which frequently holds a storefront subdomain or a
  // different TLD and is not the thing that produced the match.
  const pairs = await prisma.$queryRaw`
    SELECT a."companyId", a."matchedCompanyEmail" AS address, COUNT(*)::int AS rows
    FROM "Activity" a
    WHERE a.type = 'email'
      AND a."matchBasis" = 'domain'
      AND a."gmailDeletedAt" IS NULL
      AND a."companyId" IS NOT NULL
      AND a."matchedCompanyEmail" IS NOT NULL
    GROUP BY a."companyId", a."matchedCompanyEmail"
    ORDER BY COUNT(*) DESC
  `
  if (!pairs.length) { console.log('No domain-matched pairs found. Nothing to do.'); return }

  const companies = await prisma.company.findMany({
    where: { id: { in: [...new Set(pairs.map(p => p.companyId))] } },
    select: { id: true, name: true, email: true, emails: true, deletedAt: true },
  })
  const byId = new Map(companies.map(c => [c.id, c]))

  // A connected CRM mailbox must never become a company address — every message
  // in that mailbox would then match the company.
  const accounts = await prisma.emailAccount.findMany({ select: { email: true } })
  const ownAddresses = new Set(accounts.map(a => norm(a.email)).filter(Boolean))

  const toAdd = [], skippedPresent = [], excluded = [], skippedOther = []
  // Tracks what each company will hold as we go, so two pairs adding the same
  // address to one company cannot produce a duplicate within a single run.
  const planned = new Map()

  for (const p of pairs) {
    const co = byId.get(p.companyId)
    const addr = norm(p.address)
    if (!co)            { skippedOther.push({ ...p, why: 'company not found' }); continue }
    if (co.deletedAt)   { skippedOther.push({ ...p, co, why: 'company is in the Recycle Bin' }); continue }
    if (!addr)          { skippedOther.push({ ...p, co, why: 'empty address' }); continue }
    if (EXCLUDE.has(addr)) { excluded.push({ ...p, co, why: EXCLUDE.get(addr) }); continue }
    if (ownAddresses.has(addr)) { skippedOther.push({ ...p, co, why: 'is a connected CRM mailbox' }); continue }

    if (!planned.has(co.id)) {
      const existing = Array.isArray(co.emails) ? co.emails.slice() : []
      planned.set(co.id, { co, existing, existingSet: new Set([norm(co.email), ...existing.map(norm)].filter(Boolean)) })
    }
    const state = planned.get(co.id)
    if (state.existingSet.has(addr)) { skippedPresent.push({ ...p, co }); continue }

    state.existingSet.add(addr)
    state.existing.push(p.address.trim())   // stored as written, matching is case-insensitive
    toAdd.push({ companyId: co.id, company: co.name, address: p.address.trim(), rows: p.rows,
                 existingCount: (Array.isArray(co.emails) ? co.emails.length : 0) })
  }

  console.log('='.repeat(96))
  console.log('ADDRESSES TO ADD'.padEnd(50) + 'existing  rows-matched')
  console.log('='.repeat(96))
  for (const t of toAdd) {
    console.log('  ' + t.address.padEnd(46) + ' -> ' + String(t.company).padEnd(34) +
      String(t.existingCount).padStart(4) + String(t.rows).padStart(12))
  }

  if (excluded.length) {
    console.log('\n' + '='.repeat(96))
    console.log('EXPLICITLY EXCLUDED — reviewed and rejected as company addresses')
    console.log('='.repeat(96))
    for (const e of excluded) {
      console.log('  ' + norm(e.address).padEnd(46) + ' -> ' + String(e.co?.name).padEnd(34) +
        `(${e.rows} row(s))  ${e.why}`)
    }
  }
  if (skippedPresent.length) {
    console.log(`\nALREADY SAVED (skipped, no duplicate created): ${skippedPresent.length}`)
    for (const s of skippedPresent.slice(0, 15)) {
      console.log('  ' + norm(s.address).padEnd(46) + ' -> ' + s.co.name)
    }
    if (skippedPresent.length > 15) console.log(`  … and ${skippedPresent.length - 15} more`)
  }
  if (skippedOther.length) {
    console.log(`\nSKIPPED FOR OTHER REASONS: ${skippedOther.length}`)
    for (const s of skippedOther) {
      console.log('  ' + norm(s.address).padEnd(46) + ' -> ' + String(s.co?.name || s.companyId).padEnd(34) + s.why)
    }
  }

  const companiesAffected = new Set(toAdd.map(t => t.companyId))
  console.log('\n' + '='.repeat(96))
  console.log('SAFETY SUMMARY')
  console.log('='.repeat(96))
  console.log(`  domain-matched pairs found        : ${pairs.length}`)
  console.log(`  addresses TO ADD                  : ${toAdd.length}`)
  console.log(`  companies affected                : ${companiesAffected.size}`)
  console.log(`  explicitly excluded               : ${excluded.length}`)
  console.log(`  already saved (skipped)           : ${skippedPresent.length}`)
  console.log(`  skipped for other reasons         : ${skippedOther.length}`)
  console.log(`  activity rows behind these matches: ${toAdd.reduce((s, t) => s + t.rows, 0)}`)
  console.log(`  DATABASE RECORDS THAT WILL CHANGE : ${companiesAffected.size} Company row(s) — Company.emails[] only`)
  console.log(`  Company.email (primary) writes     : 0`)
  console.log(`  Activity rows modified             : 0`)
  console.log(`  rows deleted / unassigned          : 0`)

  if (!APPLY) {
    console.log('\nDRY RUN — nothing was written. Re-run with --apply to append these addresses.')
    return
  }

  // ── apply ──
  let updated = 0
  const added = []
  for (const [companyId, state] of planned) {
    const before = Array.isArray(state.co.emails) ? state.co.emails : []
    if (state.existing.length === before.length) continue     // nothing new for this company
    await prisma.company.update({ where: { id: companyId }, data: { emails: state.existing } })
    updated++
  }
  for (const t of toAdd) added.push({ companyId: t.companyId, company: t.company, address: t.address })
  fs.writeFileSync(MANIFEST, JSON.stringify({ appliedAt: new Date().toISOString(), added }, null, 2))
  console.log(`\nAPPLIED: ${updated} company row(s) updated, ${added.length} address(es) appended.`)
  console.log('Manifest written to', MANIFEST)

  // ── verify ──
  console.log('\nVERIFYING…')
  let ok = 0, bad = 0
  for (const t of toAdd) {
    const co = await prisma.company.findUnique({ where: { id: t.companyId }, select: { emails: true, email: true } })
    const list = (Array.isArray(co?.emails) ? co.emails : []).map(norm)
    if (list.includes(norm(t.address))) ok++
    else { bad++; console.log(`  !! MISSING after apply: ${t.address} on ${t.company}`) }
  }
  // Nothing pre-existing may have disappeared.
  let lost = 0
  for (const [companyId, state] of planned) {
    const co = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, email: true, emails: true } })
    const now = new Set((Array.isArray(co?.emails) ? co.emails : []).map(norm))
    const wasBefore = Array.isArray(state.co.emails) ? state.co.emails : []
    for (const e of wasBefore) {
      if (!now.has(norm(e))) { lost++; console.log(`  !! LOST pre-existing address ${e} on ${co?.name}`) }
    }
    if (norm(co?.email) !== norm(state.co.email)) {
      lost++; console.log(`  !! Company.email CHANGED on ${co?.name} — must never happen`)
    }
  }
  console.log(`  addresses confirmed present : ${ok}/${toAdd.length}`)
  console.log(`  pre-existing values lost    : ${lost}  (must be 0)`)
  console.log(`  Company.email changed       : ${lost ? 'see above' : '0'}`)
  console.log(bad === 0 && lost === 0 ? '\nVERIFIED OK.' : '\n*** VERIFICATION FAILED — consider --rollback --apply ***')
  console.log('Rollback with:  node scripts/backfill-company-emails.js --rollback --apply')
}

;(async () => {
  if (ROLLBACK) await rollback()
  else await backfill()
})()
  .catch(e => { console.error('ERROR', e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
