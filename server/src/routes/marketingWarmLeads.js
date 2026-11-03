const express = require('express')
const { PrismaClient } = require('@prisma/client')
const authMiddleware = require('../middleware/authMiddleware')

// ── Warm leads from the Marketing AI Agent (2026-10-30) ─────────────────────
//
// The Marketing AI Agent evaluates companies and writes each result here; the
// Companies page shows them under the "Warm Leads" tab. This file only STORES
// and READS results. It sends no email, changes no company field, owner, pin
// or status, and starts nothing — the evaluation itself runs in the Marketing
// AI Agent, which is where it is started, approved and paced.
//
//   PUT    /api/marketing-warm-leads/companies/:companyId   Marketing service account only
//   DELETE /api/marketing-warm-leads/companies/:companyId   Marketing service account only (a company that is no
//                                                           longer Warm / Early Signal is taken off the list; the
//                                                           history stays in the Marketing AI Agent)
//   PUT    /api/marketing-warm-leads/runs/:runId            Marketing service account only
//   GET /api/marketing-warm-leads/summary                any signed-in user

// warm | early_signal | cold | insufficient_data, and three statuses of their own for companies the CRM already
// knows (never grouped under cold): existing_customer | active_opportunity | do_not_contact.
const CLASSIFICATIONS = ['warm', 'early_signal', 'cold', 'insufficient_data', 'existing_customer', 'active_opportunity', 'do_not_contact']
const EVALUATION_STATUSES = ['evaluated', 'failed']
const CONFIDENCES = ['high', 'medium', 'low']
const RUN_KINDS = ['test', 'batch', 'retry', 'pilot', 'daily']
const RUN_STATUSES = ['queued', 'running', 'completed', 'failed']
const MAX_REASONS = 30

const serviceUserId = () => (process.env.MARKETING_SERVICE_USER_ID || '').trim()

/** Same reasoning as marketingBulk.js: ONE connection, opened only when used. */
function oneConnectionClient() {
  const url = process.env.DATABASE_URL || ''
  if (!url) return new PrismaClient()
  const withLimit = /[?&]connection_limit=/.test(url) ? url : `${url}${url.includes('?') ? '&' : '?'}connection_limit=1`
  return new PrismaClient({ datasources: { db: { url: withLimit } } })
}

