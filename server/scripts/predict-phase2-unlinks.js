// READ-ONLY. Predicts exactly what a full re-sync would detach now that
// company identity is "an address somebody saved on the company" and nothing
// else. Writes nothing — no Activity, no Company, no Gmail call.
//
//   node scripts/predict-phase2-unlinks.js                 whole database
//   node scripts/predict-phase2-unlinks.js --company "Ade" one company
//   node scripts/predict-phase2-unlinks.js --limit 40      cap the per-company list
//
// It runs the SAME matcher call the sync's unlink pass runs, against each
// row's own stored From/To/Cc. A row is predicted to keep its company when
// that call still resolves to the company it is currently filed under, and to
// be released otherwise. The row would be UNLINKED, never deleted: companyId,
// matchedCompanyEmail and matchBasis are cleared, everything else — body,
// attachments, tracking, threadId, rfcMessageId — is untouched, and the row
// re-links itself the moment a matching address is saved.
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const matcher = require('../src/utils/companyEmailMatcher')
const prisma = new PrismaClient()

const argv = process.argv.slice(2)
const nameIdx = argv.indexOf('--company')
const ONLY = nameIdx !== -1 ? argv[nameIdx + 1] : null
const limIdx = argv.indexOf('--limit')
const LIMIT = limIdx !== -1 ? parseInt(argv[limIdx + 1], 10) : 40

const RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const addrsOf = (...vals) => [...new Set(vals.filter(Boolean).join(' ').match(RE) || [])].map(a => a.toLowerCase())
const domOf = a => { const i = a.lastIndexOf('@'); return i === -1 ? '' : a.slice(i + 1) }

