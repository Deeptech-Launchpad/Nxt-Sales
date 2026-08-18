const router = require('express').Router()
const auth = require('../middleware/authMiddleware')
const crypto = require('crypto')
const { PrismaClient, Prisma } = require('@prisma/client')
const prisma = new PrismaClient()

// ── Email open tracking ──────────────────────────────────────────────────────
// Public base the recipient's mail client can reach. In production this is the
// app domain (nginx proxies /api to the backend); in dev it falls back to Vite.
const TRACK_BASE = process.env.PUBLIC_URL || process.env.CLIENT_URL || 'http://localhost:3000'

// 1x1 transparent GIF returned by the tracking pixel.
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

// Hidden tracking pixel appended to outbound HTML. Loading it (when the
// recipient opens the email) hits /track/open/:token and records the open.
function trackingPixel(token) {
  return `<img src="${TRACK_BASE}/api/email/track/open/${token}.gif" width="1" height="1" alt="" style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden" />`
}

// ── Outgoing signature: sourced from the connected Gmail account itself ────
// The signature source of truth is Gmail's own "sendAs" configuration (Gmail
// → Settings → Accounts → signature), NOT anything stored in our own DB — so
// there is exactly one place a user edits their signature, and the CRM can
// never drift out of sync with it. `users.settings.sendAs.list` is covered by
// the gmail.readonly scope this app already requests (confirmed against
// Google's own API discovery document — sendAs.list accepts any of
// gmail.settings.basic / gmail.modify / gmail.readonly / mail.google.com),
// so no new OAuth consent is needed from already-connected users.
// Never throws: any failure (API error, no sendAs entry, empty signature)
// resolves to null — the caller then sends without a signature rather than
// inventing one, exactly like a Gmail account with no signature configured.
// fromEmail is the address this message is actually being sent from (the
// connected EmailAccount's own address) — an account can have several sendAs
// identities/aliases, and Gmail's own "isDefault" flag marks whichever one is
// pre-selected in Gmail's OWN compose window, which is NOT necessarily the
// identity we're sending as here. Confirmed live in production: an account
// with two sendAs entries had its real, connected address at isDefault:false
// and a different alias at isDefault:true — matching by isDefault alone
// picked that unrelated alias's signature instead of the sending address's
// own. Match on the actual From address first; isDefault/isPrimary/first are
// only a fallback for the (should never happen) case where sendAs.list()
// doesn't include our own connected address at all.
async function getGmailSignature(gmail, fromEmail) {
  try {
    const res = await gmail.users.settings.sendAs.list({ userId: 'me' })
    const sendAsList = res.data.sendAs || []
    const from = (fromEmail || '').toLowerCase()
    const chosen = sendAsList.find(s => (s.sendAsEmail || '').toLowerCase() === from)
      || sendAsList.find(s => s.isDefault) || sendAsList.find(s => s.isPrimary) || sendAsList[0]
    const sig = (chosen?.signature || '').trim()
    return sig || null
  } catch (err) {
    console.warn('[Email Send] Gmail signature lookup failed, sending without one:', err.message)
    return null
  }
}

// Gmail's own web client always wraps a signature in a div carrying this
// exact class — matching it (rather than inventing our own wrapper) is what
// keeps Gmail's thread-view quote-folding from ever mistaking the signature
// for quoted history, and matches a native Gmail signature byte-for-byte in
// how the recipient's client renders/recognizes it.
function wrapGmailSignature(html) {
  return `<div class="gmail_signature" data-smartmail="gmail_signature">${html}</div>`
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// Recursively extract plain-text body from nested MIME parts.
// Gmail wraps text/plain inside multipart/alternative inside multipart/mixed,
// so a flat .parts.find() misses it on most real emails.
function extractTextBody(payload) {
  if (!payload) return ''
  // Inline body (simple messages with no parts)
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8').slice(0, 3000)
  }
  if (!payload.parts) return ''
  // Prefer text/plain at this level
  for (const part of payload.parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8').slice(0, 3000)
    }
  }
  // Recurse into any multipart container (multipart/alternative, multipart/mixed, etc.)
  for (const part of payload.parts) {
    if (part.mimeType?.startsWith('multipart/')) {
      const text = extractTextBody(part)
      if (text) return text
    }
  }
  // Last resort: strip HTML tags from text/html
  for (const part of payload.parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      const html = Buffer.from(part.body.data, 'base64').toString('utf-8')
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000)
    }
  }
  return ''
}

function getOAuth2Client() {
  const { google } = require('googleapis')
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_EMAIL_CALLBACK_URL || 'http://localhost:5000/api/email/gmail/callback'
  )
}

// Minimal scope set — request only what the app actually calls, to keep the
// Google verification footprint as small as possible:
//   gmail.send      (sensitive)  → used by messages.send
//   gmail.readonly  (restricted) → used by messages.list / threads.get / getProfile (email sync)
//   calendar.events (sensitive)  → used for meeting scheduling
// gmail.modify was previously requested but is never used, so it is removed —
// it is a restricted scope that would have widened the security assessment.
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'email',
  'profile',
]

// GET /api/email/status — check if current user has Gmail connected
// Does NOT return 401 — instead returns { connected: false } for invalid/missing tokens
// so the email modal shows "connect Gmail" instead of redirecting to login.
router.get('/status', async (req, res) => {
  try {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return res.json({ connected: false, email: null })
    }
    const jwt = require('jsonwebtoken')
    let userId
    try {
      const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET || 'dev-secret')
      userId = decoded.id
    } catch {
      return res.json({ connected: false, email: null })
    }
    const account = await prisma.emailAccount.findFirst({
      where: { userId, provider: 'gmail' },
    })
    res.json({ connected: !!account, email: account?.email || null })
  } catch (err) {
    res.json({ connected: false, email: null })
  }
})

// GET /api/email/gmail/auth-url — get OAuth URL (requires JWT auth)
router.get('/gmail/auth-url', auth, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({
      message: 'Google credentials not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env',
    })
  }
  try {
    const oauth2Client = getOAuth2Client()
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GMAIL_SCOPES,
      state: req.user.id,
      prompt: 'consent',
    })
    res.json({ url })
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate auth URL.' })
  }
})

// GET /api/email/gmail/callback — OAuth callback from Google
router.get('/gmail/callback', async (req, res) => {
  const { code, state: userId, error } = req.query
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000'

  if (error || !code || !userId) {
    return res.send(popupHtml('error', clientUrl))
  }

  try {
    const { google } = require('googleapis')
    const oauth2Client = getOAuth2Client()
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    // Get user email from Gmail profile
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const email = profile.data.emailAddress

    await prisma.emailAccount.upsert({
      where: { userId_provider: { userId, provider: 'gmail' } },
      create: {
        userId,
        provider: 'gmail',
        email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      update: {
        email,
        accessToken: tokens.access_token,
        ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    })

    res.send(popupHtml('success', clientUrl))
  } catch (err) {
    console.error('Gmail OAuth callback error:', err.message)
    res.send(popupHtml('error', clientUrl))
  }
})

function popupHtml(status, clientUrl) {
  return `<!DOCTYPE html>
<html>
<head><title>Gmail ${status === 'success' ? 'Connected' : 'Error'}</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;background:#f8fafc;">
  <div style="font-size:48px">${status === 'success' ? '✅' : '❌'}</div>
  <h2 style="margin:0;color:#0f172a">${status === 'success' ? 'Gmail Connected!' : 'Connection Failed'}</h2>
  <p style="color:#64748b;margin:0">${status === 'success' ? 'You can now send and sync emails from your CRM.' : 'Please try again or check your Google credentials.'}</p>
  <script>
    if (window.opener) {
      window.opener.postMessage('gmail_${status}', '${clientUrl}');
      setTimeout(() => window.close(), 1500);
    }
  </script>
</body>
</html>`
}

// ── helper: build a proper RFC 2822 MIME message ─────────
// inReplyTo / references (RFC 2822 Message-ID header values) are set only when
// continuing an existing Gmail thread; when null the message behaves as before.
// Returns the raw message as a Buffer (NOT base64url-encoded). This lets the
// caller pick the most efficient transport: Gmail's multipart media upload
// (used for attachment emails, see /send) takes these raw bytes directly, while
// the plain JSON `raw` field path (no-attachment emails — unchanged) base64url-
// encodes it once at the call site. Either way the message content is byte-for-
// byte identical; only how it's handed to the Gmail API differs.
function buildRawEmail({ from, to, cc, bcc, subject, htmlBody, attachments = [], inReplyTo = null, references = null }) {
  const boundary = `nxts_${Date.now()}`
  const encSubject = `=?UTF-8?B?${Buffer.from(subject || '').toString('base64')}?=`

  const headers = [
    'MIME-Version: 1.0',
    `From: ${from}`,
    `To: ${to}`,
    cc  ? `Cc: ${cc}`   : null,
    bcc ? `Bcc: ${bcc}` : null,
    inReplyTo  ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}`  : null,
    `Subject: ${encSubject}`,
  ].filter(Boolean)

  let body
  if (attachments.length > 0) {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)

    const htmlPart = [
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(htmlBody || '').toString('base64'),
    ].join('\r\n')

    const attParts = attachments.map(att => [
      `--${boundary}`,
      `Content-Type: ${att.mimeType || 'application/octet-stream'}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      att.content,
    ].join('\r\n'))

    body = [htmlPart, ...attParts, `--${boundary}--`].join('\r\n')
  } else {
    headers.push('Content-Type: text/html; charset=utf-8')
    headers.push('Content-Transfer-Encoding: base64')
    body = Buffer.from(htmlBody || '').toString('base64')
  }

  return Buffer.from([...headers, '', body].join('\r\n'))
}

