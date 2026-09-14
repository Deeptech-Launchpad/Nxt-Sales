// Reconciles CRM email rows that were created from GMAIL DRAFTS before the
// sync learned to exclude them, and hides them via the project's existing
// soft-hide column (Activity.gmailDeletedAt). Nothing is ever deleted, and
// Gmail is only ever READ.
//
//   node scripts/reconcile-draft-imports.js                      dry run (default)
//   node scripts/reconcile-draft-imports.js --days 30            only rows sent in the last 30 days
//   node scripts/reconcile-draft-imports.js --mailbox a@b.c      limit to one mailbox
//   node scripts/reconcile-draft-imports.js --apply              mark the confirmed rows
//   node scripts/reconcile-draft-imports.js --include-live-drafts  also mark drafts still open in Gmail
//   node scripts/reconcile-draft-imports.js --unmark --marked-at <ISO>   undo exactly one apply run
//
// ── Why a dedicated script, separate from reconcile-gmail-deletions.js ──────
// That script marks anything Gmail answers 404 for. A sent email the user
// genuinely deleted also answers 404, so on its own "404" cannot tell a draft
// import from a deleted send. This script therefore NEVER treats 404 as
// sufficient. A row is only ever marked when it is a same-composition
// predecessor of a REAL sent message that still exists in Gmail — the shape a
// Gmail draft auto-save leaves behind, and nothing else.
//
// ── What a draft import actually looks like ────────────────────────────────
// Gmail saves each auto-save of a half-written message as a real message
// resource: its own message id, its own generated Message-ID header, inside
// the thread it will eventually be sent in. threads.get returns it beside real
// mail. On Send, Gmail DISCARDS that draft message and mints a new one with a
// different Message-ID — so the stored row is orphaned, pointing at an id that
// no longer exists, sitting in the CRM beside the real email as an earlier,
// less-complete copy of it.
//
// ── Evidence required. ALL of these must hold; any one failing rejects. ─────
//  L1  outbound, and the From address is the mailbox that synced it
//      (the user's own composition, not a received message)
//  L2  trackingId IS NULL — a CRM-composer send always carries one, and the
//      composer never creates drafts, so a tracked row can never be a draft
//  L3  a SUCCESSOR exists in the same Gmail thread: outbound, same normalised
//      subject, an overlapping recipient, sent after the candidate
//  L4  the two are minutes apart, not months — one composing session
//      (default 6h ceiling, --gap-hours to change)
//  L5  the candidate's attachments are a strict SUBSET of the successor's —
//      a draft is caught mid-attach, so it can only ever have fewer
//  L6  the candidate's body is a prefix of (or identical to) the successor's —
//      the same text, caught earlier
//  G1  Gmail: the candidate is GONE (a definitive 404), or is still present
//      and carries the DRAFT label — direct proof, no inference needed
//  G2  Gmail: the SUCCESSOR still exists — proof the real email survived and
//      that we are not looking at a pair the user deleted deliberately
//
// L1-L6 are a cheap local pre-filter that alone prove nothing; G1+G2 are what
// actually decide. A row failing any gate is reported with the reason and left
// completely untouched.
//
// ── Safety ─────────────────────────────────────────────────────────────────
// Any Gmail failure that is NOT a definitive 404 — expired token, rate limit,
// network, 5xx — aborts that entire mailbox rather than risk a false positive.
// That is the difference between "this message is gone" and "Gmail was
// unreachable for a moment", and getting it wrong hides correct data in bulk.
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { google } = require('googleapis')
const prisma = new PrismaClient()

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const val = (f, d = null) => { const i = argv.indexOf(f); return i !== -1 ? argv[i + 1] : d }

const APPLY = has('--apply')
const UNMARK = has('--unmark')
const INCLUDE_LIVE = has('--include-live-drafts')
const DAYS = val('--days') ? parseInt(val('--days'), 10) : null
const ONLY_MAILBOX = val('--mailbox') ? String(val('--mailbox')).toLowerCase() : null
const GAP_MS = (parseFloat(val('--gap-hours', '6')) || 6) * 3600 * 1000

// Every row hidden by one --apply run is stamped with the SAME gmailDeletedAt
// timestamp, which the run prints. `--unmark --marked-at <that ISO value>`
// reverses exactly that run and nothing else — so a mark made by
// reconcile-gmail-deletions.js (a different timestamp) can never be disturbed.
// No new column, and no overloading of an existing one: openHistory is read as
// an ARRAY throughout the app, so stashing provenance there would be a type
// violation waiting to bite someone.
const MARKED_AT = val('--marked-at')

