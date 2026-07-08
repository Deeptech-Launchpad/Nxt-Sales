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

    // Trigger background auto-analysis for all pending records
    triggerPendingAnalysis().catch(e => console.error('[CallHippo] auto-analysis error:', e.message))

    console.log(`[CallHippo] Sync complete: ${synced} upserted, ${skipped} skipped`)
    res.json({ synced, skipped, total: callsArray.length })

  } catch (err) {
    console.error('[CallHippo] sync error:', err.message)
    const msg = err?.response?.data?.message || err.message || 'Sync failed.'
    res.status(500).json({ message: msg })
  }
})

// ── POST /api/callhippo/analyze/:id — run EmotionSense on a recording ────────
router.post('/analyze/:id', auth, async (req, res) => {
  const { id } = req.params
  const log = await prisma.callLog.findUnique({ where: { id } })
  if (!log) return res.status(404).json({ message: 'Call log not found.' })
  if (!log.recordingUrl) return res.status(400).json({ message: 'No recording URL for this call.' })

  // Set status to analyzing immediately
  await prisma.callLog.update({ where: { id }, data: { analysisStatus: 'analyzing' } })
  res.json({ message: 'Analysis started.', analysisStatus: 'analyzing' })

  // Run in background — don't await
  runAnalysis(id, log.recordingUrl).catch(e =>
    console.error(`[EmotionSense] analysis failed for ${id}:`, e.message)
  )
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

// ── internal: run EmotionSense analysis ─────────────────────────────────────
async function runAnalysis(callLogId, recordingUrl) {
  try {
    console.log(`[EmotionSense] Downloading recording for call ${callLogId}`)

    // Download recording audio from CallHippo URL
    const audioRes = await axios.get(recordingUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
    })

    const audioBuffer = Buffer.from(audioRes.data)
    const contentType = audioRes.headers['content-type'] || 'audio/mpeg'
    const ext = contentType.includes('wav') ? 'wav' : 'mp3'

    // Build multipart form for EmotionSense Python service
    const form = new FormData()
    form.append('file', audioBuffer, { filename: `call_${callLogId}.${ext}`, contentType })

    console.log(`[EmotionSense] Sending to analysis service at ${EMOTIONSENSE_URL}`)
    const analysisRes = await axios.post(`${EMOTIONSENSE_URL}/analyze`, form, {
      headers: form.getHeaders(),
      timeout: 600000, // 10 min — CPU-heavy ML pipeline
    })

    const result = analysisRes.data
    console.log(`[EmotionSense] Analysis complete for call ${callLogId}`)

    await prisma.callLog.update({
      where: { id: callLogId },
      data: {
        analysisStatus: 'completed',
        analysisResult: result,
      },
    })
  } catch (err) {
    console.error(`[EmotionSense] Failed for call ${callLogId}:`, err.message)
    await prisma.callLog.update({
      where: { id: callLogId },
      data: { analysisStatus: 'failed' },
    })
  }
}

// ── internal: auto-analyze all pending records (sequential queue) ────────────
async function triggerPendingAnalysis() {
  const pending = await prisma.callLog.findMany({
    where: { analysisStatus: 'pending', recordingUrl: { not: null } },
  })
  if (!pending.length) return
  console.log(`[EmotionSense] Queue started: ${pending.length} recording(s) to process`)
  for (const log of pending) {
    await prisma.callLog.update({ where: { id: log.id }, data: { analysisStatus: 'analyzing' } })
    await runAnalysis(log.id, log.recordingUrl) // wait for completion before next
    console.log(`[EmotionSense] Queue: finished ${log.id}, moving to next`)
  }
  console.log('[EmotionSense] Queue complete')
}

module.exports = router
