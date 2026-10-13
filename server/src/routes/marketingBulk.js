const express = require('express')
const crypto = require('crypto')
const axios = require('axios')
const jwt = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const JWT_SECRET = require('../config/jwtSecret')
const authMiddleware = require('../middleware/authMiddleware')

// ── Marketing AI Agent → Bulk Email sending through NXT Sales (2026-10-09) ──
//
// The Marketing AI Agent prepares, approves and schedules its bulk emails; at
// each email's time it asks NXT Sales to send it. NXT Sales sends it through
// its ONE existing send pipeline (POST /api/email/send) — the same Gmail API
// send, signature, activity recording and native open tracking as every
// other CRM email. Nothing here sends mail itself or tracks opens itself.
//
// Who may call: only the Marketing AI Agent's service account
// (MARKETING_SERVICE_USER_ID). Who it sends as: only the ONE sender a CRM
// admin names in MARKETING_BULK_SENDER_USER_ID, whose Gmail is connected in
// NXT Sales. The caller cannot choose a sender or a From address, and never
// receives a token or a Gmail credential.
//
// How it sends as that user: exactly as jobs/scheduledOutreach.js already
// does — a 5-minute token signed here, inside NXT Sales, for the configured
// sender, posted to this server's own /api/email/send on 127.0.0.1.
//
// Exactly once: every email carries the caller's idempotency key. The key is
// claimed in MarketingBulkSend BEFORE the send, so a retried, repeated or
// timed-out request can never send it twice:
//   sent     → answered from the record, never sent again
//   sending  → still in progress, nothing sent again
//   unknown  → the send pipeline did not give a clear answer (timeout, server
//              error) — Gmail may have sent it, so it is never retried
//              automatically; a person checks the sender's Sent folder
//   failed   → the pipeline refused it before sending (4xx, e.g. "Gmail not
//              connected") — the same key may be sent again

const KEY_RE = /^[A-Za-z0-9:._-]{8,200}$/
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"']+@[^\s@<>()[\]\\,;:"']+\.[A-Za-z]{2,}$/
const MAX_CC = 20
const MAX_STATUS_KEYS = 200

// Attachments (2026-10-12): the same files may go with every email of a bulk
// send. They are forwarded, unchanged, to the existing /api/email/send, which
// builds the Gmail message (the open-tracking pixel is in the HTML part and is
// not affected). That route validates nothing about attachments, so every rule
// is enforced HERE, before the idempotency key is claimed.
const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024 // decoded, all files together
// No control characters, quotes, slashes or other header/path-significant characters.
// eslint-disable-next-line no-control-regex
const ATTACHMENT_NAME_RE = /^[^\x00-\x1f\x7f"\\/<>:*?|]{1,150}$/
const ATTACHMENT_MIME_RE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,126}$/
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'pif', 'msi', 'msp', 'dll', 'jar', 'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1',
  'reg', 'lnk', 'hta', 'cpl', 'app', 'apk', 'sh', 'bin', 'iso', 'dmg',
])