;(async () => {
  console.log('READ-ONLY prediction — nothing will be written.\n')

  matcher.invalidateIndex()
  const index = await matcher.getIndex({ force: true })

  const where = { type: 'email', gmailDeletedAt: null, companyId: { not: null } }
  if (ONLY) {
    const co = await prisma.company.findFirst({
      where: { name: { contains: ONLY, mode: 'insensitive' } }, select: { id: true, name: true } })
    if (!co) { console.log('Company not found:', ONLY); return }
    where.companyId = co.id
    console.log('Scoped to:', co.name, '\n')
  }

  const rows = await prisma.activity.findMany({
    where,
    select: { id: true, companyId: true, fromEmail: true, toEmail: true, ccEmail: true,
              matchedCompanyEmail: true, matchBasis: true, direction: true, subject: true },
  })
  const companyIds = [...new Set(rows.map(r => r.companyId))]
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } }, select: { id: true, name: true } })
  const nameById = new Map(companies.map(c => [c.id, c.name]))

  // Connected mailboxes, so internal-only mail can be reported separately —
  // that is by far the most common reason a row is released, and it is the
  // thread-level bug being corrected rather than anything going wrong.
  const accounts = await prisma.emailAccount.findMany({ select: { email: true } })
  const own = new Set(accounts.map(a => (a.email || '').toLowerCase()).filter(Boolean))
  const ownDomains = new Set([...own].map(domOf).filter(Boolean))

  let keep = 0
  const perCompany = new Map()          // companyId -> { keep, unlink }
  const byReason = { movesToOtherCompany: 0, internalOnly: 0, noMatch: 0 }
  const movedPairs = new Map()          // "A -> B" -> count
  const releasedDomains = new Map()     // participant domain -> count
  const sample = []

  for (const r of rows) {
    if (!perCompany.has(r.companyId)) perCompany.set(r.companyId, { keep: 0, unlink: 0 })
    const bucket = perCompany.get(r.companyId)
    const m = matcher.matchHeaders({ from: r.fromEmail, to: r.toEmail, cc: r.ccEmail }, index)

    if (m && m.companyId === r.companyId) { keep++; bucket.keep++; continue }
    bucket.unlink++

    const participants = addrsOf(r.fromEmail, r.toEmail, r.ccEmail)
    const external = participants.filter(a => !own.has(a) && !ownDomains.has(domOf(a)))

    if (m) {
      byReason.movesToOtherCompany++
      const k = `${nameById.get(r.companyId)}  ->  ${nameById.get(m.companyId) || m.companyId}`
      movedPairs.set(k, (movedPairs.get(k) || 0) + 1)
    } else if (external.length === 0) {
      byReason.internalOnly++
    } else {
      byReason.noMatch++
      for (const a of external) releasedDomains.set(domOf(a), (releasedDomains.get(domOf(a)) || 0) + 1)
      if (sample.length < 25) sample.push({ ...r, company: nameById.get(r.companyId), external })
    }
  }

  const unlink = rows.length - keep
  const pct = (n) => rows.length ? `  (${(n / rows.length * 100).toFixed(1)}%)` : ''
  console.log('='.repeat(88))
  console.log('GLOBAL PREDICTION')
  console.log('='.repeat(88))
  console.log(`  company-linked email rows examined : ${rows.length}`)
  console.log(`  WOULD KEEP                         : ${keep}${pct(keep)}`)
  console.log(`  WOULD BE RELEASED                  : ${unlink}${pct(unlink)}`)
  console.log(`  companies touched                  : ${companyIds.length}`)
  console.log('')
  console.log('  released, by reason:')
  console.log(`    moves to a DIFFERENT company     : ${byReason.movesToOtherCompany}   (re-links there on that company's sync)`)
  console.log(`    internal mail only, no client    : ${byReason.internalOnly}   (the thread-level bug being corrected)`)
  console.log(`    external address, none saved     : ${byReason.noMatch}   <-- REVIEW THESE`)

  if (movedPairs.size) {
    console.log('\n  company reassignments:')
    for (const [k, n] of [...movedPairs].sort((a, b) => b[1] - a[1]).slice(0, LIMIT)) {
      console.log('   ' + String(n).padStart(5) + '  ' + k)
    }
  }

  if (releasedDomains.size) {
    console.log('\n  UNSAVED EXTERNAL DOMAINS behind released rows (candidates to save, if legitimate):')
    for (const [d, n] of [...releasedDomains].sort((a, b) => b[1] - a[1]).slice(0, LIMIT)) {
      console.log('   ' + String(n).padStart(5) + '  ' + d)
    }
  }

  const losers = [...perCompany.entries()]
    .filter(([, v]) => v.unlink > 0)
    .sort((a, b) => b[1].unlink - a[1].unlink)
  if (losers.length) {
    console.log(`\n  COMPANIES THAT WOULD LOSE ROWS (${losers.length} of ${companyIds.length}), top ${LIMIT}:`)
    console.log('   ' + 'release'.padStart(7) + '  ' + 'keep'.padStart(5) + '  company')
    for (const [id, v] of losers.slice(0, LIMIT)) {
      const flag = v.keep === 0 ? '   <-- would lose ALL its email' : ''
      console.log('   ' + String(v.unlink).padStart(7) + '  ' + String(v.keep).padStart(5) + '  ' + nameById.get(id) + flag)
    }
  }

  if (sample.length) {
    console.log('\n  SAMPLE of rows released with an unsaved EXTERNAL address (max 25):')
    for (const s of sample) {
      console.log('   ---')
      console.log('     ' + s.company + '  [' + s.direction + ']  ' + String(s.subject || '').slice(0, 60))
      console.log('     external addresses: ' + s.external.join(', '))
      console.log('     recorded as matched via: ' + (s.matchedCompanyEmail || '(none)') + '  basis=' + (s.matchBasis || 'null'))
    }
  }

  console.log('\nNothing was written. No row was unlinked, modified or deleted.')
  await prisma.$disconnect()
})().catch(async e => { console.error('ERROR', e); await prisma.$disconnect(); process.exitCode = 1 })
