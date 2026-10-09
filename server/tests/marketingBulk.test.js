// Tests for routes/marketingBulk.js — run with: node --test tests/
// No database, no Gmail: an in-memory store and a stand-in for the send
// pipeline. Nothing is sent anywhere.
const { test, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

// A throwaway secret for this test run only (the CRM refuses to load without one).
process.env.JWT_SECRET = require('crypto').randomBytes(48).toString('hex')
process.env.MARKETING_SERVICE_USER_ID = 'svc-marketing'
process.env.MARKETING_BULK_SENDER_USER_ID = 'u-manoj'
const { createMarketingBulkRouter } = require('../src/routes/marketingBulk')

// ── in-memory stand-ins ─────────────────────────────────────────────────────
let rows, users, accounts, activities, sends, sendImpl
function p2002() {
  const e = new Error('Unique constraint failed')
  e.code = 'P2002'
  return e
}
const prisma = {
  user: { findUnique: async ({ where }) => users.find((u) => u.id === where.id) || null },
  emailAccount: { findFirst: async ({ where }) => accounts.find((a) => a.userId === where.userId && a.provider === where.provider) || null },
  activity: { findMany: async ({ where }) => activities.filter((a) => where.id.in.includes(a.id)) },
  marketingBulkSend: {
    create: async ({ data }) => {
      if (rows.some((r) => r.idempotencyKey === data.idempotencyKey)) throw p2002()
      const row = { tracked: false, ...data, createdAt: new Date(), updatedAt: new Date() }
      rows.push(row)
      return { ...row }
    },
    findUnique: async ({ where }) => {
      const r = rows.find((x) => x.idempotencyKey === where.idempotencyKey)
      return r ? { ...r } : null
    },
    findMany: async ({ where }) => rows.filter((r) => where.idempotencyKey.in.includes(r.idempotencyKey)).map((r) => ({ ...r })),
    update: async ({ where, data }) => {
      const r = rows.find((x) => x.idempotencyKey === where.idempotencyKey)
      Object.assign(r, data)
      return { ...r }
    },
    updateMany: async ({ where, data }) => {
      const hit = rows.filter((x) => x.idempotencyKey === where.idempotencyKey && x.status === where.status)
      hit.forEach((r) => Object.assign(r, data))
      return { count: hit.length }
    },
  },
}
// The real authMiddleware verifies a JWT; here the caller is named directly.
const auth = (req, res, next) => {
  const id = req.headers['x-test-user']
  if (!id) return res.status(401).json({ message: 'Unauthorized' })
  req.user = { id }
  next()
}
const send = async (sender, payload) => {
  sends.push({ sender, payload })
  return sendImpl(sender, payload)
}

let server, base
async function start() {
  const app = express()
  app.use(express.json())
  app.use('/api/marketing-bulk', createMarketingBulkRouter({ prisma, auth, send }))
  server = app.listen(0)
  base = `http://127.0.0.1:${server.address().port}/api/marketing-bulk`
}

beforeEach(async () => {
  rows = []
  users = [{ id: 'u-manoj', name: 'Manoj S', email: 'manoj@altiusnxt.test', status: 'active' }, { id: 'svc-marketing', name: 'Marketing', email: 'svc@x', status: 'active' }]
  accounts = [{ userId: 'u-manoj', provider: 'gmail', email: 'manoj@altiusnxt.test' }]
  activities = []
  sends = []
  let n = 0
  sendImpl = async (_s, p) => {
    n += 1
    const a = { id: `act${n}`, messageId: `gm${n}`, threadId: `th${n}`, trackingId: `trk${n}`, fromEmail: 'manoj@altiusnxt.test', toEmail: p.to, openCount: 0, firstOpenedAt: null, lastOpenedAt: null }
    activities.push(a)
    return a
  }
  if (!server) await start()
})
after(() => server && server.close())

const call = (path, { method = 'GET', user = 'svc-marketing', body } = {}) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json() }))

const EMAIL = { idempotencyKey: 'bulk:rec_000001', campaignId: 'camp1', recipientId: 'rec1', to: 'ann@alpha.test', cc: ['bob@alpha.test'], subject: 'Are AI tools recommending Alpha?', htmlBody: '<div><p>Ann,</p></div>', text: 'Ann,' }

test('only the Marketing service account may call; the feature must be configured', async () => {
  assert.equal((await call('/sender', { user: null })).status, 401)
  assert.equal((await call('/sender', { user: 'u-manoj' })).status, 403)
  const saved = process.env.MARKETING_BULK_SENDER_USER_ID
  process.env.MARKETING_BULK_SENDER_USER_ID = ''
  try {
    assert.equal((await call('/sender')).status, 503)
  } finally {
    process.env.MARKETING_BULK_SENDER_USER_ID = saved
  }
})

test('the sender is the configured user with Gmail connected — no token or credential is returned', async () => {
  const r = await call('/sender')
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { configured: true, ready: true, problem: null, name: 'Manoj S', fromEmail: 'manoj@altiusnxt.test' })
  accounts = []
  const none = await call('/sender')
  assert.equal(none.body.ready, false)
  assert.match(none.body.problem, /no Gmail connected/)
})

