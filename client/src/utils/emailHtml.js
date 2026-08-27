import DOMPurify from 'dompurify'

// Renders a real email body inside the CRM.
//
// The requirement is to show the email as the recipient saw it — bold, colours,
// highlights, headings, lists, links, tables — while never handing an attacker
// a script. Stripping formatting would be the easy way out and is exactly what
// this replaces; blindly injecting the HTML would be the unsafe way out. So the
// markup goes through DOMPurify with an allowlist sized to what email actually
// uses, and nothing else survives.
//
// DOMPurify (not a hand-rolled regex/DOM walk) because email HTML is adversarial
// input: mutation XSS, namespace confusion and mis-nesting tricks all defeat the
// obvious implementations, and this one is audited against them.

// Every tag a formatted email legitimately needs.
const ALLOWED_TAGS = [
  // structure and text flow
  'div', 'p', 'span', 'br', 'hr', 'section', 'article', 'center', 'blockquote', 'pre', 'code',
  // emphasis / marks
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'mark', 'sub', 'sup', 'small', 'big', 'font',
  // headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // lists
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // links and images
  'a', 'img',
  // tables — plenty of real email templates are table-based layouts
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
]

// Presentation attributes only. Nothing that can execute, submit, or navigate
// the parent frame.
const ALLOWED_ATTR = [
  'style', 'class', 'dir', 'lang', 'title', 'alt',
  'href', 'src', 'target', 'rel',
  'width', 'height', 'align', 'valign',
  'colspan', 'rowspan', 'border', 'cellpadding', 'cellspacing',
  'bgcolor', 'color', 'face', 'size', 'start', 'type', 'span',
]

// URL policy is left to DOMPurify's own default, deliberately.
//
// A stricter custom ALLOWED_URI_REGEXP looks safer but is a trap: DOMPurify
// applies that pattern to the value of EVERY attribute it does not already
// know to be URI-safe. A scheme-anchored pattern therefore rejects ordinary
// presentation values too — colspan="2", start="3", bgcolor="#eee" and
// size="4" all fail a "must look like a URL" test — silently stripping
// exactly the table and list formatting this exists to preserve. Confirmed
// against the real library before settling on the default.
//
// That default already blocks javascript:, vbscript: and data: payloads. The
// single addition is inline base64 images on <img>, which real email uses for
// logos and signature images, and which cannot execute anything.

let hooksInstalled = false
function installHooks() {
  if (hooksInstalled || typeof window === 'undefined') return
  hooksInstalled = true

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Links leave the app, so they must not be able to reach back into it, and
    // they must not lend the CRM's reputation to whatever they point at.
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    }

    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || ''
      // Our OWN open-tracking pixel must never render here: the CRM viewer
      // fetching it would record an "open" every time a colleague read the
      // email internally, inflating the very number it exists to measure.
      // (The stored body is already written without it — this is the second
      // line of defence, and it also covers anything synced back from Gmail.)
      if (/\/api\/email\/track\/open\//i.test(src)) {
        node.remove()
        return
      }
      // A broken remote image should not blow the layout open.
      node.setAttribute('loading', 'lazy')
      node.style.maxWidth = '100%'
    }
  })
}

// Returns sanitized HTML, or '' when there is nothing safe to show.
export function sanitizeEmailBody(html) {
  if (!html || typeof html !== 'string') return ''
  installHooks()
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Belt and braces: these are already excluded by the allowlist, but naming
    // them makes the intent explicit and survives an edit to the list above.
    FORBID_TAGS: ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed',
                  'form', 'input', 'select', 'textarea', 'button', 'link', 'meta', 'base', 'svg', 'math'],
    FORBID_ATTR: ['srcset', 'formaction', 'ping', 'srcdoc', 'onerror', 'onload'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ADD_DATA_URI_TAGS: ['img'],
    // Keep it as a fragment; <html>/<head>/<body> would be stripped anyway.
    WHOLE_DOCUMENT: false,
    RETURN_TRUSTED_TYPE: false,
  })
  return clean.trim()
}

// True when there is real markup worth rendering as HTML, rather than a body
// the sender wrote as plain text that merely got wrapped in a <div> on the way
// out. Keeps the plain-text path (which handles line breaks correctly) for
// emails that never had formatting to lose.
export function hasRenderableHtml(html) {
  if (!html || typeof html !== 'string') return false
  return /<(p|br|div|span|b|strong|i|em|u|h[1-6]|ul|ol|li|a|img|table|blockquote|mark|font)\b/i.test(html)
}