// GET /api/email/track/open/:token — email open tracking pixel.
// PUBLIC (no auth) — it is loaded by the recipient's mail client. Records the
// open against the matching activity, then always returns a 1x1 transparent GIF.
// Recording is best-effort and never blocks or errors the image response.
router.get('/track/open/:token', async (req, res) => {
  const token = String(req.params.token || '').replace(/\.(gif|png)$/i, '')
  try {
    const activity = await prisma.activity.findFirst({ where: { trackingId: token } })
    if (activity) {
      const now     = new Date()
      const history = Array.isArray(activity.openHistory) ? activity.openHistory : []
      history.push({
        at: now.toISOString(),
        ip: (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim() || null,
        ua: (req.headers['user-agent'] || '').toString().slice(0, 200) || null,
      })
      await prisma.activity.update({
        where: { id: activity.id },
        data: {
          openCount:     (activity.openCount || 0) + 1,
          firstOpenedAt: activity.firstOpenedAt || now,
          lastOpenedAt:  now,
          openHistory:   history.slice(-50),
          // reflect the open in the email status (keeps existing 'opened' badge)
          ...(activity.direction === 'outbound' && { emailStatus: 'opened' }),
        },
      })
    }
  } catch (err) {
    console.error('[Email Track] open record error:', err.message)
  }

  // Never cache — so re-opens can register (subject to the mail client's own proxy)
  res.set('Content-Type', 'image/gif')
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.set('Pragma', 'no-cache')
  res.set('Expires', '0')
  res.end(PIXEL_GIF)
})

// Shared helper: fetch a Gmail thread's latest message headers so a reply can
// continue it. Used by both the legacy companyId auto-thread path and the
// new Email Mode "continue" lookup. Never throws — falls back to
// threadId-only continuation if the thread's headers can't be read.
async function resolveThreadMeta(gmail, threadId) {
  try {
    const threadRes = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'Subject', 'References'],
    })
    const tMsgs   = threadRes.data.messages || []
    const lastMsg = tMsgs[tMsgs.length - 1]
    const h       = lastMsg?.payload?.headers || []
    const getH    = (n) => h.find(x => x.name.toLowerCase() === n)?.value
    const msgId   = getH('message-id')
    const subjHdr = getH('subject')
    const refsHdr = getH('references')
    return {
      subject:    subjHdr || null,
      inReplyTo:  msgId || null,
      references: msgId ? (refsHdr ? `${refsHdr} ${msgId}` : msgId) : null,
    }
  } catch (metaErr) {
    console.warn('[Email Send] Thread metadata unavailable, threading by id only:', metaErr.message)
    return { subject: null, inReplyTo: null, references: null }
  }
}

