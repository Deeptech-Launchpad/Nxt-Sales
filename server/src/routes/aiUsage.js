const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const { estimateCost, round6 } = require('../utils/aiPricing')

const prisma = new PrismaClient()

// AI / LLM token-usage tracking.
//
// Every row is written from the usage metadata the AI provider itself returned
// — nothing here estimates, infers, or back-calculates token counts. Requests
// whose provider returned no usage metadata are still recorded (so the request
// count stays accurate) but contribute zero tokens and are reported separately
// via hasUsageData, rather than being quietly guessed at.
//
// Cost is ESTIMATED from utils/aiPricing.js using the provider's published
// per-model rates. Token counts are never altered by costing, and a model with
// no known rate reports priced:false so the UI can say "Pricing unavailable"
// instead of showing a fabricated number.
//
// All reads and writes are scoped to the authenticated user (req.user.id), so
// one user's consumption is never mixed into another's.

const MAX_LEN = 120
const clean = (v, fallback = 'unknown') => {
  const s = String(v === undefined || v === null ? '' : v).trim()
  return s ? s.slice(0, MAX_LEN) : fallback
}
// Token counts arrive from an external API — coerce defensively and never let a
// bogus/negative/huge value in. Non-numeric becomes 0, not NaN.
const toCount = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(Math.floor(n), 100000000)
}

// ── POST /api/ai-usage — record one AI request ────────────────────────────
// Fire-and-forget from the client: a failure here must never break the AI
// feature that triggered it, so the client ignores the response.
router.post('/', auth, async (req, res) => {
  try {
    const { feature, provider, model, promptTokens, outputTokens, totalTokens, hasUsageData } = req.body

    const prompt = toCount(promptTokens)
    const output = toCount(outputTokens)
    // Prefer the provider's own total; fall back to the parts only when the
    // provider gave parts but no explicit total (Anthropic does this).
    const total = toCount(totalTokens) || (prompt + output)

    const row = await prisma.aiUsage.create({
      data: {
        userId: req.user.id,
        feature: clean(feature),
        provider: clean(provider),
        model: clean(model),
        promptTokens: prompt,
        outputTokens: output,
        totalTokens: total,
        hasUsageData: hasUsageData === false ? false : (prompt + output + total) > 0,
      },
      select: { id: true },
    })
    res.status(201).json(row)
  } catch (err) {
    console.error('[AI Usage] record failed:', err.message)
    res.status(500).json({ message: 'Could not record AI usage.' })
  }
})

// Adds one group's tokens+cost into an accumulator bucket.
// `priced` stays true only while EVERY contributing model has a known rate, so
// a bucket mixing priced and unpriced models is flagged as partial rather than
// silently reporting an understated total as if it were complete.
function addInto(bucket, g, cost) {
  bucket.requests += g._count._all
  bucket.promptTokens += g._sum.promptTokens || 0
  bucket.outputTokens += g._sum.outputTokens || 0
  bucket.totalTokens += g._sum.totalTokens || 0
  if (cost.priced) {
    bucket.inputCost += cost.inputCost
    bucket.outputCost += cost.outputCost
    bucket.totalCost += cost.totalCost
    bucket.pricedRequests += g._count._all
  } else {
    bucket.unpricedRequests += g._count._all
  }
  return bucket
}

const emptyBucket = () => ({
  requests: 0, promptTokens: 0, outputTokens: 0, totalTokens: 0,
  inputCost: 0, outputCost: 0, totalCost: 0, pricedRequests: 0, unpricedRequests: 0,
})

// Rounds a bucket's money fields and derives its pricing-completeness flags.
const finalize = (b) => ({
  requests: b.requests,
  promptTokens: b.promptTokens,
  outputTokens: b.outputTokens,
  totalTokens: b.totalTokens,
  inputCost: round6(b.inputCost),
  outputCost: round6(b.outputCost),
  totalCost: round6(b.totalCost),
  // true  → every request in this bucket had a known rate
  // false → none did (show "Pricing unavailable")
  // partial → some did (show the cost, flagged as incomplete)
  priced: b.pricedRequests > 0,
  pricingComplete: b.unpricedRequests === 0 && b.pricedRequests > 0,
  unpricedRequests: b.unpricedRequests,
})

