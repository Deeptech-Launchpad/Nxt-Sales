// Backfills the RFC Message-ID onto email rows that were written without one,
// and reports the duplicates that surface as a result.
//
// A row missing rfcMessageId is invisible to the sync's cross-mailbox duplicate
// check, which is how one real email ended up stored twice. Filling the field in
// closes that hole for rows written before the send-side fix.
//
// The duplicates fall out of the backfill for free: if setting a Message-ID on
// row A collides with the unique index, another row B already holds that exact
// id — so A and B are provably the same real email, matched on RFC Message-ID,
// never on subject.
//
//   node scripts/backfill-email-message-ids.js            dry run: change nothing, report everything
//   node scripts/backfill-email-message-ids.js --apply    backfill the Message-IDs (no deletions)
//   node scripts/backfill-email-message-ids.js --merge    also merge each duplicate pair
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { google } = require('googleapis')
const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply') || process.argv.includes('--merge')
const MERGE_FLAG = process.argv.includes('--merge')

// Decides which of a duplicate pair survives and what is carried across.
// BOTH the preview and the merge run this, so the dry run cannot describe
// something different from what actually happens. (The earlier preview
// printed the raw pairing instead and had keep/remove the wrong way round.)
function planMerge(a, b) {
  // Keep whichever row carries the open-tracking history: that is the
  // CRM-composed original, and its opens cannot be reconstructed from the
  // synced copy. If neither has it, the first one found wins.
  const [keep, drop] = (a.trackingId || !b.trackingId) ? [a, b] : [b, a]

  const patch = {}
  for (const f of ['companyId', 'ccEmail', 'bccEmail', 'mailboxEmail', 'matchedCompanyEmail', 'matchBasis', 'threadId', 'body', 'bodyHtml']) {
    if ((keep[f] === null || keep[f] === undefined) && drop[f] != null) patch[f] = drop[f]
  }
  if (keep.attachments == null && drop.attachments != null) patch.attachments = drop.attachments
  if ((keep.openCount || 0) === 0 && (drop.openCount || 0) > 0) {
    patch.openCount = drop.openCount
    patch.firstOpenedAt = drop.firstOpenedAt
    patch.lastOpenedAt = drop.lastOpenedAt
    patch.openHistory = drop.openHistory
    patch.emailStatus = drop.emailStatus
  }
  return { keep, drop, patch }
}
const MERGE = process.argv.includes('--merge')