const addrsOf = (v) => ((v || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || [])
const normSubject = (s) => (s || '').replace(/^\s*((re|fwd|fw)\s*:\s*)+/i, '').trim().toLowerCase()
const normBody = (s) => (s || '').replace(/\s+/g, ' ').trim()
const fileNames = (a) => (Array.isArray(a) ? a : []).map(x => x && x.filename).filter(Boolean)

function oauthFor(account) {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_EMAIL_CALLBACK_URL || 'http://localhost:5000/api/email/gmail/callback')
  c.setCredentials({ access_token: account.accessToken, refresh_token: account.refreshToken })
  return c
}

// Gmail says "this does not exist" in a few shapes; everything else is unknown
// and must abort rather than be guessed at.
function isDefinitelyGone(err) {
  const code = err?.code || err?.response?.status
  if (code !== 404) return false
  return /not found|requested entity/i.test(String(err?.message || ''))
}

// ── Local evidence (L1-L6) ─────────────────────────────────────────────────
// Returns { candidate, successor, reasons[] } pairs. Proves nothing on its own;
// it only decides which rows are worth asking Gmail about.
async function findLocalCandidates() {
  const where = {
    type: 'email',
    direction: 'outbound',          // L1
    trackingId: null,               // L2
    messageId: { not: null },
    threadId: { not: null },
    gmailDeletedAt: null,           // not already hidden
    ...(DAYS ? { createdAt: { gte: new Date(Date.now() - DAYS * 86400000) } } : {}),
    ...(ONLY_MAILBOX ? { mailboxEmail: ONLY_MAILBOX } : {}),
  }
  const rows = await prisma.activity.findMany({
    where,
    select: {
      id: true, messageId: true, rfcMessageId: true, threadId: true, createdAt: true,
      subject: true, toEmail: true, fromEmail: true, mailboxEmail: true,
      attachments: true, body: true, companyId: true, trackingId: true, openCount: true,
    },
  })

  const byThread = new Map()
  for (const r of rows) {
    if (!byThread.has(r.threadId)) byThread.set(r.threadId, [])
    byThread.get(r.threadId).push(r)
  }

  const pairs = []
  for (const list of byThread.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => a.createdAt - b.createdAt)

    for (let i = 0; i < list.length; i++) {
      const c = list[i]
      // L1 — the From address must be the mailbox this row was synced from.
      if (!c.mailboxEmail || !addrsOf(c.fromEmail).includes(c.mailboxEmail.toLowerCase())) continue

      const cb = normBody(c.body)
      if (!cb) continue
      const probe = cb.slice(0, Math.min(cb.length, 500))
      const ca = fileNames(c.attachments)

      // Every later message that could be the real send this draft became:
      //   L3  same normalised subject, an overlapping recipient
      //   L4  inside the composing window
      //   L5  the candidate's attachments are a strict subset of it
      //   L6  the candidate's body is an earlier prefix of the same text
      const qualifying = list.slice(i + 1).filter(s => {
        if (normSubject(s.subject) !== normSubject(c.subject)) return false
        if (!addrsOf(s.toEmail).some(a => addrsOf(c.toEmail).includes(a))) return false
        if (!(s.createdAt > c.createdAt && (s.createdAt - c.createdAt) <= GAP_MS)) return false
        const sa = fileNames(s.attachments)
        if (!ca.every(f => sa.includes(f))) return false
        if (ca.length > 0 && ca.length >= sa.length) return false
        const sb = normBody(s.body)
        return cb === sb || sb.startsWith(probe)
      })
      if (!qualifying.length) continue

      // Take the LAST qualifying message, not the first.
      //
      // Gmail keeps exactly ONE message out of a composing session — the send —
      // and discards every draft snapshot before it. A long compose therefore
      // leaves a CHAIN in the CRM: draft -> draft -> send. Pairing with the
      // FIRST match walks only one link, so an early snapshot is paired with a
      // later snapshot that is itself gone from Gmail; gate G2 then rejects the
      // pair and that row stays visible forever.
      //
      // Observed in production on the Gunz Dental thread (1a08fdcca503f8b4):
      //   09:50:10  1 attachment   ← rejected, because its "successor" was…
      //   09:52:35  2 attachments  ← …this, also a draft and also gone
      //   10:50:13  4 attachments  ← the real send, still in Gmail
      //
      // Every link now resolves to the send itself, so each candidate is judged
      // against a message that still exists. This cannot loosen the result: the
      // pair still has to clear G1 and G2 against Gmail, and a candidate whose
      // real counterpart is genuinely absent is still rejected.
      const successor = qualifying[qualifying.length - 1]
      const sa = fileNames(successor.attachments)

      pairs.push({
        candidate: c,
        successor,
        gapSeconds: Math.round((successor.createdAt - c.createdAt) / 1000),
        candidateAttachments: ca,
        successorAttachments: sa,
      })
    }
  }
  return pairs
}

