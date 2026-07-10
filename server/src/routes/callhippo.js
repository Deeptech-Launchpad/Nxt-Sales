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

// ── GET /api/callhippo/logs — return synced call logs from DB ────────────────
router.get('/logs', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query
    const skip = (Number(page) - 1) * Number(limit)
    const [logs, total] = await Promise.all([
      prisma.callLog.findMany({
        orderBy: { callDate: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.callLog.count(),
    ])
    res.json({ logs, total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    console.error('[CallHippo] fetch logs error:', err.message)
    res.status(500).json({ message: 'Failed to fetch call logs.' })
  }
})

// ── POST /api/callhippo/sync — fetch from CallHippo API (READ-ONLY) ──────────
router.post('/sync', auth, async (req, res) => {
  if (!CALLHIPPO_KEY) {
    return res.status(400).json({ message: 'CallHippo API key not configured.' })
  }

  try {
    // Fetch last 100 calls — read-only, no writes to CallHippo
    // Try both common path patterns for web.callhippo.com
    // Fetch last 6 months of call logs
    const endDate   = new Date()
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - 6)
    const fmt = d => d.toISOString().slice(0, 10).replace(/-/g, '/')

    const response = await callhippoPost('/activityfeed', {
      skip:      "0",
      limit:     "100",
      startDate: fmt(startDate),
      endDate:   fmt(endDate),
    })

    const raw = response.data
    console.log('[CallHippo] Raw response keys:', Object.keys(raw || {}))

    // CallHippo returns data under different keys depending on version
    const callsArray =
      raw?.data?.data ||
      raw?.data?.callLogs ||
      raw?.data?.logs ||
      raw?.callLogs ||
      (Array.isArray(raw?.data) ? raw.data : null) ||
      []

    if (!Array.isArray(callsArray)) {
      console.error('[CallHippo] Unexpected response shape:', JSON.stringify(raw).slice(0, 500))
      return res.status(502).json({ message: 'Unexpected response from CallHippo API.', raw: raw })
    }

    // Log first record to reveal actual field names
    if (callsArray.length > 0) {
      console.log('[CallHippo] First record keys:', Object.keys(callsArray[0]))
      console.log('[CallHippo] First record sample:', JSON.stringify(callsArray[0]).slice(0, 600))
    }

    let synced = 0
    let skipped = 0

    for (const call of callsArray) {
      const callhippoId  = String(call._id || call.id || call.callId || call.callSid || '')
      if (!callhippoId) { skipped++; continue }

      // Date + Time — CallHippo returns 'date' ("Jun 28, 2026") and 'time' ("11:54:49 PM") separately
      const dateStr  = call.date || call.dateToShow || ''
      const timeStr  = call.time || ''
      const callDate = dateStr
        ? new Date(`${dateStr} ${timeStr}`.trim())
        : (call.callAnswerTime ? new Date(call.callAnswerTime) : new Date())

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

      await prisma.callLog.upsert({
        where:  { callhippoId },
        create: {
          callhippoId,
          callDate,
          fromNumber,
          toNumber,
          direction,
          status,
          duration,
          recordingUrl,
          agentName,
          agentId,
        },
        update: {
          callDate,
          fromNumber,
          toNumber,
          direction,
          status,
          duration,
          recordingUrl,
          agentName,
          agentId,
        },
      })
      synced++

      // Auto-analyze recordings longer than 90 seconds
      if (recordingUrl && duration > 90) {
        const existing = await prisma.callLog.findUnique({ where: { callhippoId } })
        if (!existing?.analysisStatus) {
          await prisma.callLog.update({
            where: { callhippoId },
            data:  { analysisStatus: 'pending' },
          })
        }
      }
    }

    // Recover any analyses orphaned by a restart, then run the pending queue
    triggerPendingAnalysis().catch(e => console.error('[CallHippo] auto-analysis error:', e.message))

    console.log(`[CallHippo] Sync complete: ${synced} upserted, ${skipped} skipped`)
    res.json({ synced, skipped, total: callsArray.length })

  } catch (err) {
    console.error('[CallHippo] sync error:', err.message)
    const msg = err?.response?.data?.message || err.message || 'Sync failed.'
    res.status(500).json({ message: msg })
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
