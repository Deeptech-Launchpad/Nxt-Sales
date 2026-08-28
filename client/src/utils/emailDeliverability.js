// ─────────────────────────────────────────────────────────────────────────────
// Email deliverability & spam analysis (pre-send)
//
// Deterministic, rule-based content/HTML checks (no external deps) + an optional
// AI pass (reuses the composer's own AI key) + a backend SPF/DKIM/DMARC lookup.
// Everything here is ADVISORY — it estimates inbox placement, never guarantees it.
// ─────────────────────────────────────────────────────────────────────────────
import api from '../api/client'
import { callGemini } from './geminiModel'
import { AI_FEATURES } from './aiUsage'

// Common spam-trigger phrases (kept practical, not exhaustive).
const SPAM_KEYWORDS = [
  'act now', 'apply now', 'buy now', 'call now', 'click here', 'click below', 'order now',
  'limited time', 'offer expires', 'expires today', 'urgent', 'don\'t miss', 'once in a lifetime',
  'free', '100% free', 'free gift', 'free access', 'free money', 'risk-free', 'no cost', 'no fees',
  'guarantee', 'guaranteed', 'no obligation', 'no strings attached', 'satisfaction guaranteed',
  'cash', 'cash bonus', 'earn money', 'make money', 'extra income', 'double your', 'income',
  'cheap', 'discount', 'best price', 'lowest price', 'save big', 'save up to', 'special promotion',
  'winner', 'you have been selected', 'congratulations', 'you won', 'prize', 'claim your',
  'increase sales', 'increase traffic', 'this is not spam', 'not spam', 'dear friend',
  'credit card', 'no credit check', 'pre-approved', 'investment', 'work from home',
  'weight loss', 'viagra', 'crypto', 'bitcoin', 'miracle', 'amazing',
]

const URL_SHORTENERS = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at']

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'for', 'with', 'at', 'by', 'is', 'are', 'was', 'be', 'this', 'that', 'it', 'as', 'your', 'you', 'we', 'our', 'i', 'from', 'will', 'can', 'has', 'have'])

