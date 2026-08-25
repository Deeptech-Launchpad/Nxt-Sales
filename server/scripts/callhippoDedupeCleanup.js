// One-time cleanup for CallLog rows created BEFORE the dedup fix in
// server/src/routes/callhippo.js (runCallHippoSync) — CallHippo occasionally
// logs the same physical call twice under two different `_id`s, and each got
// imported as a separate CallLog + mirrored Activity row.
//
// DRY RUN by default — only prints what it would do. Add --apply to actually
// delete. Never touches CallHippo, only this app's own DB.
//
// Usage:
//   node scripts/callhippoDedupeCleanup.js            (preview only)
//   node scripts/callhippoDedupeCleanup.js --apply     (actually delete)
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const DEDUP_WINDOW_SEC = 10

async function main() {
  const rows = await prisma.callLog.findMany({
    orderBy: [{ fromNumber: 'asc' }, { toNumber: 'asc' }, { direction: 'asc' }, { callDate: 'asc' }],
    select: { id: true, callhippoId: true, callDate: true, fromNumber: true, toNumber: true, direction: true, recordingUrl: true, analysisStatus: true },
  })

  // Chain-group: walk rows already sorted by (from,to,direction,callDate) and
  // group consecutive rows that share the same phone pair/direction and are
  // within DEDUP_WINDOW_SEC of the row before them (chained, so a run of
  // several close-together rows all land in the same group, not just pairs).
  const groups = []
  let current = null
  for (const r of rows) {
    const sameKey = current
      && current.fromNumber === r.fromNumber
      && current.toNumber === r.toNumber
      && current.direction === r.direction
    const within = current && (r.callDate.getTime() - current.rows[current.rows.length - 1].callDate.getTime()) <= DEDUP_WINDOW_SEC * 1000
    if (sameKey && within) {
      current.rows.push(r)
    } else {
      current = { fromNumber: r.fromNumber, toNumber: r.toNumber, direction: r.direction, rows: [r] }
      groups.push(current)
    }
  }

  const dupGroups = groups.filter(g => g.rows.length > 1)
  console.log(`Found ${dupGroups.length} duplicate group(s) covering ${dupGroups.reduce((n, g) => n + g.rows.length, 0)} rows.\n`)

  let toDeleteTotal = 0
  const idsToDelete = []
  for (const g of dupGroups) {
    // Keeper: prefer a row with a recording, then the earliest callDate,
    // then the lexicographically smaller callhippoId (deterministic tie-break).
    const keeper = [...g.rows].sort((a, b) => {
      if (!!a.recordingUrl !== !!b.recordingUrl) return a.recordingUrl ? -1 : 1
      if (a.callDate.getTime() !== b.callDate.getTime()) return a.callDate - b.callDate
      return a.callhippoId < b.callhippoId ? -1 : 1
    })[0]
    const losers = g.rows.filter(r => r.id !== keeper.id)

    console.log(`${g.fromNumber} -> ${g.toNumber} (${g.direction}):`)
    console.log(`  KEEP   ${keeper.callhippoId}  ${keeper.callDate.toISOString()}  recording=${!!keeper.recordingUrl}`)
    for (const l of losers) {
      console.log(`  DELETE ${l.callhippoId}  ${l.callDate.toISOString()}  recording=${!!l.recordingUrl}${l.analysisStatus ? '  [had analysisStatus=' + l.analysisStatus + ' — lost if deleted]' : ''}`)
      idsToDelete.push(l.id)
    }
    toDeleteTotal += losers.length
  }

  console.log(`\n${toDeleteTotal} row(s) would be deleted (keeping ${dupGroups.length} row(s), one per group).`)

  if (!APPLY) {
    console.log('\nDRY RUN — no changes made. Re-run with --apply to actually delete.')
    return
  }

  if (idsToDelete.length === 0) {
    console.log('Nothing to delete.')
    return
  }

  const delActivities = await prisma.activity.deleteMany({ where: { callLogId: { in: idsToDelete } } })
  const delLogs = await prisma.callLog.deleteMany({ where: { id: { in: idsToDelete } } })
  console.log(`\nDeleted ${delLogs.count} CallLog row(s) and ${delActivities.count} mirrored Activity row(s).`)
}

main().catch(e => console.error('CLEANUP ERROR', e)).finally(() => prisma.$disconnect())
