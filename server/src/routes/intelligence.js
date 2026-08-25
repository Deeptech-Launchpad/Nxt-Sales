const router = require('express').Router()
const auth   = require('../middleware/authMiddleware')
const dns    = require('dns').promises
const net    = require('net')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Customer Intelligence server-side context gathering.
//
// Two things the browser cannot do itself, and which therefore live here:
//
//  1. PAGE_SOURCE — fetch a prospect's homepage / product detail page and
//     reduce it to plain text plus platform signals. A browser fetch of a
//     third-party site is blocked by CORS, so this has to be server-side.
//
//  2. GMAIL_THREAD_SUMMARIES — roll up the synced Gmail activity already
//     stored against the company into a compact per-thread summary.
//
// SECURITY — this endpoint takes a URL from the client and makes the SERVER
// request it, which is textbook SSRF territory: without controls, a user
// could point it at the VPS's own localhost services, the private network, or
// a cloud metadata endpoint (169.254.169.254) and read back the response.
// The defences below are deliberately strict and deny-by-default:
//   - http/https only (no file:, ftp:, gopher:, data:)
//   - the hostname is RESOLVED and every returned IP checked against private,
//     loopback, link-local, CGNAT and reserved ranges BEFORE connecting
//   - redirects are followed manually, re-validating the target each hop, so
//     a public URL cannot 302 into the private network
//   - hard caps on redirects, response size and total time
//   - only the extracted text is ever returned, never raw bytes to disk

const MAX_REDIRECTS   = 3
const MAX_BYTES       = 2 * 1024 * 1024   // 2 MB of HTML is far more than enough
const FETCH_TIMEOUT_MS = 12000
const MAX_TEXT_CHARS  = 18000             // what we hand to the model

// ── SSRF guards ────────────────────────────────────────────────────────────

function isBlockedIPv4(ip) {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  if (a === 0) return true                        // 0.0.0.0/8
  if (a === 10) return true                       // private
  if (a === 127) return true                      // loopback
  if (a === 169 && b === 254) return true         // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true// private
  if (a === 192 && b === 168) return true         // private
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a === 192 && b === 0) return true           // IETF protocol assignments
  if (a >= 224) return true                       // multicast + reserved + broadcast
  return false
}

function isBlockedIPv6(ip) {
  const s = ip.toLowerCase().split('%')[0]
  if (s === '::' || s === '::1') return true      // unspecified / loopback
  if (s.startsWith('fe80')) return true           // link-local
  if (s.startsWith('fc') || s.startsWith('fd')) return true // unique local
  if (s.startsWith('ff')) return true             // multicast
  // IPv4-mapped (::ffff:10.0.0.1) must be judged by its IPv4 half.
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isBlockedIPv4(mapped[1])
  return false
}

const isBlockedIP = (ip) => (net.isIPv4(ip) ? isBlockedIPv4(ip) : net.isIPv6(ip) ? isBlockedIPv6(ip) : true)

// Resolves the hostname and rejects if ANY resolved address is non-public.
// Checking every address (not just the first) closes the gap where a name
// resolves to one public and one private IP.
async function assertPublicHost(hostname) {
  if (net.isIP(hostname)) {
    if (isBlockedIP(hostname)) throw new Error('That address is not publicly reachable.')
    return
  }
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(hostname)) {
    throw new Error('That address is not publicly reachable.')
  }
  let addrs
  try {
    addrs = await dns.lookup(hostname, { all: true })
  } catch {
    throw new Error('That domain could not be resolved.')
  }
  if (!addrs.length) throw new Error('That domain could not be resolved.')
  for (const a of addrs) {
    if (isBlockedIP(a.address)) throw new Error('That address is not publicly reachable.')
  }
}