const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const count = (v) => (Number.isInteger(v) && v >= 0 && v <= 1_000_000 ? v : 0)
function date(v) {
  if (v == null || v === '') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** One reason, reduced to known keys and bounded lengths. Anything else is dropped. */
function cleanReason(r) {
  if (!r || typeof r !== 'object') return null
  const signal = text(r.signal, 80)
  const summary = text(r.summary, 500)
  if (!signal || !summary) return null
  const sourceUrl = text(r.sourceUrl, 1000)
  return {
    signal,
    polarity: ['positive', 'negative', 'neutral'].includes(r.polarity) ? r.polarity : 'neutral',
    points: Number.isInteger(r.points) && Math.abs(r.points) <= 100 ? r.points : 0,
    summary,
    evidence: text(r.evidence, 1000),
    // Only web addresses: this is shown as a link on the Companies page.
    sourceUrl: sourceUrl && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null,
    observedAt: text(r.observedAt, 40),
    freshness: ['fresh', 'aging', 'stale', 'unknown'].includes(r.freshness) ? r.freshness : null,
    source: text(r.source, 40),
  }
}

/** The evaluation body, checked. Returns { data } or { error }. */
function parseEvaluation(body) {
  const b = body || {}
  const runId = text(b.runId, 100)
  const evaluationId = text(b.evaluationId, 100)
  if (!runId || !evaluationId) return { error: 'runId and evaluationId are required.' }
  if (!EVALUATION_STATUSES.includes(b.evaluationStatus)) return { error: `evaluationStatus must be one of ${EVALUATION_STATUSES.join(', ')}.` }
  const classification = b.classification == null ? null : b.classification
  if (classification !== null && !CLASSIFICATIONS.includes(classification)) return { error: `classification must be one of ${CLASSIFICATIONS.join(', ')}, or null.` }
  if (b.evaluationStatus === 'evaluated' && !classification) return { error: 'An evaluated company needs a classification.' }
  if (b.score != null && !(Number.isInteger(b.score) && b.score >= 0 && b.score <= 100)) return { error: 'score must be a whole number from 0 to 100, or null.' }
  if (b.confidence != null && !CONFIDENCES.includes(b.confidence)) return { error: `confidence must be one of ${CONFIDENCES.join(', ')}, or null.` }
  if (b.reasons != null && !Array.isArray(b.reasons)) return { error: 'reasons must be a list.' }
  const evaluatedAt = date(b.evaluatedAt)
  if (!evaluatedAt) return { error: 'evaluatedAt must be a date.' }
  return {
    data: {
      runId,
      evaluationId,
      classification,
      evaluationStatus: b.evaluationStatus,
      score: b.score ?? null,
      confidence: b.confidence ?? null,
      summary: text(b.summary, 2000),
      reasons: (b.reasons || []).slice(0, MAX_REASONS).map(cleanReason).filter(Boolean),
      deepCheck: text(b.deepCheck, 40),
      error: text(b.error, 1000),
      evaluatedAt,
    },
  }
}

function parseRun(body) {
  const b = body || {}
  if (!RUN_KINDS.includes(b.kind)) return { error: `kind must be one of ${RUN_KINDS.join(', ')}.` }
  if (!RUN_STATUSES.includes(b.status)) return { error: `status must be one of ${RUN_STATUSES.join(', ')}.` }
  const dates = {}
  for (const k of ['approvedAt', 'startedAt', 'finishedAt']) {
    const d = date(b[k])
    if (d === undefined) return { error: `${k} must be a date.` }
    dates[k] = d
  }
  return {
    data: {
      kind: b.kind,
      status: b.status,
      requestedBy: text(b.requestedBy, 200),
      total: count(b.total),
      processed: count(b.processed),
      warm: count(b.warm),
      earlySignal: count(b.earlySignal),
      cold: count(b.cold),
      insufficient: count(b.insufficient),
      existingCustomer: count(b.existingCustomer),
      activeOpportunity: count(b.activeOpportunity),
      doNotContact: count(b.doNotContact),
      failed: count(b.failed),
      approvedBy: text(b.approvedBy, 200),
      ...dates,
    },
  }
}

function createMarketingWarmLeadsRouter({ prisma = oneConnectionClient(), auth = authMiddleware } = {}) {
  const router = express.Router()
  router.use(auth)

  /** Writes: only the Marketing AI Agent service account, and only when it is configured. */
  const serviceOnly = (req, res, next) => {
    const id = serviceUserId()
    if (!id) return res.status(503).json({ message: 'Warm leads are not configured on NXT Sales (MARKETING_SERVICE_USER_ID).' })
    if (!req.user || req.user.id !== id) return res.status(403).json({ message: 'Only the Marketing AI Agent service account may write warm-lead results.' })
    next()
  }

  router.put('/companies/:companyId', serviceOnly, async (req, res) => {
    const parsed = parseEvaluation(req.body)
    if (parsed.error) return res.status(400).json({ message: parsed.error })
    const companyId = String(req.params.companyId)
    try {
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, deletedAt: true } })
      // A company in the Recycle Bin is not listed anywhere; its result is not stored.
      if (!company || company.deletedAt) return res.status(404).json({ message: 'Company not found.' })

      const existing = await prisma.companyLeadEvaluation.findUnique({ where: { companyId }, select: { evaluatedAt: true, evaluationId: true } })
      // An older result arriving late (a retried request) never replaces a newer one.
      if (existing && existing.evaluationId !== parsed.data.evaluationId && existing.evaluatedAt > parsed.data.evaluatedAt) {
        return res.json({ stored: false, reason: 'A newer evaluation is already stored for this company.' })
      }
      await prisma.companyLeadEvaluation.upsert({
        where: { companyId },
        create: { companyId, ...parsed.data },
        update: parsed.data,
      })
      res.json({ stored: true })
    } catch (err) {
      console.error('[marketing-warm-leads] store evaluation:', err.message)
      res.status(500).json({ message: 'Could not store the evaluation.' })
    }
  })

  /**
   * Takes one company off the Warm Leads list. Only the stored evaluation is removed - no company field, owner,
   * pin or status is touched. Idempotent: removing a company that is not listed answers 200 with removed: 0.
   */
  router.delete('/companies/:companyId', serviceOnly, async (req, res) => {
    const companyId = String(req.params.companyId).slice(0, 100)
    try {
      const r = await prisma.companyLeadEvaluation.deleteMany({ where: { companyId } })
      res.json({ removed: r.count })
    } catch (err) {
      console.error('[marketing-warm-leads] remove evaluation:', err.message)
      res.status(500).json({ message: 'Could not remove the evaluation.' })
    }
  })

  router.put('/runs/:runId', serviceOnly, async (req, res) => {
    const parsed = parseRun(req.body)
    if (parsed.error) return res.status(400).json({ message: parsed.error })
    const id = String(req.params.runId).slice(0, 100)
    try {
      await prisma.marketingWarmLeadRun.upsert({ where: { id }, create: { id, ...parsed.data }, update: parsed.data })
      res.json({ stored: true })
    } catch (err) {
      console.error('[marketing-warm-leads] store run:', err.message)
      res.status(500).json({ message: 'Could not store the run.' })
    }
  })

  /** What the Warm Leads tab shows above its list: the latest runs and the totals. */
  router.get('/summary', async (_req, res) => {
    try {
      const [runs, groups] = await Promise.all([
        prisma.marketingWarmLeadRun.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
        prisma.companyLeadEvaluation.groupBy({
          by: ['classification', 'evaluationStatus'],
          where: { company: { deletedAt: null } },
          _count: { _all: true },
        }),
      ])
      const totals = { evaluated: 0, warm: 0, earlySignal: 0, cold: 0, insufficient: 0, existingCustomer: 0, activeOpportunity: 0, doNotContact: 0, failed: 0 }
      const KEY = { warm: 'warm', early_signal: 'earlySignal', cold: 'cold', insufficient_data: 'insufficient', existing_customer: 'existingCustomer', active_opportunity: 'activeOpportunity', do_not_contact: 'doNotContact' }
      for (const g of groups) {
        const n = g._count._all
        if (g.evaluationStatus === 'failed') totals.failed += n
        else {
          totals.evaluated += n
          if (KEY[g.classification]) totals[KEY[g.classification]] += n
        }
      }
      res.json({ runs, totals })
    } catch (err) {
      console.error('[marketing-warm-leads] summary:', err.message)
      res.status(500).json({ message: 'Could not read the warm-lead summary.' })
    }
  })

  return router
}

module.exports = createMarketingWarmLeadsRouter()
module.exports.createMarketingWarmLeadsRouter = createMarketingWarmLeadsRouter
module.exports.WARM_CLASSIFICATIONS = CLASSIFICATIONS
