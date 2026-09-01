const router = require('express').Router()
const auth = require('../middleware/authMiddleware')
const crypto = require('crypto')
const { PrismaClient, Prisma } = require('@prisma/client')
const prisma = new PrismaClient()

// THE canonical company↔email matcher. Every decision about which company an
// email belongs to — on import, on send, and in the Inbox listing — is made
// here and nowhere else. See server/src/utils/companyEmailMatcher.js.
const matcher = require('../utils/companyEmailMatcher')

// ── Email open tracking ──────────────────────────────────────────────────────
// Public base the recipient's mail client can reach. In production this is the
// app domain (nginx proxies /api to the backend).
//
// This used to fall back to Vite's http://localhost:3000. That address means
// "this machine" to whoever opens the email, so the pixel could never load and
// the open could never be recorded — silently. Confirmed against the real
// mailboxes: of 74 CRM-sent emails, 35 carried the production origin and
// tracked, and 39 carried localhost and could not, which is exactly why
// tracking looked inconsistent.
//
// So an unreachable base now resolves to null instead, and a send with no
// reachable base carries NO pixel and NO trackingId at all. That makes
// "has a trackingId" mean "this email can genuinely report opens", which is
// what lets the UI say "not tracked" instead of asserting "not opened yet"
// about an email it was never able to observe.
function resolveTrackOrigin() {
  const raw = process.env.PUBLIC_URL || process.env.CLIENT_URL || ''
  try {
    const url = new URL(raw)
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(url.hostname)) return null
    return url.origin
  } catch {
    return null
  }
}
const TRACK_BASE = resolveTrackOrigin()
if (!TRACK_BASE) {
  console.warn('[Email Track] PUBLIC_URL is not set to a publicly reachable URL — outgoing emails will be sent WITHOUT open tracking (they will show as "Not tracked" rather than falsely as "not opened").')
}

// 1x1 transparent GIF returned by the tracking pixel.
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

