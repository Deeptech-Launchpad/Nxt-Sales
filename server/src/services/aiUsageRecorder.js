// Server-side token accounting for AI calls.
//
// The browser used to be responsible for reporting its own usage. Now that
// every Gemini call goes through the server, usage is recorded where the call
// actually happens — so it cannot be skipped, and it works the same for any
// future feature that uses the shared service.
//
// Nothing here estimates tokens: every number comes from the usage block the
// provider itself returned. When a provider returns none, the request is still
// counted with hasUsageData:false and zero tokens, matching the existing
// client-side contract in client/src/utils/aiUsage.js.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0)

// Gemini: usageMetadata { promptTokenCount, candidatesTokenCount,
// totalTokenCount, thoughtsTokenCount? }. Thinking models bill reasoning
// tokens separately from the visible answer; both are output the account pays
// for, so they are summed rather than dropped.
function extractGeminiUsage(response) {
  const u = response && response.usageMetadata
  if (!u) return { promptTokens: 0, outputTokens: 0, totalTokens: 0, hasUsageData: false }
  const promptTokens = num(u.promptTokenCount)
  const outputTokens = num(u.candidatesTokenCount) + num(u.thoughtsTokenCount)
  const totalTokens = num(u.totalTokenCount) || promptTokens + outputTokens
  return { promptTokens, outputTokens, totalTokens, hasUsageData: true }
}

// Best-effort by design: a tracking failure must never break the AI feature
// the user actually asked for.
function recordUsage({ userId, feature, model, response }) {
  if (!userId) return
  const usage = extractGeminiUsage(response)
  prisma.aiUsage.create({
    data: {
      userId,
      feature: feature || 'unknown',
      provider: 'gemini',
      model: model || 'unknown',
      promptTokens: usage.promptTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      hasUsageData: usage.hasUsageData,
    },
  }).catch(err => console.warn('[AI Usage] could not record:', err.message))
}

module.exports = { recordUsage, extractGeminiUsage }
