// One-off, READ-ONLY audit: compares CallHippo's live API data against this
// environment's CallLog table to find missing/duplicate/mismatched rows.
// Makes zero writes to CallHippo or the DB. Safe to run repeatedly.
//
// Usage:  node scripts/callhippoAudit.js
require('dotenv').config()
const axios = require('axios')
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const CALLHIPPO_BASE = 'https://web.callhippo.com/v1'
const CALLHIPPO_KEY  = process.env.CALLHIPPO_API_KEY

// ── same normalization the real sync uses (server/src/routes/callhippo.js) ──
function normalizeStatus(raw) {
  if (!raw) return 'unknown'
  const s = String(raw).toLowerCase().replace(/[\s_-]/g, '')
  if (s === 'answered' || s === 'completed' || s === 'connected') return 'answered'
  if (s === 'noanswer' || s === 'missed' || s === 'noans')         return 'missed'
  if (s === 'busy')                                                 return 'busy'
  if (s === 'cancelled' || s === 'canceled')                        return 'missed'
  if (s === 'failed')                                               return 'failed'
  if (s === 'machinedetected' || s === 'voicemail')                 return 'voicemail'
  return raw.toLowerCase()
}
function parseDuration(str) {
  if (!str) return 0
  const parts = str.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number(str) || 0
}
function normalizeCall(call) {
  const callhippoId = String(call._id || call.id || call.callId || call.callSid || '')
  const dateStr = call.date || call.dateToShow || ''
  const timeStr = call.time || ''
  const callDate = call.callAnswerTime
    ? new Date(call.callAnswerTime)
    : call.callHangupTime
      ? new Date(call.callHangupTime)
      : (dateStr ? new Date(`${dateStr} ${timeStr}`.trim()) : new Date())
  const fromNumber = call.from || call.callerNumber || call.fromNumber || ''
  const toNumber   = call.to   || call.clientNumber || call.toNumber   || ''
  const rawDir  = call.callType || call.type || call.direction || ''
  const direction = rawDir.toLowerCase().startsWith('out') ? 'outbound'
                  : rawDir.toLowerCase().startsWith('in')  ? 'inbound'
                  : rawDir.toLowerCase() || 'outbound'
  const status = normalizeStatus(call.callStatus || call.disposition || call.status || 'unknown')
  const duration = Number(call.totalCallDuration) || parseDuration(call.callDuration || '')
  return { callhippoId, callDate, fromNumber, toNumber, direction, status, duration, hasRecording: !!call.recordingUrl }
}

function chHeaders() { return { apiToken: CALLHIPPO_KEY, 'Content-Type': 'application/json' } }
function fmt(d) { return d.toISOString().slice(0, 10).replace(/-/g, '/') }

async function fetchAllFromCallHippo(startDate, endDate) {
  const PAGE_SIZE = 100
  const out = new Map()
  for (let page = 0; page < 500; page++) {
    const res = await axios.post(`${CALLHIPPO_BASE}/activityfeed`, {
      skip: String(page * PAGE_SIZE), limit: String(PAGE_SIZE),
      startDate: fmt(startDate), endDate: fmt(endDate),
    }, { headers: chHeaders(), timeout: 30000 })
    const calls = res.data?.data?.callLogs || res.data?.data?.data || res.data?.data?.logs || []
    if (!calls.length) break
    for (const c of calls) {
      const n = normalizeCall(c)
      if (n.callhippoId) out.set(n.callhippoId, n)
    }
    if (calls.length < PAGE_SIZE) break
  }
  return out
}

