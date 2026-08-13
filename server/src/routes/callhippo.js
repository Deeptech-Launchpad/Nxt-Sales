const router    = require('express').Router()
const auth      = require('../middleware/authMiddleware')
const { PrismaClient } = require('@prisma/client')
const axios     = require('axios')
const FormData  = require('form-data')
const prisma    = new PrismaClient()

// web.callhippo.com resolves correctly — api.callhippo.com has no DNS record
const CALLHIPPO_BASE = 'https://web.callhippo.com/v1'
const CALLHIPPO_KEY  = process.env.CALLHIPPO_API_KEY
const EMOTIONSENSE_URL = process.env.EMOTIONSENSE_URL || 'http://localhost:8000'

// ── EmotionSense analysis tunables ───────────────────────────────────────────
const ANALYSIS_MAX_ATTEMPTS   = 3          // total tries before marking failed
const ANALYSIS_RETRY_DELAY_MS = 5000       // base backoff between retries (×attempt)
const DOWNLOAD_TIMEOUT_MS      = 120000    // 2 min to pull the recording audio
const ANALYZE_TIMEOUT_MS       = 900000    // 15 min for the ML pipeline response
const STALE_ANALYZING_MS       = 20 * 60 * 1000  // requeue analyses stuck this long

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// A failure worth retrying: transient network/DNS issues, aborts (timeouts),
// or 5xx from the analysis service. A 4xx or programmer error is not retried.
function isTransientError(err) {
  const code = err?.code
  if (['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE'].includes(code)) return true
  const st = err?.response?.status
  if (st && st >= 500) return true
  return false
}

// ── FIFO analysis queue ──────────────────────────────────────────────────────
// EmotionSense processes one recording at a time (its own semaphore). Running
// two analyses concurrently from here would collide with that limit and get
// rejected with 429, so every analysis — whether auto-detected after Sync or
// manually triggered via Analyze/Retry — goes through this single in-memory
// queue and one worker, guaranteeing only one request is ever in flight.
const analysisQueue = []          // FIFO list of { callLogId, recordingUrl }
const queuedIds     = new Set()   // ids currently queued or being processed
let   queueRunning  = false

async function enqueueAnalysis(callLogId, recordingUrl) {
  if (queuedIds.has(callLogId)) return // already queued or in progress
  queuedIds.add(callLogId)
  analysisQueue.push({ callLogId, recordingUrl })
  await prisma.callLog.update({
    where: { id: callLogId },
    data:  { analysisStatus: 'pending' },
  }).catch(() => {})
  processQueue() // fire-and-forget; no-op if a worker is already running
}