;(async () => {
  console.log(APPLY ? (MERGE ? 'MODE: backfill + merge\n' : 'MODE: backfill only\n') : 'MODE: dry run — nothing will be written\n')

  const accounts = await prisma.emailAccount.findMany({ where: { provider: 'gmail' } })
  const clients = new Map()
  for (const a of accounts) {
    const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    c.setCredentials({ access_token: a.accessToken, refresh_token: a.refreshToken })
    clients.set(a.userId, { gmail: google.gmail({ version: 'v1', auth: c }), email: a.email })
  }

  const rows = await prisma.activity.findMany({
    where: { type: 'email', rfcMessageId: null, messageId: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, userId: true, messageId: true, subject: true, direction: true,
      threadId: true, trackingId: true, createdAt: true, companyId: true,
      ccEmail: true, bccEmail: true, mailboxEmail: true, attachments: true, body: true,
      openCount: true,
    },
  })
  console.log(`Rows with no RFC Message-ID: ${rows.length}`)

  const stats = { filled: 0, unreachable: 0, noAccount: 0, duplicates: 0 }
  const dupes = []

  for (const row of rows) {
    const conn = clients.get(row.userId)
    if (!conn) { stats.noAccount++; continue }

    let rfcId = null
    try {
      const msg = await conn.gmail.users.messages.get({
        userId: 'me', id: row.messageId, format: 'metadata', metadataHeaders: ['Message-ID'],
      })
      rfcId = (msg.data.payload?.headers || []).find(h => h.name?.toLowerCase() === 'message-id')?.value || null
    } catch {
      stats.unreachable++   // fake/test id, or the message is not in this mailbox
      continue
    }
    if (!rfcId) { stats.unreachable++; continue }

    const holder = await prisma.activity.findUnique({
      where: { rfcMessageId: rfcId },
      select: { id: true, direction: true, trackingId: true, openCount: true, subject: true, mailboxEmail: true, createdAt: true },
    })

    if (holder && holder.id !== row.id) {
      // Same real email, stored twice. Proven by Message-ID, not by subject.
      stats.duplicates++
      dupes.push({ rfcId, existing: holder, extra: row })
      continue
    }

    if (!APPLY) { stats.filled++; continue }
    try {
      await prisma.activity.update({ where: { id: row.id }, data: { rfcMessageId: rfcId } })
      stats.filled++
    } catch (e) {
      if (e.code === 'P2002') { stats.duplicates++ } else throw e
    }
  }

  console.log(`\n  Message-ID ${APPLY ? 'filled in' : 'that would be filled in'} : ${stats.filled}`)
  console.log(`  not readable from Gmail (test/foreign ids) : ${stats.unreachable}`)
  console.log(`  row's user has no connected mailbox        : ${stats.noAccount}`)
  console.log(`  DUPLICATES FOUND                           : ${stats.duplicates}`)

  if (dupes.length) {
    console.log('\n' + '='.repeat(72))
    console.log('DUPLICATE PAIRS — the same real email stored twice')
    console.log('='.repeat(72))
    for (const d of dupes) {
      const a = await prisma.activity.findUnique({ where: { id: d.existing.id } })
      const b = await prisma.activity.findUnique({ where: { id: d.extra.id } })
      if (!a || !b) continue
      const { keep, drop, patch } = planMerge(a, b)
      const show = (r) => `${r.id}  ${String(r.direction).padEnd(8)} tracking=${!!r.trackingId} opens=${r.openCount || 0} company=${r.companyId || '-'} mailbox=${r.mailboxEmail || '-'}`
      console.log(`\n  Message-ID ${d.rfcId}`)
      console.log(`    subject  "${String(keep.subject).slice(0, 60)}"`)
      console.log(`    KEEP     ${show(keep)}`)
      console.log(`    DELETE   ${show(drop)}`)
      console.log(`    carry over onto the kept row: ${Object.keys(patch).join(', ') || '(nothing missing)'}`)
      const lost = []
      if (drop.messageId && drop.messageId !== keep.messageId) lost.push(`its own per-mailbox Gmail id (${drop.messageId})`)
      if (drop.trackingId) lost.push('open-tracking id')
      if ((drop.openCount || 0) > 0 && (keep.openCount || 0) > 0) lost.push(`${drop.openCount} open event(s)`)
      console.log(`    lost with the deleted row     : ${lost.join(', ') || 'nothing'}`)
    }

    if (MERGE) {
      console.log('\nMerging...')
      for (const d of dupes) {
        // Keep whichever row carries the open-tracking history; that is the
        // CRM-composed original. Fold any field the keeper is missing across
        // from the copy before removing it, so no information is lost.
        const a = await prisma.activity.findUnique({ where: { id: d.existing.id } })
        const b = await prisma.activity.findUnique({ where: { id: d.extra.id } })
        if (!a || !b) continue
        const { keep, drop, patch } = planMerge(a, b)
        await prisma.$transaction(async (tx) => {
          await tx.activity.delete({ where: { id: drop.id } })
          await tx.activity.update({ where: { id: keep.id }, data: { ...patch, rfcMessageId: d.rfcId } })
        })
        console.log(`  merged ${drop.id} into ${keep.id}  (fields carried over: ${Object.keys(patch).join(', ') || 'none'})`)
      }
    } else {
      console.log('\n  Nothing has been written. Re-run with --merge to apply exactly the plan above.')
      console.log('  Gmail itself is never touched: this script only reads message headers.')
    }
  }

  await prisma.$disconnect()
})().catch(async e => { console.error('ERROR:', e.message); await prisma.$disconnect(); process.exit(1) })