async function main() {
  if (!CALLHIPPO_KEY) { console.error('CALLHIPPO_API_KEY not set in this environment — aborting.'); process.exit(1) }

  const dbStats = await prisma.callLog.aggregate({ _count: true, _min: { callDate: true }, _max: { callDate: true } })
  const dbTotal = dbStats._count
  console.log('=== CRM DB (CallLog table) ===')
  console.log('Total rows:', dbTotal)
  console.log('Earliest callDate:', dbStats._min.callDate)
  console.log('Latest callDate:  ', dbStats._max.callDate)

  // Duplicate callhippoId check (defensive — should be impossible given the @unique constraint)
  const dupIds = await prisma.$queryRaw`SELECT "callhippoId", COUNT(*) c FROM "CallLog" GROUP BY "callhippoId" HAVING COUNT(*) > 1`
  console.log('Duplicate callhippoId groups (should be 0):', dupIds.length)

  // Same-call-different-id duplicate check: two DB rows with the same phone
  // pair + direction within 5 seconds of each other but different callhippoId
  // — would indicate CallHippo issuing a new _id for what's really one call.
  const nearDupRows = await prisma.$queryRaw`
    SELECT a."callhippoId" as a_id, b."callhippoId" as b_id, a."callDate", a."fromNumber", a."toNumber"
    FROM "CallLog" a
    JOIN "CallLog" b ON a."fromNumber" = b."fromNumber" AND a."toNumber" = b."toNumber"
      AND a."callhippoId" < b."callhippoId"
      AND ABS(EXTRACT(EPOCH FROM (a."callDate" - b."callDate"))) < 5
    LIMIT 50`
  console.log('Same-phone-pair rows within 5s of each other but different callhippoId (possible dupes):', nearDupRows.length)
  if (nearDupRows.length) console.log(nearDupRows.slice(0, 10))

  // Audit window: from the DB's earliest record (minus 2-day buffer) through
  // tomorrow — this is everything the CRM claims to cover. If the table is
  // empty, fall back to the same 6-month window the real sync uses on first run.
  const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const startDate = dbStats._min.callDate
    ? new Date(dbStats._min.callDate.getTime() - 2 * 24 * 60 * 60 * 1000)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d })()

  console.log(`\nFetching CallHippo API for window ${fmt(startDate)} → ${fmt(endDate)} ...`)
  const chMap = await fetchAllFromCallHippo(startDate, endDate)
  console.log('=== CallHippo API (same window) ===')
  console.log('Total calls:', chMap.size)

  const dbRows = await prisma.callLog.findMany({
    where: { callDate: { gte: startDate, lte: endDate } },
    select: { callhippoId: true, callDate: true, fromNumber: true, toNumber: true, direction: true, status: true, duration: true, recordingUrl: true },
  })
  const dbMap = new Map(dbRows.map(r => [r.callhippoId, r]))

  const missingInCrm = []
  const mismatched = []
  for (const [id, ch] of chMap) {
    const db = dbMap.get(id)
    if (!db) { missingInCrm.push(ch); continue }
    const diffs = []
    if (db.status !== ch.status) diffs.push(`status: DB=${db.status} CH=${ch.status}`)
    if ((db.duration || 0) !== ch.duration) diffs.push(`duration: DB=${db.duration} CH=${ch.duration}`)
    if (db.direction !== ch.direction) diffs.push(`direction: DB=${db.direction} CH=${ch.direction}`)
    if (db.fromNumber !== ch.fromNumber) diffs.push(`from: DB=${db.fromNumber} CH=${ch.fromNumber}`)
    if (db.toNumber !== ch.toNumber) diffs.push(`to: DB=${db.toNumber} CH=${ch.toNumber}`)
    if (Math.abs(new Date(db.callDate).getTime() - ch.callDate.getTime()) > 5000) diffs.push(`callDate: DB=${new Date(db.callDate).toISOString()} CH=${ch.callDate.toISOString()}`)
    if (!!db.recordingUrl !== ch.hasRecording) diffs.push(`recording: DB=${!!db.recordingUrl} CH=${ch.hasRecording}`)
    if (diffs.length) mismatched.push({ id, diffs })
  }
  const extraInCrm = [...dbMap.keys()].filter(id => !chMap.has(id))

  console.log('\n=== DIFF SUMMARY ===')
  console.log('Missing in CRM (in CallHippo, not in DB):', missingInCrm.length)
  console.log('Extra in CRM (in DB, not returned by CallHippo for this window):', extraInCrm.length)
  console.log('Matched but field-mismatched:', mismatched.length)

  if (missingInCrm.length) {
    console.log('\n--- Sample missing calls (up to 15) ---')
    missingInCrm.slice(0, 15).forEach(c => console.log(c.callhippoId, c.callDate.toISOString(), c.fromNumber, '->', c.toNumber, c.status, c.duration + 's'))
  }
  if (extraInCrm.length) {
    console.log('\n--- Sample extra-in-CRM ids (up to 15) ---')
    extraInCrm.slice(0, 15).forEach(id => {
      const r = dbMap.get(id)
      console.log(id, new Date(r.callDate).toISOString(), r.fromNumber, '->', r.toNumber, r.status)
    })
  }
  if (mismatched.length) {
    console.log('\n--- Sample mismatches (up to 15) ---')
    mismatched.slice(0, 15).forEach(m => console.log(m.id, m.diffs.join(' | ')))
  }

  console.log('\n=== DONE ===')
}

main().catch(e => console.error('AUDIT ERROR', e.response?.data || e.message)).finally(() => prisma.$disconnect())