// POST /api/email/send — send email via Gmail API. THE single send pipeline —
// every CRM-originated outgoing email (new, reply, reply-all, forward) goes
// through this one route, so signature insertion, threading, HTML body
// construction, and the actual Gmail call are never duplicated elsewhere.
// Accepts: to, subject, body (plain) OR htmlBody (html), cc, bcc,
//          attachments: [{ filename, content (base64), mimeType }]
//          companyId
//          emailMode: 'new' | 'continue' (optional) — see Thread continuation below
//          threadId (optional) — explicit thread to continue, see below
//          quotedHtml (optional) — prior/forwarded message HTML, placed AFTER
//            the signature (composer-built, see ThreadDrawer.jsx's reply/
//            reply-all/forward actions)
//          standaloneAccessToken (optional) — see account resolution below
router.post('/send', auth, async (req, res) => {
  const {
    to, subject, body, htmlBody, cc, bcc, attachments = [], companyId, emailMode,
    threadId: explicitThreadId, quotedHtml, standaloneAccessToken,
  } = req.body
  if (!to || !subject) return res.status(400).json({ message: 'To and Subject are required.' })

  // Never trust the frontend on this — a bin'd company should reject writes
  // (Activity creation) even if a stale UI surface still has its id in hand.
  let sendCompany = null
  if (companyId) {
    sendCompany = await prisma.company.findUnique({ where: { id: companyId } })
    if (!sendCompany || sendCompany.deletedAt) {
      return res.status(400).json({ message: 'This company has been moved to the Recycle Bin. Please restore it before sending or syncing emails.' })
    }
  }

  // Which of the company's saved addresses this email is going to — recorded
  // now so the sent message appears under the right address group instantly,
  // instead of waiting for the next sync to classify it.
  const sendRecipients = [...extractAddresses(to), ...extractAddresses(cc || '')]
  const sendOwn = await ownAddressSet(req.user.id)
  const sendMatchedAddress = companyAddressList(sendCompany, sendOwn).find(a => sendRecipients.includes(a)) || null

  const account = await prisma.emailAccount.findFirst({
    where: { userId: req.user.id, provider: 'gmail' },
  })
  if (!account && !standaloneAccessToken) {
    return res.status(400).json({ message: 'Gmail not connected. Please connect your Gmail account first.' })
  }

  try {
    const { google } = require('googleapis')

    // Two ways to authorize this send, resolved to the same `gmail` client and
    // `fromEmail` so every line below is identical either way — this is what
    // makes it ONE pipeline instead of a second, divergent client-side send:
    //   1. The backend-linked Gmail account (EmailAccount row) — preferred,
    //      supports refresh-token renewal, persisted here.
    //   2. A legacy standalone-OAuth access token (the separate "Google
    //      Client ID" flow in Settings — a short-lived, client-side-only
    //      implicit grant with no refresh token to persist). Used only when
    //      no backend-linked account exists for this user.
    let gmail, fromEmail
    if (account) {
      const oauth2Client = getOAuth2Client()
      oauth2Client.setCredentials({
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
      })
      oauth2Client.on('tokens', async (tokens) => {
        if (tokens.access_token) {
          await prisma.emailAccount.update({
            where: { userId_provider: { userId: req.user.id, provider: 'gmail' } },
            data: {
              accessToken: tokens.access_token,
              ...(tokens.expiry_date && { expiresAt: new Date(tokens.expiry_date) }),
            },
          })
        }
      })
      gmail = google.gmail({ version: 'v1', auth: oauth2Client })
      fromEmail = account.email
    } else {
      const standaloneClient = new google.auth.OAuth2()
      standaloneClient.setCredentials({ access_token: standaloneAccessToken })
      gmail = google.gmail({ version: 'v1', auth: standaloneClient })
      try {
        const profile = await gmail.users.getProfile({ userId: 'me' })
        fromEmail = profile.data.emailAddress
      } catch (profileErr) {
        return res.status(401).json({ message: 'Standalone Gmail session expired. Please reconnect Gmail in Settings.' })
      }
    }

    // Use htmlBody if provided; otherwise convert plain body to a simple HTML wrapper
    const baseHtml = htmlBody
      || (body ? `<div style="font-family:sans-serif;line-height:1.6">${body.replace(/\n/g, '<br>')}</div>` : '')

    // Signature — the connected Gmail account's own sendAs signature (see
    // getGmailSignature above), appended automatically to every send through
    // this route regardless of which UI surface sent the request (Email
    // Tool, Contact/Company "Log an email", Reply/Reply All/Forward). Never
    // blocks a send if the lookup fails. Skipped if the composed body
    // already contains the same signature text (compared on stripped text,
    // since Gmail signatures are rich HTML where an exact markup substring
    // match would be unreliable) — guards against a future manual "insert
    // signature" affordance ever doubling it up; no current composer path
    // inserts it into the editable body itself.
    let signatureHtml = ''
    const gmailSig = await getGmailSignature(gmail, fromEmail)
    if (gmailSig) {
      const sigPlain = stripHtml(gmailSig)
      const alreadyPresent = sigPlain.length > 10 && stripHtml(baseHtml).includes(sigPlain)
      if (!alreadyPresent) signatureHtml = `<br>${wrapGmailSignature(gmailSig)}`
    }

    // Open-tracking: unique token embedded as a hidden pixel; when the recipient
    // opens the email the pixel loads and /track/open records it against this id.
    const trackingId  = crypto.randomUUID()
    // Quoted/forwarded content (built client-side by ThreadDrawer.jsx's
    // Reply/Reply All/Forward actions) is placed AFTER the signature, matching
    // standard reply layout: [content] [signature] [quoted original].
    const effectiveHtml = `${baseHtml}${signatureHtml}${quotedHtml || ''}${trackingPixel(trackingId)}`

    // ── Thread continuation ─────────────────────────────────
    // Four ways this resolves, in priority order:
    //   0. explicit threadId        → the caller already knows exactly which
    //      thread this continues (a genuine in-app Reply/Reply All/Forward
    //      opened from a loaded conversation) — skip the address-matching
    //      heuristic entirely and continue that thread directly.
    //   1. emailMode === 'new'      → always a fresh conversation (no lookup at all).
    //   2. emailMode === 'continue' → look up the latest thread by sender+recipient
    //      email (Email Mode dropdown — Update 4). No companyId needed, so this
    //      works from the standalone Email Composer too.
    //   3. neither provided         → the ORIGINAL companyId auto-thread
    //      behavior, byte-for-byte unchanged, for any caller that predates Email Mode.
    // In all cases, if no matching thread is found these stay null → new thread,
    // exactly as before. Subject is never altered to defeat Gmail's own grouping.
    let threadId    = null
    let sendSubject = subject
    let inReplyTo   = null
    let references  = null

    if (explicitThreadId) {
      threadId = explicitThreadId
      const meta = await resolveThreadMeta(gmail, threadId)
      sendSubject = meta.subject || subject
      inReplyTo  = meta.inReplyTo
      references = meta.references

    } else if (emailMode === 'new') {
      // explicit: skip all lookup, send completely fresh

    } else if (emailMode === 'continue') {
      // Find the MOST RECENT message exchanged with this recipient, in either
      // direction, and continue that thread.
      //
      // fromEmail/toEmail hold two different shapes depending on how the row
      // was created: a message sent through this composer stores bare
      // addresses ("a@b.com"), while a message imported by Email Sync stores
      // the RAW Gmail header — display name included ("Name <a@b.com>"),
      // original casing, and possibly several recipients in one string.
      // Comparing those columns with exact equality therefore skipped every
      // synced message and silently fell through to an older composer-sent
      // row, continuing a thread that could be months stale (or one from the
      // opposite direction). Normalising with extractAddresses() — the same
      // helper the sync matching rules already use — makes both shapes
      // compare equal, so "latest" really means latest.
      const meAddr  = fromEmail.trim().toLowerCase()
      const toAddrs = extractAddresses(to)   // the To field may itself carry a display name

      // Broad DB-side prefilter (substring, so it catches both shapes), then
      // an exact normalised check in JS below — the prefilter may over-match
      // (e.g. "jey@x.com" also matches "notjey@x.com"), which the precise
      // check discards. Bounded because only the newest match is needed.
      const candidates = toAddrs.length === 0 ? [] : await prisma.activity.findMany({
        where: {
          type: 'email',
          threadId: { not: null },
          userId: req.user.id,
          OR: toAddrs.flatMap(a => [
            { fromEmail: { contains: a, mode: 'insensitive' } },
            { toEmail:   { contains: a, mode: 'insensitive' } },
          ]),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })

      // Opposite-end pairing, same rule the sync anchor uses: the connected
      // mailbox on one end and the recipient on the other, either direction.
      const lastEmail = candidates.find(r => {
        const from = extractAddresses(r.fromEmail)
        const rcpt = extractAddresses(r.toEmail)
        return toAddrs.some(a =>
          (from.includes(meAddr) && rcpt.includes(a)) ||
          (from.includes(a) && rcpt.includes(meAddr))
        )
      })

      if (lastEmail?.threadId) {
        threadId = lastEmail.threadId
        const meta = await resolveThreadMeta(gmail, threadId)
        // Prefer our own stored record of the thread's subject over the live
        // Gmail fetch — the API call can transiently fail (resolveThreadMeta
        // then returns subject: null), which previously left sendSubject
        // silently on whatever was typed for *this* send instead of the
        // thread's real subject. lastEmail.subject was captured when that
        // email was originally sent/synced, so it doesn't depend on this
        // request's network call succeeding.
        sendSubject = lastEmail.subject || meta.subject || subject
        inReplyTo  = meta.inReplyTo
        references = meta.references
      }

    } else if (companyId) {
      const lastEmail = await prisma.activity.findFirst({
        where: {
          type: 'email',
          threadId: { not: null },
          userId: req.user.id,
          companyId,
        },
        orderBy: { createdAt: 'desc' },
      })
      if (lastEmail?.threadId) {
        threadId = lastEmail.threadId
        const meta = await resolveThreadMeta(gmail, threadId)
        // Same reasoning as the "continue" branch above: prefer our own
        // stored subject over the live (fallible) Gmail metadata fetch.
        sendSubject = lastEmail.subject || meta.subject || subject
        inReplyTo  = meta.inReplyTo
        references = meta.references
      }
    }

    const rawBuffer = buildRawEmail({
      from: fromEmail,
      to,
      cc:  cc  || null,
      bcc: bcc || null,
      subject: sendSubject,
      htmlBody: effectiveHtml,
      attachments: Array.isArray(attachments) ? attachments : [],
      inReplyTo,
      references,
    })

    // ── Send ──────────────────────────────────────────────
    // Attachment emails: use Gmail's documented multipart media upload
    // (uploadType=multipart, media MIME type message/rfc822) so the raw bytes
    // go straight to Gmail without the extra base64url encoding pass the plain
    // JSON `raw` field requires — this is the main built-in inefficiency for
    // large attachments, and Gmail's own API docs recommend media upload over
    // inlining large messages as JSON. If anything about this path fails for
    // any reason, we fall back to the exact same proven JSON `raw` call used
    // today, so a send can only ever be slower here, never fail because of it.
    // No-attachment emails are untouched — they always use the original path.
    let sent
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0
    if (hasAttachments) {
      try {
        sent = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { ...(threadId && { threadId }) },
          media: { mimeType: 'message/rfc822', body: rawBuffer },
        })
      } catch (mediaErr) {
        console.warn('[Email Send] Multipart upload failed, falling back to simple send:', mediaErr.message)
      }
    }
    if (!sent) {
      sent = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: rawBuffer.toString('base64url'), ...(threadId && { threadId }) },
      })
    }

    const activity = await prisma.activity.create({
      data: {
        type: 'email',
        companyId,
        userId: req.user.id,
        title: `Email – ${sendSubject}`,
        body: body || (htmlBody ? htmlBody.replace(/<[^>]+>/g, ' ').trim().slice(0, 2000) : null),
        toEmail: to,
        ccEmail: cc || null,
        fromEmail: fromEmail,
        subject: sendSubject,
        emailStatus: 'sent',
        direction: 'outbound',
        messageId: sent.data.id,
        threadId: sent.data.threadId,
        trackingId,
        matchedCompanyEmail: sendMatchedAddress,
        attachments: Array.isArray(attachments) && attachments.length
          ? attachments.map(a => ({ filename: a.filename, size: a.content ? Math.round(a.content.length * 0.75) : 0, mimeType: a.mimeType || null }))
          : undefined,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    res.status(201).json(activity)
  } catch (err) {
    console.error('Gmail send error:', err.message)
    res.status(500).json({ message: err.message || 'Failed to send email.' })
  }
})