function normalizeUrl(raw) {
  const v = String(raw || '').trim()
  if (!v) return null
  // An explicit non-http(s) scheme must be REJECTED, never repaired. Blindly
  // prepending "https://" to "file:///etc/passwd" produces "https://file/..."
  // — a valid URL pointing at an entirely unintended host, which is exactly
  // the kind of silent rewrite this endpoint must not perform. Keying on
  // "://" (rather than any "word:") keeps a bare "example.com:8080" working,
  // since that colon introduces a port, not a scheme.
  const sep = v.indexOf('://')
  if (sep !== -1 && !/^https?$/i.test(v.slice(0, sep))) return null
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`
  let u
  try { u = new URL(withScheme) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  return u
}

// ── HTML → text ────────────────────────────────────────────────────────────

// Decodes one numeric entity, leaving the original text alone if the code
// point is invalid (String.fromCodePoint throws on out-of-range values, which
// would otherwise take down the whole extraction for one malformed entity).
function safeCodePoint(n, original) {
  if (!Number.isInteger(n) || n < 1 || n > 0x10ffff) return original
  try { return String.fromCodePoint(n) } catch { return original }
}

function htmlToText(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    // Numeric entities (&#8211; &#x2019; …) are everywhere in real product
    // copy; left raw they reach the model as literal noise, e.g.
    // "HBA &#8211; Vehicle Parts".
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => safeCodePoint(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => safeCodePoint(parseInt(d, 10), m))
    // &amp; is decoded LAST, so an already-escaped entity ("&amp;#8211;")
    // isn't promoted into a real one by an earlier pass.
    .replace(/&amp;/gi, '&')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
}

// Platform fingerprints, checked against the RAW html (markup/asset paths are
// the giveaway, and they're stripped out of the text version).
const PLATFORM_SIGNATURES = [
  [/cdn\.shopify\.com|shopify-(?:section|features)|Shopify\.theme/i, 'Shopify'],
  [/wp-content|wp-includes|woocommerce/i, 'WooCommerce / WordPress'],
  // The lookbehind on `mage/` is load-bearing: a bare /mage\//  also matches
  // "i-mage/" — i.e. every "image/jpeg" meta tag and every /uploads/image/
  // path — which falsely tagged plain WordPress sites as Magento.
  [/\/skin\/frontend\/|Magento_|(?<![a-z])mage\/|static\/version\d+\/frontend/i, 'Magento'],
  [/cdn\d*\.bigcommerce\.com|bigcommerce\.com\/s-/i, 'BigCommerce'],
  [/cdn\.shopifycloud\.com/i, 'Shopify'],
  [/squarespace\.com|static1\.squarespace/i, 'Squarespace'],
  [/wix(?:static|apps)\.com|_wixCssImports/i, 'Wix'],
  [/\/sites\/default\/files\/|drupal(?:-settings-json|\.js)/i, 'Drupal'],
  [/prestashop/i, 'PrestaShop'],
  [/\/_next\/static\//i, 'Next.js (custom build)'],
  [/salesforce|demandware|dwstatic/i, 'Salesforce Commerce Cloud'],
  [/shopware/i, 'Shopware'],
  [/opencart/i, 'OpenCart'],
]

function detectSignals(html) {
  const platforms = []
  for (const [re, name] of PLATFORM_SIGNATURES) {
    if (re.test(html) && !platforms.includes(name)) platforms.push(name)
  }
  const generator = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i)
  const title     = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const descr     = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
  return {
    platforms,
    generator: generator ? generator[1].trim() : null,
    title: title ? htmlToText(title[1]).slice(0, 200) : null,
    metaDescription: descr ? descr[1].trim().slice(0, 300) : null,
    // Rough product-content signals the prompt asks about.
    hasStructuredData: /application\/ld\+json/i.test(html),
    productSchema: /"@type"\s*:\s*"Product"/i.test(html),
    imageCount: (html.match(/<img\b/gi) || []).length,
    tableCount: (html.match(/<table\b/gi) || []).length,
    pdfLinks: (html.match(/href=["'][^"']+\.pdf/gi) || []).length,
  }
}

// ── Fetch with manual redirect handling ────────────────────────────────────

async function fetchPage(startUrl) {
  let url = startUrl
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url.hostname)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let res
    try {
      res = await fetch(url.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          // Identify honestly rather than impersonating a browser.
          'User-Agent': 'NxtMarketWiz-CRM/1.0 (+customer-intelligence; contact via CRM administrator)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en',
        },
      })
    } catch (err) {
      clearTimeout(timer)
      if (err.name === 'AbortError') throw new Error('The site took too long to respond.')
      throw new Error('Could not reach that site.')
    }
    clearTimeout(timer)

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error('The site returned an invalid redirect.')
      let next
      try { next = new URL(loc, url) } catch { throw new Error('The site returned an invalid redirect.') }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') {
        throw new Error('The site redirected to an unsupported address.')
      }
      url = next          // re-validated at the top of the next iteration
      continue
    }

    if (!res.ok) throw new Error(`The site returned HTTP ${res.status}.`)

    const ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (ctype && !/text\/html|application\/xhtml|text\/plain/.test(ctype)) {
      throw new Error('That URL is not an HTML page.')
    }

    // Stream so an enormous/endless response can't exhaust memory.
    const reader = res.body?.getReader()
    if (!reader) throw new Error('The site returned an empty response.')
    const chunks = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MAX_BYTES) { try { await reader.cancel() } catch {} break }
      chunks.push(value)
    }
    const html = Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8')
    return { html, finalUrl: url.toString(), truncated: total > MAX_BYTES }
  }
  throw new Error('The site redirected too many times.')
}

// ── GET /api/intelligence/page-source?url=... ──────────────────────────────
// Returns extracted TEXT + platform signals for one prospect page.
router.get('/page-source', auth, async (req, res) => {
  const url = normalizeUrl(req.query.url)
  if (!url) return res.status(400).json({ message: 'A valid http(s) URL is required.' })

  try {
    const { html, finalUrl, truncated } = await fetchPage(url)
    const text = htmlToText(html)
    res.json({
      ok: true,
      requestedUrl: url.toString(),
      finalUrl,
      truncated,
      signals: detectSignals(html),
      text: text.slice(0, MAX_TEXT_CHARS),
      textTruncated: text.length > MAX_TEXT_CHARS,
    })
  } catch (err) {
    // A prospect site being unreachable is normal, not a server fault — 200
    // with ok:false lets the caller carry on and generate without PAGE_SOURCE
    // (which the prompt explicitly allows) instead of failing the whole panel.
    res.json({ ok: false, requestedUrl: url.toString(), reason: err.message || 'Could not fetch that page.' })
  }
})

// ── GET /api/intelligence/email-summaries/:companyId ───────────────────────
// Compact per-thread rollup of the Gmail activity already synced against this
// company. Read-only: it summarises stored rows, it never calls Gmail.
router.get('/email-summaries/:companyId', auth, async (req, res) => {
  try {
    const rows = await prisma.activity.findMany({
      where: { companyId: req.params.companyId, type: 'email' },
      orderBy: { createdAt: 'desc' },
      take: 60,
      // NOTE: Activity has no `sentAt` column — an email's timestamp IS its
      // createdAt (see schema.prisma). Selecting a non-existent field makes
      // Prisma throw on every request, so this list must stay in step with
      // the model.
      select: {
        id: true, subject: true, title: true, direction: true, emailStatus: true,
        fromEmail: true, toEmail: true, body: true, threadId: true,
        matchedCompanyEmail: true, createdAt: true,
      },
    })

    if (!rows.length) return res.json({ ok: true, threadCount: 0, messageCount: 0, threads: [] })

    // Group by threadId so the model sees conversations, not loose messages.
    // Messages with no threadId (e.g. imported ones) each stand alone.
    const groups = new Map()
    for (const r of rows) {
      const key = r.threadId || `single:${r.id}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(r)
    }

    const strip = (s) => String(s || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    const threads = [...groups.values()].map(msgs => {
      const ordered = [...msgs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      const last = ordered[ordered.length - 1]
      return {
        subject: last.subject || last.title || '(no subject)',
        messageCount: ordered.length,
        firstAt: ordered[0].createdAt,
        lastAt: last.createdAt,
        lastDirection: last.direction || 'unknown',
        participants: [...new Set(ordered.flatMap(m => [m.fromEmail, m.toEmail]).filter(Boolean))].slice(0, 6),
        // Trimmed excerpts, newest-relevant first; the model does the actual
        // summarising — this route only reduces volume, it never interprets.
        excerpts: ordered.slice(-4).map(m => ({
          direction: m.direction || 'unknown',
          at: m.createdAt,
          text: strip(m.body).slice(0, 600),
        })),
      }
    }).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt)).slice(0, 8)

    res.json({
      ok: true,
      threadCount: groups.size,
      messageCount: rows.length,
      lastContactAt: threads[0]?.lastAt || null,
      threads,
    })
  } catch (err) {
    console.error('[Intelligence] email summaries failed:', err.message)
    res.status(500).json({ message: 'Could not load email history.' })
  }
})

module.exports = router
