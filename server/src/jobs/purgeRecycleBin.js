const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const RETENTION_DAYS = 30
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000 // every 6 hours — plenty for a 30-day window

// Permanently removes companies that have sat in the Recycle Bin past the
// retention period. Reuses the existing hard-delete behavior (Activity rows
// cascade, Deal/CallLog rows are unlinked via SET NULL) — no new deletion
// rules, just the same delete applied once the window has passed.
async function purgeExpiredCompanies() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  try {
    const { count } = await prisma.company.deleteMany({ where: { deletedAt: { lt: cutoff } } })
    if (count > 0) console.log(`[Recycle Bin] Purged ${count} company/companies past the ${RETENTION_DAYS}-day retention window.`)
  } catch (err) {
    console.error('[Recycle Bin] Purge sweep failed:', err.message)
  }
}

// Runs once on server start, then on a recurring interval for as long as the
// process stays up (PM2 keeps it running continuously in production).
function startRecycleBinPurgeSweep() {
  purgeExpiredCompanies()
  setInterval(purgeExpiredCompanies, SWEEP_INTERVAL_MS)
}

module.exports = { startRecycleBinPurgeSweep, purgeExpiredCompanies, RETENTION_DAYS }