async function processQueue() {
  if (queueRunning) return
  queueRunning = true
  try {
    while (analysisQueue.length > 0) {
      const { callLogId, recordingUrl } = analysisQueue.shift()
      await prisma.callLog.update({
        where: { id: callLogId },
        data:  { analysisStatus: 'analyzing' },
      }).catch(() => {})
      // runAnalysis handles its own retries/errors and never throws, so one
      // bad recording can't stall the rest of the queue.
      await runAnalysis(callLogId, recordingUrl)
      queuedIds.delete(callLogId)
    }
  } finally {
    queueRunning = false
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function chHeaders() {
  return { 'apiToken': CALLHIPPO_KEY, 'Content-Type': 'application/json' }
}

async function callhippoPost(path, body) {
  return axios.post(`${CALLHIPPO_BASE}${path}`, body, {
    headers: chHeaders(),
    timeout: 30000,
  })
}

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

// Digits-only comparison key so "+1 (555) 123-4567" matches "5551234567"
// regardless of formatting differences between CallHippo and company records.
function normalizePhone(raw) {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  return digits.slice(-10) // compare by last 10 digits (national number)
}

// Build a normalized-phone → company lookup once per sync (rather than
// querying per call) so "To" numbers can be matched regardless of formatting
// differences between CallHippo and company records (dashes, spaces, +country).
async function buildCompanyPhoneIndex() {
  const companies = await prisma.company.findMany({
    where: { OR: [{ phone: { not: null } }, { phones: { not: null } }] },
    select: { id: true, name: true, phone: true, phones: true },
  })
  const index = new Map()
  for (const c of companies) {
    const keys = [c.phone, ...(Array.isArray(c.phones) ? c.phones : [])]
    for (const raw of keys) {
      const key = normalizePhone(raw)
      if (key && !index.has(key)) index.set(key, { id: c.id, name: c.name })
    }
  }
  return index
}

// ── GET /api/callhippo/logs — return synced call logs from DB ────────────────
// ?search= filters by phone number (matches From or To, substring). Company
// name is included via the companyId set during Sync (Update 10).
router.get('/logs', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query
    const skip = (Number(page) - 1) * Number(limit)
    // Hide call logs whose linked company is in the Recycle Bin — it should
    // behave as if that company no longer exists. Logs with no company at all
    // (companyId: null) are unaffected.
    const hideBinnedCompany = { OR: [{ companyId: null }, { company: { deletedAt: null } }] }
    const where = search ? {
      AND: [
        { OR: [
          { fromNumber: { contains: search } },
          { toNumber:   { contains: search } },
        ] },
        hideBinnedCompany,
      ],
    } : hideBinnedCompany
    const [logs, total] = await Promise.all([
      prisma.callLog.findMany({
        where,
        orderBy: { callDate: 'desc' },
        skip,
        take: Number(limit),
        include: { company: { select: { id: true, name: true } } },
      }),
      prisma.callLog.count({ where }),
    ])
    res.json({ logs, total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    console.error('[CallHippo] fetch logs error:', err.message)
    res.status(500).json({ message: 'Failed to fetch call logs.' })
  }
})

// Core sync logic, shared by the manual POST /sync route below and the
// periodic background sync job (server/src/jobs/callHippoAutoSync.js) — the
// job has no req/res to pull an acting user from, so it's a plain userId
// param instead (used only to attribute the mirrored Activity rows).
// Throws on failure; callers decide how to surface that (HTTP response vs.
// a log line), matching the original route's behavior via a thrown error
// carrying an optional `.status` (502 for a bad upstream shape, otherwise
// treated as a generic failure).
async function runCallHippoSync(userId, options = {}) {
  if (!CALLHIPPO_KEY) {
    const err = new Error('CallHippo API key not configured.')
    err.status = 400
    throw err
  }

  // Read-only, no writes to CallHippo.
  //
  // Fetch window: incremental, not always the full 6 months — start from
  // the most recent callDate already stored (minus a 1-day overlap buffer,
  // to tolerate clock skew / late-arriving records), so a periodic sync
  // only requests what's actually new. Falls back to a 6-month lookback
  // only when CallLog is empty (first sync ever / fresh environment), so a
  // brand-new install still gets real history instead of nothing.
  // options.fullResync forces that same 6-month lookback regardless of what's
  // already stored — a one-time opt-in used to re-fetch and correct existing
  // rows (e.g. after the callDate-timezone fix below), never used by the
  // regular manual/auto sync paths.
  // CallHippo's activityfeed startDate/endDate are date-only strings, and —
  // per direct testing against the live API — CallHippo interprets them as
  // midnight in the ACCOUNT'S OWN configured display timezone (this account:
  // US Eastern, so EST/UTC-5 in Feb, EDT/UTC-4 in Aug — it follows US DST),
  // not UTC. Confirmed directly: startDate=2026/02/13 excluded every call
  // before 2026-02-13T05:00:00Z (= Feb 13 00:00 EST) even though those calls
  // are still "Feb 13" by UTC's own calendar — costing up to ~5 hours of
  // calls right at whichever boundary a naive UTC-date computation lands on.
  // So every boundary here needs slack, not just endDate: endDate needs a
  // day of headroom to guarantee "up to right now" is actually included, and
  // startDate needs the same day of headroom on the other side so the
  // intended lookback isn't silently short-changed by up to 5 hours. The
  // extra day of overlap this creates on either end is harmless — every call
  // in it is upserted by callhippoId, so a call fetched twice just updates
  // the same row instead of duplicating it.
  const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const mostRecent = options.fullResync ? null : await prisma.callLog.findFirst({ orderBy: { callDate: 'desc' }, select: { callDate: true } })
  const startDate = mostRecent
    ? new Date(mostRecent.callDate.getTime() - 24 * 60 * 60 * 1000)
    : (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); d.setDate(d.getDate() - 1); return d })()
  const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '/')

  // Paginated (not a single fixed skip=0/limit=100 request) — a sync window
  // with more than 100 calls used to permanently strand anything past the
  // 100th call, since every sync re-requested the SAME top-100 slice and
  // never advanced. PAGE_SIZE matches CallHippo's own page size; MAX_PAGES
  // is a generous safety cap against a runaway loop if the API's "end of
  // data" signal ever misbehaves — normal incremental syncs stop naturally
  // on the first short page long before this, and even a fresh 6-month
  // backfill (observed: ~2000 calls) has comfortable headroom under it.
  const PAGE_SIZE = 100
  const MAX_PAGES = 200
  const callsArray = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await callhippoPost('/activityfeed', {
      skip:      String(page * PAGE_SIZE),
      limit:     String(PAGE_SIZE),
      startDate: fmt(startDate),
      endDate:   fmt(endDate),
    })

    const raw = response.data
    if (page === 0) console.log('[CallHippo] Raw response keys:', Object.keys(raw || {}))

    // CallHippo returns data under different keys depending on version
    const pageCalls =
      raw?.data?.data ||
      raw?.data?.callLogs ||
      raw?.data?.logs ||
      raw?.callLogs ||
      (Array.isArray(raw?.data) ? raw.data : null) ||
      []

    if (!Array.isArray(pageCalls)) {
      console.error('[CallHippo] Unexpected response shape:', JSON.stringify(raw).slice(0, 500))
      if (page === 0) {
        const err = new Error('Unexpected response from CallHippo API.')
        err.status = 502
        throw err
      }
      break // a later page failing shape-checking just ends pagination early, doesn't fail the whole sync
    }

    // Log first record of the first page only, to reveal actual field
    // names without spamming logs across every page of a large sync.
    if (page === 0 && pageCalls.length > 0) {
      console.log('[CallHippo] First record keys:', Object.keys(pageCalls[0]))
      console.log('[CallHippo] First record sample:', JSON.stringify(pageCalls[0]).slice(0, 600))
    }

    callsArray.push(...pageCalls)
    if (pageCalls.length < PAGE_SIZE) break // short page = no more data
  }
  console.log(`[CallHippo] Fetched ${callsArray.length} call(s) since ${fmt(startDate)} across up to ${MAX_PAGES} page(s).`)

    let synced = 0
    let skipped = 0

    // Company Name column (Update 10): match each call's "To" number against
    // company phone/phones once up front, reused for every call in this sync.
    const companyPhoneIndex = await buildCompanyPhoneIndex()

    // "Already have this exact call" must be checked by id membership, not a
    // callDate range — CallHippo's own date filter (fmt(), above) is
    // day-granularity, so a fetch window starting mid-day can return calls
    // from earlier the same calendar day that were already synced in a prior
    // run; a callDate >= startDate range query would miss those (they sort
    // before the exact startDate instant) and wrongly attempt to re-create
    // them. Querying by the exact ids in this fetch sidesteps that entirely.
    const fetchedIds = callsArray.map(c => String(c._id || c.id || c.callId || c.callSid || '')).filter(Boolean)
    const existingIdRows = await prisma.callLog.findMany({
      where: { callhippoId: { in: fetchedIds } },
      select: { callhippoId: true },
    })
    const existingIdSet = new Set(existingIdRows.map(r => r.callhippoId))

    // NOTE: this sync intentionally does NOT attempt to auto-merge CallHippo's
    // own occasional same-call-under-two-ids double logging (a real thing —
    // confirmed against the live API). An earlier version of this function
    // tried a fromNumber+toNumber+direction+time-window heuristic to catch
    // it live, but measurement against production data showed it couldn't
    // reliably tell "one call logged twice" apart from "two genuine back-to-
    // back call attempts to the same number" (this business's outbound
    // dialing produces plenty of the latter, e.g. missed → immediate manual
    // redial) — same time gap, no clean signal to separate them. Silently
    // skipping the wrong half of that distinction means real calls quietly
    // vanish from the CRM, which is worse than the cosmetic cost of an
    // occasional true duplicate row. So: sync is now a complete, lossless,
    // 1:1 mirror of CallHippo by id — nothing fetched is ever silently
    // dropped. Likely-duplicate rows already in the DB are still findable
    // and removable via scripts/callhippoDedupeCleanup.js, which is
    // dry-run-by-default so a human reviews every candidate before anything
    // is deleted, rather than the sync guessing unsupervised.

    for (const call of callsArray) {
      const callhippoId  = String(call._id || call.id || call.callId || call.callSid || '')
      if (!callhippoId) { skipped++; continue }

      // callAnswerTime/callHangupTime come with an explicit "GMT+0000" suffix,
      // so `new Date(...)` parses them correctly regardless of the server's
      // OS timezone. 'date'/'time' ("Aug 11, 2026", "7:50:58 AM") carry NO
      // timezone info and are rendered in the CallHippo account's own
      // configured timezone (confirmed by cross-checking against
      // callAnswerTime: not the server's local zone) — parsing them directly
      // silently assumes the server's OS timezone and can shift every call's
      // stored time by several hours (verified: several hours off on this
      // dev box, and would differ again on a production server with yet
      // another OS timezone). callHangupTime is present on every call,
      // including unanswered ones, so it's the reliable fallback; the
      // ambiguous date/time string parse is now a last resort only, for the
      // (unseen so far) case where CallHippo omits both.
      const dateStr  = call.date || call.dateToShow || ''
      const timeStr  = call.time || ''
      const callDate = call.callAnswerTime
        ? new Date(call.callAnswerTime)
        : call.callHangupTime
          ? new Date(call.callHangupTime)
          : (dateStr ? new Date(`${dateStr} ${timeStr}`.trim()) : new Date())

      // From/To numbers
      const fromNumber = call.from || call.callerNumber || call.fromNumber || ''
      const toNumber   = call.to   || call.clientNumber || call.toNumber   || ''

      // Direction — normalize "Outgoing"/"Incoming" to "outbound"/"inbound"
      const rawDir  = call.callType || call.type || call.direction || ''
      const direction = rawDir.toLowerCase().startsWith('out') ? 'outbound'
                      : rawDir.toLowerCase().startsWith('in')  ? 'inbound'
                      : rawDir.toLowerCase() || 'outbound'

      // Status — callStatus is the real field in activityfeed
      const rawStatus = call.callStatus || call.disposition || call.status || 'unknown'
      const status    = normalizeStatus(rawStatus)

      // Duration — totalCallDuration is seconds as a number; callDuration is "HH:MM:SS" string
      const duration  = Number(call.totalCallDuration) || parseDuration(call.callDuration || '')

      const recordingUrl = call.recordingUrl || null

      // Agent — 'caller' is the agent display name in activityfeed
      const agentName = call.caller || call.userName || call.agentName || null
      const agentId   = call.callerEmail || call.userId || call.agentId || null

      // Match the "To" number against a company (Update 10) — if found, the
      // call gets linked to that company and mirrored as a Company Activity.
      const matchedCompany = companyPhoneIndex.get(normalizePhone(toNumber)) || null

      const fieldValues = {
        callDate, fromNumber, toNumber, direction, status, duration,
        recordingUrl, agentName, agentId, companyId: matchedCompany?.id || null,
      }

      let savedLog
      if (existingIdSet.has(callhippoId)) {
        savedLog = await prisma.callLog.update({ where: { callhippoId }, data: fieldValues })
      } else {
        savedLog = await prisma.callLog.create({ data: { callhippoId, ...fieldValues } })
        existingIdSet.add(callhippoId)
      }
      synced++

      // Mirror the call onto the matched company's Activity feed (Company →
      // Activities → Calls) so it shows alongside recording + call details.
      // Upserted by callLogId so re-syncing the same call (e.g. a recording
      // arriving later) updates the same activity instead of duplicating it.
      if (matchedCompany) {
        await prisma.activity.upsert({
          where:  { callLogId: savedLog.id },
          create: {
            type:      'call',
            companyId: matchedCompany.id,
            userId:    userId,
            title:     `${direction === 'outbound' ? 'Outbound' : 'Inbound'} call – ${matchedCompany.name}`,
            direction,
            duration,
            outcome:   status,
            recordingUrl,
            callLogId: savedLog.id,
          },
          update: {
            direction,
            duration,
            outcome: status,
            recordingUrl,
          },
        }).catch(e => console.error(`[CallHippo] Activity link failed for call ${callhippoId}:`, e.message))
      }

    }

    // Backfill: each sync only re-fetches CallHippo's most recent 100 calls, so
    // an older call log that was synced BEFORE its matching company (or that
    // company's phone number) existed in the CRM would otherwise stay
    // unmatched forever — it falls outside every future sync's fetch window,
    // so it's never re-evaluated against the index above. Re-check every
    // still-unmatched call log against the same index built for this sync, so
    // it links up as soon as the company/phone is added, however long after
    // the call itself happened.
    let backfilled = 0
    const stillUnmatched = await prisma.callLog.findMany({ where: { companyId: null } })
    for (const log of stillUnmatched) {
      const matchedCompany = companyPhoneIndex.get(normalizePhone(log.toNumber))
      if (!matchedCompany) continue

      await prisma.callLog.update({ where: { id: log.id }, data: { companyId: matchedCompany.id } })
      await prisma.activity.upsert({
        where:  { callLogId: log.id },
        create: {
          type:      'call',
          companyId: matchedCompany.id,
          userId:    userId,
          title:     `${log.direction === 'outbound' ? 'Outbound' : 'Inbound'} call – ${matchedCompany.name}`,
          direction: log.direction,
          duration:  log.duration,
          outcome:   log.status,
          recordingUrl: log.recordingUrl,
          callLogId: log.id,
        },
        update: {
          direction: log.direction,
          duration:  log.duration,
          outcome:   log.status,
          recordingUrl: log.recordingUrl,
        },
      }).catch(e => console.error(`[CallHippo] Backfill activity link failed for call ${log.callhippoId}:`, e.message))
      backfilled++
    }

  // Recover any analyses orphaned by a restart, then run the pending queue
  triggerPendingAnalysis().catch(e => console.error('[CallHippo] auto-analysis error:', e.message))

  console.log(`[CallHippo] Sync complete: ${synced} upserted, ${skipped} skipped, ${backfilled} backfilled`)
  return { synced, skipped, backfilled, total: callsArray.length }
}

