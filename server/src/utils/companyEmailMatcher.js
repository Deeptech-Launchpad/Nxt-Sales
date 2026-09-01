const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// ── THE canonical company ↔ email matcher ──────────────────────────────────
//
// This module is the SINGLE place where "which company does this email belong
// to?" is decided. It replaces the two rules that used to disagree:
//
//   • anchorForAddresses()  (email.js) — exact address, From/To only, required
//                                        the mailbox and company on opposite
//                                        ends. Decided companyId on import.
//   • getCrmAddresses()     (email.js) — email OR DOMAIN, either end. Decided
//                                        what the global Inbox listed.
//
// Because those two rules were different, an email could satisfy one and not
// the other — which is exactly how a message appeared in the Inbox but never
// under its company. Every caller now goes through matchEmail() below, so the
// write path, the Inbox and Company → Activities → Emails can no longer
// disagree by construction.
//
// MATCHING RULES (in priority order):
//
//   1. EXPLICIT ADDRESS — a company's saved address (Company.email or any of
//      Company.emails[]) appearing in From, To or Cc. All three fields are
//      equal-weight matching fields. This is the source of truth.
//
//   2. DOMAIN — secondary only, used when no explicit address matched, and
//      only when the domain maps to exactly ONE company. Free/consumer mail
//      domains are never used for domain matching: `@gmail.com` identifies a
//      person, not an organisation, and matching on it would sweep unrelated
//      mail into whichever company happened to store a Gmail address.
//
// Bcc is stored on the record but is NOT a matching field: the Bcc header is
// only present in the sender's own copy, so matching on it would associate a
// thread for the sender and not for anyone else — the precise kind of
// asymmetry this rewrite exists to remove.
//
// Addresses belonging to a connected CRM mailbox are never usable as company
// addresses: every message in that mailbox has the user as a participant, so
// treating one as a company address matches the entire mailbox.

const EMAIL_ADDR_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

// Consumer mailbox providers. A company record may legitimately store a Gmail
// address (spec §13 explicitly allows purchase@gmail.com as a company address)
// — that still works, because rule 1 matches the ADDRESS. What must never
// happen is rule 2 treating "gmail.com" as a company DOMAIN.
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com', 'proton.me',
  'gmx.com', 'gmx.net', 'mail.com', 'zoho.com', 'yandex.com', 'rediffmail.com',
  'ymail.com', 'inbox.com', 'fastmail.com', 'tutanota.com',
])

function extractAddresses(headerValue) {
  if (!headerValue) return []
  return (String(headerValue).match(EMAIL_ADDR_RE) || []).map(a => a.toLowerCase())
}

function domainOf(address) {
  const at = String(address || '').lastIndexOf('@')
  return at === -1 ? '' : address.slice(at + 1).toLowerCase()
}

// Normalises a stored Company.domain ("https://www.acme.ie/about") to "acme.ie".
function normalizeDomain(v) {
  if (typeof v !== 'string' || !v.trim()) return ''
  return v.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split(':')[0]
}

// ── Index ──────────────────────────────────────────────────────────────────
// Built once and cached briefly. Companies can run to thousands of rows, so
// this must never become a per-message query.
let cache = { index: null, expiresAt: 0 }
const INDEX_TTL_MS = 60_000

async function buildIndex() {
  const [companies, accounts] = await Promise.all([
    prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, email: true, emails: true, domain: true },
    }),
    prisma.emailAccount.findMany({ select: { email: true } }),
  ])

  // Every connected mailbox across ALL users. Company association is
  // deliberately mailbox-agnostic (Decision A: the CRM is company-centric), so
  // an address that is any user's mailbox is excluded for every user — not
  // just for the user who happens to be syncing.
  const ownAddresses = new Set(
    accounts.map(a => (a.email || '').trim().toLowerCase()).filter(Boolean)
  )

  // The domains of the connected mailboxes themselves — i.e. OUR OWN
  // organisation's domain(s). These must never be company-matching domains.
  //
  // Found the hard way: a junk company record had the user's own mailbox
  // (saranya@altiusnxt.com) saved as its address. The address itself was
  // correctly excluded below, but the DOMAIN derived from it was not, so
  // "altiusnxt.com" became a matchable company domain and every internal
  // colleague-to-colleague email resolved to that unrelated company. Excluding
  // own domains outright is the only safe rule: internal mail is never
  // company correspondence.
  const ownDomains = new Set()
  for (const a of ownAddresses) {
    const d = domainOf(a)
    if (d) ownDomains.add(d)
  }

  const byAddress = new Map()          // address -> companyId
  const domainOwners = new Map()       // domain  -> Set<companyId>

  const addAddress = (addr, companyId) => {
    if (typeof addr !== 'string') return
    const a = addr.trim().toLowerCase()
    if (!a || ownAddresses.has(a)) return
    // First writer wins, so the result is deterministic when two companies
    // mistakenly share an address rather than flip-flopping between runs.
    if (!byAddress.has(a)) byAddress.set(a, companyId)
  }

  for (const c of companies) {
    addAddress(c.email, c.id)
    if (Array.isArray(c.emails)) c.emails.forEach(e => addAddress(e, c.id))

    // Domain candidates: the stored domain field AND the domains of the
    // company's own saved addresses (a company whose emails are @accura.ie
    // should be reachable by that domain even if Company.domain says
    // something else — a real case in this data set).
    const domains = new Set()
    const d = normalizeDomain(c.domain)
    if (d) domains.add(d)
    const addrs = [c.email, ...(Array.isArray(c.emails) ? c.emails : [])]
    for (const a of addrs) {
      if (typeof a !== 'string') continue
      const lower = a.trim().toLowerCase()
      // An address that is one of our own mailboxes contributes NOTHING —
      // not as an address (excluded above) and not as a domain either.
      if (ownAddresses.has(lower)) continue
      const ad = domainOf(lower)
      if (ad) domains.add(ad)
    }
    for (const dom of domains) {
      if (FREE_EMAIL_DOMAINS.has(dom)) continue
      if (ownDomains.has(dom)) continue
      if (!domainOwners.has(dom)) domainOwners.set(dom, new Set())
      domainOwners.get(dom).add(c.id)
    }
  }

  // A domain shared by more than one company identifies nothing — drop it
  // rather than guessing and filing mail under an unrelated company.
  const byDomain = new Map()
  for (const [dom, owners] of domainOwners) {
    if (owners.size === 1) byDomain.set(dom, [...owners][0])
  }

  return { byAddress, byDomain, ownAddresses, ownDomains, companyCount: companies.length }
}