// Hidden tracking pixel appended to outbound HTML. Loading it (when the
// recipient opens the email) hits /track/open/:token and records the open.
function trackingPixel(token) {
  if (!TRACK_BASE || !token) return ''
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

// The text/html part of a message, for showing an email in the CRM the way it
// actually looked. Mirrors extractTextBody above — same recursion, same nested
// multipart handling — but returns the markup instead of throwing it away.
// Capped because a message with inline base64 images can be enormous and this
// is a display convenience, not an archive.
const MAX_STORED_HTML = 400_000
function extractHtmlBody(payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8').slice(0, MAX_STORED_HTML)
  }
  if (!payload.parts) return ''
  for (const part of payload.parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8').slice(0, MAX_STORED_HTML)
    }
  }
  for (const part of payload.parts) {
    if (part.mimeType?.startsWith('multipart/')) {
      const html = extractHtmlBody(part)
      if (html) return html
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
    // Minted ONLY when the pixel has a reachable home (see resolveTrackOrigin):
    // a token with a dead pixel would sit at zero opens forever and be
    // indistinguishable from a genuinely unopened email.
    const trackingId  = TRACK_BASE ? crypto.randomUUID() : null
    // Quoted/forwarded content (built client-side by ThreadDrawer.jsx's
    // Reply/Reply All/Forward actions) is placed AFTER the signature, matching
    // standard reply layout: [content] [signature] [quoted original].
    // What the recipient sees, and — separately — what we store. They differ by
    // exactly one thing: the invisible tracking pixel is NOT stored. Rendering it
    // back in our own viewer would fetch it and record a false "open" every time
    // somebody read the email inside the CRM, corrupting the number it exists to
    // measure.
    const storedHtml    = `${baseHtml}${signatureHtml}${quotedHtml || ''}`
    const effectiveHtml = `${storedHtml}${trackingPixel(trackingId)}`

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

    // An email sent from the standalone composer carries no companyId, which
    // is how outbound mail used to end up permanently orphaned. Run it through
    // the SAME canonical matcher so it is filed on the way in rather than
    // waiting to be adopted by a later sync of the right company.
    let sendCompanyId = companyId || null
    let sendMatchBasis = companyId ? 'address' : null
    let resolvedMatchedAddress = sendMatchedAddress
    if (!sendCompanyId) {
      const m = await matcher.matchEmail({ from: fromEmail, to, cc })
      if (m) {
        sendCompanyId = m.companyId
        sendMatchBasis = m.basis
        resolvedMatchedAddress = resolvedMatchedAddress || m.matchedEmail
      }
    }

    // ── The RFC 5322 Message-ID of the message we just sent ──────────────
    // Gmail's own message id (sent.data.id) is unique only WITHIN one mailbox.
    // The Message-ID header is globally unique, and it is what the sync uses to
    // recognise that a message arriving from a second mailbox is the same real
    // email it already has (see the rfcMessageId dupe check in the sync below).
    //
    // Until now this row was written with rfcMessageId: null, so a CRM-composed
    // send was INVISIBLE to that check: when a colleague's mailbox — or the
    // recipient's, if they are also a CRM user — synced the same conversation,
    // nothing matched and a second row was created for the one real email. That
    // is the "1/2 Sent, 2/2 Sent" duplicate. Measured before this change: 21 of
    // 26 CRM-composed sends still had rfcMessageId null.
    //
    // Read back from Gmail rather than generated here and injected into the MIME:
    // this way it is unconditionally the id the message ACTUALLY carries, with no
    // assumption about whether Gmail preserves or replaces a client-supplied one.
    // Best-effort — a failure here leaves the field null, i.e. exactly the old
    // behaviour, and never affects an email that has already gone out.
    // Retried, because a null here is not harmless. The sync's cross-mailbox
    // guard is findUnique({ rfcMessageId }) — a NULL row can never match it, so
    // a send stored without its Message-ID is invisible to de-duplication: the
    // moment ANOTHER connected mailbox syncs that same email, a second Activity
    // is created for it, and nothing later can reconcile the pair. (The
    // sender's own mailbox does repair it on its next sync, via the messageId
    // adopt path — but only if it wins the race.) Three quick attempts turn a
    // transient blip into a non-event; the send itself has already succeeded
    // either way, so this must never throw.
    let sentRfcMessageId = null
    for (let attempt = 1; attempt <= 3 && !sentRfcMessageId; attempt++) {
      try {
        const meta = await gmail.users.messages.get({
          userId: 'me', id: sent.data.id, format: 'metadata', metadataHeaders: ['Message-ID'],
        })
        sentRfcMessageId = (meta.data.payload?.headers || [])
          .find(h => h.name?.toLowerCase() === 'message-id')?.value || null
      } catch (metaErr) {
        if (attempt === 3) {
          console.error('[Email Send] Could not read back the Message-ID after 3 attempts — this row is invisible to cross-mailbox de-duplication until the sending mailbox syncs it:', metaErr.message)
        } else {
          await new Promise(r => setTimeout(r, 300 * attempt))
        }
      }
    }

    const activityData = {
      type: 'email',
      companyId: sendCompanyId,
      userId: req.user.id,
      title: `Email – ${sendSubject}`,
      body: body || (htmlBody ? htmlBody.replace(/<[^>]+>/g, ' ').trim().slice(0, 2000) : null),
      bodyHtml: storedHtml || null,
      toEmail: to,
      ccEmail: cc || null,
      bccEmail: bcc || null,
      fromEmail: fromEmail,
      mailboxEmail: fromEmail,
      subject: sendSubject,
      emailStatus: 'sent',
      direction: 'outbound',
      messageId: sent.data.id,
      rfcMessageId: sentRfcMessageId,
      threadId: sent.data.threadId,
      trackingId,
      matchedCompanyEmail: resolvedMatchedAddress,
      matchBasis: sendMatchBasis,
      attachments: Array.isArray(attachments) && attachments.length
        ? attachments.map(a => ({ filename: a.filename, size: a.content ? Math.round(a.content.length * 0.75) : 0, mimeType: a.mimeType || null }))
        : undefined,
    }
    const activityInclude = { user: { select: { id: true, name: true, email: true } } }

    let activity
    try {
      activity = await prisma.activity.create({ data: activityData, include: activityInclude })
    } catch (createErr) {
      // rfcMessageId is uniquely indexed, and a clash means this exact email is
      // already stored — synced from another mailbox in the moment between the
      // send and this write. The email has ALREADY gone out, so this must never
      // fail the request.
      //
      // This used to insert the row anyway with rfcMessageId dropped to null.
      // That is what MANUFACTURED the duplicate: two rows for one real email,
      // and the copy holding the Message-ID was the synced one while the CRM
      // copy held the tracking — so the pair could never be reconciled by the
      // sync (its dedupe check keys on exactly the field that was nulled), and
      // the same email showed twice, once "Opened Nx" and once not tracked.
      //
      // The row that already owns this Message-ID IS this email, so adopt it
      // instead of adding a second one. Only what a synced copy cannot know is
      // filled in; nothing already recorded is overwritten, and no row is
      // deleted. Gmail is untouched either way.
      if (createErr.code !== 'P2002') throw createErr
      if (sentRfcMessageId) {
        const existing = await prisma.activity.findUnique({ where: { rfcMessageId: sentRfcMessageId } })
        if (existing) {
          activity = await prisma.activity.update({
            where: { id: existing.id },
            data: {
              // Carry the open-tracking identity across — without it this send
              // could never report opens, because the pixel points at this id.
              ...(existing.trackingId ? {} : { trackingId }),
              // We composed and sent this, so it is outbound regardless of how
              // the mailbox it was synced from happened to classify it. The
              // tracking block is only exposed for outbound mail, so this is
              // also what lets the opens show up at all.
              direction: 'outbound',
              ...(existing.emailStatus === 'opened' ? {} : { emailStatus: 'sent' }),
              // Fill only genuine gaps.
              ...(existing.bodyHtml   == null && storedHtml           ? { bodyHtml: storedHtml } : {}),
              ...(existing.companyId  == null && sendCompanyId        ? { companyId: sendCompanyId } : {}),
              ...(existing.ccEmail    == null && cc                   ? { ccEmail: cc } : {}),
              ...(existing.bccEmail   == null && bcc                  ? { bccEmail: bcc } : {}),
              ...(existing.matchedCompanyEmail == null && resolvedMatchedAddress ? { matchedCompanyEmail: resolvedMatchedAddress } : {}),
              ...(existing.matchBasis == null && sendMatchBasis       ? { matchBasis: sendMatchBasis } : {}),
            },
            include: activityInclude,
          })
        }
      }
      if (!activity) {
        // No row to adopt (or the clash was on some other unique field): fall
        // back to the previous behaviour so a sent email is never unrecorded.
        activity = await prisma.activity.create({
          data: { ...activityData, rfcMessageId: null },
          include: activityInclude,
        })
      }
    }

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

// ── Conversation matching ──────────────────────────────────────────────────
// The old `anchorForAddresses` lived here and implemented one of the two
// competing rules this rewrite removed: exact address, From/To only, and the
// mailbox and company required on OPPOSITE ends. The global Inbox meanwhile
// used a different rule (email OR domain, either end), which is precisely how
// a message could show in the Inbox yet never under its company.
//
// Both are now gone. Matching is delegated wholly to companyEmailMatcher, so
// From, To and Cc are all full matching fields and every caller — import,
// send, Inbox, reconciliation — agrees by construction.
//
// The opposite-ends requirement is deliberately NOT carried over: it was
// added to stop a mass-import incident, but the real defect there was that
// ANY address on a group email could anchor a thread. The matcher closes that
// differently and more precisely — only an explicitly saved company address
// (or an unambiguous, non-free company domain) can match at all, so an
// unrelated distribution list no longer resolves to a company in the first
// place.
function getHeaderFrom(headers, name) {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

// Pulls the header trio the matcher needs out of one Gmail message.
function headerTripleForMessage(msg) {
  const headers = msg.payload?.headers || []
  return {
    from: getHeaderFrom(headers, 'From'),
    to:   getHeaderFrom(headers, 'To'),
    cc:   getHeaderFrom(headers, 'Cc'),
  }
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

  const lockKey = `company:${companyId || [...companyAddresses].sort().join(',')}`
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

// ── POST /api/email/sync-mailbox ───────────────────────────────────────────
// Mailbox-wide sync for the calling user's connected Gmail account. This is
// what makes email arrive WITHOUT anyone opening a particular company — the
// structural gap behind "historical emails missing" and "future emails not
// associated". Every message is resolved through the same canonical matcher,
// so it produces exactly the associations a per-company sync would.
//
//   ?days=N  — window (default 30). `days=all` sweeps the whole mailbox and is
//              what to use for the initial historical import.
router.post('/sync-mailbox', auth, async (req, res) => {
  const daysRaw = String(req.body?.days ?? req.query?.days ?? '30').toLowerCase()
  const gmailQuery = daysRaw === 'all'
    ? 'in:anywhere'
    : `newer_than:${Math.min(Math.max(parseInt(daysRaw, 10) || 30, 1), 3650)}d`

  const lockKey = `mailbox:${req.user.id}`
  if (syncInFlight.has(lockKey)) {
    try { return res.json(await syncInFlight.get(lockKey)) }
    catch (err) { return res.status(err.status || 500).json({ message: err.message || 'Failed to sync mailbox.' }) }
  }

  const own = await ownAddressSet(req.user.id)
  const runPromise = runEmailSync({ userId: req.user.id, own, mode: 'mailbox', gmailQuery })
  syncInFlight.set(lockKey, runPromise)
  try {
    res.json(await runPromise)
  } catch (err) {
    console.error('[Email Sync] mailbox sync error:', err.message)
    res.status(err.status || 500).json({ message: err.message || 'Failed to sync mailbox.' })
  } finally {
    syncInFlight.delete(lockKey)
  }
})

// Pages through a Gmail search query until exhausted (or the safety cap is
// hit), instead of silently keeping only the first 100 hits — that truncation
// is why older conversations could go missing from a long history.
// Raised from 10 (1,000 messages). A full-history import ("days=all") on a
// real sales mailbox exceeds that easily, and the cap was silent: the run
// reported success while quietly leaving the oldest mail unsynced, which reads
// downstream as "messages missing from the CRM". Still bounded, so a runaway
// query cannot page forever — but now it says so when it stops early, instead
// of pretending it reached the end.
const MAX_PAGES = 100
async function listAllMessages(gmail, q) {
  const out = []
  let pageToken
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken })
    out.push(...(res.data.messages || []))
    pageToken = res.data.nextPageToken
    if (!pageToken) return out
  }
  console.warn(`[Email Sync] page cap (${MAX_PAGES}) reached for query "${q}" — ${out.length} message(s) collected, MORE REMAIN UNSYNCED. Narrow the window or raise MAX_PAGES.`)
  return out
}

async function runEmailSync({
  userId,
  companyId = null,
  companyAddresses = [],
  own = new Set(),
  mode = 'company',      // 'company' | 'mailbox'
  gmailQuery = null,     // mailbox mode: the Gmail search window
}) {
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
    console.log(`[Email Sync] ${mode} sync on ${profile.data.emailAddress}` +
      (mode === 'company' ? ` — company addresses: ${companyAddresses.join(', ')}` : ` — window: ${gmailQuery}`))
  } catch (tokenErr) {
    console.error(`[Email Sync] Token invalid:`, tokenErr.message)
    const err = new Error('Gmail token expired. Please disconnect Gmail and reconnect it.')
    err.status = 401
    throw err
  }

  // Candidate discovery casts a WIDE net — relevance is decided by the
  // canonical matcher below, never by the search query. Anything the search
  // over-collects is filtered out; anything it misses can never be recovered,
  // so breadth here matters more than precision.
  //
  // Two modes, ONE downstream pipeline:
  //   'company' — targeted at one company's saved addresses. Cheap, used by
  //               the manual "Sync emails" button on a company.
  //   'mailbox' — the whole mailbox over a time window. This is what makes
  //               historical and future email arrive without anyone opening a
  //               particular company (the defect this rewrite fixes).
  let queries
  if (mode === 'mailbox') {
    queries = [gmailQuery || 'newer_than:30d']
  } else {
    const clause = (field) => companyAddresses.map(a => `${field}:${a}`).join(' OR ')
    queries = [clause('from'), clause('to'), clause('cc'), clause('bcc')].map(q => `(${q})`)
  }

  const found = await Promise.all(queries.map(q => listAllMessages(gmail, q)))

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
  // threadIds is an Array, so `.size` was always undefined here — the log line
  // read "across undefined thread(s)" on every run.
  console.log(`[Email Sync] ${candidateCount} candidate hit(s) across ${threadIds.length} thread(s)`)

  // The canonical matcher index, built once for the whole run.
  const index = await matcher.getIndex()

  // One lookup for every candidate message instead of one per message later.
  const allCandidateIds = [...new Set([...candidatesByThread.values()].flatMap(s => [...s]))]
  const knownRows = allCandidateIds.length
    ? await prisma.activity.findMany({
        where: { messageId: { in: allCandidateIds } },
        select: { messageId: true, threadId: true, companyId: true },
      })
    : []
  // A message counts as "nothing left to do" only when it is already stored
  // AND already carries a company. Treating mere presence in the table as done
  // is what used to strand messages: one sent from the standalone composer is
  // stored with companyId null, so its thread looked fully synced, was never
  // re-fetched, and stayed orphaned permanently.
  const settledIds = new Set(knownRows.filter(r => r.companyId).map(r => r.messageId))
  const settledThreads = new Set(knownRows.filter(r => r.companyId).map(r => r.threadId))

  let synced = 0, adopted = 0, duplicates = 0
  let skippedThreads = 0, failedThreads = 0, unchangedThreads = 0, unassignedThreads = 0

  const processThread = async (threadId) => {
    // Fast path: every candidate message of this thread is already stored and
    // already linked to this company — there is nothing new to fetch, so skip
    // the (expensive) threads.get entirely. A new reply always shows up as a
    // new candidate id, so genuinely-updated threads still get processed.
    // The check is against messages linked to THIS company (not merely present
    // in the table), so a thread holding any unlinked message is still fetched
    // and that message gets adopted rather than stranded.
    const candidates = candidatesByThread.get(threadId)
    if (settledThreads.has(threadId) && [...candidates].every(id => settledIds.has(id))) {
      unchangedThreads++
      return
    }

    // Per-thread isolation: one failing thread (rate limit, deleted message,
    // malformed payload) must never abort the whole run and lose the progress
    // already made on every other thread.
    try {
      const threadRes = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' })
      const threadMessages = threadRes.data.messages || []

      // Thread-level resolution through THE canonical matcher. The first
      // message that resolves decides for the whole conversation, so replies
      // and forwards are never dropped and the thread is never shown with
      // holes. From/To/Cc are all matching fields, so a company Cc'd on
      // someone else's thread is now correctly associated (spec §6) — the old
      // rule fetched those messages and then discarded them.
      //
      // A thread that resolves to NO company is still stored, with companyId
      // null: it belongs in the mailbox record as an unassigned email, and
      // leaving it out is what made history look incomplete. It simply never
      // surfaces under a company.
      const resolved = matcher.matchThread(threadMessages.map(headerTripleForMessage), index)
      if (!resolved && mode === 'company') { skippedThreads++; return }

      const threadCompanyId   = resolved?.companyId || null
      const threadMatchedAddr = resolved?.matchedEmail || null
      const threadMatchBasis  = resolved?.basis || null
      if (!resolved) unassignedThreads++

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

        const rfcId = getHeader('Message-ID') || getHeader('Message-Id') || null

        // THE authoritative timestamp is Gmail's own internalDate — the value
        // the Gmail UI displays. The RFC "Date:" header, used here before, is
        // only what the SENDING CLIENT claimed: it drifts with clock skew,
        // delayed delivery and relaying, and a forwarded or re-sent message can
        // carry a Date header from days earlier. That is why CRM dates did not
        // line up with what the user sees in Gmail. The header is kept as a
        // fallback for the (rare) case internalDate is absent.
        const internalMs = Number(msg.internalDate)
        const gmailDate = Number.isFinite(internalMs) && internalMs > 0
          ? new Date(internalMs)
          : (getHeader('Date') ? new Date(getHeader('Date')) : new Date())

        if (existing) {
          // ADOPT and CORRECT, never skip. Re-pointing the existing row keeps
          // its id, trackingId and open history intact — which is why tracking
          // and the Activity view can no longer disagree.
          //
          // The matcher is authoritative, so there is no "don't steal from
          // another company" special case any more: if it resolves this thread
          // to company X, X is where it belongs. The old guard existed only
          // because two different rules could disagree about ownership.
          //
          // Deliberately NOT corrected here: createdAt. Rewriting the stored
          // date of rows that already exist would silently modify production
          // data on every sync, so the internalDate change below applies to
          // NEWLY created rows only. Back-correcting existing dates is a
          // separate, explicit migration.
          const patch = {}
          if (existing.companyId !== threadCompanyId) patch.companyId = threadCompanyId
          if (existing.matchedCompanyEmail !== threadMatchedAddr) patch.matchedCompanyEmail = threadMatchedAddr
          if (existing.matchBasis !== threadMatchBasis) patch.matchBasis = threadMatchBasis
          if (!existing.threadId) patch.threadId = threadId
          if (existing.ccEmail == null && getHeader('Cc')) patch.ccEmail = getHeader('Cc')
          if (existing.bccEmail == null && getHeader('Bcc')) patch.bccEmail = getHeader('Bcc')
          if (!existing.mailboxEmail) patch.mailboxEmail = userEmail
          if (!existing.rfcMessageId && rfcId) patch.rfcMessageId = rfcId
          // Emails stored before bodyHtml existed keep only the plain-text body.
          // The real markup is still in the mailbox, so a sync that revisits the
          // thread recovers it — genuinely, from the message itself, never
          // reconstructed or guessed.
          if (!existing.bodyHtml) {
            const html = extractHtmlBody(msg.payload)
            if (html) patch.bodyHtml = html
          }
          if (existing.attachments == null) {
            const atts = extractAttachments(msg.payload)
            if (atts.length) patch.attachments = atts
          }
          if (Object.keys(patch).length) {
            try {
              await prisma.activity.update({ where: { id: existing.id }, data: patch })
              adopted++
            } catch (e) {
              // A unique clash on rfcMessageId means the same real email is
              // already stored from another mailbox — drop just that field and
              // keep the rest of the correction.
              if (e.code === 'P2002') {
                delete patch.rfcMessageId
                if (Object.keys(patch).length) {
                  await prisma.activity.update({ where: { id: existing.id }, data: patch })
                  adopted++
                }
              } else throw e
            }
          }
          continue
        }

        // Cross-mailbox duplicate check (spec §11). Gmail's own message id is
        // unique per MAILBOX, so once several users' mailboxes are synced the
        // same real email arrives twice under two different ids. The RFC 5322
        // Message-ID header is globally unique and is what actually identifies
        // it. Guarded here in application code AND by a unique index.
        if (rfcId) {
          const dupe = await prisma.activity.findUnique({ where: { rfcMessageId: rfcId }, select: { id: true } })
          if (dupe) { duplicates++; continue }
        }

        const subjectRaw = getHeader('Subject') || '(no subject)'
        const atts       = extractAttachments(msg.payload)

        try {
          await prisma.activity.create({
            data: {
              type:        'email',
              companyId:   threadCompanyId,
              userId,
              title:       `Email – ${subjectRaw}`,
              body:        extractTextBody(msg.payload) || null,
              bodyHtml:    extractHtmlBody(msg.payload) || null,
              toEmail:     getHeader('To'),
              ccEmail:     getHeader('Cc') || null,
              bccEmail:    getHeader('Bcc') || null,
              fromEmail:   getHeader('From'),
              subject:     subjectRaw,
              emailStatus: isOutbound ? 'sent' : 'received',
              direction:   isOutbound ? 'outbound' : 'inbound',
              messageId:   msg.id,
              rfcMessageId: rfcId,
              threadId,
              matchedCompanyEmail: threadMatchedAddr,
              matchBasis:  threadMatchBasis,
              mailboxEmail: userEmail,
              attachments: atts.length ? atts : undefined,
              createdAt:   gmailDate,
            },
          })
          synced++
        } catch (e) {
          // Lost a race against a concurrent sync of the same message — the
          // row exists, which is the outcome we wanted anyway.
          if (e.code === 'P2002') duplicates++
          else throw e
        }
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
      // Exactly the rule used on import — THE canonical matcher, applied to
      // the stored headers. Keeping these identical is what makes the module
      // self-healing: if a company's addresses change, a re-sync releases rows
      // that no longer qualify instead of leaving them linked forever.
      const stillOurs = rows.some(r => {
        const m = matcher.matchHeaders({ from: r.fromEmail, to: r.toEmail, cc: r.ccEmail }, index)
        return m && m.companyId === companyId
      })
      if (!stillOurs) staleIds.push(...rows.map(r => r.id))
    }
    if (staleIds.length) {
      // Wrongly-linked rows are UNLINKED, never deleted: the row, its
      // trackingId and its open history all survive, and the right company can
      // claim it on a later sync.
      const r = await prisma.activity.updateMany({
        where: { id: { in: staleIds } },
        data: { companyId: null, matchedCompanyEmail: null, matchBasis: null },
      })
      unlinked = r.count
    }
  }

  console.log(`[Email Sync] Done (${mode}): created=${synced}, adopted=${adopted}, duplicates=${duplicates}, unlinked=${unlinked}, threadsUnchanged=${unchangedThreads}, threadsUnassigned=${unassignedThreads}, threadsSkipped=${skippedThreads}, threadsFailed=${failedThreads}`)
  return {
    synced, adopted, duplicates, unlinked, removed: 0, total: candidateCount,
    unchangedThreads, skippedThreads, failedThreads, unassignedThreads, mode,
  }
}