// ── Email address matching helpers (Update: Email Sync Rewrite) ────────────
// Extracts bare, lowercase email addresses out of a raw header value such as
// `"Jane Doe" <jane@company.com>, other@company.com` — used instead of raw
// substring matching so display names, aliases, and multiple recipients in
// To/Cc all resolve correctly.
const EMAIL_ADDR_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
function extractAddresses(headerValue) {
  if (!headerValue) return []
  return (headerValue.match(EMAIL_ADDR_RE) || []).map(a => a.toLowerCase())
}

// A company's full set of saved addresses — primary `email` plus any
// additional `emails` (Update 2: multi-email support). Same fields already
// rendered in Company Details; sync now uses all of them, not just primary.
// Ordered: primary first, then additional in saved order — the anchor picker
// below relies on that order to stay deterministic across runs.
// `exclude` holds the viewer's own connected mailbox addresses. A company
// address that is ALSO the connected account can never identify a counterpart:
// every message in the mailbox has the user as a participant, so treating it as
// a company address matches the entire mailbox. Such an address is dropped.
function companyAddressList(company, exclude = new Set()) {
  const seen = new Set()
  const list = []
  const push = (v) => {
    if (typeof v !== 'string') return
    const a = v.trim().toLowerCase()
    if (a && !seen.has(a) && !exclude.has(a)) { seen.add(a); list.push(a) }
  }
  push(company?.email)
  if (Array.isArray(company?.emails)) company.emails.forEach(push)
  return list
}

// Every mailbox this user has connected — never valid as a company address.
async function ownAddressSet(userId) {
  const accounts = await prisma.emailAccount.findMany({ where: { userId }, select: { email: true } })
  return new Set(accounts.map(a => (a.email || '').trim().toLowerCase()).filter(Boolean))
}

// Walks the MIME tree and collects attachment metadata (filename + size).
// Stored at sync time so opening a conversation never needs a live Gmail call.
function extractAttachments(payload, out = []) {
  if (!payload) return out
  if (payload.filename && payload.filename.trim() && payload.body?.attachmentId) {
    out.push({ filename: payload.filename, size: payload.body.size || 0, mimeType: payload.mimeType || null })
  }
  if (Array.isArray(payload.parts)) payload.parts.forEach(p => extractAttachments(p, out))
  return out
}

// ── Conversation matching rules ────────────────────────────────────────────
// A message ANCHORS a thread to a company only when the connected mailbox and
// a company address sit on OPPOSITE ends of that message — one sent it, the
// other received it. Direction is the entire point of the rule: it is what
// separates "I corresponded with this company" from "somebody else happened to
// put us both on the same email".
//
// This previously pooled From+To together and asked only whether both addresses
// appeared *somewhere* in that pool. A group email from an outside sender to a
// distribution list containing both the connected mailbox and a company address
// satisfied that test, which is how a batch of unrelated internal team email was
// imported into a company. Requiring opposite ends closes that hole at the root.
//
// Cc/Bcc are excluded on both sides: being copied on someone else's conversation
// does not make it part of the company relationship.
//
// Returns the matched company address (used for address-level grouping), or null.
// The company's own saved address order is preserved so re-running a sync always
// resolves the same anchor for the same message.
//
// Used by BOTH the Gmail import path and the reconciliation pass — they must
// never diverge, or rows that could no longer be imported would survive cleanup.
function anchorForAddresses(fromRaw, toRaw, userEmail, companyAddresses) {
  const from = extractAddresses(fromRaw)
  const to   = extractAddresses(toRaw)

  // user → company
  if (from.includes(userEmail)) {
    const anchor = companyAddresses.find(a => to.includes(a))
    if (anchor) return anchor
  }
  // company → user
  if (to.includes(userEmail)) {
    const anchor = companyAddresses.find(a => from.includes(a))
    if (anchor) return anchor
  }
  return null
}

// Once any single message in a thread anchors, the WHOLE thread is imported —
// including replies where a participant was only Cc'd — so the conversation is
// never shown with holes in it.
function anchorForMessage(msg, userEmail, companyAddresses) {
  const headers = msg.payload?.headers || []
  const getHeader = (name) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
  return anchorForAddresses(getHeader('From'), getHeader('To'), userEmail, companyAddresses)
}

// In-process single-flight lock: if a sync for the same company is already
// running, a second call awaits and returns that same in-flight result
// instead of starting a duplicate run that could race on the same rows.
const syncInFlight = new Map()

// POST /api/email/sync — incremental, idempotent sync: only conversations
// between the connected Gmail account and the company's saved address(es).
// Never deletes or recreates an Activity — a message already synced is left
// untouched forever, which is what keeps its id, trackingId, and open-tracking
// history permanently intact and in sync with notifications.
router.post('/sync', auth, async (req, res) => {
  const { contactEmail, companyId } = req.body

  let company = null
  if (companyId) {
    company = await prisma.company.findUnique({ where: { id: companyId } })
    // Never trust the frontend on this — a bin'd company should reject writes
    // (Activity creation) even if a stale UI surface still has its id in hand.
    if (!company || company.deletedAt) {
      return res.status(400).json({ message: 'This company has been moved to the Recycle Bin. Please restore it before sending or syncing emails.' })
    }
  }

  // The company record is the ONLY source of truth for which addresses belong
  // to it. contactEmail is honoured solely when there is no company context —
  // letting a caller inject an arbitrary address into a company's address list
  // is precisely how unrelated conversations got attached to a company.
  const own = await ownAddressSet(req.user.id)
  const companyAddresses = company
    ? companyAddressList(company, own)
    : (contactEmail && !own.has(contactEmail.trim().toLowerCase()) ? [contactEmail.trim().toLowerCase()] : [])

  if (companyAddresses.length === 0) {
    return res.json({
      synced: 0, adopted: 0, unlinked: 0, removed: 0, total: 0,
      message: company
        ? 'No usable company email address. Add a client address to this company (an address that is also your own connected mailbox cannot be used).'
        : 'contactEmail required',
    })
  }

  const lockKey = companyId || [...companyAddresses].sort().join(',')
  if (syncInFlight.has(lockKey)) {
    try {
      return res.json(await syncInFlight.get(lockKey))
    } catch (err) {
      return res.status(err.status || 500).json({ message: err.message || 'Failed to sync emails.' })
    }
  }

  const runPromise = runEmailSync({ userId: req.user.id, companyId, companyAddresses, own })
  syncInFlight.set(lockKey, runPromise)
  try {
    res.json(await runPromise)
  } catch (err) {
    console.error('Gmail sync error:', err.message)
    res.status(err.status || 500).json({ message: err.message || 'Failed to sync emails.' })
  } finally {
    syncInFlight.delete(lockKey)
  }
})

// Pages through a Gmail search query until exhausted (or the safety cap is
// hit), instead of silently keeping only the first 100 hits — that truncation
// is why older conversations could go missing from a long history.
const MAX_PAGES = 10
async function listAllMessages(gmail, q) {
  const out = []
  let pageToken
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken })
    out.push(...(res.data.messages || []))
    pageToken = res.data.nextPageToken
    if (!pageToken) break
  }
  return out
}

