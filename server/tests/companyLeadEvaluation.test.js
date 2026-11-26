// Tests for GET /api/companies/:id/lead-evaluation (routes/companies.js) and the
// Warm Leads list filter for human_review — run with: node --test tests/
// The REAL companies router and the REAL auth middleware are used; only the
// Prisma client is replaced by an in-memory stand-in, so no database is
// touched and nothing is sent anywhere.
const { test, beforeEach, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const express = require('express')
const jwt = require('jsonwebtoken')

process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex')

// ── in-memory stand-in for every PrismaClient the router's modules create ──
let users, companies, evaluations, findManyCalls
const pick = (row, select) => {
  if (!row) return null
  if (!select) return { ...row }
  const out = {}
  for (const k of Object.keys(select)) if (select[k] && k in row) out[k] = row[k]
  return out
}
class FakePrismaClient {
  constructor() {
    this.user = { findUnique: async ({ where, select }) => pick(users.find((u) => u.id === where.id), select) }
    this.company = {
      findUnique: async ({ where, select }) => pick(companies.find((c) => c.id === where.id), select),
      findMany: async (args) => { findManyCalls.push(args); return [] },
      count: async () => 0,
    }
    this.companyLeadEvaluation = {
      findUnique: async ({ where, select }) => pick(evaluations.find((e) => e.companyId === where.companyId), select),
    }
    this.customFieldValue = { findMany: async () => [] }
  }
}
require('@prisma/client').PrismaClient = FakePrismaClient
const companiesRouter = require('../src/routes/companies')

let server, base
beforeEach(async () => {
  users = [{ id: 'u1', status: 'active', role: 'member' }, { id: 'u-off', status: 'deactivated', role: 'member' }]
  companies = [
    { id: 'c1', name: 'Acme', deletedAt: null },
    { id: 'c2', name: 'Blank Ltd', deletedAt: null },
    { id: 'binned', name: 'Old Co', deletedAt: new Date('2026-11-01T00:00:00Z') },
  ]
  evaluations = []
  findManyCalls = []
  if (!server) {
    const app = express()
    app.use(express.json())
    app.use('/api/companies', companiesRouter)
    server = app.listen(0)
    base = `http://127.0.0.1:${server.address().port}/api/companies`
  }
})
after(() => server && server.close())

const token = (id) => jwt.sign({ id, email: `${id}@example.test`, name: id }, process.env.JWT_SECRET, { expiresIn: '5m' })
const get = (path, user = 'u1') =>
  fetch(`${base}${path}`, { headers: user ? { Authorization: `Bearer ${token(user)}` } : {} })
    .then(async (r) => ({ status: r.status, body: await r.json() }))

const stored = (over = {}) => ({
  id: 'ev-row-1',
  companyId: 'c1',
  classification: 'warm',
  evaluationStatus: 'evaluated',
  score: 72,
  confidence: 'medium',
  summary: 'Replied to us recently.',
  reasons: [
    { signal: 'inbound_engagement', polarity: 'positive', points: 45, summary: '2 inbound emails in 90 days', evidence: 'Inbound email "Re: quote"', sourceUrl: null, observedAt: '2026-10-01', source: 'crm' },
    { signal: 'news', polarity: 'neutral', points: 0, summary: 'Website updated', evidence: null, sourceUrl: 'https://acme.example/news', observedAt: '2026-10-20', source: 'web' },
  ],
  deepCheck: 'done',
  error: null,
  runId: 'run-secret-1',
  evaluationId: 'eval-secret-1',
  evaluatedAt: new Date('2026-10-30T10:00:00.000Z'),
  createdAt: new Date('2026-10-30T10:00:01.000Z'),
  updatedAt: new Date('2026-10-30T10:00:02.000Z'),
  ...over,
})

test('a company the Marketing AI Agent has not checked answers { evaluation: null }', async () => {
  const r = await get('/c2/lead-evaluation')
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, { evaluation: null })
})

