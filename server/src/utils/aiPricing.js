// ── Centralised AI model pricing ──────────────────────────────────────────
//
// SINGLE source of truth for cost estimation. To update a rate, edit only this
// file — nothing else computes cost.
//
// Rates are USD per 1,000,000 tokens, taken from the providers' own published
// pricing pages. Nothing here is inferred or averaged: a model that is not
// listed returns null, and every caller then reports "Pricing unavailable"
// rather than showing an invented number.
//
// Sources and verification dates:
//   Gemini    — https://ai.google.dev/gemini-api/docs/pricing        (verified 2026-08-20)
//   Anthropic — https://platform.claude.com/docs/en/about-claude/pricing (verified 2026-08-20)
//   OpenAI    — https://openai.com/api/pricing/ (published standard rates;
//               the page blocks automated fetching, so re-check manually)
//
// Caveats deliberately encoded as "unavailable" rather than guessed:
//   * Rolling aliases (gemini-flash-latest / gemini-pro-latest) resolve to a
//     different concrete model over time, so they are NOT priced. In practice
//     the tracker stores Gemini's own `modelVersion` (the concrete model that
//     answered), so alias rows should be rare.
//   * Gemini 1.5 models no longer appear on Google's pricing page.
//   * Tiered rates (e.g. Gemini 2.5 Pro's >200k-token tier, audio input,
//     cache/batch discounts) are NOT modelled — the base text rate is used.
//     That makes long-context or audio requests an UNDER-estimate, which is
//     why every figure is labelled "Estimated".

const PER_MILLION = 1000000

// input/output = USD per 1M tokens
const PRICING = {
  gemini: {
    'gemini-3.7-flash':       { input: 0.75, output: 3.75 },
    'gemini-3.6-flash':       { input: 0.75, output: 3.75 },
    'gemini-3.5-flash':       { input: 1.50, output: 9.00 },
    'gemini-3.5-flash-lite':  { input: 0.30, output: 2.50 },
    'gemini-2.5-pro':         { input: 1.25, output: 10.00 },
    'gemini-2.5-flash':       { input: 0.30, output: 2.50 },
    'gemini-2.5-flash-lite':  { input: 0.10, output: 0.40 },
    'gemini-2.0-flash':       { input: 0.10, output: 0.40 },
    'gemini-2.0-flash-lite':  { input: 0.075, output: 0.30 },
  },
  openai: {
    'gpt-4o':      { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
  },
  anthropic: {
    'claude-fable-5':               { input: 10.00, output: 50.00 },
    'claude-opus-5':                { input: 5.00, output: 25.00 },
    'claude-opus-4-8':              { input: 5.00, output: 25.00 },
    'claude-opus-4-7':              { input: 5.00, output: 25.00 },
    'claude-opus-4-6':              { input: 5.00, output: 25.00 },
    'claude-opus-4-5':              { input: 5.00, output: 25.00 },
    'claude-sonnet-5':              { input: 2.00, output: 10.00 },
    'claude-sonnet-4-6':            { input: 3.00, output: 15.00 },
    'claude-sonnet-4-5':            { input: 3.00, output: 15.00 },
    'claude-haiku-4-5':             { input: 1.00, output: 5.00 },
    // Retired models kept so historical rows still cost correctly.
    'claude-3-5-sonnet-20241022':   { input: 3.00, output: 15.00 },
    'claude-3-5-sonnet':            { input: 3.00, output: 15.00 },
    'claude-3-5-haiku':             { input: 0.80, output: 4.00 },
  },
}

// Aliases that intentionally have NO price — they don't identify a concrete
// model, so pricing them would be a guess.
const UNPRICED_ALIASES = new Set(['gemini-flash-latest', 'gemini-pro-latest', 'unknown'])

// Resolves a stored model string to a rate. Exact match first, then a longest
// prefix match so dated/preview variants (e.g. "gemini-2.5-flash-preview-09-2025")
// price as their base model. Returns null when nothing matches.
function getRate(provider, model) {
  const table = PRICING[String(provider || '').toLowerCase()]
  if (!table) return null

  const key = String(model || '').toLowerCase().replace(/^models\//, '').trim()
  if (!key || UNPRICED_ALIASES.has(key)) return null
  if (table[key]) return table[key]

  let best = null
  for (const candidate of Object.keys(table)) {
    if (key.startsWith(candidate) && (!best || candidate.length > best.length)) best = candidate
  }
  return best ? table[best] : null
}

// Returns { inputCost, outputCost, totalCost, priced } in USD.
// priced === false means no rate is known — callers must show "Pricing
// unavailable" and must NOT treat the zeros as a real cost.
function estimateCost(provider, model, promptTokens, outputTokens) {
  const rate = getRate(provider, model)
  if (!rate) return { inputCost: 0, outputCost: 0, totalCost: 0, priced: false }

  // outputTokens already includes Gemini "thoughts" tokens — folded in by the
  // existing extractor (client/src/utils/aiUsage.js). Cost therefore follows
  // exactly the same accounting as the token counts, with no separate rule.
  const inputCost = ((Number(promptTokens) || 0) / PER_MILLION) * rate.input
  const outputCost = ((Number(outputTokens) || 0) / PER_MILLION) * rate.output
  return { inputCost, outputCost, totalCost: inputCost + outputCost, priced: true }
}

// Rounds to cents-with-precision for transport. Sub-cent AI calls are normal,
// so 6dp is kept rather than rounding tiny costs away to 0.00.
const round6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6

module.exports = { PRICING, getRate, estimateCost, round6 }
