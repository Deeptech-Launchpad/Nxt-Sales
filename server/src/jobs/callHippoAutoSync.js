const { PrismaClient } = require('@prisma/client')
const { runCallHippoSync } = require('../routes/callhippo')
const prisma = new PrismaClient()

const SYNC_INTERVAL_MS = 10 * 60 * 1000 // every 10 minutes

// Background counterpart to the manual "Sync Now" button — so new CallHippo
// calls reach the Calls Dashboard and Company Activities without anyone
// needing to click Sync. Reuses the exact same sync logic (pagination,
// dedup-by-callhippoId, Activity mirroring) as the manual route.
//
// runCallHippoSync needs a userId to attribute the mirrored Activity rows
// to (Activity.userId is required) — there's no "acting user" for a
// background job, so this picks the earliest-created active admin (falling
// back to the earliest-created active user of any role) once per run. If no
// active user exists at all, the run is skipped rather than guessing.
async function resolveSystemUserId() {
  const admin = await prisma.user.findFirst({
    where: { status: 'active', role: 'admin' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (admin) return admin.id
  const anyActive = await prisma.user.findFirst({
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  return anyActive?.id || null
}

async function autoSyncCallHippo() {
  if (!process.env.CALLHIPPO_API_KEY) return // not configured — silently skip, matches manual route's own guard
  try {
    const userId = await resolveSystemUserId()
    if (!userId) {
      console.error('[CallHippo] Auto-sync skipped: no active user found to attribute synced calls to.')
      return
    }
    const result = await runCallHippoSync(userId)
    console.log(`[CallHippo] Auto-sync: ${result.synced} upserted, ${result.skipped} skipped, ${result.backfilled} backfilled`)
  } catch (err) {
    console.error('[CallHippo] Auto-sync failed:', err.message)
  }
}

// Runs once on server start, then on a recurring interval for as long as the
// process stays up — same pattern as purgeRecycleBin.js / autoCompleteOverdueTasks.js.
function startCallHippoAutoSync() {
  autoSyncCallHippo()
  setInterval(autoSyncCallHippo, SYNC_INTERVAL_MS)
}

module.exports = { startCallHippoAutoSync, autoSyncCallHippo }
