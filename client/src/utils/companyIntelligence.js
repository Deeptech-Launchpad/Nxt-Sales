// AI Customer Intelligence for the Company detail page.
//
// Reuses the EXACT same AI configuration the Email Tool saves in Settings
// (server-held Gemini key, no browser configuration) and the same shared
// call helper (geminiModel.js) every other AI call site uses — no second
// API-key field, no separate AI configuration, nothing hardcoded. The API key
// is read here and sent only to Google's Gemini endpoint; it is never
// rendered anywhere in the UI.
//
// The model now returns a human-readable "Sales Pitch Intelligence Sheet"
// rather than JSON, so there is no schema to parse — the raw text is handed to
// the UI, which renders it as the sheet. See SYSTEM_PROMPT below.

import api from '../api/client'
import { callGemini, getAiStatus, aiUnavailableMessage } from './geminiModel'
import { valueList } from './multiValue'
import { AI_FEATURES } from './aiUsage'

// ── AI settings ───────────────────────────────────────
// Kept as a function so existing callers still work, but there is no key and
// no model here any more — both belong to the server now.
export function getAiSettings() {
  return { provider: 'gemini' }
}

// ── In-session cache ───────────────────────────────────────────────────────
// Generation only ever happens on an explicit button click; this cache just
// keeps the last result per company alive across tab switches / Prev-Next
// navigation within the session, so the user is never silently re-billed for
// Gemini tokens by simply revisiting a page.
const insightsCache = new Map() // companyId -> { sheet, generatedAt, model, sources }

export function getCachedInsights(companyId) {
  return insightsCache.get(companyId) || null
}

// ── Prompt ─────────────────────────────────────────────────────────────────
// SUPPLIED VERBATIM BY THE PRODUCT OWNER — DO NOT REWRITE, SHORTEN, RESTRUCTURE
// OR "IMPROVE" THIS STRING. Its wording, section order, role logic, output
// rules and labels are all deliberate and finalized. Only the code that feeds
// inputs into it (below) may change.
const SYSTEM_PROMPT = `ROLE:

You are a Sales Intelligence Analyst working for Altisunxt, a Product Data
Enrichment company. You support outbound sales agents who need to call or
email decision makers at industrial/B2B distributors (e.g., AIS National)
and pitch Altisunxt's catalog enrichment services. Your output feeds the
CRM "Customer Intelligence" panel and must read like sales-ready ammunition,
not a technical audit -- an agent should be able to speak from it directly
on a live call.

INPUTS PROVIDED TO YOU:
1. PDP_URL: A product detail page URL from the prospect's live store
   (optional -- if absent, work from DOMAIN and CRM_DATA only).
2. DOMAIN: The prospect's root domain.
3. CRM_DATA: Structured fields already in CRM (company name, contact name,
   job title, industry, lead owner, deal stage, CMS/platform if logged).
4. GMAIL_THREAD_SUMMARIES: Auto-summarized synced Google Business inbox
   content for this contact/domain (last contact date, key points,
   sentiment, commitments made).
5. PAGE_SOURCE (from PDP_URL or DOMAIN homepage): rendered HTML/text used
   to detect CMS/platform, catalog scale, contact/address details, and
   product content quality.

TASK:
Produce a single scannable "Sales Pitch Intelligence Sheet" that a rep can
read in under a minute before dialing. Label every claim as one of:
  [CRM data]      -- pulled directly from CRM fields
  [Page data]     -- observed directly on the site/PDP
  [Email summary] -- derived from synced Gmail thread
  [AI inference]  -- your reasoning, not a verified fact

------------------------------------------------
1. COMPANY SNAPSHOT & ORIGIN
------------------------------------------------
Company name, HQ/location, year founded or "years in business" if
  discoverable, primary vertical/niche
Company origin story cue if available (family business, franchise,
  distributor-of-record for a brand, etc.) -- useful as rapport-building
  detail on the call
Estimated catalog scale (SKU depth, number of categories)

------------------------------------------------
2. CMS / PLATFORM IDENTIFIED
------------------------------------------------
Detected platform: Shopify / WooCommerce / Magento / BigCommerce /
  custom-built / other
Any visible plugins, storefront builder, or hosting signals that hint at
  technical maturity or in-house dev capability
Note if platform limits enrichment options Altisunxt should flag (e.g.,
  bulk import method varies by CMS)

------------------------------------------------
3. WHAT ALTISUNXT CAN ENRICH FOR THIS LEAD
------------------------------------------------
Map observed gaps directly to Altisunxt's service lines. Only list services
relevant to what was actually observed on PDP_URL/DOMAIN:
Technical specification enrichment (dimensions, materials, compliance,
  compatibility data)
Product documentation sourcing/structuring (spec sheets, manuals, CAD,
  safety data sheets)
Product imagery enhancement (multi-angle, lifestyle, technical diagrams)
SEO-optimized product copy and structured attribute/taxonomy building
Bulk catalog migration/enrichment support suited to their specific CMS

------------------------------------------------
4. CUSTOMER BENEFITS IF THEY TAKE ALTISUNXT'S SERVICES
------------------------------------------------
Frame as outcomes the prospect cares about, not features:
Higher on-site conversion from complete, trustworthy product data
Fewer inbound support calls/emails asking for specs already on the page
Improved organic search visibility from richer, keyword-structured
  content
Faster time-to-publish for new SKUs/catalog updates
Reduced buyer hesitation and cart abandonment for technical B2B purchases

------------------------------------------------
5. RELATIONSHIP CONTEXT (from synced email)
------------------------------------------------
Last contact date and channel [Email summary]
Summary of most recent thread(s): topics discussed, objections raised,
  interest signals, next steps promised
Sentiment read: cold / warm / engaged
Any commitments the rep should honor or reference

------------------------------------------------
6. ROLE-BASED CALL / EMAIL TALKING POINTS
------------------------------------------------
Do NOT output role templates, and do not reuse the wording of any generic
script. This section is the one part of the sheet the rep could not have
written without this analysis, so every line must trace back to something
actually observed in CRM_DATA, PAGE_SOURCE or GMAIL_THREAD_SUMMARIES for THIS
company.

Read the contact's job title from CRM_DATA and pitch to that person's
concerns, but do NOT label or split the output by role. Produce ONE
consolidated set of talking points for the call that is about to happen.

Output exactly these five labels, each starting its own line, in this order:

Icebreaker: One natural opening line. Reference something specific and
  verifiable — a product range or category seen on their site, a recent thread
  from GMAIL_THREAD_SUMMARIES, their location, their vertical. Never flattery,
  never a generic greeting.
Pain Points: The one or two concrete gaps or opportunities actually observed —
  thin specifications, missing documentation, weak imagery, an objection or
  delay raised over email, a platform limitation. State what was seen and where
  it was seen.
Value Pitch: One or two sentences on what Altisunxt does about those specific
  gaps and why that matters commercially to this company. Tie it to the pain
  points above, not to a general list of services.
Sales Points: Two or three short bullets the rep should be ready to raise, each
  on its own line beginning with '- '. Use proof points, catalog scale, prior
  commitments from email, timing or seasonal hooks, or platform-specific
  delivery detail. Skip anything not grounded in the inputs.
Discovery Question: One open question that moves THIS deal to a next step,
  informed by where the relationship actually stands. If an earlier thread
  promised something, ask the question that follows from it.

Where the inputs do not support a line, write 'Not enough data' for that line
rather than inventing something plausible. Mark reasoning as [AI inference].

------------------------------------------------
OUTPUT RULES:
------------------------------------------------
Keep the full sheet to one page equivalent; role-based section may run
  slightly longer if multiple contacts are involved
Never fabricate company history, financials, or contact details --
  mark uncertain items [AI inference] and keep them brief
If CRM_DATA has no job title for the contact, default to Category
  Manager and General Manager blocks (most common CMS/catalog owners)
End with a timestamp and model/source disclosure line, matching the
existing CRM AI-inference footer convention.`