async function runEmailSync({ userId, companyId, companyAddresses, own = new Set() }) {
  const account = await prisma.emailAccount.findFirst({
    where: { userId, provider: 'gmail' },
  })
  if (!account) return { synced: 0, adopted: 0, removed: 0, total: 0, message: 'Gmail not connected' }

  const userEmail = account.email.toLowerCase()

  const { google } = require('googleapis')
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
  })
  // Persist refreshed access tokens, so a long-lived session doesn't start
  // failing sync once the original access token expires.
  oauth2Client.on('tokens', async (tokens) => {
    if (!tokens.access_token) return
    try {
      await prisma.emailAccount.update({
        where: { userId_provider: { userId, provider: 'gmail' } },
        data: {
          accessToken: tokens.access_token,
          ...(tokens.expiry_date && { expiresAt: new Date(tokens.expiry_date) }),
        },
      })
    } catch (e) { console.warn('[Email Sync] token persist failed:', e.message) }
  })
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  try {
    const profile = await gmail.users.getProfile({ userId: 'me' })
    console.log(`[Email Sync] Connected Gmail: ${profile.data.emailAddress}`)
    console.log(`[Email Sync] Company addresses: ${companyAddresses.join(', ')}`)
  } catch (tokenErr) {
    console.error(`[Email Sync] Token invalid:`, tokenErr.message)
    const err = new Error('Gmail token expired. Please disconnect Gmail and reconnect it.')
    err.status = 401
    throw err
  }

  // Candidate discovery casts a WIDE net (from/to/cc/bcc, every address) —
  // relevance is decided by the anchor rules below, not by the search query.
  // Anything the search over-collects is filtered out; anything it misses can
  // never be recovered, so breadth here matters more than precision.
  const clause = (field) => companyAddresses.map(a => `${field}:${a}`).join(' OR ')
  const queries = [clause('from'), clause('to'), clause('cc'), clause('bcc')]

  const found = await Promise.all(queries.map(q => listAllMessages(gmail, `(${q})`)))

  // Keep the candidate message ids per thread — used below to skip threads
  // that are already fully synced without paying for a threads.get round-trip.
  const candidatesByThread = new Map()
  let candidateCount = 0
  for (const list of found) {
    for (const m of list) {
      if (!candidatesByThread.has(m.threadId)) candidatesByThread.set(m.threadId, new Set())
      candidatesByThread.get(m.threadId).add(m.id)
      candidateCount++
    }
  }
  const threadIds = [...candidatesByThread.keys()]
  console.log(`[Email Sync] ${candidateCount} candidate hit(s) across ${threadIds.size} thread(s)`)

  // One lookup for every candidate message instead of one per message later.
  const allCandidateIds = [...new Set([...candidatesByThread.values()].flatMap(s => [...s]))]
  const knownRows = allCandidateIds.length
    ? await prisma.activity.findMany({
        where: { messageId: { in: allCandidateIds } },
        select: { messageId: true, threadId: true, companyId: true },
      })
    : []
  // Only messages ALREADY LINKED TO THIS COMPANY count as "nothing left to do".
  // Using mere presence in the Activity table (regardless of companyId) made the
  // fast path below skip threads that still contained unlinked messages — a
  // message sent from the standalone composer is stored with companyId null, so
  // the thread looked fully synced, was never re-fetched, and that message stayed
  // orphaned permanently instead of being adopted.
  const linkedHereIds = new Set(knownRows.filter(r => r.companyId === companyId).map(r => r.messageId))
  const threadsLinkedHere = new Set(knownRows.filter(r => r.companyId === companyId).map(r => r.threadId))

  let synced = 0, adopted = 0, skippedThreads = 0, failedThreads = 0, unchangedThreads = 0

  const processThread = async (threadId) => {
    // Fast path: every candidate message of this thread is already stored and
    // already linked to this company — there is nothing new to fetch, so skip
    // the (expensive) threads.get entirely. A new reply always shows up as a
    // new candidate id, so genuinely-updated threads still get processed.
    // The check is against messages linked to THIS company (not merely present
    // in the table), so a thread holding any unlinked message is still fetched
    // and that message gets adopted rather than stranded.
    const candidates = candidatesByThread.get(threadId)
    if (threadsLinkedHere.has(threadId) && [...candidates].every(id => linkedHereIds.has(id))) {
      unchangedThreads++
      return
    }

    // Per-thread isolation: one failing thread (rate limit, deleted message,
    // malformed payload) must never abort the whole run and lose the progress
    // already made on every other thread.
    try {
      const threadRes = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' })
      const threadMessages = threadRes.data.messages || []

      // Thread-level anchoring: find the first message that qualifies. If none
      // does, the entire thread is irrelevant (this is what drops Cc-only
      // conversations). If one does, EVERY message in the thread is imported
      // so the conversation is complete — replies and forwards included.
      let anchorAddress = null
      for (const msg of threadMessages) {
        const a = anchorForMessage(msg, userEmail, companyAddresses)
        if (a) { anchorAddress = a; break }
      }
      if (!anchorAddress) { skippedThreads++; return }

      // One lookup for the whole thread instead of one query per message.
      const threadMsgIds = threadMessages.map(m => m.id)
      const existingRows = await prisma.activity.findMany({ where: { messageId: { in: threadMsgIds } } })
      const existingByMsgId = new Map(existingRows.map(r => [r.messageId, r]))

      for (const msg of threadMessages) {
        const headers = msg.payload?.headers || []
        const getHeader = (name) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

        const fromAddrs = extractAddresses(getHeader('From'))
        const isOutbound = fromAddrs.includes(userEmail)

        const existing = existingByMsgId.get(msg.id)

        if (existing) {
          // Never steal a message that is correctly linked to a DIFFERENT
          // company (its matched address is still one of that company's own).
          if (existing.companyId && companyId && existing.companyId !== companyId) {
            const otherOk = existing.matchedCompanyEmail && !own.has(existing.matchedCompanyEmail)
            if (otherOk) continue
          }

          // ADOPT and CORRECT, never skip. An email sent from the standalone
          // composer is stored with companyId null, and an email linked while
          // the company had a bad address carries a stale matchedCompanyEmail.
          // Re-pointing the existing row keeps its id, trackingId and open
          // history intact — which is why tracking and the Activity view can
          // no longer disagree.
          const patch = {}
          if (existing.companyId !== companyId && companyId) patch.companyId = companyId
          // Correct the address bucket whenever it is missing OR no longer one
          // of the company's saved addresses (the stale-link case).
          if (existing.matchedCompanyEmail !== anchorAddress &&
              !companyAddresses.includes(existing.matchedCompanyEmail)) {
            patch.matchedCompanyEmail = anchorAddress
          }
          if (!existing.threadId) patch.threadId = threadId
          if (existing.ccEmail == null && getHeader('Cc')) patch.ccEmail = getHeader('Cc')
          if (existing.attachments == null) {
            const atts = extractAttachments(msg.payload)
            if (atts.length) patch.attachments = atts
          }
          if (Object.keys(patch).length) {
            await prisma.activity.update({ where: { id: existing.id }, data: patch })
            adopted++
          }
          continue
        }

        const subjectRaw = getHeader('Subject') || '(no subject)'
        const dateHeader = getHeader('Date')
        const atts       = extractAttachments(msg.payload)

        await prisma.activity.create({
          data: {
            type:        'email',
            companyId:   companyId || null,
            userId,
            title:       `Email – ${subjectRaw}`,
            body:        extractTextBody(msg.payload) || null,
            toEmail:     getHeader('To'),
            ccEmail:     getHeader('Cc') || null,
            fromEmail:   getHeader('From'),
            subject:     subjectRaw,
            emailStatus: isOutbound ? 'sent' : 'received',
            direction:   isOutbound ? 'outbound' : 'inbound',
            messageId:   msg.id,
            threadId,
            matchedCompanyEmail: anchorAddress,
            attachments: atts.length ? atts : undefined,
            createdAt:   dateHeader ? new Date(dateHeader) : new Date(),
          },
        })
        synced++
      }
    } catch (threadErr) {
      failedThreads++
      console.warn(`[Email Sync] thread ${threadId} failed (continuing):`, threadErr.message)
    }
  }

  // Threads are fetched a few at a time rather than strictly one after another.
  // Sequential fetching is what made a large mailbox take minutes; the cap keeps
  // us well inside Gmail's rate limits.
  const CONCURRENCY = 5
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, threadIds.length) }, async () => {
      while (cursor < threadIds.length) {
        const idx = cursor++
        await processThread(threadIds[idx])
      }
    })
  )

  // ── Reconciliation ────────────────────────────────────────────────────────
  // Links are re-validated on every sync, so a company can never keep showing
  // conversations that stopped belonging to it (e.g. its email address was
  // corrected after a bad one attached half the mailbox). A conversation is
  // kept only if some message in that thread actually involves one of the
  // company's CURRENT addresses — thread-aware, so replies between other
  // parties inside a genuine conversation are not stripped out.
  //
  // Wrongly-linked rows are UNLINKED, never deleted: the row, its trackingId
  // and its open history all survive, and it can be claimed by the right
  // company on a later sync.
  let unlinked = 0
  if (companyId) {
    const linked = await prisma.activity.findMany({
      where: { companyId, type: 'email' },
      select: { id: true, threadId: true, fromEmail: true, toEmail: true, ccEmail: true },
    })
    const byThread = new Map()
    for (const r of linked) {
      const k = r.threadId || `single:${r.id}`
      if (!byThread.has(k)) byThread.set(k, [])
      byThread.get(k).push(r)
    }
    const staleIds = []
    for (const rows of byThread.values()) {
      // Exactly the rule used on import (anchorForAddresses) — applied to the
      // stored headers. Keeping these identical is what makes the module
      // self-healing: if the matching rules tighten, a re-sync releases rows
      // that would no longer qualify, instead of leaving them linked forever.
      const threadStillQualifies = rows.some(r => anchorForAddresses(r.fromEmail, r.toEmail, userEmail, companyAddresses))
      if (!threadStillQualifies) staleIds.push(...rows.map(r => r.id))
    }
    if (staleIds.length) {
      const r = await prisma.activity.updateMany({
        where: { id: { in: staleIds } },
        data: { companyId: null, matchedCompanyEmail: null },
      })
      unlinked = r.count
    }
  }

  console.log(`[Email Sync] Done: created=${synced}, adopted=${adopted}, unlinked=${unlinked}, threadsUnchanged=${unchangedThreads}, threadsSkipped=${skippedThreads}, threadsFailed=${failedThreads}`)
  return { synced, adopted, unlinked, removed: 0, total: candidateCount, unchangedThreads, skippedThreads, failedThreads }
}

