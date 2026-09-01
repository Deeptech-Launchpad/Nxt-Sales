// READ-ONLY Gmail ↔ CRM integrity diagnostic.
//
// Proves what is actually in Gmail versus what the CRM stored, per client
// address. Nothing is written, updated or deleted — Gmail is only read
// (messages.list / threads.get / messages.get), and the database is only
// queried. Safe to run on production at any time.
//
//   node scripts/diagnose-email-integrity.js info@adelab.com.au
//   node scripts/diagnose-email-integrity.js info@adelab.com.au datamanager@tractamotors.ie
//   node scripts/diagnose-email-integrity.js --company "Ade Lab Scientific"
//
// For every client address it reports, per Gmail thread:
//   • every real Gmail message (id, RFC Message-ID, internalDate, Date header)
//   • the CRM Activity holding it, or MISSING
//   • CRM rows with no matching Gmail message (EXTRA)
//   • date drift between Gmail's internalDate and CRM createdAt
//   • duplicate RFC Message-IDs
//   • which mailbox, thread, company and matched address each row carries
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { google } = require('googleapis')
const prisma = new PrismaClient()

const args = process.argv.slice(2)
const companyFlagIdx = args.indexOf('--company')
const companyName = companyFlagIdx !== -1 ? args[companyFlagIdx + 1] : null
const addresses = args.filter((a, i) =>
  a.includes('@') && i !== companyFlagIdx && i !== companyFlagIdx + 1).map(a => a.toLowerCase())

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_EMAIL_CALLBACK_URL || 'http://localhost:5000/api/email/gmail/callback'
  )
}

const RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const addrs = (v) => (String(v || '').match(RE) || []).map(a => a.toLowerCase())
const hdr = (m, name) => (m.payload?.headers || [])
  .find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

// Walks the MIME tree counting real attachments (parts with a filename).
function countAttachments(payload) {
  let n = 0
  const walk = (p) => {
    if (!p) return
    if (p.filename && p.filename.length > 0 && p.body?.attachmentId) n++
    ;(p.parts || []).forEach(walk)
  }
  walk(payload)
  return n
}