function line(label, value) {
  const v = Array.isArray(value) ? value.filter(Boolean).join(', ') : value
  return `${label}: ${v && String(v).trim() ? String(v).trim() : 'Not available'}`
}

// ── Input block builders — one per named input in the prompt ───────────────

export function buildCompanyDataBlock(company, extraContext = {}) {
  const emails = valueList(company.email, company.emails)
  const phones = valueList(company.phone, company.phones)
  const contacts = Array.isArray(company.contactPersons) ? company.contactPersons.filter(Boolean) : []
  const profiles = Array.isArray(company.linkedProfiles) ? company.linkedProfiles.filter(Boolean) : []

  const lines = [
    'CRM_DATA (anything marked "Not available" is genuinely not stored — do not guess it):',
    line('Company name', company.name),
    line('Company website / domain', company.domain),
    line('Industry', company.industry),
    line('Country', company.country),
    line('Lead status', company.leadStatus),
    // The prompt's role logic keys off the contact's job title. Titles are
    // stored inline in the contact string when known ("Gary Harte - Shop
    // Manager"), so they are passed through verbatim rather than being parsed
    // out — the model reads them better than a brittle splitter would.
    line('Contact person(s) (job title follows the name where known)', contacts),
    line('Contact email(s)', emails),
    line('Contact phone(s)', phones),
    line('LinkedIn / linked profile(s)', profiles),
    line('CMS / platform (as logged in CRM)', company.cms),
    line('Lead owner', company.owner?.name),
    line('Remarks (notes by sales team)', company.remarks),
    line('Notes', company.notes),
  ]

  for (const [label, value] of Object.entries(extraContext)) {
    lines.push(line(label, value))
  }

  return lines.join('\n')
}

