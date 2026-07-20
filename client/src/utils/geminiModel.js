// Shared Gemini model discovery + call-with-fallback logic. Single source of
// truth so every AI call site (Template 3 generation, Deliverability Report's
// AI review, etc.) auto-detects and self-heals the same way, instead of each
// one hardcoding a model name that can go stale — which is exactly how the
// original "AI Composition Failed" bug happened, and a second, un-fixed copy
// of it was found in the deliverability analyzer.

export const GEMINI_MODEL_PRIORITY = [
  'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro',
  'gemini-1.5-flash', 'gemini-1.5-pro',
]

// Ask Google which Gemini models this specific API key can actually use, and
// rank them by GEMINI_MODEL_PRIORITY — so the user never has to guess/enter a
// model name themselves.
export async function discoverBestGeminiModel(apiKey) {
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
  if (!resp.ok) {
    const e = await resp.json().catch(() => ({}))
    throw new Error(e.error?.message || 'Could not list Gemini models for this API key.')
  }
  const data = await resp.json()
  const available = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
  if (!available.length) throw new Error('No Gemini models are available for this API key.')

  for (const preferred of GEMINI_MODEL_PRIORITY) {
    if (available.includes(preferred)) return preferred
  }
  return available[0] // key supports Gemini but none of our preferred names — use whatever it does support
}

// Calls Gemini generateContent, retrying through the priority list if the
// configured/detected model is unavailable (404/"not found") OR its quota is
// exhausted (429) — Gemini's free-tier quotas are commonly PER-MODEL, so a
// 429 on one model does not mean every model is blocked for this key. A bad
// key or a safety block applies identically to every model, so those fail
// fast after one attempt instead of wasting time retrying.
export async function callGeminiWithFallback(apiKey, preferredModel, requestBody) {
  const candidates = [preferredModel, ...GEMINI_MODEL_PRIORITY].filter((v, i, a) => v && a.indexOf(v) === i)
  let lastErr = null
  let attempts = 0

  for (const model of candidates) {
    attempts++
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    let resp
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
    } catch (networkErr) {
      lastErr = networkErr
      continue
    }
    if (resp.ok) return await resp.json()

    const e = await resp.json().catch(() => ({}))
    const msg = e.error?.message || `Gemini API error (${resp.status})`
    const canTryNextModel = resp.status === 404 || resp.status === 429 || /not found|not supported|does not exist/i.test(msg)
    lastErr = new Error(msg)
    if (!canTryNextModel) break
  }

  throw new Error(attempts > 1
    ? `${lastErr.message} (tried ${attempts} Gemini model${attempts > 1 ? 's' : ''} — none worked, check your API key/quota)`
    : lastErr.message)
}