// ── POST /api/callhippo/sync — fetch from CallHippo API (READ-ONLY) ──────────
// ?fullResync=true re-fetches the full 6-month lookback (instead of just the
// incremental window) to reconcile existing rows — same read-only, idempotent
// upsert path as a normal sync, just a wider fetch window. Not exposed in the
// UI; intended for a one-off corrective run, same as the manual button but
// via a direct API call.
router.post('/sync', auth, async (req, res) => {
  try {
    const result = await runCallHippoSync(req.user.id, { fullResync: req.query.fullResync === 'true' })
    res.json(result)
  } catch (err) {
    console.error('[CallHippo] sync error:', err.message)
    const msg = err?.response?.data?.message || err.message || 'Sync failed.'
    res.status(err.status || 500).json({ message: msg })
  }
})

// ── POST /api/callhippo/analyze/:id — queue EmotionSense analysis ────────────
// Enqueues onto the shared FIFO queue rather than starting immediately, so a
// manual Analyze/Retry click can never collide with another in-flight analysis.
router.post('/analyze/:id', auth, async (req, res) => {
  const { id } = req.params
  const log = await prisma.callLog.findUnique({ where: { id } })
  if (!log) return res.status(404).json({ message: 'Call log not found.' })
  if (!log.recordingUrl) return res.status(400).json({ message: 'No recording URL for this call.' })

  await enqueueAnalysis(id, log.recordingUrl)
  res.json({ message: 'Analysis queued.', analysisStatus: 'pending' })
})