// ── Conversation hierarchy: Company → Email Address → Thread → Messages ─────
// Tracking telemetry (open count/times) is sender-private: it is stripped from
// the payload for anyone who is not the user who sent the message, so a
// teammate viewing the same company never sees another rep's open data.
function publicMessage(a, viewerId) {
  const isOwnSent = a.direction === 'outbound' && a.userId === viewerId
  return {
    id:        a.id,
    messageId: a.messageId,
    threadId:  a.threadId,
    subject:   a.subject,
    body:      a.body,
    fromEmail: a.fromEmail,
    toEmail:   a.toEmail,
    ccEmail:   a.ccEmail,
    direction: a.direction,
    createdAt: a.createdAt,
    attachments: Array.isArray(a.attachments) ? a.attachments : [],
    user:      a.user || null,
    matchedCompanyEmail: a.matchedCompanyEmail,
    // Sender-only tracking block. Absent entirely for received mail and for
    // mail sent by a different user.
    tracking: isOwnSent ? {
      status:        a.emailStatus || 'sent',
      openCount:     a.openCount || 0,
      firstOpenedAt: a.firstOpenedAt,
      lastOpenedAt:  a.lastOpenedAt,
      openHistory:   Array.isArray(a.openHistory) ? a.openHistory : [],
    } : null,
  }
}

// GET /api/email/conversations?companyId=…
// Returns every saved company address (even ones with zero conversations),
// each with its thread summaries. Message bodies are NOT included — the drawer
// loads a full thread on demand via /thread/:threadId.
router.get('/conversations', auth, async (req, res) => {
  try {
    const { companyId } = req.query
    if (!companyId) return res.status(400).json({ message: 'companyId required' })

    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) return res.status(404).json({ message: 'Company not found.' })

    const own = await ownAddressSet(req.user.id)
    const addresses = companyAddressList(company, own)

    // Bodies are deliberately NOT selected here — the list only needs a short
    // snippet of each thread's latest message, fetched separately below. On a
    // company with a long history this is the difference between shipping a
    // few KB and several MB per page load.
    const rows = await prisma.activity.findMany({
      where: { companyId, type: 'email' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, threadId: true, subject: true, title: true, direction: true,
        createdAt: true, fromEmail: true, toEmail: true, ccEmail: true,
        matchedCompanyEmail: true, attachments: true,
      },
    })

    // Group into threads first, then file each thread under the company
    // address it actually involves. A conversation is only ever shown under an
    // address that genuinely takes part in it — a thread involving none of the
    // company's current addresses is not shown at all, which is what keeps
    // unrelated mailbox conversations out of the company record.
    const threadMap = new Map()
    for (const row of rows) {
      const tid = row.threadId || `single:${row.id}`
      if (!threadMap.has(tid)) threadMap.set(tid, [])
      threadMap.get(tid).push(row)
    }

    const buckets = new Map()
    for (const a of addresses) buckets.set(a, new Map())

    for (const [tid, msgs] of threadMap.entries()) {
      const participants = new Set(msgs.flatMap(m => [
        ...extractAddresses(m.fromEmail), ...extractAddresses(m.toEmail), ...extractAddresses(m.ccEmail),
      ]))
      // Prefer the address recorded at sync time, but only if it is still a
      // saved address AND actually appears in the conversation.
      const recorded = msgs.find(m => m.matchedCompanyEmail && addresses.includes(m.matchedCompanyEmail))?.matchedCompanyEmail
      const key = (recorded && participants.has(recorded))
        ? recorded
        : addresses.find(a => participants.has(a))
      if (!key) continue   // involves no saved company address → not this company's conversation
      buckets.get(key).set(tid, msgs)
    }

    // Snippets: one targeted query for just the latest message of each thread.
    const latestIds = [...buckets.values()].flatMap(threadMap =>
      [...threadMap.values()].map(msgs =>
        [...msgs].sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt)).slice(-1)[0].id)
    )
    const snippetRows = latestIds.length
      ? await prisma.activity.findMany({ where: { id: { in: latestIds } }, select: { id: true, body: true } })
      : []
    const snippetById = new Map(snippetRows.map(r => [r.id, (r.body || '').replace(/\s+/g, ' ').trim().slice(0, 160)]))

    const toThreadSummary = (threadId, msgs) => {
      const sorted = [...msgs].sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt))
      const first = sorted[0]
      const last  = sorted[sorted.length - 1]
      const participants = [...new Set(sorted.flatMap(m => [
        ...extractAddresses(m.fromEmail), ...extractAddresses(m.toEmail), ...extractAddresses(m.ccEmail),
      ]))]
      return {
        threadId,
        subject:       first.subject || first.title || '(no subject)',
        messageCount:  sorted.length,
        firstMessageAt: first.createdAt,
        lastMessageAt:  last.createdAt,
        lastDirection:  last.direction,
        lastSnippet:    snippetById.get(last.id) || '',
        hasAttachments: sorted.some(m => Array.isArray(m.attachments) && m.attachments.length > 0),
        participants,
      }
    }

    const buildGroup = (address, threadMap) => {
      const threads = [...threadMap.entries()]
        .map(([tid, msgs]) => toThreadSummary(tid, msgs))
        .sort((x, y) => new Date(y.lastMessageAt) - new Date(x.lastMessageAt))
      return {
        address,
        isPrimary: address === addresses[0],
        threadCount: threads.length,
        messageCount: threads.reduce((n, t) => n + t.messageCount, 0),
        lastActivityAt: threads[0]?.lastMessageAt || null,
        threads,
      }
    }

    // Saved addresses keep the company's own order (primary first) and are
    // always returned — an address with no conversations still shows, so the
    // user can see it exists rather than wonder if it was dropped.
    const groups = addresses.map(a => buildGroup(a, buckets.get(a) || new Map()))

    // Addresses that had to be dropped because they are the viewer's own
    // connected mailbox — surfaced so the reason is visible in the UI instead
    // of the address silently disappearing.
    const savedRaw = [company.email, ...(Array.isArray(company.emails) ? company.emails : [])]
      .filter(v => typeof v === 'string' && v.trim())
      .map(v => v.trim().toLowerCase())
    const ignoredOwnAddresses = [...new Set(savedRaw.filter(a => own.has(a)))]

    res.json({
      companyId,
      companyName: company.name,
      addresses: groups,
      ignoredOwnAddresses,
      totalMessages: groups.reduce((n, g) => n + g.messageCount, 0),
    })
  } catch (err) {
    console.error('[Email Conversations] error:', err.message)
    res.status(500).json({ message: 'Failed to load conversations.' })
  }
})

