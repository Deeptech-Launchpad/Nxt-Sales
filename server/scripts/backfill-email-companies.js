#!/usr/bin/env node
//
// Backfill company associations onto existing email Activity rows.
//
// Every stored email already holds the headers the matcher needs (fromEmail,
// toEmail, ccEmail), so this re-derives the association purely from the
// database — no Gmail round-trip, no risk of hitting API quota, and it works
// for messages whose original mailbox is no longer connected.
//
// Run:
//   node scripts/backfill-email-companies.js            # dry run, changes nothing
//   node scripts/backfill-email-companies.js --apply    # writes
//   node scripts/backfill-email-companies.js --apply --relink   # also re-check ALREADY-linked rows
//
// Safety:
//   • Default is a DRY RUN. Nothing is written without --apply.
//   • Only companyId / matchedCompanyEmail / matchBasis are ever written.
//   • Rows already linked are left alone unless --relink is passed.
//   • A row the matcher cannot place is left untouched (companyId stays null)
//     — it is never guessed at and never deleted.
//   • Thread-consistent: the whole thread inherits the association of the
//     first message in it that matches, mirroring the sync path exactly.

const { PrismaClient } = require('@prisma/client')
const matcher = require('../src/utils/companyEmailMatcher')

const prisma = new PrismaClient()
const APPLY  = process.argv.includes('--apply')
const RELINK = process.argv.includes('--relink')

async function main() {
  const index = await matcher.getIndex({ force: true })
  console.log(`Matcher index: ${index.byAddress.size} company addresses, ${index.byDomain.size} unambiguous domains\n`)

  const rows = await prisma.activity.findMany({
    where: { type: 'email' },
    select: {
      id: true, threadId: true, companyId: true, fromEmail: true,
      toEmail: true, ccEmail: true, matchedCompanyEmail: true, matchBasis: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`${rows.length} email activities found`)
  console.log(`  already linked : ${rows.filter(r => r.companyId).length}`)
  console.log(`  unlinked       : ${rows.filter(r => !r.companyId).length}\n`)

  // Group by thread so an association derived from one message applies to the
  // whole conversation — otherwise a reply that happens not to name a company
  // address would be left orphaned inside an otherwise-associated thread.
  const byThread = new Map()
  for (const r of rows) {
    const k = r.threadId || `single:${r.id}`
    if (!byThread.has(k)) byThread.set(k, [])
    byThread.get(k).push(r)
  }

  let associated = 0, unassigned = 0, skippedAlreadyLinked = 0, corrected = 0
  const byBasis = { address: 0, domain: 0 }
  const perCompany = new Map()
  const updates = []

  for (const msgs of byThread.values()) {
    const resolved = matcher.matchThread(
      msgs.map(m => ({ from: m.fromEmail, to: m.toEmail, cc: m.ccEmail })),
      index
    )

    if (!resolved) {
      unassigned += msgs.filter(m => !m.companyId).length
      continue
    }

    for (const m of msgs) {
      if (m.companyId && !RELINK) { skippedAlreadyLinked++; continue }

      const needs =
        m.companyId !== resolved.companyId ||
        m.matchedCompanyEmail !== resolved.matchedEmail ||
        m.matchBasis !== resolved.basis
      if (!needs) { skippedAlreadyLinked++; continue }

      if (m.companyId && m.companyId !== resolved.companyId) corrected++
      else associated++

      byBasis[resolved.basis]++
      perCompany.set(resolved.companyId, (perCompany.get(resolved.companyId) || 0) + 1)
      updates.push({ id: m.id, companyId: resolved.companyId, matchedCompanyEmail: resolved.matchedEmail, matchBasis: resolved.basis })
    }
  }

  console.log('── Result ──────────────────────────────────')
  console.log(`  would associate      : ${associated}`)
  console.log(`  would re-point       : ${corrected}   (already linked elsewhere; --relink only)`)
  console.log(`  remain unassigned    : ${unassigned}`)
  console.log(`  skipped (unchanged)  : ${skippedAlreadyLinked}`)
  console.log(`  matched via address  : ${byBasis.address}`)
  console.log(`  matched via domain   : ${byBasis.domain}`)
  console.log(`  distinct companies   : ${perCompany.size}`)

  if (perCompany.size) {
    const top = [...perCompany.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    const names = await prisma.company.findMany({
      where: { id: { in: top.map(([id]) => id) } },
      select: { id: true, name: true },
    })
    const nameById = new Map(names.map(c => [c.id, c.name]))
    console.log('\n  top companies:')
    for (const [id, n] of top) console.log(`    ${String(n).padStart(5)}  ${nameById.get(id) || id}`)
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist.')
    return
  }

  console.log(`\nApplying ${updates.length} update(s)…`)
  let done = 0
  // Chunked so a large backfill never builds one enormous transaction.
  const CHUNK = 200
  for (let i = 0; i < updates.length; i += CHUNK) {
    const slice = updates.slice(i, i + CHUNK)
    await prisma.$transaction(
      slice.map(u => prisma.activity.update({
        where: { id: u.id },
        data: { companyId: u.companyId, matchedCompanyEmail: u.matchedCompanyEmail, matchBasis: u.matchBasis },
      }))
    )
    done += slice.length
    process.stdout.write(`\r  ${done}/${updates.length}`)
  }
  console.log('\n\nVerifying…')
  const linked = await prisma.activity.count({ where: { type: 'email', companyId: { not: null } } })
  const total  = await prisma.activity.count({ where: { type: 'email' } })
  console.log(`  ${linked}/${total} email activities now carry a company (${total - linked} unassigned)`)
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1) })
