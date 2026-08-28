// The ONE place the Gemini API key is read, and the ONE place a Gemini request
// is made from this application.
//
// Modelled on how EmotionSense already does it
// (ai-service/modules/gemini_transcriber.py — os.getenv("GEMINI_API_KEY") /
// os.getenv("GEMINI_MODEL")): the key lives in the server's environment and
// never leaves the server. It is not returned by any route, not stored in the
// database, and not sent to the browser in any form.
//
// This replaces the previous arrangement, where every AI feature read the key
// out of the browser's localStorage and called Google directly from the page —
// which meant the key was readable by anyone with devtools, by any script on
// the page, and was duplicated across three call sites.
const { recordUsage } = require('./aiUsageRecorder')

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Google has been retiring pinned model names for newer accounts even while
// the /models endpoint still advertises them — which is exactly how the
// reported "gemini-1.5-pro is not found" error happens. The rolling "-latest"
// aliases lead, so a key resolves on the first attempt rather than working
// through a list of names that may already be dead.
const MODEL_PRIORITY = [
  'gemini-flash-latest', 'gemini-pro-latest',
  'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro',
  'gemini-1.5-flash', 'gemini-1.5-pro',
]

// A hung model must not be able to stall the whole fallback chain.
const ATTEMPT_TIMEOUT_MS = 20000
// Re-detect at most this often; a redeploy or a restart clears it anyway.
const MODEL_CACHE_MS = 60 * 60 * 1000

const apiKey = () => (process.env.GEMINI_API_KEY || '').trim()
// AI can be switched off without removing the key, so features degrade to
// their non-AI behaviour instead of erroring.
const aiEnabled = () => String(process.env.AI_ENABLED ?? 'true').toLowerCase() !== 'false'

function isConfigured() {
  return apiKey().length > 0
}

let cache = { model: null, at: 0, error: null }

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

// Asks Google which models THIS key can actually use, then picks the best one
// by MODEL_PRIORITY. Nothing is hardcoded as the answer: the configured
// GEMINI_MODEL is only a preference, and if the key cannot use it we fall
// through to whatever it can.
async function detectModel() {
  if (!isConfigured()) throw new Error('GEMINI_API_KEY is not set on the server.')

  const { ok, body } = await fetchJson(`${API_BASE}/models?key=${apiKey()}`)
  if (!ok) throw new Error(body?.error?.message || 'Could not list Gemini models for this API key.')

  const available = (body.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => String(m.name).replace(/^models\//, ''))
  if (!available.length) throw new Error('This API key has no Gemini models that support generateContent.')

  const configured = (process.env.GEMINI_MODEL || '').trim()
  if (configured && available.includes(configured)) return configured
  for (const preferred of MODEL_PRIORITY) {
    if (available.includes(preferred)) return preferred
  }
  return available[0]
}

async function resolveModel({ force = false } = {}) {
  if (!force && cache.model && Date.now() - cache.at < MODEL_CACHE_MS) return cache.model
  try {
    const model = await detectModel()
    cache = { model, at: Date.now(), error: null }
    return model
  } catch (err) {
    cache = { model: null, at: Date.now(), error: err.message }
    throw err
  }
}

// Safe to hand to the browser: says whether AI works and which model is live,
// and deliberately contains nothing derived from the key itself.
async function getStatus({ refresh = false } = {}) {
  if (!isConfigured()) {
    return { provider: 'gemini', configured: false, enabled: aiEnabled(), connected: false, model: null, error: 'No Gemini API key is configured on the server.' }
  }
  if (!aiEnabled()) {
    return { provider: 'gemini', configured: true, enabled: false, connected: false, model: null, error: null }
  }
  try {
    const model = await resolveModel({ force: refresh })
    return { provider: 'gemini', configured: true, enabled: true, connected: true, model, error: null }
  } catch (err) {
    return { provider: 'gemini', configured: true, enabled: true, connected: false, model: null, error: err.message }
  }
}

// Runs a generateContent request, retrying down the priority list when a model
// is missing (404) or its quota is spent (429) — Gemini quotas are per-model,
// so one exhausted model does not mean the key is blocked. A bad key or a
// safety block fails the same way on every model, so those stop immediately
// rather than burning through the list.
async function generate(requestBody, { feature = null, userId = null } = {}) {
  if (!isConfigured()) throw Object.assign(new Error('AI is not configured on the server.'), { status: 503 })
  if (!aiEnabled()) throw Object.assign(new Error('AI is currently disabled.'), { status: 503 })

  let preferred = null
  try { preferred = await resolveModel() } catch { /* fall through to the priority list */ }

  const candidates = [preferred, ...MODEL_PRIORITY].filter((v, i, a) => v && a.indexOf(v) === i)
  let lastErr = null
  let attempts = 0

  for (const model of candidates) {
    attempts++
    let result
    try {
      result = await fetchJson(`${API_BASE}/models/${model}:generateContent?key=${apiKey()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
    } catch (networkErr) {
      lastErr = new Error(networkErr.name === 'TimeoutError'
        ? `${model} did not respond within ${ATTEMPT_TIMEOUT_MS / 1000}s`
        : networkErr.message)
      continue
    }

    if (result.ok) {
      // A model reached by fallback is the real one now — remember it so the
      // next request starts there instead of failing the same way again.
      if (model !== cache.model) cache = { model, at: Date.now(), error: null }
      // Usage is recorded here rather than in the browser: it is the only
      // place that sees every AI call, and it cannot be skipped by a client.
      recordUsage({ userId, feature, model: result.body?.modelVersion || model, response: result.body })
      return result.body
    }

    const msg = result.body?.error?.message || `Gemini API error (${result.status})`
    const retryable = result.status === 404 || result.status === 429 ||
      /not found|not supported|does not exist|no longer available/i.test(msg)
    lastErr = Object.assign(new Error(msg), { status: result.status })
    if (!retryable) break
  }

  const err = new Error(attempts > 1
    ? `${lastErr.message} (tried ${attempts} Gemini models — none worked; check the key's quota)`
    : lastErr.message)
  err.status = lastErr.status || 502
  throw err
}

module.exports = { isConfigured, aiEnabled, getStatus, resolveModel, generate, MODEL_PRIORITY }
