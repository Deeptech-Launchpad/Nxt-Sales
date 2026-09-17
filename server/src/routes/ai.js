const router = require('express').Router()
const auth = require('../middleware/authMiddleware')
const gemini = require('../services/geminiService')

// The single AI endpoint for the whole CRM.
//
// Every AI feature — Customer Intelligence, Email Template 3 / PDP Audit,
// the Deliverability (spam) review, and anything added later — goes through
// here. The browser sends the prompt it wants run; the server holds the key,
// picks the model and makes the call. The key itself is never part of any
// request or response on this route.

// GET /api/ai/status — everything the UI needs to describe the AI connection,
// and nothing that could reconstruct the key. `?refresh=1` forces a fresh
// model detection instead of using the cached answer.
router.get('/status', auth, async (req, res) => {
  try {
    res.json(await gemini.getStatus({ refresh: req.query.refresh === '1' }))
  } catch (err) {
    console.error('[AI] status error:', err.message)
    res.status(500).json({ message: 'Could not read AI status.' })
  }
})

// POST /api/ai/generate — run one generateContent request.
//   { feature: 'customer_intelligence', request: { contents: [...], ... } }
// Returns Gemini's response verbatim, so every existing call site keeps
// reading `candidates[0].content.parts[0].text` exactly as it did before.
router.post('/generate', auth, async (req, res) => {
  const { request, feature } = req.body || {}

  // Only a generateContent body is accepted. The client cannot choose the
  // model, the endpoint or the key — those are the server's decisions.
  if (!request || typeof request !== 'object' || !Array.isArray(request.contents)) {
    return res.status(400).json({ message: 'A `request` object with a `contents` array is required.' })
  }

  const featureKey = typeof feature === 'string' ? feature.slice(0, 64) : null

  // The deliverability review is the one AI call a user sits and waits on:
  // it blocks the Review & Send dialog. Every other feature runs in its own
  // screen where a slower, more thorough fallback is the better trade, so
  // only this one gets a tighter budget. Measured healthy round-trip is
  // ~4.3s, so 9s leaves roughly 2x headroom before giving up on a model,
  // and 3 attempts still covers the preferred model plus two fallbacks.
  // Nothing here skips the check — it only bounds how long a DEGRADED
  // Gemini may stall it. When Gemini answers, the report is identical.
  const DELIVERABILITY_TIMEOUT_MS  = 9000
  const DELIVERABILITY_MAX_ATTEMPTS = 3
  const isDeliverability = featureKey === 'email_deliverability'

  try {
    const data = await gemini.generate(request, {
      feature: featureKey,
      userId: req.user.id,
      ...(isDeliverability && {
        timeoutMs: DELIVERABILITY_TIMEOUT_MS,
        maxAttempts: DELIVERABILITY_MAX_ATTEMPTS,
      }),
    })
    res.json(data)
  } catch (err) {
    // Surface Google's own message so "quota exceeded" or "model not found"
    // still reaches the user, but as a plain string with no key in it.
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502
    console.error('[AI] generate failed:', err.message)
    res.status(status).json({ message: err.message })
  }
})

module.exports = router