test('sends once through the pipeline, as the configured sender, with CC joined', async () => {
  const r = await call('/send', { method: 'POST', body: EMAIL })
  assert.equal(r.status, 201)
  assert.equal(r.body.status, 'sent')
  assert.equal(r.body.tracked, true)
  assert.equal(r.body.messageId, 'gm1')
  assert.equal(sends.length, 1)
  assert.equal(sends[0].sender.id, 'u-manoj')
  assert.deepEqual(sends[0].payload, { to: 'ann@alpha.test', cc: 'bob@alpha.test', subject: EMAIL.subject, htmlBody: EMAIL.htmlBody, body: 'Ann,', emailMode: 'new' })
  // The caller cannot choose the sender or the From address.
  assert.equal(JSON.stringify(sends[0].payload).includes('from'), false)
})

test('a repeated or concurrent request with the same key never sends twice', async () => {
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => call('/send', { method: 'POST', body: EMAIL })))
  assert.equal(sends.length, 1)
  assert.equal(results.filter((r) => r.status === 201).length, 1)
  assert.ok(results.every((r) => r.body.idempotencyKey === EMAIL.idempotencyKey))
  const again = await call('/send', { method: 'POST', body: EMAIL })
  assert.equal(again.body.duplicate, true)
  assert.equal(again.body.status, 'sent')
  assert.equal(sends.length, 1)
})

test('the same key for a different email is refused', async () => {
  await call('/send', { method: 'POST', body: EMAIL })
  const r = await call('/send', { method: 'POST', body: { ...EMAIL, to: 'other@alpha.test' } })
  assert.equal(r.status, 409)
  assert.equal(sends.length, 1)
})

test('a refusal before sending (4xx) is "failed" and may be retried; a timeout is "unknown" and never retried', async () => {
  sendImpl = async () => {
    const e = new Error('Request failed')
    e.response = { status: 400, data: { message: 'Gmail not connected. Please connect your Gmail account first.' } }
    throw e
  }
  const f = await call('/send', { method: 'POST', body: EMAIL })
  assert.equal(f.status, 422)
  assert.equal(f.body.status, 'failed')
  assert.match(f.body.error, /Gmail not connected/)
  sendImpl = async () => ({ id: 'actX', messageId: 'gmX', threadId: 'thX', trackingId: 'trkX', fromEmail: 'manoj@altiusnxt.test' })
  const retry = await call('/send', { method: 'POST', body: EMAIL })
  assert.equal(retry.status, 201)
  assert.equal(retry.body.status, 'sent')
  assert.equal(sends.length, 2)

  const k2 = { ...EMAIL, idempotencyKey: 'bulk:rec_000002', recipientId: 'rec2' }
  sendImpl = async () => {
    const e = new Error('timeout of 120000ms exceeded')
    e.code = 'ECONNABORTED'
    throw e
  }
  const u = await call('/send', { method: 'POST', body: k2 })
  assert.equal(u.status, 502)
  assert.equal(u.body.status, 'unknown')
  assert.match(u.body.error, /check the sender's Sent folder/)
  const u2 = await call('/send', { method: 'POST', body: k2 })
  assert.equal(u2.body.duplicate, true)
  assert.equal(sends.length, 3) // not sent again
})

test('validates the request and sends nothing when invalid', async () => {
  for (const bad of [
    { ...EMAIL, idempotencyKey: 'x' },
    { ...EMAIL, to: 'not an email' },
    { ...EMAIL, to: 'a@b.test, c@d.test' },
    { ...EMAIL, cc: ['bad'] },
    { ...EMAIL, subject: 'two\nlines' },
    { ...EMAIL, htmlBody: '' },
    { ...EMAIL, campaignId: '' },
  ]) {
    assert.equal((await call('/send', { method: 'POST', body: bad })).status, 400)
  }
  assert.equal(sends.length, 0)
  assert.equal(rows.length, 0)
})

test('status returns the send result and NXT Sales\' own open tracking — no tracking id', async () => {
  await call('/send', { method: 'POST', body: EMAIL })
  await call('/send', { method: 'POST', body: { ...EMAIL, idempotencyKey: 'bulk:rec_000002', recipientId: 'rec2', to: 'cy@charlie.test' } })
  activities[0].openCount = 2
  activities[0].firstOpenedAt = '2026-10-10T06:00:00.000Z'
  activities[0].lastOpenedAt = '2026-10-10T07:00:00.000Z'
  const r = await call('/status?keys=bulk:rec_000001,bulk:rec_000002,bulk:rec_unknown1')
  assert.equal(r.status, 200)
  assert.equal(r.body.results.length, 2)
  const one = r.body.results.find((x) => x.idempotencyKey === 'bulk:rec_000001')
  assert.equal(one.status, 'sent')
  assert.equal(one.openCount, 2)
  assert.equal(one.firstOpenedAt, '2026-10-10T06:00:00.000Z')
  assert.equal(r.body.results.find((x) => x.idempotencyKey === 'bulk:rec_000002').openCount, 0)
  assert.equal(JSON.stringify(r.body).includes('trk'), false)
  assert.equal((await call('/status?keys=')).status, 400)
})

test('an untracked send (no public URL in NXT Sales) reports no open data rather than zero', async () => {
  sendImpl = async () => ({ id: 'act9', messageId: 'gm9', threadId: 'th9', trackingId: null, fromEmail: 'manoj@altiusnxt.test' })
  activities.push({ id: 'act9', openCount: 0, firstOpenedAt: null, lastOpenedAt: null })
  await call('/send', { method: 'POST', body: EMAIL })
  const r = await call('/status?keys=bulk:rec_000001')
  assert.equal(r.body.results[0].tracked, false)
  assert.equal(r.body.results[0].openCount, null)
})
