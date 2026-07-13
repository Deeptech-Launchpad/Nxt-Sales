const router = require('express').Router()
const auth = require('../middleware/authMiddleware')
const crypto = require('crypto')
const { PrismaClient } = require('@prisma/client')
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
// continue it. Used by both the legacy contactId/companyId auto-thread path
// and the new Email Mode "continue" lookup. Never throws — falls back to
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

// POST /api/email/send — send email via Gmail API
// Accepts: to, subject, body (plain) OR htmlBody (html), cc, bcc,
//          attachments: [{ filename, content (base64), mimeType }]
//          contactId, companyId
//          emailMode: 'new' | 'continue' (optional) — see Thread continuation below
router.post('/send', auth, async (req, res) => {
  const { to, subject, body, htmlBody, cc, bcc, attachments = [], contactId, companyId, emailMode } = req.body
  if (!to || !subject) return res.status(400).json({ message: 'To and Subject are required.' })

  const account = await prisma.emailAccount.findFirst({
    where: { userId: req.user.id, provider: 'gmail' },
  })
  if (!account) {
    return res.status(400).json({ message: 'Gmail not connected. Please connect your Gmail account first.' })
  }

  try {
    const { google } = require('googleapis')
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

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Use htmlBody if provided; otherwise convert plain body to a simple HTML wrapper
    const baseHtml = htmlBody
      || (body ? `<div style="font-family:sans-serif;line-height:1.6">${body.replace(/\n/g, '<br>')}</div>` : '')

    // Open-tracking: unique token embedded as a hidden pixel; when the recipient
    // opens the email the pixel loads and /track/open records it against this id.
    const trackingId  = crypto.randomUUID()
    const effectiveHtml = `${baseHtml}${trackingPixel(trackingId)}`

    // ── Thread continuation ─────────────────────────────────
    // Three ways this resolves, in priority order:
    //   1. emailMode === 'new'      → always a fresh conversation (no lookup at all).
    //   2. emailMode === 'continue' → look up the latest thread by sender+recipient
    //      email (Email Mode dropdown — Update 4). No contactId/companyId needed,
    //      so this works from the standalone Email Composer too.
    //   3. neither provided         → the ORIGINAL contactId/companyId auto-thread
    //      behavior, byte-for-byte unchanged, for any caller that predates Email Mode.
    // In all cases, if no matching thread is found these stay null → new thread,
    // exactly as before. Subject is never altered to defeat Gmail's own grouping.
    let threadId    = null
    let sendSubject = subject
    let inReplyTo   = null
    let references  = null

    if (emailMode === 'new') {
      // explicit: skip all lookup, send completely fresh

    } else if (emailMode === 'continue') {
      const lastEmail = await prisma.activity.findFirst({
        where: {
          type: 'email',
          threadId: { not: null },
          userId: req.user.id,
          OR: [
            { fromEmail: account.email, toEmail: to },
            { fromEmail: to, toEmail: account.email },
          ],
        },
        orderBy: { createdAt: 'desc' },
      })
      if (lastEmail?.threadId) {
        threadId = lastEmail.threadId
        const meta = await resolveThreadMeta(gmail, threadId)
        if (meta.subject) sendSubject = meta.subject
        inReplyTo  = meta.inReplyTo
        references = meta.references
      }

    } else if (contactId || companyId) {
      const lastEmail = await prisma.activity.findFirst({
        where: {
          type: 'email',
          threadId: { not: null },
          userId: req.user.id,
          ...(contactId && { contactId }),
          ...(companyId && { companyId }),
        },
        orderBy: { createdAt: 'desc' },
      })
      if (lastEmail?.threadId) {
        threadId = lastEmail.threadId
        const meta = await resolveThreadMeta(gmail, threadId)
        if (meta.subject) sendSubject = meta.subject
        inReplyTo  = meta.inReplyTo
        references = meta.references
      }
    }

    const rawBuffer = buildRawEmail({
      from: account.email,
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
        ...(contactId && { contactId }),
        ...(companyId && { companyId }),
        userId: req.user.id,
        title: `Email – ${sendSubject}`,
        body: body || (htmlBody ? htmlBody.replace(/<[^>]+>/g, ' ').trim().slice(0, 2000) : null),
        toEmail: to,
        fromEmail: account.email,
        subject: sendSubject,
        emailStatus: 'sent',
        direction: 'outbound',
        messageId: sent.data.id,
        threadId: sent.data.threadId,
        trackingId,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    })

    res.status(201).json(activity)
  } catch (err) {
    console.error('Gmail send error:', err.message)
    res.status(500).json({ message: err.message || 'Failed to send email.' })
  }
})