// ── Conversation hierarchy: Company → Email Address → Thread → Messages ─────
// Tracking telemetry (open count/times) is sender-private: it is stripped from
// the payload for anyone who is not the user who sent the message, so a
// teammate viewing the same company never sees another rep's open data.
// Collapses rows that are the SAME real Gmail message down to one.
//
// Identity is the RFC 5322 Message-ID and nothing else. Gmail's own message id
// and thread id are per-MAILBOX, so the one email sitting in two connected
// mailboxes legitimately has two of each — while subject and body are shared
// by genuinely different messages all the time (a template re-sent, a repeated
// notification), which is exactly why neither may be used to decide identity.
// A row with no Message-ID is therefore never collapsed: unidentifiable is not
// the same as duplicate.
//
// Which copy survives matters for more than tidiness. The CRM-composed send is
// the row carrying trackingId and the open history; the copy the sync pulled
// from the recipient's mailbox carries none. Preferring the tracked row is what
// stops the same email reading "Opened 3x" on one screen and showing nothing on
// another — the duplicate was the cause of that inconsistency, not a separate
// tracking bug.
function dedupeSameGmailMessage(rows) {
  const winnerByRfc = new Map()
  for (const r of rows) {
    if (!r.rfcMessageId) continue
    const cur = winnerByRfc.get(r.rfcMessageId)
    if (!cur) { winnerByRfc.set(r.rfcMessageId, r); continue }
    // Prefer the row that can actually report opens, then the outbound
    // original over the synced-back copy of it.
    const better = (!cur.trackingId && r.trackingId) ||
      (!!cur.trackingId === !!r.trackingId && cur.direction !== 'outbound' && r.direction === 'outbound')
    if (better) winnerByRfc.set(r.rfcMessageId, r)
  }
  return rows.filter(r => !r.rfcMessageId || winnerByRfc.get(r.rfcMessageId) === r)
}