async function run() {
  if (UNMARK) {
    if (!MARKED_AT) {
      console.log('--unmark needs --marked-at <ISO timestamp>, the value printed by the --apply run.')
      console.log('It is required on purpose: without it this would also clear marks made by')
      console.log('reconcile-gmail-deletions.js, which are a different thing entirely.')
      return
    }
    const at = new Date(MARKED_AT)
    if (isNaN(at.getTime())) { console.log(`--marked-at "${MARKED_AT}" is not a valid timestamp.`); return }
    const mine = await prisma.activity.findMany({
      where: { gmailDeletedAt: at },
      select: { id: true, subject: true, createdAt: true, messageId: true },
    })
    if (!APPLY) {
      console.log(`${mine.length} row(s) were hidden at ${at.toISOString()}:`)
      for (const r of mine) console.log(`  ${r.id}  ${r.createdAt.toISOString()}  ${r.subject}`)
      console.log('\nRe-run with --unmark --marked-at <ISO> --apply to make them visible again.')
      return
    }
    const res = await prisma.activity.updateMany({
      where: { gmailDeletedAt: at }, data: { gmailDeletedAt: null },
    })
    console.log(`Cleared the mark on ${res.count} row(s) — they are visible again.`)
    return
  }

  console.log(APPLY ? 'MODE: apply — confirmed draft imports will be HIDDEN (never deleted)\n'
                    : 'MODE: dry run — nothing will be written\n')
  console.log(`window        : ${DAYS ? `last ${DAYS} day(s)` : 'all time'}`)
  console.log(`mailbox filter: ${ONLY_MAILBOX || '(all connected)'}`)
  console.log(`gap ceiling   : ${GAP_MS / 3600000}h\n`)

  const pairs = await findLocalCandidates()
  console.log(`Local evidence (L1-L6) selected ${pairs.length} candidate pair(s).`)
  console.log('These are NOT yet considered drafts — Gmail decides.\n')
  if (!pairs.length) { console.log('Nothing to check.'); return }

  const accounts = await prisma.emailAccount.findMany({ where: { provider: 'gmail' } })
  const byMailbox = new Map()
  for (const p of pairs) {
    const mb = (p.candidate.mailboxEmail || '').toLowerCase()
    if (!byMailbox.has(mb)) byMailbox.set(mb, [])
    byMailbox.get(mb).push(p)
  }

  const confirmed = []     // gone from Gmail, successor alive  → safe to hide
  const liveDrafts = []    // still open in Gmail with DRAFT label → direct proof
  const rejected = []      // Gmail says otherwise
  const unchecked = []     // mailbox aborted; deliberately left alone

  for (const [mb, list] of byMailbox) {
    const account = accounts.find(a => (a.email || '').toLowerCase() === mb)
    if (!account) {
      console.log(`${mb}: NOT CONNECTED — ${list.length} candidate(s) cannot be verified, skipping.`)
      unchecked.push(...list.map(p => ({ ...p, why: 'mailbox not connected' })))
      continue
    }
    const gmail = google.gmail({ version: 'v1', auth: oauthFor(account) })
    console.log(`${mb}: verifying ${list.length} candidate(s) against Gmail…`)

    let aborted = null
    for (const p of list) {
      try {
        // G1 — is the candidate gone, or still present as a DRAFT?
        let g1 = null
        try {
          const got = await gmail.users.messages.get({
            userId: 'me', id: p.candidate.messageId, format: 'minimal',
          })
          const labels = got.data.labelIds || []
          if (labels.includes('DRAFT')) g1 = 'live-draft'          // direct proof
          else { rejected.push({ ...p, why: `still in Gmail with labels [${labels.join(', ')}] — a real message, not a draft` }); continue }
        } catch (err) {
          if (isDefinitelyGone(err)) g1 = 'gone'
          else throw err
        }

        // G2 — the real send must still exist. If it does not, this is not the
        // "draft superseded by a real email" shape and we must not touch it.
        try {
          await gmail.users.messages.get({
            userId: 'me', id: p.successor.messageId, format: 'minimal',
          })
        } catch (err) {
          if (isDefinitelyGone(err)) {
            rejected.push({ ...p, why: 'the successor is ALSO gone from Gmail — not a draft/send pair, left untouched' })
            continue
          }
          throw err
        }

        if (g1 === 'live-draft') liveDrafts.push({ ...p, why: 'still open in Gmail and carries the DRAFT label' })
        else confirmed.push({ ...p, why: 'gone from Gmail, while the real send it became is still there' })
      } catch (err) {
        aborted = err.message
        break
      }
    }

    if (aborted) {
      console.log(`  !! ABORTING ${mb} — non-404 Gmail error: ${aborted}`)
      console.log('     Nothing from this mailbox will be marked in this run.')
      for (const arr of [confirmed, liveDrafts, rejected]) {
        for (let i = arr.length - 1; i >= 0; i--) {
          if ((arr[i].candidate.mailboxEmail || '').toLowerCase() === mb) arr.splice(i, 1)
        }
      }
      unchecked.push(...list.map(p => ({ ...p, why: `mailbox aborted: ${aborted}` })))
    }
  }

  const show = (title, arr) => {
    if (!arr.length) return
    console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`)
    for (const p of arr) {
      const c = p.candidate, s = p.successor
      console.log(`\n  row ${c.id}`)
      console.log(`    subject   : ${c.subject}`)
      console.log(`    to        : ${c.toEmail}`)
      console.log(`    mailbox   : ${c.mailboxEmail}    company: ${c.companyId || '(unassigned)'}`)
      console.log(`    DRAFT  ->  gmailId ${c.messageId}  sent-header ${c.createdAt.toISOString()}`)
      console.log(`               attachments(${p.candidateAttachments.length}) ${JSON.stringify(p.candidateAttachments)}`)
      console.log(`               rfcMessageId ${c.rfcMessageId || '(none)'}`)
      console.log(`    REAL   ->  gmailId ${s.messageId}  sent-header ${s.createdAt.toISOString()}`)
      console.log(`               attachments(${p.successorAttachments.length}) ${JSON.stringify(p.successorAttachments)}`)
      console.log(`               rfcMessageId ${s.rfcMessageId || '(none)'}`)
      console.log(`    evidence  : same thread ${c.threadId}, ${p.gapSeconds}s apart, same subject + recipient`)
      console.log(`                attachments are a strict subset; body is an earlier prefix of the same text`)
      console.log(`                no trackingId (not a CRM-composer send)`)
      console.log(`    gmail     : ${p.why}`)
      if (c.openCount) console.log(`    NOTE      : openCount=${c.openCount} on this row — review before applying`)
    }
  }

  show('CONFIRMED DRAFT IMPORTS — would be hidden (row kept, never deleted)', confirmed)
  show(`DRAFTS STILL OPEN IN GMAIL — ${INCLUDE_LIVE ? 'would be hidden (--include-live-drafts)' : 'NOT hidden without --include-live-drafts'}`, liveDrafts)
  show('REJECTED BY GMAIL — left completely untouched', rejected)
  show('UNVERIFIED — left completely untouched', unchecked)

  const toMark = INCLUDE_LIVE ? [...confirmed, ...liveDrafts] : confirmed

  let markedAt = null
  if (APPLY && toMark.length) {
    markedAt = new Date()
    // One shared timestamp for the whole run — that is what makes this run
    // individually reversible via --unmark --marked-at.
    const res = await prisma.activity.updateMany({
      where: { id: { in: toMark.map(p => p.candidate.id) } },
      data: { gmailDeletedAt: markedAt },
    })
    console.log(`\nHidden ${res.count} row(s) at ${markedAt.toISOString()}.`)
    console.log('To undo exactly this run:')
    console.log(`  node scripts/reconcile-draft-imports.js --unmark --marked-at ${markedAt.toISOString()} --apply`)
  }

  console.log(`\n${'-'.repeat(78)}`)
  console.log(`local candidates    : ${pairs.length}`)
  console.log(`confirmed (gone)    : ${confirmed.length}`)
  console.log(`live drafts         : ${liveDrafts.length}${INCLUDE_LIVE ? ' (included)' : ' (excluded — pass --include-live-drafts to hide these too)'}`)
  console.log(`rejected by Gmail   : ${rejected.length}`)
  console.log(`unverified          : ${unchecked.length}`)
  console.log(`would hide          : ${toMark.length}${APPLY ? '  (APPLIED)' : '  (dry run — re-run with --apply)'}`)
  console.log('Gmail was only read. No message was deleted from Gmail, and no CRM row was deleted.')
}

run()
  .catch(e => { console.error('ERROR', e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