// POST /api/email/sync — strict sync: only emails between user Gmail ↔ contact/company email
router.post('/sync', auth, async (req, res) => {
  const { contactEmail, contactId, companyId } = req.body
  if (!contactEmail) return res.status(400).json({ message: 'contactEmail required' })

  const account = await prisma.emailAccount.findFirst({
    where: { userId: req.user.id, provider: 'gmail' },
  })
  if (!account) return res.json({ synced: 0, message: 'Gmail not connected' })

  const userEmail    = account.email.toLowerCase()
  const contactLower = contactEmail.toLowerCase()

  try {
    const { google } = require('googleapis')
    const oauth2Client = getOAuth2Client()
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    })

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

    // Verify token is valid and log which Gmail account is actually connected
    let actualEmail
    try {
      const profile = await gmail.users.getProfile({ userId: 'me' })
      actualEmail = profile.data.emailAddress
      console.log(`[Email Sync] Token valid — connected Gmail: ${actualEmail}`)
      console.log(`[Email Sync] Searching for emails with contact: ${contactLower}`)
    } catch (tokenErr) {
      console.error(`[Email Sync] Token invalid:`, tokenErr.message)
      return res.status(401).json({ message: 'Gmail token expired. Please disconnect Gmail and reconnect it.' })
    }

    // Use simple single-address queries — Gmail API can silently return 0
    // when combining from: and to: for the signed-in user's own address.
    // The strict app-level header check below ensures only relevant emails are kept.
    const queryInbound  = `from:${contactEmail}`   // emails received from contact
    const queryOutbound = `to:${contactEmail}`      // emails sent to contact (in Sent)

    console.log(`[Email Sync] Inbound  query: ${queryInbound}`)
    console.log(`[Email Sync] Outbound query: ${queryOutbound}`)

    const [inboundRes, outboundRes] = await Promise.all([
      gmail.users.messages.list({ userId: 'me', q: queryInbound,  maxResults: 100 }),
      gmail.users.messages.list({ userId: 'me', q: queryOutbound, maxResults: 100 }),
    ])

    // Merge + deduplicate by message ID
    const seenIds = new Set()
    const messages = [
      ...(inboundRes.data.messages  || []),
      ...(outboundRes.data.messages || []),
    ].filter(m => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true })

    const threadIds = new Set(messages.map(m => m.threadId))
    console.log(`[Email Sync] Gmail returned ${messages.length} message(s) (${(inboundRes.data.messages||[]).length} inbound + ${(outboundRes.data.messages||[]).length} outbound), ${threadIds.size} thread(s)`)

    // All messageIds that belong to valid threads — used to clean up unrelated old syncs
    const validMessageIds = new Set()
    let synced = 0

    for (const threadId of threadIds) {
      const threadRes = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      })

      const threadMessages = threadRes.data.messages || []

      for (const msg of threadMessages) {
        const headers     = msg.payload?.headers || []
        const fromRaw     = headers.find(h => h.name === 'From')?.value  || ''
        const toRaw       = headers.find(h => h.name === 'To')?.value    || ''
        const fromLower   = fromRaw.toLowerCase()
        const toLower     = toRaw.toLowerCase()

        // Application-level strict check: message must be between user and contact only
        const userToContact    = fromLower.includes(userEmail)    && toLower.includes(contactLower)
        const contactToUser    = fromLower.includes(contactLower) && toLower.includes(userEmail)
        if (!userToContact && !contactToUser) continue

        validMessageIds.add(msg.id)

        const exists = await prisma.activity.findFirst({ where: { messageId: msg.id } })
        if (exists) continue

        const subjectRaw = headers.find(h => h.name === 'Subject')?.value || '(no subject)'
        const dateHeader = headers.find(h => h.name === 'Date')?.value

        const bodyText = extractTextBody(msg.payload)

        const isInbound = fromLower.includes(contactLower)
        const emailDate = dateHeader ? new Date(dateHeader) : new Date()

        await prisma.activity.create({
          data: {
            type:        'email',
            ...(contactId && { contactId }),
            ...(companyId && { companyId }),
            userId:      req.user.id,
            title:       `Email – ${subjectRaw}`,
            body:        bodyText || null,
            toEmail:     toRaw,
            fromEmail:   fromRaw,
            subject:     subjectRaw,
            emailStatus: isInbound ? 'received' : 'sent',
            direction:   isInbound ? 'inbound'  : 'outbound',
            messageId:   msg.id,
            threadId:    threadId,
            createdAt:   emailDate,
          },
        })
        synced++
      }
    }

    // Delete previously synced emails for this entity that don't match the strict filter
    const allSynced = await prisma.activity.findMany({
      where: {
        type: 'email',
        messageId: { not: null },
        ...(contactId && { contactId }),
        ...(companyId && { companyId }),
      },
      select: { id: true, messageId: true },
    })
    const toDelete = allSynced.filter(a => !validMessageIds.has(a.messageId))
    if (toDelete.length > 0) {
      await prisma.activity.deleteMany({ where: { id: { in: toDelete.map(a => a.id) } } })
    }

    console.log(`[Email Sync] Done: synced=${synced}, removed=${toDelete.length}`)
    res.json({ synced, removed: toDelete.length, total: messages.length })
  } catch (err) {
    console.error('Gmail sync error:', err.message)
    res.status(500).json({ message: err.message || 'Failed to sync emails.' })
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
