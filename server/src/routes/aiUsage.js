const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// AI / LLM token-usage tracking.
//
// Every row is written from the usage metadata the AI provider itself returned
// — nothing here estimates, infers, or back-calculates token counts. Requests
// whose provider returned no usage metadata are still recorded (so the request
// count stays accurate) but contribute zero tokens and are reported separately
// via hasUsageData, rather than being quietly guessed at.
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

// ── GET /api/ai-usage/summary — everything the Settings panel renders ──────
// ?days=30 limits the window (default 30, max 365). Aggregation is done
// DB-side via groupBy so this stays O(groups) rather than pulling every row.
router.get('/summary', auth, async (req, res) => {
  try {
    const userId = req.user.id
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const where = { userId, createdAt: { gte: since } }

    const sum = { _sum: { promptTokens: true, outputTokens: true, totalTokens: true }, _count: { _all: true } }

    const [totals, byFeature, byModel, noMeta, recent, allTime] = await Promise.all([
      prisma.aiUsage.aggregate({ where, ...sum }),
      prisma.aiUsage.groupBy({ by: ['feature'], where, ...sum }),
      prisma.aiUsage.groupBy({ by: ['model', 'provider'], where, ...sum }),
      prisma.aiUsage.count({ where: { ...where, hasUsageData: false } }),
      prisma.aiUsage.findMany({
        where, orderBy: { createdAt: 'desc' }, take: 20,
        select: {
          id: true, feature: true, provider: true, model: true, createdAt: true,
          promptTokens: true, outputTokens: true, totalTokens: true, hasUsageData: true,
        },
      }),
      prisma.aiUsage.aggregate({ where: { userId }, ...sum }),
    ])

    // Per-day history for the window. Grouping by a DATE expression isn't
    // expressible through groupBy, so this uses a raw parameterised query
    // (still DB-side aggregation, still scoped to this user).
    const daily = await prisma.$queryRaw`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS requests,
             COALESCE(SUM("promptTokens"), 0)::int AS "promptTokens",
             COALESCE(SUM("outputTokens"), 0)::int AS "outputTokens",
             COALESCE(SUM("totalTokens"), 0)::int AS "totalTokens"
      FROM "AiUsage"
      WHERE "userId" = ${userId} AND "createdAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 DESC
    `

    const shape = (agg) => ({
      requests: agg._count._all,
      promptTokens: agg._sum.promptTokens || 0,
      outputTokens: agg._sum.outputTokens || 0,
      totalTokens: agg._sum.totalTokens || 0,
    })

    res.json({
      windowDays: days,
      totals: shape(totals),
      allTime: shape(allTime),
      // Requests the provider answered but gave no token metadata for — surfaced
      // so the panel can say so instead of implying the totals are complete.
      requestsWithoutUsageData: noMeta,
      byFeature: byFeature.map(g => ({ feature: g.feature, ...shape(g) }))
        .sort((a, b) => b.totalTokens - a.totalTokens),
      byModel: byModel.map(g => ({ model: g.model, provider: g.provider, ...shape(g) }))
        .sort((a, b) => b.totalTokens - a.totalTokens),
      daily,
      recent,
    })
  } catch (err) {
    console.error('[AI Usage] summary failed:', err.message)
    res.status(500).json({ message: 'Could not load AI usage.' })
  }
})

module.exports = router
