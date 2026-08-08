const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const RETENTION_DAYS = 30
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours — plenty for a 30-day window

// Permanently removes companies that have sat in the Recycle Bin past the
// retention period. Reuses the existing hard-delete behavior (Activity rows
// cascade, Deal/CallLog rows are unlinked via SET NULL) — no new deletion
// rules, just the same delete applied once the window has passed.
//
// Custom Field values (Dynamic Custom Fields) are cleaned up here too:
// CustomFieldValue.recordId is intentionally polymorphic (a Company.id OR a
// Deal.id) with no database foreign key to either table — Prisma can't FK
// one column to two different parent tables — so nothing cascades this
// automatically the way onDelete: Cascade does for fieldId. This is one of
// exactly two places a Company/Deal is ever permanently removed (the other
// is deals.js's DELETE /:id) — both clean up in the SAME transaction as the
// parent delete, so the two either both succeed or both roll back together.
async function purgeExpiredCompanies() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  try {
    const expired = await prisma.company.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } })
    if (expired.length === 0) return
    const ids = expired.map(c => c.id)

    const [, { count }] = await prisma.$transaction([
      prisma.customFieldValue.deleteMany({ where: { recordId: { in: ids } } }),
      prisma.company.deleteMany({ where: { id: { in: ids } } }),
    ])
    if (count > 0) console.log(`[Recycle Bin] Purged ${count} company/companies past the ${RETENTION_DAYS}-day retention window.`)
  } catch (err) {
    console.error('[Recycle Bin] Purge sweep failed:', err.message)
  }
}

// Defense-in-depth safety net, run on the same sweep: deletes any
// CustomFieldValue row whose recordId no longer exists in Company, Deal, OR
// Activity (task/meeting custom fields — see activities.js) — catches
// anything the explicit cleanup above (or deals.js's/activities.js's
// DELETE /:id) missed, e.g. a future deletion path that forgets this step.
// Cheap given CustomFieldValue's recordId index; only ever matches rows
// that are already orphaned by definition, so it's safe to run
// unconditionally every 6 hours.
async function sweepOrphanedCustomFieldValues() {
  try {
    // $executeRaw resolves to the number of affected rows directly (not an object).
    const count = await prisma.$executeRaw`
      DELETE FROM "CustomFieldValue"
      WHERE "recordId" NOT IN (SELECT id FROM "Company")
        AND "recordId" NOT IN (SELECT id FROM "Deal")
        AND "recordId" NOT IN (SELECT id FROM "Activity")
    `
    if (count > 0) console.log(`[Custom Fields] Swept ${count} orphaned CustomFieldValue row(s).`)
  } catch (err) {
    console.error('[Custom Fields] Orphan sweep failed:', err.message)
  }
}

async function runSweep() {
  await purgeExpiredCompanies()
  await sweepOrphanedCustomFieldValues()
}

// Runs once on server start, then on a recurring interval for as long as the
// process stays up (PM2 keeps it running continuously in production).
function startRecycleBinPurgeSweep() {
  runSweep()
  setInterval(runSweep, SWEEP_INTERVAL_MS)
}

module.exports = { startRecycleBinPurgeSweep, purgeExpiredCompanies, sweepOrphanedCustomFieldValues, RETENTION_DAYS }
