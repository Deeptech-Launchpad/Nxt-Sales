// Reconciles CRM email rows against Gmail: finds Activities whose underlying
// Gmail message no longer exists, and (with --apply) marks them gmailDeletedAt
// so they stop being displayed. Nothing is ever deleted, and Gmail is only read.
//
//   node scripts/reconcile-gmail-deletions.js                 dry run (default)
//   node scripts/reconcile-gmail-deletions.js --days 30       only rows synced in the last 30 days
//   node scripts/reconcile-gmail-deletions.js --mailbox a@b.c limit to one mailbox
//   node scripts/reconcile-gmail-deletions.js --apply         stamp the confirmed-gone rows
//   node scripts/reconcile-gmail-deletions.js --unmark        clear the stamp (undo)
//
// SAFETY — a row is only ever marked on a DEFINITIVE "this message does not
// exist" answer from Gmail (HTTP 404 / "Requested entity was not found"). Any
// other failure — expired token, rate limit, network, 5xx — aborts that mailbox
// entirely rather than risking a mass false-positive. That is the difference
// between "the user deleted it" and "Gmail was unreachable for a minute", and
// getting it wrong would hide correct data in bulk.
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { google } = require('googleapis')
const prisma = new PrismaClient()

const argv = process.argv.slice(2)
const APPLY = argv.includes('--apply')
const UNMARK = argv.includes('--unmark')
const daysIdx = argv.indexOf('--days')
const DAYS = daysIdx !== -1 ? parseInt(argv[daysIdx + 1], 10) : null
const mbIdx = argv.indexOf('--mailbox')
const ONLY_MAILBOX = mbIdx !== -1 ? String(argv[mbIdx + 1] || '').toLowerCase() : null

function oauth() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_EMAIL_CALLBACK_URL || 'http://localhost:5000/api/email/gmail/callback')
}

// Gmail says "gone" in a few shapes; everything else must be treated as unknown.
function isDefinitelyGone(err) {
  const code = err?.code || err?.response?.status
  if (code !== 404) return false
  const msg = String(err?.message || '')
  return /not found|requested entity/i.test(msg)
}

;(async () => {
  if (UNMARK) {
    const n = await prisma.activity.count({ where: { gmailDeletedAt: { not: null } } })
    if (!APPLY) {
      console.log(`${n} row(s) are currently marked as deleted-in-Gmail.`)
      console.log('Re-run with --unmark --apply to clear the mark on all of them.')
      return
    }
    const r = await prisma.activity.updateMany({
      where: { gmailDeletedAt: { not: null } }, data: { gmailDeletedAt: null } })
    console.log(`Cleared the mark on ${r.count} row(s) — they are visible again.`)
    return
  }

  console.log(APPLY ? 'MODE: apply — confirmed-gone rows will be MARKED\n'
                    : 'MODE: dry run — nothing will be written\n')

  const accounts = await prisma.emailAccount.findMany({ where: { provider: 'gmail' } })
  const mailboxes = accounts.filter(a => !ONLY_MAILBOX || (a.email || '').toLowerCase() === ONLY_MAILBOX)
  if (!mailboxes.length) { console.log('No matching connected mailbox.'); return }

  let totalChecked = 0, totalGone = 0, totalMarked = 0
  const goneRows = []

  for (const acct of mailboxes) {
    const where = {
      type: 'email',
      mailboxEmail: acct.email,
      messageId: { not: null },
      gmailDeletedAt: null,
      ...(DAYS ? { createdAt: { gte: new Date(Date.now() - DAYS * 86400000) } } : {}),
    }
    const rows = await prisma.activity.findMany({
      where,
      select: { id: true, messageId: true, subject: true, createdAt: true, threadId: true,
        companyId: true, rfcMessageId: true, direction: true },
      orderBy: { createdAt: 'desc' },
    })
    console.log(`${acct.email}: checking ${rows.length} row(s)`)

    const auth = oauth()
    auth.setCredentials({ access_token: acct.accessToken, refresh_token: acct.refreshToken })
    const gmail = google.gmail({ version: 'v1', auth })

    let aborted = false
    for (const r of rows) {
      totalChecked++
      try {
        await gmail.users.messages.get({ userId: 'me', id: r.messageId, format: 'minimal' })
      } catch (err) {
        if (isDefinitelyGone(err)) {
          totalGone++
          goneRows.push({ ...r, mailbox: acct.email })
          continue
        }
        // Anything else: stop this mailbox rather than guess.
        console.log(`  !! ABORTING ${acct.email} — non-404 error on ${r.messageId}: ${err.message}`)
        console.log('     (nothing from this mailbox will be marked in this run)')
        aborted = true
        break
      }
    }
    if (aborted) {
      // Drop anything collected for this mailbox — a partial pass must not
      // produce a partial mark.
      for (let i = goneRows.length - 1; i >= 0; i--) {
        if (goneRows[i].mailbox === acct.email) { goneRows.splice(i, 1); totalGone-- }
      }
    }
  }

  if (goneRows.length) {
    console.log(`\n${'='.repeat(72)}`)
    console.log('CONFIRMED GONE FROM GMAIL — would be hidden (row kept, not deleted)')
    console.log('='.repeat(72))
    for (const g of goneRows) {
      console.log(`  ${g.id}  ${g.createdAt.toISOString()}  [${g.direction}]  ${g.mailbox}`)
      console.log(`    subject : ${g.subject}`)
      console.log(`    gmailId : ${g.messageId}   thread: ${g.threadId}`)
      console.log(`    rfcMsgId: ${g.rfcMessageId || '(none)'}   companyId: ${g.companyId || '(unassigned)'}`)
    }
  }

  if (APPLY && goneRows.length) {
    const res = await prisma.activity.updateMany({
      where: { id: { in: goneRows.map(g => g.id) } },
      data: { gmailDeletedAt: new Date() },
    })
    totalMarked = res.count
  }

  console.log(`\nchecked        : ${totalChecked}`)
  console.log(`confirmed gone : ${totalGone}`)
  console.log(`marked         : ${APPLY ? totalMarked : 0}${APPLY ? '' : '  (dry run — re-run with --apply)'}`)
  console.log('Gmail was only read. No message was deleted from Gmail, and no CRM row was deleted.')
})().catch(e => { console.error('ERROR', e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
