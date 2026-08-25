const { PrismaClient } = require('@prisma/client')
const { runEmailSync, ownAddressSet } = require('../routes/email')
const matcher = require('../utils/companyEmailMatcher')
const prisma = new PrismaClient()

// Background Gmail synchronisation.
//
// This is the piece the email pipeline was missing entirely. Before it, mail
// only ever entered the CRM when a user opened one specific company's Emails
// tab — so a company nobody visited had no history, and new mail for any
// company appeared only on the next visit. CallHippo had a background sweep;
// Gmail did not.
//
// Every connected mailbox is swept, and each message is resolved through the
// one canonical matcher (companyEmailMatcher.js) — the same code path the
// manual per-company sync and the send path use. Nothing here decides company
// ownership on its own.
//
// Mailbox-agnostic by design (Decision A): the CRM is company-centric, so an
// email found in ANY user's mailbox is associated with the company it belongs
// to. Which mailbox it came from is preserved on Activity.mailboxEmail.

// Every 10 minutes, matching the CallHippo sweep's cadence. Gmail's per-user
// quota is 250 units/second and a windowed list+get run costs far less than
// that, so this is comfortably inside limits even with several mailboxes.
const SYNC_INTERVAL_MS = 10 * 60 * 1000

// How far back each pass looks. Deliberately wider than the interval so a
// missed run, a restart, or a message that arrives with a backdated header is
// still picked up rather than being skipped forever. Re-seeing a message is
// free: it is matched by messageId/rfcMessageId and skipped.
const WINDOW_DAYS = 2

// A full historical sweep is expensive and only needs to happen once per
// mailbox, so it is NOT part of the recurring pass — it runs the first time a
// mailbox is seen, then never again unless triggered manually via
// POST /api/email/sync-mailbox { days: 'all' }.
const historicalDone = new Set()

async function syncOneMailbox(account, { historical = false } = {}) {
  const label = account.email
  try {
    const own = await ownAddressSet(account.userId)
    const result = await runEmailSync({
      userId: account.userId,
      own,
      mode: 'mailbox',
      gmailQuery: historical ? 'in:anywhere' : `newer_than:${WINDOW_DAYS}d`,
    })
    const changed = (result.synced || 0) + (result.adopted || 0)
    if (changed > 0 || historical) {
      console.log(
        `[Gmail Auto-sync] ${label}${historical ? ' (historical)' : ''}: ` +
        `${result.synced} new, ${result.adopted} updated, ${result.duplicates} duplicate(s) skipped, ` +
        `${result.unassignedThreads} thread(s) unassigned`
      )
    }
    return result
  } catch (err) {
    // One mailbox failing (expired token, revoked access, rate limit) must
    // never stop the others from syncing.
    console.error(`[Gmail Auto-sync] ${label} failed:`, err.message)
    return null
  }
}

async function autoSyncGmail() {
  try {
    const accounts = await prisma.emailAccount.findMany({
      where: { provider: 'gmail' },
      select: { userId: true, email: true },
    })
    if (!accounts.length) return

    // Company addresses may have changed since the last pass; rebuild the
    // index once for the whole run rather than trusting a stale cache.
    matcher.invalidateIndex()

    for (const account of accounts) {
      const key = `${account.userId}:${account.email}`
      if (!historicalDone.has(key)) {
        // First sight of this mailbox in this process: pull the full history
        // once so existing conversations appear without anyone clicking.
        historicalDone.add(key)
        await syncOneMailbox(account, { historical: true })
        continue
      }
      await syncOneMailbox(account)
    }
  } catch (err) {
    console.error('[Gmail Auto-sync] pass failed:', err.message)
  }
}

// Runs once on server start, then on a recurring interval for as long as the
// process stays up — same pattern as callHippoAutoSync.js / purgeRecycleBin.js.
//
// The first pass is delayed briefly so it never competes with server startup
// (a full historical sweep on boot would otherwise slow the first requests).
function startGmailAutoSync() {
  setTimeout(autoSyncGmail, 30_000)
  setInterval(autoSyncGmail, SYNC_INTERVAL_MS)
}

module.exports = { startGmailAutoSync, autoSyncGmail, syncOneMailbox }