// ── GET /api/callhippo/analysis/:id — get analysis result ────────────────────
router.get('/analysis/:id', auth, async (req, res) => {
  try {
    const log = await prisma.callLog.findUnique({ where: { id: req.params.id } })
    if (!log) return res.status(404).json({ message: 'Not found.' })
    res.json({
      analysisStatus: log.analysisStatus || null,
      analysisResult: log.analysisResult || null,
    })
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch analysis.' })
  }
})

// ── internal: one analysis attempt (download → analyse → save) ──────────────
async function analyzeOnce(callLogId, recordingUrl) {
  // Download recording audio from CallHippo URL
  const audioRes = await axios.get(recordingUrl, {
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  })

  const audioBuffer = Buffer.from(audioRes.data)
  const contentType = audioRes.headers['content-type'] || 'audio/mpeg'
  const ext = contentType.includes('wav') ? 'wav' : 'mp3'

  // Build multipart form for EmotionSense Python service
  const form = new FormData()
  form.append('file', audioBuffer, { filename: `call_${callLogId}.${ext}`, contentType })

  const analysisRes = await axios.post(`${EMOTIONSENSE_URL}/analyze`, form, {
    headers: form.getHeaders(),
    timeout: ANALYZE_TIMEOUT_MS,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  })

  return analysisRes.data
}

