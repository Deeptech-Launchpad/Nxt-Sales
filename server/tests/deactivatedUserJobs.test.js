// Deactivated users must not be processed by the background jobs, and
// reactivating them must resume processing. Run from server/:
//   node tests/deactivatedUserJobs.test.js
// Needs the local database. It creates and removes its own rows (email domain
// example.test); Gmail is stubbed, so nothing calls Google and no existing
// account is modified.
require('dotenv').config()
const assert = require('assert')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const syncedUserIds = []
const emailModulePath = require.resolve('../src/routes/email')
require.cache[emailModulePath] = {
  id: emailModulePath, filename: emailModulePath, loaded: true,
  exports: {
    runEmailSync: async ({ userId }) => { syncedUserIds.push(userId); return null },
    ownAddressSet: async () => new Set(),
  },
}
const { autoSyncGmail } = require('../src/jobs/gmailAutoSync')
const { processDueFollowUps } = require('../src/jobs/followUpSequences')

// The stub returns no result, which the job logs as a per-mailbox failure —
// that is expected here, so keep it out of the test output.
const realConsoleError = console.error
console.error = (...args) => { if (!String(args[0]).startsWith('[Gmail Auto-sync]')) realConsoleError(...args) }

const stamp = Date.now()
let passed = 0
const ok = (label) => { passed++; console.log('PASS', label) }

async function main() {
  const active = await prisma.user.create({ data: { name: 'ZZ Job Active', email: `zz-job-active-${stamp}@example.test`, status: 'active' } })
  const deact = await prisma.user.create({ data: { name: 'ZZ Job Deact', email: `zz-job-deact-${stamp}@example.test`, status: 'deactivated' } })
  try {
    for (const u of [active, deact]) {
      await prisma.emailAccount.create({ data: { userId: u.id, provider: 'gmail', email: u.email, accessToken: 'x', historicalSyncAt: new Date() } })
    }

    // ── Gmail sync ──
    await autoSyncGmail()
    assert(syncedUserIds.includes(active.id)); ok('gmail sync: active user is synced')
    assert(!syncedUserIds.includes(deact.id)); ok('gmail sync: deactivated user is skipped')
    assert.strictEqual(await prisma.emailAccount.count({ where: { userId: deact.id } }), 1); ok('gmail sync: deactivated account row left untouched')

    await prisma.user.update({ where: { id: deact.id }, data: { status: 'active' } })
    syncedUserIds.length = 0
    await autoSyncGmail()
    assert(syncedUserIds.includes(deact.id)); ok('gmail sync: reactivated user resumes')
    await prisma.user.update({ where: { id: deact.id }, data: { status: 'deactivated' } })

    // ── Follow-up sequences ──
    const company = await prisma.company.create({ data: { name: `ZZ Job Co ${stamp}` } })
    const due = new Date(Date.now() - 60000)
    const eActive = await prisma.followUpEnrollment.create({ data: { companyId: company.id, userId: active.id, nextRunAt: due } })
    const eDeact = await prisma.followUpEnrollment.create({ data: { companyId: company.id, userId: deact.id, nextRunAt: due } })

    await processDueFollowUps()
    const a1 = await prisma.followUpEnrollment.findUnique({ where: { id: eActive.id } })
    const d1 = await prisma.followUpEnrollment.findUnique({ where: { id: eDeact.id } })
    assert.strictEqual(a1.currentStep, 1); ok('follow-up: active user\'s enrollment advances')
    assert.strictEqual(await prisma.activity.count({ where: { companyId: company.id, userId: active.id, type: 'task' } }), 1); ok('follow-up: active user gets their task')
    assert.strictEqual(d1.currentStep, 0); assert.strictEqual(d1.lastRunAt, null); assert.strictEqual(d1.status, 'active'); ok('follow-up: deactivated user\'s enrollment untouched (still active, not cancelled)')
    assert.strictEqual(await prisma.activity.count({ where: { companyId: company.id, userId: deact.id } }), 0); ok('follow-up: no task created for deactivated user')

    await prisma.user.update({ where: { id: deact.id }, data: { status: 'active' } })
    await processDueFollowUps()
    const d2 = await prisma.followUpEnrollment.findUnique({ where: { id: eDeact.id } })
    assert.strictEqual(d2.currentStep, 1); ok('follow-up: reactivated user\'s enrollment resumes')
  } finally {
    const cos = await prisma.company.findMany({ where: { name: { startsWith: 'ZZ Job Co' } }, select: { id: true } })
    await prisma.activity.deleteMany({ where: { companyId: { in: cos.map(c => c.id) } } })
    await prisma.company.deleteMany({ where: { id: { in: cos.map(c => c.id) } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: 'zz-job-' } } })
    await prisma.$disconnect()
  }
  console.log(`\n${passed} checks passed`)
}
main().catch(e => { console.error('FAIL', e.message); process.exit(1) })
