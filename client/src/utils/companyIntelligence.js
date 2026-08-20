// AI Customer Intelligence for the Company detail page.
//
// Reuses the EXACT same AI configuration the Email Tool saves in Settings
// (localStorage: ai_provider / ai_key / ai_model) and the same shared Gemini
// call helper (geminiModel.js) every other AI call site uses — no second
// API-key field, no separate AI configuration, nothing hardcoded. The API key
// is read here and sent only to Google's Gemini endpoint; it is never
// rendered anywhere in the UI.
//
// Kept as a standalone module (prompt building, calling, parsing, caching)
// so it can later be fed richer context — call summaries, email history,
// meetings — via the optional `extraContext` parameter without touching the
// Company detail page again.

import { callGeminiWithFallback } from './geminiModel'
import { valueList } from './multiValue'
import { AI_FEATURES } from './aiUsage'

// ── AI settings (single source of truth: Email Tool → Settings) ────────────
export function getAiSettings() {
  return {
    provider: localStorage.getItem('ai_provider') || 'gemini',
    key: (localStorage.getItem('ai_key') || '').trim(),
    model: localStorage.getItem('ai_model') || 'gemini-2.5-flash',
  }
}

// ── In-session cache ───────────────────────────────────────────────────────
// Generation only ever happens on an explicit button click; this cache just
// keeps the last result per company alive across tab switches / Prev-Next
// navigation within the session, so the user is never silently re-billed for
// Gemini tokens by simply revisiting a page.
const insightsCache = new Map() // companyId -> { insights, generatedAt, model }

export function getCachedInsights(companyId) {
  return insightsCache.get(companyId) || null
}

// ── Prompt ─────────────────────────────────────────────────────────────────
// Every section is a list of { text, basis } items where basis is "fact"
// (directly grounded in the CRM data supplied) or "inference" (the model's
// own reasoning/recommendation) — this is what lets the UI visibly separate
// factual information from AI inference.
const SECTION_KEYS = [
  'companyOverview',
  'contactOverview',
  'potentialBusinessNeeds',
  'potentialOpportunities',
  'recommendedApproach',
  'talkingPoints',
]

const SYSTEM_PROMPT = `You are a B2B sales-intelligence assistant inside a CRM used by a digital commerce agency (services: structured eCommerce, product detail page optimization, CMS and web development, digital revenue growth).

You will receive the CRM's stored data about ONE company. Produce pre-call/pre-email intelligence for the salesperson.

STRICT RULES:
- Use ONLY the CRM data provided plus, where clearly relevant, widely-known general knowledge about the company/industry. NEVER invent specific facts (revenue, headcount, tools, names, events) that are not in the data.
- Every item must be labeled: basis "fact" when it restates or directly follows from the provided CRM data; basis "inference" for anything reasoned, assumed, or recommended (including general-knowledge claims).
- If a section cannot be grounded at all (e.g. no contact person stored), return exactly one item: { "text": "Not available — <what is missing in the CRM>.", "basis": "fact" }. Do not pad with generic filler.
- Plain sentences only. No markdown, no bullets characters, no headings inside items.

Return ONLY valid JSON, no code fences, exactly this shape:
{
  "companyOverview": [{ "text": "...", "basis": "fact" }],
  "contactOverview": [{ "text": "...", "basis": "fact" }],
  "potentialBusinessNeeds": [{ "text": "...", "basis": "inference" }],
  "potentialOpportunities": [{ "text": "...", "basis": "inference" }],
  "recommendedApproach": [{ "text": "...", "basis": "inference" }],
  "talkingPoints": [{ "text": "...", "basis": "inference" }]
}

Section meanings:
- companyOverview: what the company is/does and its business area.
- contactOverview: the stored contact person(s) and their likely role/professional context.
- potentialBusinessNeeds: what they may need, based on the available data.
- potentialOpportunities: where the agency's services could help them.
- recommendedApproach: how the salesperson should approach this customer.
- talkingPoints: concrete topics/questions for a call or email.`

function line(label, value) {
  const v = Array.isArray(value) ? value.filter(Boolean).join(', ') : value
  return `${label}: ${v && String(v).trim() ? String(v).trim() : 'Not available'}`
}

export function buildCompanyDataBlock(company, extraContext = {}) {
  const emails = valueList(company.email, company.emails)
  const phones = valueList(company.phone, company.phones)
  const contacts = Array.isArray(company.contactPersons) ? company.contactPersons.filter(Boolean) : []
  const profiles = Array.isArray(company.linkedProfiles) ? company.linkedProfiles.filter(Boolean) : []

  const lines = [
    'CRM DATA FOR THIS COMPANY (anything marked "Not available" is genuinely not stored — do not guess it):',
    line('Company name', company.name),
    line('Company website / domain', company.domain),
    line('Industry', company.industry),
    line('Country', company.country),
    line('Lead status', company.leadStatus),
    line('Contact person(s)', contacts),
    line('Contact email(s)', emails),
    line('Contact phone(s)', phones),
    line('LinkedIn / linked profile(s)', profiles),
    line('Product detail page URL', company.endPdpUrl),
    line('CMS / platform', company.cms),
    line('Remarks (notes by sales team)', company.remarks),
    line('Notes', company.notes),
  ]

  // Future hook: call summaries, email history, meetings etc. can be passed
  // in as extraContext without changing the callers' shape.
  for (const [label, value] of Object.entries(extraContext)) {
    lines.push(line(label, value))
  }

  return lines.join('\n')
}

// Strips code fences / stray prose and parses the JSON object out of a model
// response — Gemini is asked for pure JSON (and responseMimeType is set), but
// this stays robust if a model wraps it anyway.
function parseInsightsJson(text) {
  let raw = (text || '').trim()
  if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('AI returned an unexpected format. Try again.')
  const parsed = JSON.parse(raw.slice(start, end + 1))

  const insights = {}
  for (const key of SECTION_KEYS) {
    const items = Array.isArray(parsed[key]) ? parsed[key] : []
    insights[key] = items
      .map(it => (typeof it === 'string' ? { text: it, basis: 'inference' } : it))
      .filter(it => it && typeof it.text === 'string' && it.text.trim())
      .map(it => ({ text: it.text.trim(), basis: it.basis === 'fact' ? 'fact' : 'inference' }))
  }
  return insights
}

// ── Main entry point ───────────────────────────────────────────────────────
// Throws with a user-presentable message on any failure; on success returns
// { insights, generatedAt, model } and caches it for this session.
export async function generateCompanyInsights(company, extraContext = {}) {
  const { provider, key, model } = getAiSettings()

  if (!key) {
    throw new Error('No AI API key configured. Add your Gemini API key in Marketing → Email → Settings → AI API Key.')
  }
  if (provider !== 'gemini') {
    throw new Error(`Customer Intelligence currently supports the Gemini API (your AI provider is set to "${provider}"). Switch the provider to Gemini in Marketing → Email → Settings.`)
  }

  const dataBlock = buildCompanyDataBlock(company, extraContext)
  const d = await callGeminiWithFallback(key, model, {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: dataBlock }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
  }, { feature: AI_FEATURES.CUSTOMER_INTELLIGENCE })

  const text = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const insights = parseInsightsJson(text)

  const result = { insights, generatedAt: new Date().toISOString(), model: d.modelVersion || model }
  insightsCache.set(company.id, result)
  return result
}