async function getIndex({ force = false } = {}) {
  if (!force && cache.index && Date.now() < cache.expiresAt) return cache.index
  const index = await buildIndex()
  cache = { index, expiresAt: Date.now() + INDEX_TTL_MS }
  return index
}

// Company addresses change (a company is edited, an address added) — callers
// that just wrote such a change invalidate so the very next match is correct.
function invalidateIndex() {
  cache = { index: null, expiresAt: 0 }
}

// ── The match ──────────────────────────────────────────────────────────────
// headers: { from, to, cc } — raw header strings, any format.
// Returns { companyId, matchedEmail, basis } or null when nothing matches.
//
// basis is 'address' (rule 1) or 'domain' (rule 2) and is stored on the row so
// a domain-derived association is always distinguishable from an explicit one.
function matchHeaders({ from, to, cc } = {}, index) {
  // From, To and Cc are all full matching fields (Decision B). They are
  // scanned in this order purely so that a message touching two different
  // companies resolves deterministically — not because Cc counts for less.
  const groups = [extractAddresses(from), extractAddresses(to), extractAddresses(cc)]

  // Rule 1 — explicit address, across ALL fields first.
  for (const addrs of groups) {
    for (const a of addrs) {
      const companyId = index.byAddress.get(a)
      if (companyId) return { companyId, matchedEmail: a, basis: 'address' }
    }
  }

  // Rule 2 (DOMAIN) has been REMOVED. A company is identified by an address
  // somebody actually saved on it, and by nothing else.
  //
  // The old rule mapped a message when no saved address matched but the
  // sender/recipient DOMAIN resolved to exactly one company. It was right more
  // often than not — but only by luck, because a domain is not an identity: it
  // is shared by every employee of a client, by their shared inboxes, by their
  // bounce daemons, and sometimes by an unrelated business on the same domain.
  // Nobody ever asserted those links, they were invisible in the UI, and the
  // rule would silently claim any FUTURE address at a known domain too.
  //
  // The ~1,000 rows that were relying on this have had their addresses saved
  // explicitly against their companies first (see scripts/backfill-company-
  // emails.js), so removing it costs no correct mapping. What it does stop is
  // postmaster@, junkemail@ and the next unrecognised address from being filed
  // against a company on a domain guess.
  //
  // Consequence, and it is intended: a message whose addresses are not saved
  // anywhere resolves to NO company. It is still stored in full — the sync
  // writes it with companyId null rather than dropping it — and associates
  // itself the moment somebody adds that address to a company.
  return null
}

async function matchEmail(headers) {
  return matchHeaders(headers, await getIndex())
}

// DEPRECATED — no longer used by the sync, kept only so any other caller keeps
// working. Resolving a whole Gmail thread from ONE message is what allowed a
// single matching message to drag every other message in the conversation into
// that company, including messages addressed to entirely different people at
// unrelated organisations. Each message now resolves on its own headers; see
// the per-message match in routes/email.js.
function matchThread(messagesHeaders, index) {
  for (const h of messagesHeaders) {
    const m = matchHeaders(h, index)
    if (m) return m
  }
  return null
}

module.exports = {
  EMAIL_ADDR_RE,
  FREE_EMAIL_DOMAINS,
  extractAddresses,
  domainOf,
  normalizeDomain,
  getIndex,
  invalidateIndex,
  matchHeaders,
  matchEmail,
  matchThread,
}