test('a stored evaluation is returned with its signals, without runId / evaluationId', async () => {
  evaluations.push(stored())
  const r = await get('/c1/lead-evaluation')
  assert.equal(r.status, 200)
  const e = r.body.evaluation
  assert.deepEqual(Object.keys(e).sort(), ['classification', 'confidence', 'deepCheck', 'error', 'evaluatedAt', 'evaluationStatus', 'reasons', 'score', 'summary', 'updatedAt'])
  assert.equal(e.classification, 'warm')
  assert.equal(e.evaluationStatus, 'evaluated')
  assert.equal(e.score, 72)
  assert.equal(e.confidence, 'medium')
  assert.equal(e.summary, 'Replied to us recently.')
  assert.equal(e.reasons.length, 2)
  assert.equal(e.reasons[1].sourceUrl, 'https://acme.example/news')
  assert.equal(e.evaluatedAt, '2026-10-30T10:00:00.000Z')
  assert.equal(e.updatedAt, '2026-10-30T10:00:02.000Z')
  const raw = JSON.stringify(r.body)
  assert.ok(!raw.includes('run-secret-1') && !raw.includes('eval-secret-1'), 'runId / evaluationId never leave the server')
  assert.ok(!('runId' in e) && !('evaluationId' in e) && !('companyId' in e) && !('id' in e))
})

test('a human_review and a failed evaluation come back as stored', async () => {
  evaluations.push(stored({ classification: 'human_review', score: 40 }))
  assert.equal((await get('/c1/lead-evaluation')).body.evaluation.classification, 'human_review')
  evaluations = [stored({ companyId: 'c2', classification: null, evaluationStatus: 'failed', score: null, reasons: null, error: 'Website unreadable' })]
  const f = (await get('/c2/lead-evaluation')).body.evaluation
  assert.equal(f.evaluationStatus, 'failed')
  assert.equal(f.error, 'Website unreadable')
  assert.deepEqual(f.reasons, [])
})

test('an unauthenticated or deactivated request is refused, exactly like the company detail route', async () => {
  evaluations.push(stored())
  for (const path of ['/c1', '/c1/lead-evaluation']) {
    const anon = await get(path, null)
    assert.equal(anon.status, 401, path)
    assert.equal(anon.body.evaluation, undefined)
    assert.equal((await get(path, 'u-off')).status, 401, path)
  }
  const forged = await fetch(`${base}/c1/lead-evaluation`, { headers: { Authorization: `Bearer ${jwt.sign({ id: 'u1' }, 'x'.repeat(64))}` } })
  assert.equal(forged.status, 401)
})

test('a Recycle-Binned or unknown company answers 404 on both the detail route and this one, even with a stored evaluation', async () => {
  evaluations.push(stored({ companyId: 'binned' }))
  for (const id of ['binned', 'nope']) {
    const detail = await get(`/${id}`)
    const signals = await get(`/${id}/lead-evaluation`)
    assert.equal(detail.status, 404, id)
    assert.equal(signals.status, detail.status, id)
    assert.deepEqual(signals.body, { message: 'Company not found.' })
  }
  // and the same live company is readable on both
  assert.equal((await get('/c1')).status, 200)
  assert.equal((await get('/c1/lead-evaluation')).status, 200)
})

test('the Warm Leads list can be filtered to human_review; an unknown value still falls back to warm', async () => {
  const leadFilter = () => findManyCalls.at(-1).where.AND.find((c) => c.leadEvaluation).leadEvaluation.is
  assert.equal((await get('/?view=warm&warmStatus=human_review')).status, 200)
  assert.deepEqual(leadFilter(), { evaluationStatus: 'evaluated', classification: 'human_review' })
  assert.equal(findManyCalls.at(-1).where.deletedAt, null, 'binned companies stay excluded')
  await get('/?view=warm&warmStatus=bogus')
  assert.deepEqual(leadFilter(), { evaluationStatus: 'evaluated', classification: 'warm' })
})