// ── internal: run EmotionSense analysis with retry/backoff ──────────────────
// The record stays in the "analyzing" (Processing) state across retries and is
// only marked "failed" after all attempts are exhausted — so a transient blip
// or a slow service never shows a premature Failed.
async function runAnalysis(callLogId, recordingUrl) {
  let lastErr
  for (let attempt = 1; attempt <= ANALYSIS_MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[EmotionSense] Call ${callLogId}: attempt ${attempt}/${ANALYSIS_MAX_ATTEMPTS}`)
      const result = await analyzeOnce(callLogId, recordingUrl)
      await prisma.callLog.update({
        where: { id: callLogId },
        data: { analysisStatus: 'completed', analysisResult: result, analysisError: null },
      })
      console.log(`[EmotionSense] Analysis complete for call ${callLogId}`)
      return
    } catch (err) {
      lastErr = err
      const transient = isTransientError(err)
      console.error(`[EmotionSense] Call ${callLogId} attempt ${attempt} failed: ${err.message} (transient=${transient})`)

      // Retry only transient failures, and only while attempts remain.
      if (transient && attempt < ANALYSIS_MAX_ATTEMPTS) {
        // keep it visibly "Processing" while we back off and retry
        await prisma.callLog.update({
          where: { id: callLogId },
          data: { analysisStatus: 'analyzing' },
        }).catch(() => {})
        await sleep(ANALYSIS_RETRY_DELAY_MS * attempt)
        continue
      }
      break // non-transient, or out of attempts
    }
  }

  const reason = (lastErr?.message || 'Analysis failed').slice(0, 300)
  await prisma.callLog.update({
    where: { id: callLogId },
    data: { analysisStatus: 'failed', analysisError: reason },
  }).catch(() => {})
}

// ── internal: recover analyses orphaned by a restart/deploy ─────────────────
// A record left in "analyzing" longer than STALE_ANALYZING_MS has lost its
// background worker (e.g. server restarted mid-run) — requeue it so it retries
// instead of hanging on Processing forever.
async function requeueStaleAnalyzing() {
  const cutoff = new Date(Date.now() - STALE_ANALYZING_MS)
  const { count } = await prisma.callLog.updateMany({
    where: { analysisStatus: 'analyzing', updatedAt: { lt: cutoff } },
    data:  { analysisStatus: 'pending' },
  })
  if (count > 0) console.log(`[EmotionSense] Recovered ${count} stalled analysis record(s)`)
  return count
}

// ── internal: enqueue all pending records for analysis ───────────────────────
// Feeds the same shared FIFO queue used by manual Analyze/Retry, so an
// auto-detected call and a manually retried call can never run concurrently.
async function triggerPendingAnalysis() {
  // Self-heal first: bring back any analyses orphaned by a restart/deploy.
  await requeueStaleAnalyzing().catch(e => console.error('[EmotionSense] recovery error:', e.message))

  const pending = await prisma.callLog.findMany({
    where: { analysisStatus: 'pending', recordingUrl: { not: null } },
  })
  if (!pending.length) return
  console.log(`[EmotionSense] Enqueuing ${pending.length} recording(s) for analysis`)
  for (const log of pending) {
    await enqueueAnalysis(log.id, log.recordingUrl)
  }
}

module.exports = router
module.exports.runCallHippoSync = runCallHippoSync