function publicMessage(a, viewerId) {
  const isOutbound = a.direction === 'outbound'
  return {
    id:        a.id,
    messageId: a.messageId,
    threadId:  a.threadId,
    subject:   a.subject,
    body:      a.body,
    // The formatted original, when we have it. The client sanitises before
    // rendering (see client/src/utils/emailHtml.js) and falls back to `body`
    // above for anything plain-text-only.
    bodyHtml:  a.bodyHtml || null,
    fromEmail: a.fromEmail,
    toEmail:   a.toEmail,
    ccEmail:   a.ccEmail,
    direction: a.direction,
    createdAt: a.createdAt,
    attachments: Array.isArray(a.attachments) ? a.attachments : [],
    user:      a.user || null,
    matchedCompanyEmail: a.matchedCompanyEmail,
    // Tracking for outbound mail. Previously restricted to the viewer's OWN
    // sends, while the Company Detail activity feed applied no such filter — so
    // the very same email reported "Opened 3x" on one screen and nothing at all
    // on the other. Both screens now follow one rule.
    tracking: isOutbound ? {
      // Can this email report an open AT ALL? Only a CRM-composed send carries
      // a pixel; mail written in Gmail and pulled in by sync never did, and must
      // read as "not tracked" rather than as "not opened yet".
      tracked:       !!a.trackingId,
      sentByViewer:  a.userId === viewerId,
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
    // gmailDeletedAt: null — a message the user permanently deleted in Gmail
    // must stop appearing here too (Gmail is the source of truth). The row is
    // kept in the table, only withheld from display.
    const allRows = await prisma.activity.findMany({
      where: { companyId, type: 'email', gmailDeletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, threadId: true, subject: true, title: true, direction: true,
        createdAt: true, fromEmail: true, toEmail: true, ccEmail: true,
        matchedCompanyEmail: true, attachments: true,
        rfcMessageId: true, trackingId: true,
      },
    })
    // Gmail's threadId is per-mailbox, so the same real email synced from two
    // connected mailboxes lands under two different threadIds — each would
    // otherwise become its own thread card below. Collapsed here, once, across
    // every thread at once (never within a single thread only), so this is
    // correct with no pagination edge case: this endpoint returns the whole
    // company's history in one response, not a page of it.
    const rows = dedupeSameGmailMessage(allRows)

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

// The former `getCrmAddresses()` / `crmAddressCache` lived here. It was the
// SECOND, competing matcher: company email OR company domain OR deal contact
// email OR deal domain, in either direction. Because the import path used a
// stricter, different rule, a message could pass this filter and appear in the
// Inbox while never being linked to any company — the exact inconsistency this
// rewrite removes.
//
// Inbox relevance is now the stored company association produced by the one
// canonical matcher (companyEmailMatcher.js), so both surfaces read the same
// records. Deal-contact-only matching is deliberately not carried over:
// spec §13 makes the company's explicitly configured addresses the source of
// truth, and a deal's contact address that matters should be saved on its
// company — where it now also drives the company association, not just a
// listing filter.

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
// The company-association filter is applied in SQL (not as a post-fetch JS
// filter), so it applies to the COUNT and the paginated query identically —
// page/total stay accurate instead of pages coming back short after
// non-CRM rows are dropped client-side.
router.get('/inbox', auth, async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50))
    const { search, direction, companyId, dateFrom, dateTo } = req.query

    const conditions = [Prisma.sql`type = 'email'`]
    if (direction) conditions.push(Prisma.sql`direction = ${direction}`)
    if (companyId) conditions.push(Prisma.sql`"companyId" = ${companyId}`)
    if (search && search.trim()) {
      const q = `%${search.trim()}%`
      conditions.push(Prisma.sql`(subject ILIKE ${q} OR "fromEmail" ILIKE ${q} OR "toEmail" ILIKE ${q})`)
    }
    if (dateFrom) conditions.push(Prisma.sql`"createdAt" >= ${new Date(dateFrom)}`)
    if (dateTo) conditions.push(Prisma.sql`"createdAt" <= ${new Date(dateTo)}`)
    // CRM relevance is now simply "the canonical matcher associated it with a
    // company". This replaces the old inline email-OR-domain SQL rule, which
    // was the SECOND matcher in the system and the direct cause of the
    // reported inconsistency: it could qualify a message for the Inbox that
    // the import rule had refused to link to any company, so the same email
    // appeared here and nowhere else.
    //
    // Both surfaces now read the same stored association, so Inbox and
    // Company → Activities → Emails cannot disagree.
    //
    // Unassigned mail is STORED but never DISPLAYED. The CRM exists for
    // customer correspondence, so personal, internal and vendor mail the
    // matcher could not place against a saved company address is withheld
    // from this read path unconditionally — there is deliberately no query
    // parameter to opt back into seeing it, because any such parameter is a
    // way for that mail to reach the UI again.
    //
    // Nothing is deleted and the sync is unchanged: those rows stay in the
    // database in full for audit and history. The moment a company gains the
    // matching address, the matcher links them and they appear here on their
    // own — hiding is a display rule, not a data change.
    conditions.push(Prisma.sql`"companyId" IS NOT NULL`)
    // A message permanently deleted in Gmail stops being listed here — Gmail is
    // the source of truth. Applied as a SQL condition (not a post-fetch filter)
    // so it narrows the COUNT and the page identically.
    conditions.push(Prisma.sql`"gmailDeletedAt" IS NULL`)
    const whereClause = Prisma.join(conditions, ' AND ')

    const countRows = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT COALESCE("threadId", 'single:' || id))::int AS count
      FROM "Activity" WHERE ${whereClause}
    `
    const total = countRows[0]?.count || 0

    const pageRows = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT DISTINCT ON (COALESCE("threadId", 'single:' || id)) *
        FROM "Activity"
        WHERE ${whereClause}
        ORDER BY COALESCE("threadId", 'single:' || id), "createdAt" DESC
      ) t
      ORDER BY t."createdAt" DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `

    // threadId is per-mailbox, so the one row DISTINCT ON keeps per thread can
    // still be the exact same real email as another thread's row — the same
    // outreach synced back from a second connected mailbox, one thread each.
    // Collapsed here so the Inbox lists that email once, matched on
    // rfcMessageId alone (never subject/body/threadId, which distinct emails
    // share constantly). Applied to this page's rows only: a duplicate pair
    // split across a page boundary is not caught, which is the trade-off for
    // not restructuring the count/pagination query for a case that is already
    // provably rare (0 confirmed in production).
    const rows = dedupeSameGmailMessage(pageRows)

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

    // gmailDeletedAt: null — see /conversations. A thread never shows a message
    // that no longer exists in Gmail.
    const where = { type: 'email', companyId: companyId || undefined, gmailDeletedAt: null }
    if (threadId.startsWith('single:')) where.id = threadId.slice(7)
    else where.threadId = threadId

    const allRows = await prisma.activity.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    if (allRows.length === 0) return res.status(404).json({ message: 'Conversation not found.' })

    // One real Gmail message renders once. Genuinely different messages in the
    // thread are untouched — they have their own Message-IDs.
    const rows = dedupeSameGmailMessage(allRows)

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
// Exposed for the background mailbox sync job (jobs/gmailAutoSync.js), which
// must drive the SAME pipeline as the HTTP routes rather than reimplementing
// any part of it.
module.exports.runEmailSync = runEmailSync
module.exports.ownAddressSet = ownAddressSet
