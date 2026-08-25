// One-off corrective full resync: re-fetches CallHippo's full 6-month
// lookback window (not just the incremental "since last sync" window) and
// upserts every call through the CURRENT normalization logic. This is how
// existing rows get their callDate corrected after a parsing/timezone fix,
// and how any calls the incremental sync never picked up get backfilled.
//
// Same upsert-by-callhippoId + cross-id duplicate dedup as every other sync
// (server/src/routes/callhippo.js) — existing rows are updated in place,
// never deleted; genuinely new calls are created; CallHippo-side duplicate
// call records are detected and skipped, never duplicated. No writes to
// CallHippo — read-only against their API.
//
// Usage:  node scripts/callhippoFullResync.js
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { runCallHippoSync } = require('../src/routes/callhippo')
const prisma = new PrismaClient()

async function resolveSystemUserId() {
  const admin = await prisma.user.findFirst({ where: { status: 'active', role: 'admin' }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, email: true } })
  if (admin) return admin
  return prisma.user.findFirst({ where: { status: 'active' }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, email: true } })
}

async function main() {
  const user = await resolveSystemUserId()
  if (!user) { console.error('No active user found to attribute synced calls to — aborting.'); process.exit(1) }
  console.log(`Full resync starting (6-month lookback), attributed to ${user.name || user.email} (${user.id})...`)
  const startedAt = Date.now()
  const result = await runCallHippoSync(user.id, { fullResync: true })
  const secs = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`\nDone in ${secs}s.`)
  console.log('RESULT:', result)
}

main()
  .catch(e => { console.error('FULL RESYNC ERROR', e.response?.data || e.message); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