function stripHtml(html) {
  return (html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Deterministic analysis ───────────────────────────────────────────────────
export function analyzeContent({ subject = '', html = '' }) {
  const text = stripHtml(html)
  const words = text.split(/\s+/).filter(Boolean)
  const letters = text.replace(/[^a-zA-Z]/g, '')
  const upperLetters = text.replace(/[^A-Z]/g, '')
  const capsRatio = letters.length ? upperLetters.length / letters.length : 0

  // Links
  const hrefs = [...(html || '').matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => m[1])
  const anchors = [...(html || '').matchAll(/<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  const rawUrls = (text.match(/https?:\/\/[^\s)]+/gi) || [])
  const allLinks = [...new Set([...hrefs, ...rawUrls])].filter(u => /^https?:\/\//i.test(u))
  const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }

  const shortenerLinks = allLinks.filter(u => URL_SHORTENERS.includes(domainOf(u)))
  const ipLinks = allLinks.filter(u => /https?:\/\/\d{1,3}(\.\d{1,3}){3}/i.test(u))
  const mismatchedAnchors = anchors.filter(([, href, label]) => {
    const clean = stripHtml(label)
    if (!/[a-z0-9]\.[a-z]{2,}/i.test(clean)) return false          // label doesn't look like a domain
    const labelDomain = (clean.match(/[a-z0-9.-]+\.[a-z]{2,}/i) || [''])[0].replace(/^www\./, '').toLowerCase()
    const hrefDomain = domainOf(href).toLowerCase()
    return labelDomain && hrefDomain && !hrefDomain.includes(labelDomain) && !labelDomain.includes(hrefDomain)
  })

  // Images
  const images = [...(html || '').matchAll(/<img[^>]*>/gi)].map(m => m[0])
  const imagesNoAlt = images.filter(img => !/alt\s*=\s*["'][^"']+["']/i.test(img))
  const imageTextRatio = images.length ? images.length / Math.max(1, words.length / 20) : 0

  // Spam keywords
  const lowerAll = `${subject} ${text}`.toLowerCase()
  const foundKeywords = SPAM_KEYWORDS.filter(k => lowerAll.includes(k))

  // Repeated words
  const freq = {}
  for (const w of words.map(w => w.toLowerCase().replace(/[^a-z']/g, '')).filter(w => w.length > 3 && !STOPWORDS.has(w))) {
    freq[w] = (freq[w] || 0) + 1
  }
  const repeated = Object.entries(freq).filter(([, c]) => c >= 6).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Excess punctuation
  const exclamations = (lowerAll.match(/!/g) || []).length
  const moneySymbols = (lowerAll.match(/\$\$+|€€+|££+/g) || []).length

  // HTML structure red flags
  const hasScript = /<script/i.test(html || '')
  const hasForm = /<form/i.test(html || '')
  const hasIframe = /<iframe/i.test(html || '')
  const hasUnsubscribe = /unsubscribe|opt[\s-]?out|manage preferences/i.test(html || '')

  // ── Build checks ──
  const checks = []
  const add = (severity, label, detail) => checks.push({ severity, label, detail })

  // Subject
  const subjLen = subject.trim().length
  if (subjLen === 0) add('fail', 'Subject line', 'Subject is empty — a missing subject strongly hurts deliverability.')
  else if (subjLen > 70) add('warn', 'Subject length', `Subject is ${subjLen} chars. Aim for 30–60 to avoid truncation and spam heuristics.`)
  else add('pass', 'Subject length', `${subjLen} characters — good.`)

  if (subject && subject.replace(/[^A-Z]/g, '').length >= 4 && subject === subject.toUpperCase()) {
    add('fail', 'Subject capitalization', 'Subject is ALL CAPS — a classic spam signal.')
  }
  if (/[!?]{2,}|\$\$|free|winner|urgent|congratulations/i.test(subject)) {
    add('warn', 'Subject wording', 'Subject contains spam-associated wording or punctuation.')
  }

  // Body length
  if (words.length < 15) add('warn', 'Body length', `Only ${words.length} words. Very short emails (or image-only emails) look promotional.`)
  else add('pass', 'Body length', `${words.length} words.`)

  // Caps
  if (capsRatio > 0.35 && letters.length > 40) add('fail', 'Excessive capitalization', `${Math.round(capsRatio * 100)}% of letters are uppercase.`)
  else if (capsRatio > 0.2 && letters.length > 40) add('warn', 'Capitalization', `${Math.round(capsRatio * 100)}% uppercase — slightly high.`)
  else add('pass', 'Capitalization', 'Normal casing.')

  // Keywords
  if (foundKeywords.length >= 5) add('fail', 'Spam trigger words', `${foundKeywords.length} found: ${foundKeywords.slice(0, 8).join(', ')}.`)
  else if (foundKeywords.length >= 1) add('warn', 'Spam trigger words', `${foundKeywords.length} found: ${foundKeywords.join(', ')}.`)
  else add('pass', 'Spam trigger words', 'None detected.')

  // Punctuation
  if (exclamations >= 4 || moneySymbols > 0) add('warn', 'Excessive punctuation', `${exclamations} exclamation marks${moneySymbols ? ' and repeated currency symbols' : ''}.`)
  else add('pass', 'Punctuation', 'Reasonable.')

  // Links
  if (shortenerLinks.length || ipLinks.length || mismatchedAnchors.length) {
    const bits = []
    if (shortenerLinks.length) bits.push(`${shortenerLinks.length} shortened link(s)`)
    if (ipLinks.length) bits.push(`${ipLinks.length} raw-IP link(s)`)
    if (mismatchedAnchors.length) bits.push(`${mismatchedAnchors.length} link(s) whose text hides a different domain`)
    add('fail', 'Suspicious links', bits.join(', ') + '.')
  } else if (allLinks.length > 8) {
    add('warn', 'Link count', `${allLinks.length} links — a high number can look promotional.`)
  } else {
    add('pass', 'Links', allLinks.length ? `${allLinks.length} link(s), all look clean.` : 'No links.')
  }

  // Image / text ratio
  if (images.length > 0 && words.length < 20) add('fail', 'Image-to-text ratio', `${images.length} image(s) with very little text — image-heavy emails are frequently filtered.`)
  else if (imageTextRatio > 1.5) add('warn', 'Image-to-text ratio', 'Image-heavy relative to text. Add more real text.')
  else add('pass', 'Image-to-text ratio', images.length ? `${images.length} image(s), balanced with text.` : 'Text-based email.')

  if (images.length && imagesNoAlt.length) add('warn', 'Image alt text', `${imagesNoAlt.length} of ${images.length} image(s) missing alt text.`)

  // Repeated words
  if (repeated.length) add('warn', 'Repeated words', repeated.map(([w, c]) => `“${w}” ×${c}`).join(', ') + '.')

  // HTML red flags
  if (hasScript) add('fail', 'HTML: script tag', '<script> in email HTML is stripped by clients and flags spam filters.')
  if (hasIframe) add('fail', 'HTML: iframe', '<iframe> is unsupported in email and a strong spam signal.')
  if (hasForm) add('warn', 'HTML: form', '<form> elements rarely work in email and look suspicious.')
  if (!hasUnsubscribe) add('warn', 'Unsubscribe option', 'No unsubscribe / opt-out link found — required for bulk outreach and expected by spam filters.')
  else add('pass', 'Unsubscribe option', 'Opt-out link present.')

  // ── Score ──
  const weight = { fail: 18, warn: 7, pass: 0 }
  let spamScore = checks.reduce((s, c) => s + (weight[c.severity] || 0), 0)
  spamScore = Math.min(100, spamScore)
  const spamRisk = spamScore <= 20 ? 'Low' : spamScore <= 45 ? 'Medium' : 'High'
  const inboxProbability = Math.max(5, Math.min(98, 100 - spamScore))

  return {
    spamScore,
    spamRisk,
    inboxProbability,
    checks,
    stats: {
      words: words.length,
      capsPct: Math.round(capsRatio * 100),
      links: allLinks.length,
      images: images.length,
      keywords: foundKeywords.length,
      exclamations,
    },
  }
}

// ── AI pass ───────────────────────────────────────────────
// Gemini now runs through the backend, so no key reaches this function.
// The other providers still take one at the call site — unchanged.
export async function analyzeWithAI({ subject = '', html = '', provider = 'gemini', key = '', model = '' }) {
  if (provider !== 'gemini' && !key) return { available: false }
  const text = stripHtml(html).slice(0, 6000)
  const instruction =
`You are an expert email deliverability and anti-spam analyst for cold/B2B outreach to international clients.
Analyze the email below and respond with ONLY a compact JSON object (no markdown, no commentary):
{"spamRisk":"Low|Medium|High","inboxProbability":<0-100 integer>,"issues":["short issue", ...],"improvedSubject":"...","improvedBody":"<clean professional HTML body>"}
Keep improvedBody as simple email-safe HTML (<p>, <ul>, <li>, <strong>, <a>). Keep the sender's intent; make it professional, concise, spam-resistant.

SUBJECT: ${subject}
BODY (text): ${text}`

  let raw = ''
  try {
    if (provider === 'gemini') {
      const d = await callGemini({ contents: [{ parts: [{ text: instruction }] }] }, AI_FEATURES.EMAIL_DELIVERABILITY)
      raw = d.candidates?.[0]?.content?.parts?.[0]?.text || ''
    } else if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', messages: [{ role: 'user', content: instruction }] }),
      })
      if (!r.ok) throw new Error((await r.json()).error?.message || 'OpenAI error')
      raw = (await r.json()).choices?.[0]?.message?.content || ''
    } else if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: 2000, messages: [{ role: 'user', content: instruction }] }),
      })
      if (!r.ok) throw new Error((await r.json()).error?.message || 'Anthropic error')
      raw = (await r.json()).content?.[0]?.text || ''
    } else {
      return { available: false }
    }

    let jsonStr = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
    const start = jsonStr.indexOf('{'); const end = jsonStr.lastIndexOf('}')
    if (start >= 0 && end > start) jsonStr = jsonStr.slice(start, end + 1)
    const parsed = JSON.parse(jsonStr)
    return {
      available: true,
      spamRisk: parsed.spamRisk || null,
      inboxProbability: typeof parsed.inboxProbability === 'number' ? parsed.inboxProbability : null,
      issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 10) : [],
      improvedSubject: parsed.improvedSubject || '',
      improvedBody: parsed.improvedBody || '',
    }
  } catch (err) {
    return { available: false, error: err.message }
  }
}