/** Validates the attachments of one send. Returns { ok: true, list } or { ok: false, message }. */
function checkAttachments(input) {
  if (input === undefined || input === null) return { ok: true, list: [] }
  const bad = (message) => ({ ok: false, message })
  if (!Array.isArray(input)) return bad('attachments must be a list.')
  if (input.length > MAX_ATTACHMENTS) return bad(`At most ${MAX_ATTACHMENTS} attachments.`)
  let encodedChars = 0
  for (const a of input) encodedChars += a && typeof a.content === 'string' ? a.content.length : 0
  if (encodedChars > Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 16) return bad('The attachments are too large (10 MB in all).')
  const list = []
  let total = 0
  for (const a of input) {
    if (!a || typeof a !== 'object') return bad('Each attachment must be an object with filename, mimeType and content.')
    const filename = typeof a.filename === 'string' ? a.filename.trim() : ''
    if (!ATTACHMENT_NAME_RE.test(filename) || filename === '.' || filename === '..') return bad('An attachment has an invalid file name.')
    const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : ''
    if (BLOCKED_EXTENSIONS.has(ext)) return bad(`Attachments of type .${ext} are not allowed.`)
    const mimeType = a.mimeType === undefined || a.mimeType === null || a.mimeType === '' ? 'application/octet-stream' : String(a.mimeType)
    if (!ATTACHMENT_MIME_RE.test(mimeType)) return bad(`An attachment has an invalid mimeType.`)
    const content = typeof a.content === 'string' ? a.content : ''
    if (!content || content.length % 4 !== 0 || !BASE64_RE.test(content)) return bad('An attachment content must be standard base64 (no data: prefix).')
    const bytes = (content.length / 4) * 3 - (content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0)
    if (bytes <= 0) return bad('An attachment is empty.')
    total += bytes
    if (total > MAX_ATTACHMENT_BYTES) return bad('The attachments are too large (10 MB in all).')
    list.push({ filename, mimeType, content })
  }
  return { ok: true, list }
}

/** What an attachment contributes to the "same key = same email" hash: names, types and a digest, in order. */
const attachmentDigest = (list) => list.map((a) => [a.filename, a.mimeType, crypto.createHash('sha256').update(a.content).digest('hex')])

function config() {
  return {
    serviceUserId: (process.env.MARKETING_SERVICE_USER_ID || '').trim(),
    senderUserId: (process.env.MARKETING_BULK_SENDER_USER_ID || '').trim(),
  }
}

const cleanEmail = (v) => {
  const s = String(v || '').trim().toLowerCase()
  return EMAIL_RE.test(s) ? s : null
}

/** The real send: this server's own /api/email/send, as the configured sender. */
async function sendThroughPipeline(sender, payload) {
  const token = jwt.sign({ id: sender.id, name: sender.name, email: sender.email }, JWT_SECRET, { expiresIn: '5m' })
  const res = await axios.post(`http://127.0.0.1:${process.env.PORT || 5000}/api/email/send`, payload, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
    // Attachments make the body large (up to ~14 MB encoded); never let the HTTP client's own default cut it off.
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })
  return res.data
}

/**
 * This module's own database client, limited to ONE connection, opened only
 * when the Marketing AI Agent calls. The database is shared and close to its
 * connection limit, so this feature must never take connections the rest of
 * NXT Sales needs.
 */
function oneConnectionClient() {
  const url = process.env.DATABASE_URL || ''
  if (!url) return new PrismaClient()
  const withLimit = /[?&]connection_limit=/.test(url) ? url : `${url}${url.includes('?') ? '&' : '?'}connection_limit=1`
  return new PrismaClient({ datasources: { db: { url: withLimit } } })
}

