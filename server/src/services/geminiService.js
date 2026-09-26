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
// How long a FAILED detection is remembered. Short on purpose: a key whose
// quota resets, or a transient Google outage, must start working again
// quickly — but without this, a failing /models call was repeated on every
// single request (the guard below tests cache.model, which a failure leaves
// null, so the error it stored could never be read back). On a send that
// meant paying the detection timeout again before the fallback chain even
// started.
const MODEL_ERROR_CACHE_MS = 60 * 1000

const apiKey = () => (process.env.GEMINI_API_KEY || '').trim()
// AI can be switched off without removing the key, so features degrade to
// their non-AI behaviour instead of erroring.
const aiEnabled = () => String(process.env.AI_ENABLED ?? 'true').toLowerCase() !== 'false'

function isConfigured() {
  return apiKey().length > 0
}

let cache = { model: null, at: 0, error: null }

async function fetchJson(url, options = {}, timeoutMs = ATTEMPT_TIMEOUT_MS) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
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
  // Re-throw a recent failure instead of re-running detection. `force` still
  // bypasses it, so the Settings "refresh" button re-checks immediately.
  if (!force && cache.error && Date.now() - cache.at < MODEL_ERROR_CACHE_MS) {
    throw new Error(cache.error)
  }
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
// timeoutMs overrides the per-attempt deadline for callers whose requests are
// legitimately slow — multimodal screenshot analysis takes far longer than the
// text prompts this default was chosen for. Omitting it keeps the old value,
// so no existing caller changes behaviour.
// maxAttempts caps how far down the priority list one call may walk. Null
// (the default) keeps the original behaviour of trying every candidate, so no
// existing caller changes. A caller that is latency-sensitive — the
// deliverability check runs while the user waits on the Review & Send dialog —
// passes a small number so a degraded Gemini costs seconds rather than the
// full chain's worth of per-attempt timeouts.
async function generate(requestBody, { feature = null, userId = null, timeoutMs = ATTEMPT_TIMEOUT_MS, maxAttempts = null } = {}) {
  if (!isConfigured()) throw Object.assign(new Error('AI is not configured on the server.'), { status: 503 })
  if (!aiEnabled()) throw Object.assign(new Error('AI is currently disabled.'), { status: 503 })

  let preferred = null
  try { preferred = await resolveModel() } catch { /* fall through to the priority list */ }

  const allCandidates = [preferred, ...MODEL_PRIORITY].filter((v, i, a) => v && a.indexOf(v) === i)
  const candidates = Number.isFinite(maxAttempts) && maxAttempts > 0
    ? allCandidates.slice(0, maxAttempts)
    : allCandidates
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
      }, timeoutMs)
    } catch (networkErr) {
      lastErr = new Error(networkErr.name === 'TimeoutError'
        ? `${model} did not respond within ${timeoutMs / 1000}s`
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

// ── Admin key management ─────────────────────────────────────────────────
// The key's one home stays GEMINI_API_KEY in the server's environment — the
// same variable apiKey() and enrichmentReports.js already read — so changing it
// here changes it for every AI feature at once. There is deliberately no second
// store: the new value is written to the server's .env (so it survives a
// restart/redeploy) and to process.env (so it applies immediately), and the
// detected-model cache is cleared so the new key's own models are picked up.
// Only the admin-only routes in routes/ai.js call these.
const fs = require('fs')
const path = require('path')

// Same file dotenv loads at boot (server/.env, relative to the working dir).
const envPath = () => path.resolve(process.cwd(), '.env')

// Reads the current key for the admin settings screen. Never used by any route
// a Member can reach.
function getApiKey() {
  return apiKey()
}

// Asks Google whether a key is accepted, without saving it. Only a definite
// "this key is not valid/allowed" (400/401/403) counts as a failure — a quota
// or network problem must not stop an admin saving a good key.
async function verifyKey(candidate) {
  try {
    const { ok, status, body } = await fetchJson(`${API_BASE}/models?key=${encodeURIComponent(candidate)}`)
    if (ok) return { valid: true }
    if ([400, 401, 403].includes(status)) return { valid: false, message: body?.error?.message || 'Google rejected this API key.' }
    return { valid: true }
  } catch {
    return { valid: true }
  }
}

function persistKey(newKey) {
  const file = envPath()
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const line = `GEMINI_API_KEY=${newKey}`
  // [ \t] and [^\r\n], never \s or .: those can reach across a CRLF boundary and
  // eat the line ending of the neighbouring line.
  const pattern = /^[ \t]*GEMINI_API_KEY[ \t]*=[^\r\n]*/m
  const next = pattern.test(original)
    ? original.replace(pattern, line)
    : original + (original && !original.endsWith('\n') ? eol : '') + line + eol
  // Write beside the target then rename, so a crash mid-write can never leave a
  // truncated .env (it also holds the database URL and JWT secret).
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, next, { mode: 0o600 })
  fs.renameSync(tmp, file)
}

// Persist first, then apply: if the file cannot be written nothing changes.
function setApiKey(newKey) {
  persistKey(newKey)
  process.env.GEMINI_API_KEY = newKey
  cache = { model: null, at: 0, error: null }
}

module.exports = { isConfigured, aiEnabled, getStatus, resolveModel, generate, MODEL_PRIORITY, getApiKey, verifyKey, setApiKey }
