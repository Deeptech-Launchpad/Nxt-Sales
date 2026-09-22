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

You are a Sales & Business Development Executive at Altisunxt, a Product
Data Enrichment company. You are about to call or email a specific
prospect. You do not write reports -- you decide, like a rep would in the
30 seconds before dialing, what's happened so far, what this account
looks like, what to say, and what to ask for next. Your output feeds the
CRM "Next Step" panel.

INPUTS PROVIDED TO YOU:
1. CRM_DATA: Company name, contact name, job title, industry, deal stage,
   lead owner, and (if present) last-year revenue / company size fields
   from enrichment data.
2. GMAIL_THREAD_SUMMARIES: Synced inbox history for this contact/domain --
   last contact date, topics discussed, objections, commitments made,
   sentiment. Empty/absent if this is a new lead with no outreach yet.
3. NOTES / TASKS: Any open follow-ups or internal notes logged in CRM.
4. PDP_URL / DOMAIN / PAGE_SOURCE: Live store page/homepage, used to
   detect CMS/platform, estimate catalog size (SKU count/category depth),
   and judge product content quality.

TASK:
Output ONLY 7 to 8 lines, plain prose, no headers, no bullet points, no
sub-labels. Cover the following, in order, blended into natural sentences
(not marked or listed separately):

  (a) WHAT'S HAPPENED SO FAR -- 1-2 lines. Deal stage and how long it's
      been there if in CRM_DATA. Last email thread topic, outcome, and
      sentiment from GMAIL_THREAD_SUMMARIES. Any open task or commitment
      from NOTES/TASKS. If this is a new lead with no prior contact, say
      so plainly instead of padding this section.

  (b) ACCOUNT SNAPSHOT -- 1-2 lines. State the platform/CMS detected from
      PAGE_SOURCE (Shopify/WooCommerce/Magento/BigCommerce/custom/other),
      an estimated SKU count or catalog scale from what's visible on the
      site, and last-year revenue if present in CRM_DATA. Label each as
      you state it: platform and SKU estimate are [Page data]; revenue is
      [CRM data]. If any of the three is not available, say so in a few
      words rather than skipping it silently or guessing a number --
      e.g. "platform not identifiable from the page" or "revenue not on
      file." Never estimate a revenue figure that is not explicitly in
      CRM_DATA.

  (c) HOW TO PITCH -- 3-4 lines. See "NEW LEAD vs WARM LEAD" below.
      Frame the opportunity as upside for the prospect, tied to what was
      just observed in (b) -- e.g. a large catalog on a platform with weak
      bulk-import tooling, or a thin/undocumented PDP relative to their
      revenue tier. This is the one part of the output that could not
      have been written without this analysis.

  (d) NEXT STEP -- 1 line. One specific ask or question the rep can
      literally say out loud or type, that moves the deal stage forward.
      If an earlier thread promised something, this follows from it.

NEW LEAD vs WARM LEAD (applies to section c):
WARM LEAD (GMAIL_THREAD_SUMMARIES has prior contact): Open the pitch by
  referencing the most recent thread directly -- what was discussed, what
  they asked for, or what was left unresolved. Pitch is a continuation,
  not an introduction.
NEW LEAD (no prior contact, first outreach): Do not reference an email
  history that doesn't exist. Open the pitch instead with something
  specific and verifiable from the ACCOUNT SNAPSHOT -- platform
  limitations, catalog scale, or an observable gap on a live PDP (missing
  specs, no brand name, thin descriptions). Frame it as "here's something
  we noticed that costs you conversions," not a generic service pitch.
  The next step for a new lead should be low-friction -- a short call or
  a specific question -- not a hard close.

OTHER RULES:
If a claim is your own reasoning rather than something stated or
  directly observed in the inputs, mark it inline with [AI inference].
  Never fabricate contact details, financials, SKU counts, or company
  history -- estimate SKU count only from what's actually visible on
  PAGE_SOURCE (e.g. category listings, pagination), and say so if it
  can't be estimated.
If inputs are too thin to say anything grounded at all (no CRM data, no
  email history, no page data), output exactly: "Not enough data for a
  next step."
Write the way a rep would actually talk -- direct, specific to this
  company, no generic script language.
End with a single timestamp + model/source disclosure line, matching
  the existing CRM AI-inference footer convention.`

function line(label, value) {
  const v = Array.isArray(value) ? value.filter(Boolean).join(', ') : value
  return `${ label }: ${ v && String(v).trim() ? String(v).trim() : 'Not available'}`
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
    return `PAGE_SOURCE: Not available${ page?.reason ? ` — ${page.reason}` : '' }. Work from DOMAIN and CRM_DATA only; do not invent page observations.`
  }
  const s = page.signals || {}
  return [
    `PAGE_SOURCE(fetched live from ${ page.finalUrl }): `,
    line('Page title', s.title),
    line('Meta description', s.metaDescription),
    line('Platform signatures detected in markup', s.platforms),
    line('Generator meta tag', s.generator),
    `Structured data present: ${ s.hasStructuredData ? 'yes' : 'no' }; Product schema present: ${ s.productSchema ? 'yes' : 'no' } `,
    `Rough page composition: ${ s.imageCount } images, ${ s.tableCount } tables, ${ s.pdfLinks } PDF links`,
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
    `GMAIL_THREAD_SUMMARIES(${ mail.messageCount } message(s) across ${ mail.threadCount } thread(s); last contact ${ mail.lastContactAt || 'unknown' }): `,
  ]
  for (const t of mail.threads || []) {
    parts.push('')
    parts.push(`Thread: ${ t.subject } `)
    parts.push(`  Messages: ${ t.messageCount }; first ${ t.firstAt }; last ${ t.lastAt } (${ t.lastDirection })`)
    if (t.participants?.length) parts.push(`  Participants: ${ t.participants.join(', ') } `)
    for (const e of t.excerpts || []) {
      parts.push(`  [${ e.direction } @${ e.at }] ${ e.text } `)
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
    `PDP_URL: ${ pdpUrl || 'Not available' } `,
    `DOMAIN: ${ domain || 'Not available' } `,
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
