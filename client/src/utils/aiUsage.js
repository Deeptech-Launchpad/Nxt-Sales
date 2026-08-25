// Common AI token-usage tracking. Single source of truth for BOTH extracting
// usage metadata from an AI provider's response and persisting it.
//
// Nothing here estimates tokens. Every number reported comes from the usage
// block the provider itself returned; when a provider returns none, the request
// is still recorded (so request counts stay right) with hasUsageData:false and
// zero tokens, and the Settings panel says so explicitly.
//
// Gemini calls are tracked automatically — utils/geminiModel.js calls
// recordAiUsage() for every successful generateContent, so any current or
// future feature that goes through the shared helper is covered without adding
// counting logic of its own. The OpenAI/Anthropic branches (selectable in
// Email Tool Settings → AI Provider) are raw fetches at their call sites, so
// those pass their response to recordAiUsage() directly — the extraction logic
// still lives only here.

import api from '../api/client'

// Feature identifiers. Keep these stable — they are what the usage panel groups
// by, so renaming one splits its history.
export const AI_FEATURES = {
  EMAIL_AI_GENERATION: 'email_ai_generation',
  EMAIL_DELIVERABILITY: 'email_deliverability',
  CUSTOMER_INTELLIGENCE: 'customer_intelligence',
}

// Human labels for the UI. Unknown//future keys fall back to a prettified slug
// so a new feature shows up sensibly even before it's listed here.
const FEATURE_LABELS = {
  [AI_FEATURES.EMAIL_AI_GENERATION]: 'Email AI Generation',
  [AI_FEATURES.EMAIL_DELIVERABILITY]: 'Deliverability AI Review',
  [AI_FEATURES.CUSTOMER_INTELLIGENCE]: 'Customer Intelligence',
}

export function featureLabel(key) {
  if (FEATURE_LABELS[key]) return FEATURE_LABELS[key]
  return String(key || 'unknown').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0)

// Normalises the three provider response shapes into one form.
//   Gemini    : usageMetadata { promptTokenCount, candidatesTokenCount, totalTokenCount, thoughtsTokenCount? }
//   OpenAI    : usage { prompt_tokens, completion_tokens, total_tokens }
//   Anthropic : usage { input_tokens, output_tokens }   (no explicit total)
// Returns hasUsageData:false when the provider gave nothing to read.
export function extractUsage(provider, response) {
  if (!response || typeof response !== 'object') {
    return { promptTokens: 0, outputTokens: 0, totalTokens: 0, hasUsageData: false }
  }

  if (provider === 'gemini') {
    const u = response.usageMetadata
    if (!u) return { promptTokens: 0, outputTokens: 0, totalTokens: 0, hasUsageData: false }
    const prompt = num(u.promptTokenCount)
    // Thinking models bill reasoning tokens separately from the visible answer;
    // both are output the caller pays for, so they're summed rather than dropped.
    const output = num(u.candidatesTokenCount) + num(u.thoughtsTokenCount)
    const total = num(u.totalTokenCount) || prompt + output
    return { promptTokens: prompt, outputTokens: output, totalTokens: total, hasUsageData: true }
  }

  const u = response.usage
  if (!u) return { promptTokens: 0, outputTokens: 0, totalTokens: 0, hasUsageData: false }

  if (provider === 'anthropic') {
    const prompt = num(u.input_tokens)
    const output = num(u.output_tokens)
    return { promptTokens: prompt, outputTokens: output, totalTokens: prompt + output, hasUsageData: true }
  }

  // OpenAI (and anything else that follows its shape)
  const prompt = num(u.prompt_tokens)
  const output = num(u.completion_tokens)
  const total = num(u.total_tokens) || prompt + output
  return { promptTokens: prompt, outputTokens: output, totalTokens: total, hasUsageData: true }
}

// Records one AI request. Deliberately fire-and-forget and never throws: usage
// tracking must not be able to break, delay, or fail the AI feature that
// triggered it. The model actually used is read from the response when the
// provider reports it (Gemini's modelVersion / OpenAI's model), since the
// shared Gemini helper may have fallen through to a different model than the
// one requested.
export function recordAiUsage({ provider, model, feature, response }) {
  try {
    const usage = extractUsage(provider, response)
    const actualModel = (response && (response.modelVersion || response.model)) || model || 'unknown'
    api.post('/ai-usage', {
      feature: feature || 'unknown',
      provider: provider || 'unknown',
      model: actualModel,
      ...usage,
    }).catch(() => {})
  } catch {
    // never surface tracking problems to the caller
  }
}

export function fetchAiUsageSummary(days = 30) {
  return api.get('/ai-usage/summary', { params: { days } }).then(r => r.data)
}