function createMarketingBulkRouter({ prisma = oneConnectionClient(), auth = authMiddleware, send = sendThroughPipeline } = {}) {
  const router = express.Router()

  // Every request: a valid NXT Sales token (the existing middleware), from
  // the Marketing service account, with the feature configured.
  router.use(auth, (req, res, next) => {
    const { serviceUserId, senderUserId } = config()
    if (!serviceUserId || !senderUserId) {
      return res.status(503).json({ message: 'Marketing bulk sending is not configured on NXT Sales (MARKETING_SERVICE_USER_ID, MARKETING_BULK_SENDER_USER_ID).' })
    }
    if (!req.user || req.user.id !== serviceUserId) {
      return res.status(403).json({ message: 'Only the Marketing AI Agent service account may use this API.' })
    }
    next()
  })

  /** The configured sender, and whether it can send. Its Gmail tokens never leave NXT Sales. */
  async function loadSender() {
    const { senderUserId } = config()
    const user = await prisma.user.findUnique({ where: { id: senderUserId }, select: { id: true, name: true, email: true, status: true } })
    if (!user || user.status === 'deactivated') return { user: null, gmail: null, problem: 'The configured sender (MARKETING_BULK_SENDER_USER_ID) is not an active NXT Sales user.' }
    const gmail = await prisma.emailAccount.findFirst({ where: { userId: user.id, provider: 'gmail' }, select: { email: true } })
    if (!gmail) return { user, gmail: null, problem: `The configured sender (${user.email}) has no Gmail connected in NXT Sales.` }
    return { user, gmail, problem: null }
  }

  router.get('/sender', async (_req, res) => {
    try {
      const s = await loadSender()
      res.json({
        configured: true,
        ready: !s.problem,
        problem: s.problem,
        name: s.user?.name || null,
        fromEmail: s.gmail?.email || null,
        // The caller must not send attachments to a CRM that does not advertise this: an older CRM would ignore them.
        capabilities: { attachments: { maxFiles: MAX_ATTACHMENTS, maxBytes: MAX_ATTACHMENT_BYTES } },
      })
    } catch (err) {
      console.error('[Marketing bulk] sender lookup failed:', err.message)
      res.status(500).json({ message: 'Could not read the configured sender.' })
    }
  })

  function view(row, duplicate) {
    return {
      idempotencyKey: row.idempotencyKey,
      status: row.status,
      duplicate,
      error: row.error || null,
      sentAt: row.sentAt || null,
      messageId: row.messageId || null,
      threadId: row.threadId || null,
      activityId: row.activityId || null,
      fromEmail: row.fromEmail || null,
      tracked: Boolean(row.tracked),
    }
  }

  router.post('/send', async (req, res) => {
    const b = req.body || {}
    const idempotencyKey = String(b.idempotencyKey || '')
    const to = cleanEmail(b.to)
    const ccIn = Array.isArray(b.cc) ? b.cc : []
    const cc = ccIn.map(cleanEmail)
    const subject = typeof b.subject === 'string' ? b.subject.trim() : ''
    const htmlBody = typeof b.htmlBody === 'string' ? b.htmlBody : ''
    const text = typeof b.text === 'string' ? b.text : ''
    const campaignId = String(b.campaignId || '').slice(0, 200)
    const recipientId = String(b.recipientId || '').slice(0, 200)

    if (!KEY_RE.test(idempotencyKey)) return res.status(400).json({ message: 'idempotencyKey is required (8–200 letters, digits, : . _ -).' })
    if (!campaignId || !recipientId) return res.status(400).json({ message: 'campaignId and recipientId are required.' })
    if (!to) return res.status(400).json({ message: '"to" must be one valid email address.' })
    if (ccIn.length > MAX_CC || cc.some((c) => !c)) return res.status(400).json({ message: `"cc" must be a list of at most ${MAX_CC} valid email addresses.` })
    if (!subject || subject.length > 500 || /[\r\n]/.test(subject)) return res.status(400).json({ message: 'subject is required, one line, at most 500 characters.' })
    if (!htmlBody || htmlBody.length > 1_000_000) return res.status(400).json({ message: 'htmlBody is required (at most 1,000,000 characters).' })
    if (text.length > 200_000) return res.status(400).json({ message: 'text is too long.' })
    const att = checkAttachments(b.attachments)
    if (!att.ok) return res.status(400).json({ message: att.message })

    // The same key must always mean the same email. Attachments join the hash only when there are any,
    // so a request without attachments hashes exactly as before this feature.
    const hashParts = [to, [...cc].sort(), subject, htmlBody]
    if (att.list.length) hashParts.push(attachmentDigest(att.list))
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(hashParts)).digest('hex')

    try {
      const sender = await loadSender()
      if (sender.problem) return res.status(409).json({ message: sender.problem })

      // Claim the key before anything is sent.
      let claimed = false
      let row = null
      try {
        row = await prisma.marketingBulkSend.create({
          data: { idempotencyKey, campaignId, recipientId, senderUserId: sender.user.id, toEmail: to, subject, payloadHash, status: 'sending' },
        })
        claimed = true
      } catch (err) {
        if (err.code !== 'P2002') throw err
        row = await prisma.marketingBulkSend.findUnique({ where: { idempotencyKey } })
        if (!row) throw err
        if (row.payloadHash !== payloadHash) return res.status(409).json({ message: 'This idempotencyKey was already used for a different email.' })
        if (row.status === 'failed') {
          // Refused before sending last time: it may be sent now.
          const again = await prisma.marketingBulkSend.updateMany({ where: { idempotencyKey, status: 'failed' }, data: { status: 'sending', error: null } })
          claimed = again.count === 1
          row = await prisma.marketingBulkSend.findUnique({ where: { idempotencyKey } })
        }
      }
      if (!claimed) return res.status(200).json(view(row, true))

      try {
        const activity = await send(sender.user, {
          to,
          ...(cc.length ? { cc: cc.join(', ') } : {}),
          subject,
          htmlBody,
          ...(text ? { body: text } : {}),
          ...(att.list.length ? { attachments: att.list } : {}),
          emailMode: 'new',
        })
        row = await prisma.marketingBulkSend.update({
          where: { idempotencyKey },
          data: {
            status: 'sent',
            sentAt: new Date(),
            activityId: activity?.id || null,
            messageId: activity?.messageId || null,
            threadId: activity?.threadId || null,
            fromEmail: activity?.fromEmail || sender.gmail.email,
            tracked: Boolean(activity?.trackingId),
            error: null,
          },
        })
        return res.status(201).json(view(row, false))
      } catch (err) {
        const status = err.response?.status
        const detail = String(err.response?.data?.message || err.message || 'Send failed.').slice(0, 500)
        // A clear refusal before sending (4xx) may be retried; anything else
        // may have reached Gmail and is never retried automatically.
        const outcome = status >= 400 && status < 500 ? 'failed' : 'unknown'
        row = await prisma.marketingBulkSend.update({
          where: { idempotencyKey },
          data: { status: outcome, error: outcome === 'unknown' ? `Outcome unknown — check the sender's Sent folder before sending again. (${detail})` : detail },
        })
        console.error(`[Marketing bulk] send ${outcome}:`, detail)
        return res.status(outcome === 'failed' ? 422 : 502).json(view(row, false))
      }
    } catch (err) {
      console.error('[Marketing bulk] send error:', err.message)
      return res.status(500).json({ message: 'Could not process the send request.' })
    }
  })

  // Per email: the send result and NXT Sales' own open tracking for it.
  router.get('/status', async (req, res) => {
    const keys = String(req.query.keys || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    if (!keys.length || keys.length > MAX_STATUS_KEYS || keys.some((k) => !KEY_RE.test(k))) {
      return res.status(400).json({ message: `keys must be 1–${MAX_STATUS_KEYS} comma-separated idempotency keys.` })
    }
    try {
      const rows = await prisma.marketingBulkSend.findMany({ where: { idempotencyKey: { in: keys } } })
      const activityIds = rows.map((r) => r.activityId).filter(Boolean)
      const activities = activityIds.length
        ? await prisma.activity.findMany({ where: { id: { in: activityIds } }, select: { id: true, openCount: true, firstOpenedAt: true, lastOpenedAt: true } })
        : []
      const byId = new Map(activities.map((a) => [a.id, a]))
      res.json({
        results: rows.map((r) => {
          const a = r.activityId ? byId.get(r.activityId) : null
          return {
            ...view(r, false),
            openCount: r.tracked && a ? a.openCount : null,
            firstOpenedAt: r.tracked && a ? a.firstOpenedAt : null,
            lastOpenedAt: r.tracked && a ? a.lastOpenedAt : null,
          }
        }),
      })
    } catch (err) {
      console.error('[Marketing bulk] status error:', err.message)
      res.status(500).json({ message: 'Could not read the send status.' })
    }
  })

  return router
}

module.exports = createMarketingBulkRouter()
module.exports.createMarketingBulkRouter = createMarketingBulkRouter
module.exports.checkAttachments = checkAttachments