// PAGE_SOURCE — fetched server-side (a browser cannot fetch a third-party
// site because of CORS). Reduced to text + platform signals by the server.
function buildPageSourceBlock(page) {
  if (!page || !page.ok) {
    return `PAGE_SOURCE: Not available${page?.reason ? ` — ${page.reason}` : ''}. Work from DOMAIN and CRM_DATA only; do not invent page observations.`
  }
  const s = page.signals || {}
  return [
    `PAGE_SOURCE (fetched live from ${page.finalUrl}):`,
    line('Page title', s.title),
    line('Meta description', s.metaDescription),
    line('Platform signatures detected in markup', s.platforms),
    line('Generator meta tag', s.generator),
    `Structured data present: ${s.hasStructuredData ? 'yes' : 'no'}; Product schema present: ${s.productSchema ? 'yes' : 'no'}`,
    `Rough page composition: ${s.imageCount} images, ${s.tableCount} tables, ${s.pdfLinks} PDF links`,
    '',
    'Extracted page text:',
    page.text || '(no text extracted)',
  ].join('\n')
}

// GMAIL_THREAD_SUMMARIES — rolled up server-side from Gmail activity already
// synced against this company.
function buildEmailBlock(mail) {
  if (!mail || !mail.ok || !mail.threadCount) {
    return 'GMAIL_THREAD_SUMMARIES: Not available — no synced email is stored against this company. Say so plainly in section 5 rather than inferring a relationship.'
  }
  const parts = [
    `GMAIL_THREAD_SUMMARIES (${mail.messageCount} message(s) across ${mail.threadCount} thread(s); last contact ${mail.lastContactAt || 'unknown'}):`,
  ]
  for (const t of mail.threads || []) {
    parts.push('')
    parts.push(`Thread: ${t.subject}`)
    parts.push(`  Messages: ${t.messageCount}; first ${t.firstAt}; last ${t.lastAt} (${t.lastDirection})`)
    if (t.participants?.length) parts.push(`  Participants: ${t.participants.join(', ')}`)
    for (const e of t.excerpts || []) {
      parts.push(`  [${e.direction} @ ${e.at}] ${e.text}`)
    }
  }
  return parts.join('\n')
}

// ── Context gathering ──────────────────────────────────────────────────────
// Both calls are best-effort: the prompt explicitly allows working without
// PDP_URL, and a prospect site being unreachable or a company having no synced
// email must not block generation.
async function gatherContext(company) {
  const pdpUrl = (company.endPdpUrl || '').trim()
  const domain = (company.domain || '').trim()
  const target = pdpUrl || domain

  const [page, mail] = await Promise.all([
    target
      ? api.get('/intelligence/page-source', { params: { url: target } })
          .then(r => r.data)
          .catch(() => ({ ok: false, reason: 'The page could not be fetched.' }))
      : Promise.resolve({ ok: false, reason: 'No PDP URL or domain is stored for this company.' }),
    api.get(`/intelligence/email-summaries/${company.id}`)
      .then(r => r.data)
      .catch(() => ({ ok: false })),
  ])

  return { page, mail, pdpUrl, domain }
}

// ── Main entry point ───────────────────────────────────────────────────────
// Throws with a user-presentable message on any failure; on success returns
// { sheet, generatedAt, model, sources } and caches it for this session.
export async function generateCompanyInsights(company, extraContext = {}) {
  // One round-trip to confirm AI is actually usable, so a misconfigured
  // server produces a clear message instead of a failed generation.
  const status = await getAiStatus().catch(() => null)
  if (!status || !status.connected) {
    throw new Error(aiUnavailableMessage(status))
  }

  const { page, mail, pdpUrl, domain } = await gatherContext(company)

  const userBlock = [
    `PDP_URL: ${pdpUrl || 'Not available'}`,
    `DOMAIN: ${domain || 'Not available'}`,
    '',
    buildCompanyDataBlock(company, extraContext),
    '',
    buildEmailBlock(mail),
    '',
    buildPageSourceBlock(page),
  ].join('\n')

  // No responseMimeType/JSON constraint any more — the prompt asks for a
  // readable sheet, and forcing application/json would fight it.
  const d = await callGemini({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [{ text: userBlock }] }],
    generationConfig: { temperature: 0.4 },
  }, { feature: AI_FEATURES.CUSTOMER_INTELLIGENCE })

  const sheet = (d.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
  if (!sheet) throw new Error('The AI returned an empty response. Try again.')

  const result = {
    sheet,
    generatedAt: new Date().toISOString(),
    // Whichever model the server actually used, straight from the response.
    model: d.modelVersion || 'gemini',
    // Shown in the UI so the rep can see which inputs actually reached the
    // model — an empty section 5 is then obviously "no synced email", not a
    // silent failure.
    sources: {
      pageFetched: !!page?.ok,
      pageUrl: page?.ok ? page.finalUrl : null,
      pageReason: page?.ok ? null : (page?.reason || null),
      emailThreads: mail?.ok ? (mail.threadCount || 0) : 0,
      emailMessages: mail?.ok ? (mail.messageCount || 0) : 0,
    },
  }
  insightsCache.set(company.id, result)
  return result
}