;(async () => {
  let targets = addresses
  if (companyName) {
    const co = await prisma.company.findFirst({
      where: { name: { contains: companyName, mode: 'insensitive' }, deletedAt: null },
      select: { id: true, name: true, email: true, emails: true },
    })
    if (!co) { console.log('Company not found:', companyName); process.exit(0) }
    console.log(`Company: ${co.name} (${co.id})`)
    targets = [...new Set([co.email, ...(Array.isArray(co.emails) ? co.emails : [])]
      .filter(v => typeof v === 'string' && v.trim()).map(v => v.trim().toLowerCase()))]
    console.log('Saved addresses:', targets.join(', ') || '(none)')
  }
  if (!targets.length) {
    console.log('Usage: node scripts/diagnose-email-integrity.js <client-email> [more...] | --company "Name"')
    process.exit(0)
  }

  const accounts = await prisma.emailAccount.findMany({ where: { provider: 'gmail' } })
  console.log(`\nConnected mailboxes: ${accounts.map(a => a.email).join(', ')}\n`)

  for (const target of targets) {
    console.log('#'.repeat(78))
    console.log('CLIENT ADDRESS:', target)
    console.log('#'.repeat(78))

    // ── Gmail side: every message involving this address, across every mailbox
    const gmailMsgs = new Map()   // rfcMessageId -> {..., seenIn: [mailbox]}
    const gmailByThread = new Map()
    for (const acct of accounts) {
      const auth = oauthClient()
      auth.setCredentials({ access_token: acct.accessToken, refresh_token: acct.refreshToken })
      const gmail = google.gmail({ version: 'v1', auth })
      let list = []
      try {
        const q = `{to:${target} from:${target} cc:${target} bcc:${target}}`
        let pageToken
        for (let p = 0; p < 10; p++) {
          const r = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken })
          list.push(...(r.data.messages || []))
          pageToken = r.data.nextPageToken
          if (!pageToken) break
        }
      } catch (e) {
        console.log(`  !! ${acct.email}: Gmail read FAILED — ${e.message}`)
        continue
      }
      for (const ref of list) {
        let m
        try { m = (await gmail.users.messages.get({ userId: 'me', id: ref.id, format: 'full' })).data }
        catch (e) { console.log(`  !! ${acct.email}: fetch ${ref.id} failed — ${e.message}`); continue }
        const rfc = hdr(m, 'Message-ID') || hdr(m, 'Message-Id') || null
        const rec = {
          rfc,
          gmailIdsByMailbox: { [acct.email]: m.id },
          threadIdsByMailbox: { [acct.email]: m.threadId },
          internalDate: new Date(Number(m.internalDate)),
          dateHeader: hdr(m, 'Date'),
          subject: hdr(m, 'Subject'),
          from: hdr(m, 'From'), to: hdr(m, 'To'), cc: hdr(m, 'Cc'),
          attachments: countAttachments(m.payload),
          seenIn: [acct.email],
        }
        const key = rfc || `NO_RFC:${acct.email}:${m.id}`
        if (gmailMsgs.has(key)) {
          const prev = gmailMsgs.get(key)
          prev.seenIn.push(acct.email)
          prev.gmailIdsByMailbox[acct.email] = m.id
          prev.threadIdsByMailbox[acct.email] = m.threadId
          prev.attachments = Math.max(prev.attachments, rec.attachments)
        } else {
          gmailMsgs.set(key, rec)
        }
        const tk = m.threadId
        if (!gmailByThread.has(tk)) gmailByThread.set(tk, [])
        gmailByThread.get(tk).push(key)
      }
    }

    // ── CRM side: every Activity involving this address
    const crmRows = await prisma.activity.findMany({
      where: {
        type: 'email',
        OR: [
          { toEmail:   { contains: target, mode: 'insensitive' } },
          { fromEmail: { contains: target, mode: 'insensitive' } },
          { ccEmail:   { contains: target, mode: 'insensitive' } },
          { bccEmail:  { contains: target, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, threadId: true, messageId: true, rfcMessageId: true, subject: true,
        direction: true, fromEmail: true, toEmail: true, ccEmail: true, createdAt: true,
        companyId: true, matchedCompanyEmail: true, matchBasis: true, mailboxEmail: true,
        trackingId: true, attachments: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    const crmByRfc = new Map()
    for (const r of crmRows) {
      if (!r.rfcMessageId) continue
      if (!crmByRfc.has(r.rfcMessageId)) crmByRfc.set(r.rfcMessageId, [])
      crmByRfc.get(r.rfcMessageId).push(r)
    }

    console.log(`\nGMAIL: ${gmailMsgs.size} distinct real message(s)`)
    console.log(`CRM  : ${crmRows.length} Activity row(s)\n`)

    // ── Per Gmail message: is it in the CRM exactly once, and is the date right?
    let missing = 0, dup = 0, drift = 0
    for (const [key, g] of gmailMsgs) {
      const matches = g.rfc ? (crmByRfc.get(g.rfc) || []) : []
      const tag = matches.length === 0 ? 'MISSING from CRM'
        : matches.length > 1 ? `DUPLICATED in CRM x${matches.length}` : 'ok'
      if (matches.length === 0) missing++
      if (matches.length > 1) dup++
      console.log('---')
      console.log(`  [${tag}] ${g.subject || '(no subject)'}`)
      console.log(`    Gmail internalDate : ${g.internalDate.toISOString()}   <-- what Gmail SHOWS`)
      console.log(`    Date header        : ${g.dateHeader}`)
      console.log(`    Message-ID         : ${g.rfc || '(none!)'}`)
      console.log(`    per-mailbox ids    : ${JSON.stringify(g.gmailIdsByMailbox)}`)
      console.log(`    per-mailbox threads: ${JSON.stringify(g.threadIdsByMailbox)}`)
      console.log(`    from/to            : ${g.from}  ->  ${g.to}${g.cc ? '  cc: ' + g.cc : ''}`)
      console.log(`    attachments        : ${g.attachments}`)
      for (const r of matches) {
        const crmAtt = Array.isArray(r.attachments) ? r.attachments.length : 0
        const deltaMs = r.createdAt.getTime() - g.internalDate.getTime()
        const off = Math.abs(deltaMs) > 60_000
        if (off) drift++
        console.log(`    CRM row ${r.id}`)
        console.log(`      createdAt   : ${r.createdAt.toISOString()}  ${off ? `*** DATE DRIFT ${Math.round(deltaMs / 60000)} min ***` : '(matches)'}`)
        console.log(`      threadId    : ${r.threadId}   messageId: ${r.messageId}`)
        console.log(`      mailbox     : ${r.mailboxEmail}   direction: ${r.direction}`)
        console.log(`      companyId   : ${r.companyId}   matchedAs: ${r.matchedCompanyEmail}   basis: ${r.matchBasis}`)
        console.log(`      attachments : ${crmAtt}${crmAtt !== g.attachments ? `  *** Gmail has ${g.attachments} ***` : ''}`)
        console.log(`      trackingId  : ${r.trackingId || '(none)'}`)
      }
    }

    // ── CRM rows Gmail does not have (extra / wrongly-mapped)
    const gmailRfcs = new Set([...gmailMsgs.values()].map(g => g.rfc).filter(Boolean))
    const extras = crmRows.filter(r => !r.rfcMessageId || !gmailRfcs.has(r.rfcMessageId))
    if (extras.length) {
      console.log(`\n!! ${extras.length} CRM row(s) with NO matching Gmail message for this address:`)
      for (const r of extras) {
        console.log(`  - ${r.id}  "${r.subject}"`)
        console.log(`      rfcMessageId: ${r.rfcMessageId || 'NULL  <-- invisible to dedupe'}`)
        console.log(`      createdAt: ${r.createdAt.toISOString()}  thread: ${r.threadId}  mailbox: ${r.mailboxEmail}`)
        console.log(`      from: ${r.fromEmail}  to: ${r.toEmail}`)
        console.log(`      companyId: ${r.companyId}  matchedAs: ${r.matchedCompanyEmail}  basis: ${r.matchBasis}`)
      }
    }

    console.log(`\nSUMMARY for ${target}:`)
    console.log(`  Gmail real messages      : ${gmailMsgs.size}`)
    console.log(`  CRM activity rows        : ${crmRows.length}`)
    console.log(`  missing from CRM         : ${missing}`)
    console.log(`  duplicated in CRM        : ${dup}`)
    console.log(`  rows with date drift >1m : ${drift}`)
    console.log(`  CRM rows not in Gmail    : ${extras.length}`)
    console.log(`  CRM rows with NULL rfcId : ${crmRows.filter(r => !r.rfcMessageId).length}`)
    console.log(`  matched by DOMAIN (not exact address): ${crmRows.filter(r => r.matchBasis === 'domain').length}`)
    console.log('')
  }

  await prisma.$disconnect()
})().catch(async e => { console.error('ERROR', e); await prisma.$disconnect(); process.exit(1) })