// ── CRM-relevance matching (Inbox business rule) ────────────────────────────
// Inbox must show ONLY conversations involving a CRM company/deal contact —
// never the connected mailbox's personal mail, newsletters, or notification
// senders (GitHub, Google, ChatGPT, Adobe, UiPath, etc). This is purely a
// listing filter: it does not touch how emails are stored or synced, and an
// Activity row that fails this match still exists untouched in the table —
// it is simply excluded from this one view.
//
// "Known CRM identifier" = a company's saved email(s)/domain, or a deal's
// contact email/domain — matched live against current data (not the
// possibly-stale companyId/matchedCompanyEmail an old sync recorded), so the
// filter self-heals the same way /sync's reconciliation pass already does:
// if a company's address changes, Inbox reflects that on the very next call.
//
// Cached briefly rather than re-queried on every keystroke/page click — the
// same large-table-refetch concern noted below (Companies can run 16,000+
// rows), except here it is ONE lightweight, capped-lifetime query instead of
// a per-request full fetch.
let crmAddressCache = { emails: new Set(), domains: new Set(), expiresAt: 0 }
const CRM_ADDRESS_TTL_MS = 60_000

function addKnownDomain(set, v) {
  if (typeof v !== 'string' || !v.trim()) return
  const d = v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  if (d) set.add(d)
}

async function getCrmAddresses() {
  if (Date.now() < crmAddressCache.expiresAt) return crmAddressCache

  const [companies, deals] = await Promise.all([
    prisma.company.findMany({ where: { deletedAt: null }, select: { email: true, emails: true, domain: true } }),
    prisma.deal.findMany({ select: { contactEmail: true, domainName: true } }),
  ])

  const emails = new Set()
  const domains = new Set()
  const addEmail = (v) => { if (typeof v === 'string' && v.trim()) emails.add(v.trim().toLowerCase()) }

  for (const c of companies) {
    addEmail(c.email)
    if (Array.isArray(c.emails)) c.emails.forEach(addEmail)
    addKnownDomain(domains, c.domain)
  }
  for (const d of deals) {
    addEmail(d.contactEmail)
    addKnownDomain(domains, d.domainName)
  }

  crmAddressCache = { emails, domains, expiresAt: Date.now() + CRM_ADDRESS_TTL_MS }
  return crmAddressCache
}

