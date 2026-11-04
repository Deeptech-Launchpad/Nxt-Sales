// Tests for routes/marketingWarmLeads.js — run with: node --test tests/
// No database: an in-memory store. Nothing is sent anywhere.
const { test, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')

process.env.JWT_SECRET = require('crypto').randomBytes(48).toString('hex')
process.env.MARKETING_SERVICE_USER_ID = 'svc-marketing'
const { createMarketingWarmLeadsRouter } = require('../src/routes/marketingWarmLeads')

// ── in-memory stand-ins ─────────────────────────────────────────────────────
let companies, evaluations, runs
const prisma = {
  company: { findUnique: async ({ where }) => companies.find((c) => c.id === where.id) || null },
  companyLeadEvaluation: {
    findUnique: async ({ where }) => evaluations.find((e) => e.companyId === where.companyId) || null,
    upsert: async ({ where, create, update }) => {
      const e = evaluations.find((x) => x.companyId === where.companyId)
      if (e) Object.assign(e, update)
      else evaluations.push({ ...create })
    },
    deleteMany: async ({ where }) => {
      const before = evaluations.length
      evaluations = evaluations.filter((e) => e.companyId !== where.companyId)
      return { count: before - evaluations.length }
    },
    groupBy: async () => {
      const live = evaluations.filter((e) => !companies.find((c) => c.id === e.companyId)?.deletedAt)
      const keys = new Map()
      for (const e of live) {
        const k = `${e.classification}|${e.evaluationStatus}`
        keys.set(k, (keys.get(k) || 0) + 1)
      }
      return [...keys].map(([k, n]) => {
        const [classification, evaluationStatus] = k.split('|')
        return { classification: classification === 'null' ? null : classification, evaluationStatus, _count: { _all: n } }
      })
    },
  },
  marketingWarmLeadRun: {
    upsert: async ({ where, create, update }) => {
      const r = runs.find((x) => x.id === where.id)
      if (r) Object.assign(r, update)
      else runs.push({ ...create, createdAt: new Date() })
    },
    findMany: async () => [...runs].reverse(),
  },
}
const auth = (req, res, next) => {
  const id = req.headers['x-test-user']
  if (!id) return res.status(401).json({ message: 'Unauthorized' })
  req.user = { id }
  next()
}

let server, base
async function start() {
  const app = express()
  app.use(express.json())
  app.use('/api/marketing-warm-leads', createMarketingWarmLeadsRouter({ prisma, auth }))
  server = app.listen(0)
  base = `http://127.0.0.1:${server.address().port}/api/marketing-warm-leads`
}
beforeEach(async () => {
  companies = [{ id: 'c1', deletedAt: null }, { id: 'c2', deletedAt: null }, { id: 'binned', deletedAt: new Date() }]
  evaluations = []
  runs = []
  if (!server) await start()
})
after(() => server && server.close())

const call = (method, path, body, user = 'svc-marketing') =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(async (r) => ({ status: r.status, body: await r.json() }))

const evaluation = (over = {}) => ({
  runId: 'run1',
  evaluationId: 'ev1',
  classification: 'warm',
  evaluationStatus: 'evaluated',
  score: 72,
  confidence: 'medium',
  summary: 'Replied to us recently.',
  reasons: [{ signal: 'inbound_engagement', polarity: 'positive', points: 45, summary: '2 inbound emails in 90 days', evidence: 'Inbound email "Re: quote"', sourceUrl: null, observedAt: '2026-10-01', source: 'crm' }],
  deepCheck: 'done',
  evaluatedAt: '2026-10-30T10:00:00.000Z',
  ...over,
})

test('only the Marketing service account may write; anyone signed in may read the summary', async () => {
  assert.equal((await call('PUT', '/companies/c1', evaluation(), null)).status, 401)
  const other = await call('PUT', '/companies/c1', evaluation(), 'u-someone')
  assert.equal(other.status, 403)
  assert.equal(evaluations.length, 0)
  assert.equal((await call('PUT', '/runs/run1', { kind: 'test', status: 'running' }, 'u-someone')).status, 403)
  assert.equal((await call('GET', '/summary', null, 'u-someone')).status, 200)
})

test('not configured: writes are refused with a clear message', async () => {
  const saved = process.env.MARKETING_SERVICE_USER_ID
  process.env.MARKETING_SERVICE_USER_ID = ''
  try {
    const r = await call('PUT', '/companies/c1', evaluation())
    assert.equal(r.status, 503)
    assert.match(r.body.message, /MARKETING_SERVICE_USER_ID/)
  } finally {
    process.env.MARKETING_SERVICE_USER_ID = saved
  }
})

test('stores one evaluation per company and replaces it with a newer one; a late older one never wins', async () => {
  assert.deepEqual((await call('PUT', '/companies/c1', evaluation())).body, { stored: true })
  assert.equal(evaluations.length, 1)
  assert.equal(evaluations[0].classification, 'warm')
  assert.equal(evaluations[0].reasons[0].signal, 'inbound_engagement')

  // the same evaluation again (a retried request): still one row
  await call('PUT', '/companies/c1', evaluation())
  assert.equal(evaluations.length, 1)

  // a newer evaluation replaces it
  await call('PUT', '/companies/c1', evaluation({ evaluationId: 'ev2', classification: 'cold', score: 10, evaluatedAt: '2026-11-01T00:00:00.000Z' }))
  assert.equal(evaluations[0].classification, 'cold')

  // an older one arriving late does not
  const late = await call('PUT', '/companies/c1', evaluation({ evaluationId: 'ev0', evaluatedAt: '2026-09-01T00:00:00.000Z' }))
  assert.equal(late.body.stored, false)
  assert.equal(evaluations[0].classification, 'cold')
})

test('unknown or recycle-binned companies are not stored', async () => {
  assert.equal((await call('PUT', '/companies/nope', evaluation())).status, 404)
  assert.equal((await call('PUT', '/companies/binned', evaluation())).status, 404)
  assert.equal(evaluations.length, 0)
})

test('the body is checked: bad values are refused, unknown keys and non-web links dropped', async () => {
  const bad = [
    { classification: 'hot' },
    { classification: 'cold-ish' },
    { evaluationStatus: 'done' },
    { classification: null }, // evaluated without a classification
    { score: 101 },
    { score: 5.5 },
    { confidence: 'sure' },
    { reasons: 'many' },
    { evaluatedAt: 'yesterday' },
    { evaluatedAt: '2999-01-01T00:00:00.000Z' }, // a far-future date would block every later evaluation
    { runId: '' },
  ]
  for (const over of bad) {
    const r = await call('PUT', '/companies/c1', evaluation(over))
    assert.equal(r.status, 400, JSON.stringify(over))
  }
  assert.equal(evaluations.length, 0)

  await call('PUT', '/companies/c1', evaluation({
    reasons: [
      { signal: 'news', polarity: 'positive', points: 20, summary: 'Expansion', sourceUrl: 'javascript:alert(1)', extra: 'x' },
      { signal: 'no summary' },
    ],
  }))
  assert.equal(evaluations[0].reasons.length, 1)
  assert.equal(evaluations[0].reasons[0].sourceUrl, null)
  assert.equal(evaluations[0].reasons[0].extra, undefined)

  // a failed evaluation needs no classification
  const failed = await call('PUT', '/companies/c2', evaluation({ evaluationId: 'ev3', classification: null, evaluationStatus: 'failed', score: null, error: 'CRM timed out' }))
  assert.equal(failed.status, 200)
})

test('run summaries are stored and the summary counts results per class, leaving out recycle-binned companies', async () => {
  await call('PUT', '/runs/run1', { kind: 'test', status: 'completed', total: 10, processed: 10, warm: 2, cold: 6, insufficient: 1, failed: 1, startedAt: '2026-10-30T10:00:00Z', finishedAt: '2026-10-30T10:20:00Z' })
  assert.equal((await call('PUT', '/runs/run2', { kind: 'nightly', status: 'running' })).status, 400)
  await call('PUT', '/companies/c1', evaluation())
  await call('PUT', '/companies/c2', evaluation({ evaluationId: 'ev2', classification: 'cold' }))
  evaluations.push({ companyId: 'binned', classification: 'warm', evaluationStatus: 'evaluated' })
  const s = await call('GET', '/summary', null, 'u-someone')
  assert.equal(s.body.runs.length, 1)
  assert.equal(s.body.runs[0].warm, 2)
  assert.deepEqual(s.body.totals, { evaluated: 2, warm: 1, earlySignal: 0, cold: 1, insufficient: 0, existingCustomer: 0, activeOpportunity: 0, doNotContact: 0, failed: 0 })
})

test('every status is accepted and counted on its own: early signal, existing customer, active opportunity and do not contact are never folded into cold', async () => {
  companies.push({ id: 'c3', deletedAt: null }, { id: 'c4', deletedAt: null }, { id: 'c5', deletedAt: null }, { id: 'c6', deletedAt: null }, { id: 'c7', deletedAt: null })
  const put = (id, classification, extra = {}) => call('PUT', `/companies/${id}`, evaluation({ evaluationId: `ev-${id}`, classification, ...extra }))
  assert.equal((await put('c1', 'warm')).status, 200)
  assert.equal((await put('c2', 'early_signal', { score: 35 })).status, 200)
  assert.equal((await put('c3', 'cold', { score: 0 })).status, 200)
  assert.equal((await put('c4', 'existing_customer', { score: 0 })).status, 200)
  assert.equal((await put('c5', 'active_opportunity', { score: 0 })).status, 200)
  assert.equal((await put('c6', 'do_not_contact', { score: 0 })).status, 200)
  assert.equal((await put('c7', 'insufficient_data', { score: 0 })).status, 200)
  // an unknown status is still refused, and nothing is stored for it
  assert.equal((await put('c1', 'hot')).status, 400)
  assert.equal(evaluations.find((e) => e.companyId === 'c1').classification, 'warm')

  const s = await call('GET', '/summary', null, 'u-someone')
  assert.deepEqual(s.body.totals, { evaluated: 7, warm: 1, earlySignal: 1, cold: 1, insufficient: 1, existingCustomer: 1, activeOpportunity: 1, doNotContact: 1, failed: 0 })
})

test('a run summary keeps the counters of the new statuses; a reason keeps how fresh its evidence is', async () => {
  await call('PUT', '/runs/run9', { kind: 'test', status: 'completed', total: 30, processed: 30, warm: 0, earlySignal: 1, cold: 14, insufficient: 5, existingCustomer: 1, activeOpportunity: 3, doNotContact: 1, failed: 5 })
  const r = runs.find((x) => x.id === 'run9')
  assert.equal(r.earlySignal, 1)
  assert.equal(r.existingCustomer, 1)
  assert.equal(r.activeOpportunity, 3)
  assert.equal(r.doNotContact, 1)
  await call('PUT', '/companies/c1', evaluation({ reasons: [{ signal: 'public_business_activity', polarity: 'positive', points: 25, summary: 'Announced X', sourceUrl: 'https://x.example/a', freshness: 'fresh', observedAt: '2026-10-23' }, { signal: 'old', polarity: 'positive', points: 0, summary: 'Older', freshness: 'bogus' }] }))
  const reasons = evaluations.find((e) => e.companyId === 'c1').reasons
  assert.equal(reasons[0].freshness, 'fresh')
  assert.equal(reasons[1].freshness, null) // only the four known words are kept
})

test('withdrawing a company removes only its evaluation, is idempotent, and is for the service account only', async () => {
  await call('PUT', '/companies/c1', evaluation())
  await call('PUT', '/companies/c2', evaluation({ evaluationId: 'ev2' }))
  assert.equal(evaluations.length, 2)

  assert.equal((await call('DELETE', '/companies/c1', null, null)).status, 401)
  assert.equal((await call('DELETE', '/companies/c1', null, 'u-someone')).status, 403)
  assert.equal(evaluations.length, 2, 'nobody else can remove a result')

  const first = await call('DELETE', '/companies/c1')
  assert.equal(first.status, 200)
  assert.deepEqual(first.body, { removed: 1 })
  assert.deepEqual(evaluations.map((e) => e.companyId), ['c2'], 'only that company is withdrawn')

  const again = await call('DELETE', '/companies/c1')
  assert.equal(again.status, 200)
  assert.deepEqual(again.body, { removed: 0 })
})

test('the pilot and daily run kinds are accepted', async () => {
  assert.equal((await call('PUT', '/runs/r-pilot', { kind: 'pilot', status: 'completed' })).status, 200)
  assert.equal((await call('PUT', '/runs/r-daily', { kind: 'daily', status: 'running' })).status, 200)
  assert.equal((await call('PUT', '/runs/r-bad', { kind: 'whatever', status: 'running' })).status, 400)
})