// ── GET /api/ai-usage/summary — everything the dashboard renders ──────────
// ?days=30 limits the window (1–365); ?days=all covers all time.
// Aggregation is DB-side (groupBy + one grouped raw query); the browser never
// downloads individual rows except the small "recent requests" list.
router.get('/summary', auth, async (req, res) => {
  try {
    const userId = req.user.id
    const isAll = String(req.query.days).toLowerCase() === 'all'
    const days = isAll ? null : Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365)
    const since = isAll ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const where = isAll ? { userId } : { userId, createdAt: { gte: since } }

    const sum = { _sum: { promptTokens: true, outputTokens: true, totalTokens: true }, _count: { _all: true } }

    // ONE grouping by (feature, model, provider) drives totals, by-feature and
    // by-model — so all three are guaranteed mutually consistent, and per-model
    // rates are applied before any roll-up (a feature spanning two models is
    // costed per model, never with a blended rate).
    const [groups, noMeta, recent, allTimeGroups] = await Promise.all([
      prisma.aiUsage.groupBy({ by: ['feature', 'model', 'provider'], where, ...sum }),
      prisma.aiUsage.count({ where: { ...where, hasUsageData: false } }),
      prisma.aiUsage.findMany({
        where, orderBy: { createdAt: 'desc' }, take: 25,
        select: {
          id: true, feature: true, provider: true, model: true, createdAt: true,
          promptTokens: true, outputTokens: true, totalTokens: true, hasUsageData: true,
        },
      }),
      prisma.aiUsage.groupBy({ by: ['model', 'provider'], where: { userId }, ...sum }),
    ])

    const totals = emptyBucket()
    const featureMap = new Map()
    const modelMap = new Map()

    for (const g of groups) {
      const cost = estimateCost(g.provider, g.model, g._sum.promptTokens, g._sum.outputTokens)
      addInto(totals, g, cost)

      if (!featureMap.has(g.feature)) featureMap.set(g.feature, emptyBucket())
      addInto(featureMap.get(g.feature), g, cost)

      const mk = `${g.provider}||${g.model}`
      if (!modelMap.has(mk)) modelMap.set(mk, emptyBucket())
      addInto(modelMap.get(mk), g, cost)
    }

    const allTime = emptyBucket()
    for (const g of allTimeGroups) {
      addInto(allTime, g, estimateCost(g.provider, g.model, g._sum.promptTokens, g._sum.outputTokens))
    }

    // Per-day, per-model so daily cost uses each model's own rate. Grouping by
    // a DATE expression isn't expressible through Prisma groupBy, so this is a
    // parameterised raw query — still DB-side, still scoped to this user.
    const dailyRows = isAll
      ? await prisma.$queryRaw`
          SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
                 "model", "provider",
                 COUNT(*)::int AS requests,
                 COALESCE(SUM("promptTokens"), 0)::int AS "promptTokens",
                 COALESCE(SUM("outputTokens"), 0)::int AS "outputTokens",
                 COALESCE(SUM("totalTokens"), 0)::int AS "totalTokens"
          FROM "AiUsage" WHERE "userId" = ${userId}
          GROUP BY 1, 2, 3 ORDER BY 1 ASC`
      : await prisma.$queryRaw`
          SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
                 "model", "provider",
                 COUNT(*)::int AS requests,
                 COALESCE(SUM("promptTokens"), 0)::int AS "promptTokens",
                 COALESCE(SUM("outputTokens"), 0)::int AS "outputTokens",
                 COALESCE(SUM("totalTokens"), 0)::int AS "totalTokens"
          FROM "AiUsage" WHERE "userId" = ${userId} AND "createdAt" >= ${since}
          GROUP BY 1, 2, 3 ORDER BY 1 ASC`

    const dayMap = new Map()
    for (const r of dailyRows) {
      if (!dayMap.has(r.day)) dayMap.set(r.day, emptyBucket())
      const cost = estimateCost(r.provider, r.model, r.promptTokens, r.outputTokens)
      addInto(dayMap.get(r.day), {
        _count: { _all: r.requests },
        _sum: { promptTokens: r.promptTokens, outputTokens: r.outputTokens, totalTokens: r.totalTokens },
      }, cost)
    }

    res.json({
      windowDays: isAll ? 'all' : days,
      totals: finalize(totals),
      allTime: finalize(allTime),
      // Requests the provider answered but gave no token metadata for — surfaced
      // so the dashboard can say so instead of implying the totals are complete.
      requestsWithoutUsageData: noMeta,
      byFeature: [...featureMap.entries()]
        .map(([feature, b]) => ({ feature, ...finalize(b) }))
        .sort((a, b) => b.totalTokens - a.totalTokens),
      byModel: [...modelMap.entries()]
        .map(([k, b]) => {
          const [provider, model] = k.split('||')
          return { provider, model, ...finalize(b) }
        })
        .sort((a, b) => b.totalTokens - a.totalTokens),
      daily: [...dayMap.entries()]
        .map(([day, b]) => ({ day, ...finalize(b) }))
        .sort((a, b) => a.day.localeCompare(b.day)),
      recent: recent.map(r => {
        const c = estimateCost(r.provider, r.model, r.promptTokens, r.outputTokens)
        return { ...r, totalCost: round6(c.totalCost), priced: c.priced }
      }),
    })
  } catch (err) {
    console.error('[AI Usage] summary failed:', err.message)
    res.status(500).json({ message: 'Could not load AI usage.' })
  }
})

module.exports = router