// ── Backend SPF/DKIM/DMARC + reputation guidance ─────────────────────────────
export async function fetchAuthCheck(email) {
  try {
    const { data } = await api.get('/email/deliverability/check', {
      params: email ? { email } : {},
    })
    return data
  } catch (err) {
    return { available: false, message: err?.response?.data?.message || 'Auth check unavailable.' }
  }
}

// ── Orchestrator: run everything and return one combined report ──────────────
export async function runDeliverabilityAnalysis({ subject, html, fromEmail, aiProvider, aiKey, aiModel }) {
  const content = analyzeContent({ subject, html })
  const [ai, auth] = await Promise.all([
    analyzeWithAI({ subject, html, provider: aiProvider, key: aiKey, model: aiModel }),
    fetchAuthCheck(fromEmail),
  ])

  // Blend authentication into the inbox probability (informational).
  let inboxProbability = content.inboxProbability
  if (auth?.available) {
    if (auth.spf?.found) inboxProbability += 4; else inboxProbability -= 12
    if (auth.dmarc?.found) inboxProbability += 3; else inboxProbability -= 6
    if (auth.isFreeDomain) inboxProbability -= 4
    inboxProbability = Math.max(5, Math.min(98, Math.round(inboxProbability)))
  }

  return { content, ai, auth, inboxProbability }
}
