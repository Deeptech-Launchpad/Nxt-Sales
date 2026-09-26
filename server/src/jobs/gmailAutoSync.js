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
//
// "First time a mailbox is seen" is tracked on EmailAccount.historicalSyncAt
// (persisted), not in an in-memory Set. It used to be an in-memory Set here,
// which meant every process restart — a routine deploy — forgot every
// mailbox had already been done and re-ran a full "in:anywhere" resync of
// all of them. That stacked with the normal recurring pass and was the
// direct cause of a Gmail API quota exhaustion incident (2026-09-24). A
// restart now never re-triggers it; only a mailbox whose historicalSyncAt is
// still null does.
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
    // A deactivated user's mailbox is not synced: deactivation cuts off their
    // access, and this job reads with their stored Gmail token. The account
    // row and everything already imported stay untouched, so reactivating the
    // user resumes syncing on the next pass.
    const accounts = await prisma.emailAccount.findMany({
      where: { provider: 'gmail', user: { status: { not: 'deactivated' } } },
      select: { id: true, userId: true, email: true, historicalSyncAt: true },
    })
    if (!accounts.length) return

    // Company addresses may have changed since the last pass; rebuild the
    // index once for the whole run rather than trusting a stale cache.
    matcher.invalidateIndex()

    for (const account of accounts) {
      if (!account.historicalSyncAt) {
        // Genuinely never done for this mailbox (not just "not yet done in
        // this process"): pull the full history once so existing
        // conversations appear without anyone clicking. Only recorded as
        // done on success, so a mailbox that fails (expired token, quota)
        // keeps retrying on future passes instead of being silently skipped
        // forever.
        const result = await syncOneMailbox(account, { historical: true })
        if (result) {
          await prisma.emailAccount.update({
            where: { id: account.id },
            data: { historicalSyncAt: new Date() },
          }).catch(err => console.error(`[Gmail Auto-sync] failed to record historical-sync completion for ${account.email}:`, err.message))
        }
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