// GET /api/email/inbox — global, cross-company inbox (Inbox module).
// Unlike /conversations above (which buckets threads under one company's
// saved addresses — a fundamentally per-company operation), this has no
// single company to bucket against: it needs one row per THREAD across the
// whole table, newest-first, correctly paginated. A plain findMany({skip,
// take}) over raw message rows would paginate messages, not conversations,
// and fetching everything to group in JS would repeat the exact full-fetch
// mistake this project already got burned by once (see the bulk-import
// incident). So this uses a real DISTINCT ON query instead: one Activity row
// per thread (its latest message, matching whatever filters are active),
// ordered by that message's time, sliced with LIMIT/OFFSET at the SQL level.
// COALESCE(threadId, 'single:'||id) mirrors the exact same fallback key
// /conversations already uses in JS for a standalone (non-threaded) email —
// without it, Postgres's DISTINCT ON would treat every NULL threadId as the
// same group and collapse all standalone emails into a single row.
//
// The CRM-relevance match runs as a real SQL EXISTS condition (not a
// post-fetch JS filter), so it applies to the COUNT and the paginated query
// identically — page/total stay accurate instead of pages coming back
// short after junk rows are filtered out client-side.
router.get('/inbox', auth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50))
    const { search, direction, companyId, dateFrom, dateTo } = req.query

    const { emails: crmEmails, domains: crmDomains } = await getCrmAddresses()
    // No CRM data at all → nothing can qualify (rather than every message
    // vacuously "matching" an empty rule set).
    if (crmEmails.size === 0 && crmDomains.size === 0) {
      return res.json({ items: [], total: 0, page, pages: 1 })
    }

    const conditions = [Prisma.sql`type = 'email'`]
    if (direction) conditions.push(Prisma.sql`direction = ${direction}`)
    if (companyId) conditions.push(Prisma.sql`"companyId" = ${companyId}`)
    if (search && search.trim()) {
      const q = `%${search.trim()}%`
      conditions.push(Prisma.sql`(subject ILIKE ${q} OR "fromEmail" ILIKE ${q} OR "toEmail" ILIKE ${q})`)
    }
    if (dateFrom) conditions.push(Prisma.sql`"createdAt" >= ${new Date(dateFrom)}`)
    if (dateTo) conditions.push(Prisma.sql`"createdAt" <= ${new Date(dateTo)}`)
    // At least one participant (From or To) must resolve to a known CRM
    // email or domain. Same address-extraction rule as extractAddresses()
    // above (identical character class), applied here as SQL so it can run
    // as one EXISTS per row instead of fetching every row into Node first.
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM regexp_matches(COALESCE("fromEmail", '') || ' ' || COALESCE("toEmail", ''), ${EMAIL_ADDR_RE.source}, 'g') AS addr
      WHERE lower(addr[1]) = ANY(${[...crmEmails]}::text[])
         OR lower(split_part(addr[1], '@', 2)) = ANY(${[...crmDomains]}::text[])
    )`)
    const whereClause = Prisma.join(conditions, ' AND ')

    const countRows = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT COALESCE("threadId", 'single:' || id))::int AS count
      FROM "Activity" WHERE ${whereClause}
    `
    const total = countRows[0]?.count || 0

    const rows = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT DISTINCT ON (COALESCE("threadId", 'single:' || id)) *
        FROM "Activity"
        WHERE ${whereClause}
        ORDER BY COALESCE("threadId", 'single:' || id), "createdAt" DESC
      ) t
      ORDER BY t."createdAt" DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `

    // Company names resolved via one targeted query keyed on just the
    // companyIds present on this page — not a global join.
    const companyIds = [...new Set(rows.map(r => r.companyId).filter(Boolean))]
    const companies = companyIds.length
      ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
      : []
    const companyNameById = new Map(companies.map(c => [c.id, c.name]))

    const items = rows.map(r => ({
      id: r.id,
      threadId: r.threadId || `single:${r.id}`,
      companyId: r.companyId,
      companyName: r.companyId ? (companyNameById.get(r.companyId) || null) : null,
      subject: r.subject || r.title || '(no subject)',
      snippet: (r.body || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      direction: r.direction,
      fromEmail: r.fromEmail,
      toEmail: r.toEmail,
      createdAt: r.createdAt,
      hasAttachments: Array.isArray(r.attachments) && r.attachments.length > 0,
    }))

    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) })
  } catch (err) {
    console.error('[Email Inbox] error:', err.message)
    res.status(500).json({ message: 'Failed to load inbox.' })
  }
})

// GET /api/email/thread/:threadId?companyId=…
// The complete conversation, oldest → newest. Every message is returned; the
// UI shows them all in sequence rather than collapsing replies behind a count.
router.get('/thread/:threadId', auth, async (req, res) => {
  try {
    const { threadId } = req.params
    const { companyId } = req.query

    const where = { type: 'email', companyId: companyId || undefined }
    if (threadId.startsWith('single:')) where.id = threadId.slice(7)
    else where.threadId = threadId

    const rows = await prisma.activity.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (rows.length === 0) return res.status(404).json({ message: 'Conversation not found.' })

    res.json({
      threadId,
      subject: rows[0].subject || '(no subject)',
      messageCount: rows.length,
      matchedCompanyEmail: rows[0].matchedCompanyEmail || null,
      messages: rows.map(r => publicMessage(r, req.user.id)),
    })
  } catch (err) {
    console.error('[Email Thread] error:', err.message)
    res.status(500).json({ message: 'Failed to load conversation.' })
  }
})

// GET /api/email/analytics — real send counts, replacing the localStorage-
// derived KPIs and chart in the Email Tool's Analytics tab. Intentionally
// separate from the /conversations logic above rather than reusing it, so the
// company email history/matching code is not touched at all. Scoped to the
// requesting user, matching the personal-log nature of what it replaces (the
// old localStorage array was already per-browser).
router.get('/analytics', auth, async (req, res) => {
  try {
    const userId = req.user.id
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dow = now.getDay()
    const weekStart = new Date(todayStart.getTime() - ((dow === 0 ? 6 : dow - 1)) * 86400000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const base = { type: 'email', direction: 'outbound', userId }
    const [total, today, week, month] = await Promise.all([
      prisma.activity.count({ where: base }),
      prisma.activity.count({ where: { ...base, createdAt: { gte: todayStart } } }),
      prisma.activity.count({ where: { ...base, createdAt: { gte: weekStart } } }),
      prisma.activity.count({ where: { ...base, createdAt: { gte: monthStart } } }),
    ])

    // Last 7 days, oldest → newest, for the chart.
    const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 86400000)
    const recent = await prisma.activity.findMany({
      where: { ...base, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    })
    const last7Days = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(todayStart.getTime() - i * 86400000)
      const dayEnd = new Date(dayStart.getTime() + 86400000)
      last7Days.push({
        date: dayStart.toISOString().slice(0, 10),
        label: dayStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        count: recent.filter(r => r.createdAt >= dayStart && r.createdAt < dayEnd).length,
      })
    }

    res.json({ totalSent: total, sentToday: today, sentWeek: week, sentMonth: month, last7Days })
  } catch (err) {
    console.error('[Email Analytics] error:', err.message)
    res.status(500).json({ message: 'Failed to load analytics.' })
  }
})

// DELETE /api/email/gmail/disconnect
router.delete('/gmail/disconnect', auth, async (req, res) => {
  try {
    await prisma.emailAccount.deleteMany({
      where: { userId: req.user.id, provider: 'gmail' },
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ message: 'Failed to disconnect.' })
  }
})

// ── Email authentication (SPF/DKIM/DMARC) best-effort DNS checks ──────────────
// Additive, read-only. Does NOT touch send/sync. Used by the pre-send
// deliverability report. Results are informational, never a guarantee.
const dnsp = require('dns').promises

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('dns timeout')), ms)),
  ])
}

async function resolveTxtFlat(name) {
  const records = await withTimeout(dnsp.resolveTxt(name), 4000)
  return records.map(chunks => chunks.join(''))
}

const FREE_DOMAINS = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'aol.com', 'icloud.com']

async function checkDomainAuth(domain) {
  const out = {
    domain,
    spf:   { found: false, record: null },
    dkim:  { found: false, selector: null, record: null },
    dmarc: { found: false, record: null, policy: null },
  }

  // SPF — TXT record on the root domain
  try {
    const txt = await resolveTxtFlat(domain)
    const spf = txt.find(r => /^v=spf1/i.test(r.trim()))
    if (spf) out.spf = { found: true, record: spf }
  } catch { /* no record / timeout */ }

  // DMARC — TXT record at _dmarc.<domain>
  try {
    const txt = await resolveTxtFlat(`_dmarc.${domain}`)
    const dmarc = txt.find(r => /^v=DMARC1/i.test(r.trim()))
    if (dmarc) {
      const policy = (dmarc.match(/\bp\s*=\s*([a-z]+)/i) || [])[1] || 'none'
      out.dmarc = { found: true, record: dmarc, policy: policy.toLowerCase() }
    }
  } catch { /* none */ }

  // DKIM — best-effort common selectors (selectors are private, so this can miss)
  const selectors = FREE_DOMAINS.includes(domain)
    ? ['20230601', '20161025', 'google']
    : ['google', 'default', 'selector1', 'selector2', 'k1', 'mail', 'dkim', 's1']
  for (const sel of selectors) {
    try {
      const txt = await resolveTxtFlat(`${sel}._domainkey.${domain}`)
      const dkim = txt.find(r => /v=DKIM1|k=rsa|(^|;)\s*p=/i.test(r))
      if (dkim) {
        out.dkim = { found: true, selector: sel, record: dkim.slice(0, 90) + (dkim.length > 90 ? '…' : '') }
        break
      }
    } catch { /* try next selector */ }
  }
  return out
}

function buildAuthRecommendations({ domain, spf, dkim, dmarc, isFreeDomain }) {
  const recs = []
  if (isFreeDomain) {
    recs.push({ level: 'warn', text: `You are sending from a free mailbox provider (${domain}). For international B2B outreach, a custom authenticated domain typically lands in the inbox far more reliably.` })
  }
  if (!spf.found)  recs.push({ level: 'fail', text: 'No SPF record found. Add an SPF TXT record authorizing your sending servers.' })
  if (!dmarc.found) recs.push({ level: 'warn', text: 'No DMARC record found. Publish a DMARC policy (start with p=none to monitor) to improve trust and get reporting.' })
  else if (dmarc.policy === 'none') recs.push({ level: 'info', text: 'DMARC is set to p=none (monitor only). Once confident, move to p=quarantine or p=reject for stronger protection.' })
  if (!dkim.found) {
    recs.push({ level: isFreeDomain ? 'info' : 'warn', text: isFreeDomain
      ? 'DKIM selector not publicly discoverable, but this provider signs your mail automatically.'
      : 'Could not detect a DKIM record via common selectors. Confirm DKIM signing is enabled for your domain.' })
  }
  recs.push({ level: 'info', text: 'Best practice: keep sending volume steady, warm up new domains gradually, and maintain clean, engaged recipient lists.' })
  return recs
}

// GET /api/email/deliverability/check?email=optional
// Returns best-effort SPF/DKIM/DMARC status + reputation guidance for the
// sender domain (the connected Gmail account by default).
router.get('/deliverability/check', auth, async (req, res) => {
  try {
    let email = (req.query.email || '').trim().toLowerCase()
    if (!email) {
      const account = await prisma.emailAccount.findFirst({
        where: { userId: req.user.id, provider: 'gmail' },
      })
      email = account?.email?.toLowerCase() || ''
    }
    if (!email || !email.includes('@')) {
      return res.json({ available: false, message: 'No sender email available to check.' })
    }

    const domain = email.split('@')[1]
    const isFreeDomain = FREE_DOMAINS.includes(domain)
    const auth = await checkDomainAuth(domain)
    const recommendations = buildAuthRecommendations({ ...auth, isFreeDomain })

    res.json({
      available: true,
      email,
      domain,
      isFreeDomain,
      spf: auth.spf,
      dkim: auth.dkim,
      dmarc: auth.dmarc,
      recommendations,
    })
  } catch (err) {
    res.json({ available: false, message: err.message || 'Auth check failed.' })
  }
})

module.exports = router
