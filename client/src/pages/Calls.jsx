import React, { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  RefreshCw, Play, Brain, ExternalLink, ChevronDown, ChevronRight,
  CheckCircle, XCircle, Loader2, AlertCircle, BarChart2, X, Search
} from 'lucide-react'
import api from '../api/client'
import EditColumnsMenu from '../components/EditColumnsMenu'
import '../styles/contacts.css'

const CALLHIPPO_URL = 'https://web.callhippo.com/dashboard?key=2'

// Toggleable/reorderable-by-visibility columns (Edit Columns). Checkbox, #,
// and Actions stay fixed outside this list, same as every other module's
// non-toggleable structural columns (Companies' checkbox/star/name,
// Tasks'/Deals' Actions). Table renders columns in this canonical order
// filtered by what's visible — same "not toggle order" behavior the other
// Edit Columns tables already use, since the underlying <table> here isn't
// drag-reorderable either.
const CALLS_FIELDS = [
  { key: 'callDate',           label: 'Date & Time',     width: 160 },
  { key: 'direction',          label: 'Direction',       width: 110 },
  { key: 'fromNumber',         label: 'From',            width: 140 },
  { key: 'toNumber',           label: 'To',              width: 140 },
  { key: 'company',            label: 'Company Name',    width: 200 },
  { key: 'contactHistory',     label: 'Contact History', width: 145 },
  { key: 'status',             label: 'Status',          width: 105 },
  { key: 'duration',           label: 'Duration',        width: 90  },
  { key: 'recording',          label: 'Recording',       width: 110 },
  { key: 'analysis',           label: 'Analysis',        width: 120 },
  { key: 'lastContacted',      label: 'Last Contacted',  width: 160 },
  { key: 'previousCallsCount', label: 'Previous Calls',  width: 115 },
]
// Last Contacted / Previous Calls are the "optional" columns from the spec —
// available in Edit Columns but off by default; everything else matches
// what was already shown before Edit Columns existed on this page.
const DEFAULT_COLUMNS = ['callDate', 'direction', 'fromNumber', 'toNumber', 'company', 'contactHistory', 'status', 'duration', 'recording', 'analysis']
const COLUMNS_STORAGE_KEY = 'mwz_calls_visible_columns'

// Every column here holds short, fixed-format content (phone numbers,
// dates, counts) that should stay on one line — nowrap, not the table's
// default wrap-anywhere behavior (which is what caused phone numbers to
// break character-by-character). Company Name is the deliberate exception:
// it keeps its own 2-line-clamp wrapping (set inline where it renders),
// since company names are free text and can genuinely be long.
const CALL_TD_STYLE = {
  callDate:           { whiteSpace: 'nowrap', color: '#0f172a', fontWeight: 500 },
  direction:          { whiteSpace: 'nowrap' },
  fromNumber:         { whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 },
  toNumber:           { whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 },
  contactHistory:     { whiteSpace: 'nowrap' },
  status:             { whiteSpace: 'nowrap' },
  duration:           { whiteSpace: 'nowrap', fontWeight: 600, color: '#374151' },
  recording:          { whiteSpace: 'nowrap' },
  analysis:           { whiteSpace: 'nowrap' },
  lastContacted:      { whiteSpace: 'nowrap', color: '#374151' },
  previousCallsCount: { whiteSpace: 'nowrap', color: '#374151', fontWeight: 600 },
}

// ── helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(sec) {
  if (!sec || sec === 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}

// Stored callDate is a correct absolute UTC instant (see server/src/routes/
// callhippo.js). Without an explicit timeZone, toLocaleString renders in
// whatever timezone the VIEWER'S browser/OS happens to be set to — so two
// people looking at the same call could see two different times. Pinning to
// Asia/Kolkata makes the displayed time deterministic for every viewer,
// matching the 'en-IN' formatting already used here. Note this will not
// match CallHippo's own dashboard, which renders in that account's own
// separately-configured display timezone — a CallHippo-side setting outside
// this app's control, not a data or display bug on our side.
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

function StatusBadge({ status }) {
  const map = {
    answered:  { bg: '#f0fdf4', color: '#16a34a', label: 'Answered' },
    connected: { bg: '#f0fdf4', color: '#16a34a', label: 'Connected' },
    missed:    { bg: '#fef2f2', color: '#dc2626', label: 'Missed'   },
    busy:      { bg: '#fff7ed', color: '#ea580c', label: 'Busy'     },
    failed:    { bg: '#fef2f2', color: '#dc2626', label: 'Failed'   },
    voicemail: { bg: '#f5f3ff', color: '#7c3aed', label: 'Voicemail'},
    unknown:   { bg: '#f8fafc', color: '#64748b', label: 'Unknown'  },
  }
  const s = status?.toLowerCase() || 'unknown'
  const c = map[s] || map.unknown
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  )
}

function ContactHistoryBadge({ value }) {
  const map = {
    'New Contact':     { bg: '#eff6ff', color: '#2563eb' },
    'Existing Contact': { bg: '#f0fdf4', color: '#16a34a' },
    'Re-contact':       { bg: '#fff7ed', color: '#ea580c' },
  }
  const c = map[value] || { bg: '#f8fafc', color: '#64748b' }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      background: c.bg, color: c.color, whiteSpace: 'nowrap',
    }}>
      {value || '—'}
    </span>
  )
}

function AnalysisBadge({ status, title }) {
  if (!status) return null
  const map = {
    pending:   { icon: <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />, color: '#64748b', label: 'Queued'      },
    analyzing: { icon: <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />, color: '#2563eb', label: 'Processing…' },
    completed: { icon: <CheckCircle size={11} />,  color: '#16a34a', label: 'Analyzed'   },
    failed:    { icon: <XCircle size={11} />,      color: '#dc2626', label: 'Failed'     },
  }
  const c = map[status] || map.pending
  return (
    <span
      title={title || undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: c.color, cursor: title ? 'help' : 'default', whiteSpace: 'nowrap' }}
    >
      {c.icon} {c.label}
    </span>
  )
}

// ── Analysis Details Modal ───────────────────────────────────────────────────

const EMOTION_COLORS = {
  joy:      '#22c55e',
  neutral:  '#94a3b8',
  sadness:  '#3b82f6',
  anger:    '#ef4444',
  fear:     '#f97316',
  disgust:  '#a855f7',
  surprise: '#eab308',
}

const EMOTION_EMOJI = {
  joy: '😄', neutral: '😐', sadness: '😢',
  anger: '😠', fear: '😨', disgust: '🤢', surprise: '😲',
}

const SPEAKER_PALETTE = ['#3b82f6', '#06b6d4', '#22c55e', '#f97316', '#a855f7', '#eab308', '#ef4444', '#ec4899']

function fmtTimestamp(sec) {
  const m = Math.floor((sec || 0) / 60)
  const s = Math.floor((sec || 0) % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function toStr(e) {
  if (!e) return null
  if (typeof e === 'string') return e
  return e.dominant || null
}

function AnalysisModal({ callLog, onClose }) {
  const r = callLog.analysisResult
  if (!r) return null

  const summary  = r.call_summary        || null
  const segments = r.segments            || []
  const speakers = r.speakers            || []
  const duration = r.audio_duration_sec  || 0
  const usage    = r.gemini_usage        || null
  const procSec  = r.processing_time_ms  ? (r.processing_time_ms / 1000).toFixed(1) : null

  // Speaker → color map
  const speakerColorMap = {}
  speakers.forEach((sp, i) => { speakerColorMap[sp] = SPEAKER_PALETTE[i % SPEAKER_PALETTE.length] })

  // Aggregate overall emotion by averaging final_emotion.scores across all segments
  const aggScores = {}
  let scoreCount = 0
  segments.forEach(seg => {
    const emo = seg.final_emotion || seg.text_emotion
    if (emo && emo.scores) {
      Object.entries(emo.scores).forEach(([k, v]) => {
        aggScores[k] = (aggScores[k] || 0) + v
      })
      scoreCount++
    }
  })

  const overallScores = {}
  let dominantEmotion = 'neutral'
  let dominantScore   = 0
  if (scoreCount > 0) {
    Object.entries(aggScores).forEach(([k, total]) => {
      const avg = total / scoreCount
      overallScores[k] = avg
      if (avg > dominantScore) { dominantScore = avg; dominantEmotion = k }
    })
  }
  const sortedEmotions = Object.entries(overallScores).sort((a, b) => b[1] - a[1])

  // Dark card style
  const card = {
    background: '#161b2b', borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.07)', marginBottom: 16,
  }
  const cardHeader = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
  }
  const cardHeaderIcon = {
    width: 32, height: 32, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16,
  }
  const labelStyle  = { fontSize: 11, color: '#6b7a99', fontWeight: 500, marginBottom: 4 }
  const valueStyle  = { fontSize: 14, color: '#ffffff', fontWeight: 600, lineHeight: 1.4 }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20,
    }}>
      <div style={{
        background: '#0d1117', borderRadius: 16, width: '100%', maxWidth: 860,
        maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Top bar: branding + close ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Brain size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff' }}>EmotionSense AI</div>
              <div style={{ fontSize: 11, color: '#6b7a99' }}>Call Recording Analyser</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {usage && (
              <span style={{
                fontSize: 12, fontWeight: 600, color: '#fff',
                background: '#16a34a', borderRadius: 99,
                padding: '4px 12px', letterSpacing: 0.2,
              }}>
                ₹{Number(usage.cost_inr).toFixed(4)} · {Number(usage.total_tokens).toLocaleString('en-IN')} tokens
              </span>
            )}
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.07)', border: 'none', cursor: 'pointer',
              color: '#94a3b8', borderRadius: 8, padding: '6px 8px', display: 'flex', alignItems: 'center',
            }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 20px 24px', overflowY: 'auto', flex: 1 }}>

          {/* ── Stats bar ── */}
          {(duration > 0 || speakers.length > 0 || segments.length > 0 || procSec) && (
            <div style={{
              display: 'flex', gap: 20, alignItems: 'center',
              marginBottom: 20, flexWrap: 'wrap',
            }}>
              {duration > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8892a4' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                  {duration.toFixed(1)}s
                </span>
              )}
              {speakers.length > 0 && (
                <span style={{ fontSize: 12, color: '#8892a4' }}>
                  👤 {speakers.length} speaker{speakers.length !== 1 ? 's' : ''}
                </span>
              )}
              {segments.length > 0 && (
                <span style={{ fontSize: 12, color: '#8892a4' }}>
                  📄 {segments.length} lines
                </span>
              )}
              {procSec && (
                <span style={{ fontSize: 12, color: '#8892a4' }}>
                  ⚡ {procSec}s to process
                </span>
              )}
            </div>
          )}

          {/* ── Section 1: Call Summary ── */}
          {summary && (
            <div style={card}>
              <div style={cardHeader}>
                <div style={{ ...cardHeaderIcon, background: 'rgba(99,102,241,0.15)' }}>📋</div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Call Summary</span>
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
                padding: '4px 0',
              }}>
                {[
                  { label: 'Who Answered',       val: summary.recipient          },
                  { label: 'Call Purpose',        val: summary.call_purpose       },
                  { label: 'Asked to Speak With', val: summary.inquired_personnel },
                  { label: 'Outcome',             val: summary.outcome            },
                ].map(({ label, val }) => (
                  <div key={label} style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={labelStyle}>{label}</div>
                    <div style={valueStyle}>{val || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Section 2: Overall Call Emotion ── */}
          {sortedEmotions.length > 0 && (
            <div style={card}>
              <div style={cardHeader}>
                <div style={{ ...cardHeaderIcon, background: 'rgba(234,179,8,0.15)' }}>🎭</div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Overall Call Emotion</span>
              </div>
              <div style={{ padding: '16px 20px' }}>
                {/* Dominant emotion row */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
                  padding: '12px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 10,
                }}>
                  <span style={{ fontSize: 32 }}>{EMOTION_EMOJI[dominantEmotion] || '😐'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: '#6b7a99', fontWeight: 500, marginBottom: 2 }}>Dominant Emotion</div>
                    <div style={{
                      fontSize: 22, fontWeight: 800, color: '#ffffff',
                      textTransform: 'capitalize',
                    }}>
                      {dominantEmotion.charAt(0).toUpperCase() + dominantEmotion.slice(1)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#6b7a99', fontWeight: 500, marginBottom: 2 }}>Score</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: EMOTION_COLORS[dominantEmotion] || '#fff' }}>
                      {(dominantScore * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Emotion bars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sortedEmotions.map(([emotion, score]) => {
                    const pct = (score * 100).toFixed(1)
                    const color = EMOTION_COLORS[emotion] || '#94a3b8'
                    return (
                      <div key={emotion} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{
                          width: 72, fontSize: 12, color: '#c8d0e0', fontWeight: 500,
                          textTransform: 'capitalize', flexShrink: 0,
                        }}>
                          {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                        </span>
                        <div style={{
                          flex: 1, height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${pct}%`, height: '100%',
                            background: color, borderRadius: 99,
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                        <span style={{ width: 44, fontSize: 12, color: '#8892a4', textAlign: 'right', flexShrink: 0 }}>
                          {pct}%
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Section 3: Extracted Transcript ── */}
          {segments.length > 0 && (
            <div style={card}>
              <div style={cardHeader}>
                <div style={{ ...cardHeaderIcon, background: 'rgba(6,182,212,0.15)' }}>📝</div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Extracted Transcript</span>
              </div>
              <div style={{ padding: '14px 20px 4px' }}>
                {/* Speaker chips */}
                {speakers.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                    {speakers.map((sp, i) => {
                      const color = SPEAKER_PALETTE[i % SPEAKER_PALETTE.length]
                      return (
                        <span key={sp} style={{
                          fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99,
                          background: color + '22', color, border: `1px solid ${color}44`,
                        }}>
                          {sp}
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* Transcript lines */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {segments.map((seg, i) => {
                    const spLabel = seg.speaker_label || seg.speaker || `Speaker ${i + 1}`
                    const color   = speakerColorMap[spLabel] || SPEAKER_PALETTE[i % SPEAKER_PALETTE.length]
                    const ts      = seg.start !== undefined ? seg.start : (seg.start_time !== undefined ? seg.start_time : null)
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'baseline', gap: 12,
                        padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <span style={{
                          width: 34, fontSize: 11, color: '#4a5568',
                          fontFamily: 'monospace', flexShrink: 0,
                        }}>
                          {ts !== null ? fmtTimestamp(ts) : ''}
                        </span>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color, flexShrink: 0, width: 160,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {spLabel}
                        </span>
                        <span style={{ fontSize: 13, color: '#c8d0e0', lineHeight: 1.5 }}>
                          {seg.text || seg.transcript || ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Fallback: raw JSON when no structured data at all */}
          {!summary && segments.length === 0 && (
            <div style={card}>
              <div style={{ ...cardHeader }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#ffffff' }}>Analysis Result</span>
              </div>
              <div style={{ padding: 16 }}>
                <pre style={{
                  fontSize: 11, color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 8, padding: 14, maxHeight: 400, overflowY: 'auto', margin: 0,
                }}>
                  {JSON.stringify(r, null, 2)}
                </pre>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Error Boundary ───────────────────────────────────────────────────────────

class CallsErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'DM Sans, sans-serif' }}>
          <h3 style={{ color: '#dc2626', marginBottom: 12 }}>Calls page error</h3>
          <pre style={{ fontSize: 12, background: '#fef2f2', padding: 16, borderRadius: 8, color: '#7f1d1d', whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}{'\n'}{this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Main Calls Dashboard ─────────────────────────────────────────────────────

export default function Calls() {
  return <CallsErrorBoundary><CallsInner /></CallsErrorBoundary>
}

const PAGE_SIZE = 100

function CallsInner() {
  const navigate = useNavigate()
  const [logs,         setLogs]         = useState([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [syncing,      setSyncing]      = useState(false)
  const [syncMsg,      setSyncMsg]      = useState('')
  const [viewLog,      setViewLog]      = useState(null)
  const [analyzingIds, setAnalyzingIds] = useState(new Set())
  // Page, search and the open analysis all live in the URL so ANY refresh -
  // the 15s auto-refresh, F5, or a restored tab - comes back to the same
  // place instead of resetting to page 1 of the unfiltered list.
  const [searchParams, setSearchParams] = useSearchParams()
  const [page,         setPage]         = useState(() => Math.max(1, parseInt(searchParams.get('page'), 10) || 1))
  const [selectedIds,  setSelectedIds]  = useState(new Set())
  const [search,           setSearch]           = useState(() => searchParams.get('q') || '')
  const [debouncedSearch,  setDebouncedSearch]   = useState(() => searchParams.get('q') || '')

  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY))
      return Array.isArray(saved) && saved.length ? saved : DEFAULT_COLUMNS
    } catch {
      return DEFAULT_COLUMNS
    }
  })
  const saveVisibleColumns = (cols) => {
    setVisibleColumns(cols)
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(cols))
  }
  const orderedVisibleFields = CALLS_FIELDS.filter(f => visibleColumns.includes(f.key))

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const fetchLogs = useCallback((pg, searchTerm = '') => {
    setLoading(true)
    const params = { limit: PAGE_SIZE, page: pg, ...(searchTerm && { search: searchTerm }) }
    api.get('/callhippo/logs', { params })
      .then(r => { setLogs(r.data.logs || []); setTotal(r.data.total || 0) })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [])

  // Debounce phone-number search so we don't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch])

  useEffect(() => { fetchLogs(page, debouncedSearch) }, [fetchLogs, page, debouncedSearch])

  // Mirror the current context into the URL. replace:true so this never fills
  // the back stack - Back should still leave Calls, not step through pages.
  useEffect(() => {
    const p = new URLSearchParams(searchParams)
    page > 1 ? p.set('page', String(page)) : p.delete('page')
    debouncedSearch ? p.set('q', debouncedSearch) : p.delete('q')
    if (p.toString() !== searchParams.toString()) setSearchParams(p, { replace: true })
  }, [page, debouncedSearch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear selection whenever page changes
  useEffect(() => { setSelectedIds(new Set()) }, [page])

  // While anything is still processing/queued, poll every 15s so a finished
  // analysis flips to Analyzed (or Failed) almost immediately instead of
  // looking stuck. Polling stops automatically once nothing is in progress.
  useEffect(() => {
    const active = logs.some(l => l.analysisStatus === 'analyzing' || l.analysisStatus === 'pending')
    if (!active) return
    // Must pass the CURRENT search term: calling fetchLogs(page) alone let
    // searchTerm default to '', so each automatic refresh silently discarded
    // the user's active search and reloaded the unfiltered list underneath
    // them - the auto-refresh-loses-my-context bug.
    const timer = setInterval(() => fetchLogs(page, debouncedSearch), 15000)
    return () => clearInterval(timer)
  }, [logs, fetchLogs, page, debouncedSearch])

  // Recording Analysis is identified in the URL (?analysis=<id>) rather than
  // held only in component state, so an automatic refresh - or a real browser
  // refresh - reopens the exact analysis the user was reading instead of
  // dumping them back on the Calls list.
  const openAnalysis = (log) => {
    setViewLog(log)
    const p = new URLSearchParams(searchParams)
    p.set('analysis', log.id)
    setSearchParams(p, { replace: true })
  }
  const closeAnalysis = () => {
    setViewLog(null)
    const p = new URLSearchParams(searchParams)
    p.delete('analysis')
    setSearchParams(p, { replace: true })
  }

  // Reopen from the URL once the logs for this page have loaded.
  useEffect(() => {
    const id = searchParams.get('analysis')
    if (!id) { if (viewLog) setViewLog(null); return }
    if (viewLog?.id === id) return
    const match = logs.find(l => l.id === id)
    if (match) setViewLog(match)
  }, [logs, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const goToPage = (pg) => {
    if (pg < 1 || pg > totalPages) return
    setPage(pg)
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allOnPageSelected = logs.length > 0 && logs.every(l => selectedIds.has(l.id))
  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        logs.forEach(l => next.delete(l.id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        logs.forEach(l => next.add(l.id))
        return next
      })
    }
  }

  const syncNow = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const { data } = await api.post('/callhippo/sync')
      setSyncMsg(`${data.synced} calls synced`)
      setPage(1)
      fetchLogs(1, debouncedSearch)
    } catch (err) {
      setSyncMsg(err?.response?.data?.message || 'Sync failed.')
    } finally {
      setSyncing(false)
    }
  }

  const handleAnalyze = async (log) => {
    setAnalyzingIds(prev => new Set([...prev, log.id]))
    try {
      await api.post(`/callhippo/analyze/${log.id}`)
      // optimistically update status
      setLogs(prev => prev.map(l => l.id === log.id ? { ...l, analysisStatus: 'analyzing' } : l))
    } catch (err) {
      alert(err?.response?.data?.message || 'Failed to start analysis.')
    } finally {
      setAnalyzingIds(prev => { const s = new Set(prev); s.delete(log.id); return s })
    }
  }

  // Renders one dynamic-column cell's content for a call row. Keeps every
  // existing column's exact prior look/behavior — this only reorganizes
  // which of them are shown via Edit Columns, nothing about how each one
  // renders or what data it reads.
  const renderCallCell = (f, log) => {
    switch (f.key) {
      case 'callDate':
        return fmtDate(log.callDate)
      case 'direction':
        return log.direction === 'inbound' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#7c3aed', fontSize: 12, fontWeight: 600 }}>
            <PhoneIncoming size={13} /> Inbound
          </span>
        ) : log.direction === 'missed' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626', fontSize: 12, fontWeight: 600 }}>
            <PhoneMissed size={13} /> Missed
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb', fontSize: 12, fontWeight: 600 }}>
            <PhoneOutgoing size={13} /> Outbound
          </span>
        )
      case 'fromNumber':
        return log.fromNumber || '—'
      case 'toNumber':
        return log.toNumber || '—'
      case 'company':
        return log.company ? (
          <span
            style={{
              color: '#3b82f6', fontWeight: 600, cursor: 'pointer',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', textOverflow: 'ellipsis', overflowWrap: 'anywhere',
            }}
            onClick={() => navigate(`/companies/${log.company.id}`)}
          >
            {log.company.name}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
        )
      case 'contactHistory':
        return <ContactHistoryBadge value={log.contactHistory} />
      case 'status':
        return <StatusBadge status={log.status} />
      case 'duration':
        return fmtDuration(log.duration)
      case 'recording':
        return log.recordingUrl ? (
          <a
            href={log.recordingUrl}
            target="_blank"
            rel="noreferrer"
            className="ch-btn ch-btn-outline"
            style={{ textDecoration: 'none' }}
          >
            <Play size={11} /> Play
          </a>
        ) : (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>No recording</span>
        )
      case 'analysis':
        return log.recordingUrl ? (
          <AnalysisBadge
            status={log.analysisStatus}
            title={log.analysisStatus === 'failed' ? log.analysisError : undefined}
          />
        ) : (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>
        )
      case 'lastContacted':
        return fmtDate(log.lastContacted)
      case 'previousCallsCount':
        return log.previousCallsCount ?? 0
      default:
        return '—'
    }
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .ch-table { width: 100%; min-width: max-content; table-layout: fixed; border-collapse: collapse; }
        .ch-table th { background: #f8fafc; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .5px; padding: 10px 14px; text-align: left; border-bottom: 1px solid #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ch-table td { padding: 12px 14px; font-size: 13px; color: #374151; border-bottom: 1px solid #f1f5f9; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
        .ch-table tr:hover td { background: #fafbff; }
        .ch-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit; }
        .ch-btn-primary { background: #e63329; color: #fff; }
        .ch-btn-primary:hover { background: #c62a21; }
        .ch-btn-outline { background: #fff; color: #374151; border: 1px solid #e2e8f0; }
        .ch-btn-outline:hover { background: #f8fafc; }
        .ch-btn-analyze { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        .ch-btn-analyze:hover { background: #dbeafe; }
        .ch-btn-details { background: #f5f3ff; color: #7c3aed; border: 1px solid #ddd6fe; }
        .ch-btn-details:hover { background: #ede9fe; }
        .ch-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      <div style={{ padding: '24px 28px', fontFamily: 'DM Sans, sans-serif' }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>Calls Dashboard</h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
              Total: {total} Call{total !== 1 ? 's' : ''} synced from CallHippo
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', background: '#fff' }}>
              <Search size={13} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search by phone number"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: 12, fontFamily: 'inherit', width: 170 }}
              />
            </div>
            {syncMsg && (
              <span style={{ fontSize: 12, color: syncMsg.includes('failed') || syncMsg.includes('Failed') ? '#ef4444' : '#16a34a' }}>
                {syncMsg}
              </span>
            )}
            <button className="ch-btn ch-btn-outline" onClick={syncNow} disabled={syncing}>
              <RefreshCw size={13} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              {syncing ? 'Syncing…' : 'Sync calls'}
            </button>
            <EditColumnsMenu fields={CALLS_FIELDS} visibleColumns={visibleColumns} onSave={saveVisibleColumns} alwaysShownKey="__none__" />
            <a
              href={CALLHIPPO_URL}
              target="_blank"
              rel="noreferrer"
              className="ch-btn ch-btn-primary"
              style={{ textDecoration: 'none' }}
            >
              <Phone size={13} /> Open CallHippo <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
              <p style={{ margin: 0 }}>Loading call history…</p>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Phone size={40} color="#e2e8f0" style={{ marginBottom: 12 }} />
              <p style={{ color: '#64748b', margin: 0 }}>No calls yet. Click "Sync calls" to import from CallHippo.</p>
              <button className="ch-btn ch-btn-primary" style={{ marginTop: 16 }} onClick={syncNow}>
                <RefreshCw size={13} /> Sync calls now
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
              <table className="ch-table">
                <thead>
                  <tr>
                    <th style={{ width: 36, paddingRight: 4 }}>
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer', width: 14, height: 14 }}
                      />
                    </th>
                    <th style={{ width: 44 }}>#</th>
                    {orderedVisibleFields.map(f => (
                      <th key={f.key} style={f.width ? { width: f.width } : undefined}>{f.label}</th>
                    ))}
                    <th style={{ width: 210 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr key={log.id} style={{ background: selectedIds.has(log.id) ? '#f0f7ff' : undefined }}>
                      <td style={{ paddingRight: 4 }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(log.id)}
                          onChange={() => toggleSelect(log.id)}
                          style={{ cursor: 'pointer', width: 14, height: 14 }}
                        />
                      </td>
                      <td style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500, minWidth: 32 }}>
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      {orderedVisibleFields.map(f => (
                        <td key={f.key} style={CALL_TD_STYLE[f.key]}>{renderCallCell(f, log)}</td>
                      ))}
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {/* Analyze button — only if recording exists and not yet analyzed */}
                          {log.recordingUrl && !log.analysisStatus && (
                            <button
                              className="ch-btn ch-btn-analyze"
                              onClick={() => handleAnalyze(log)}
                              disabled={analyzingIds.has(log.id)}
                            >
                              <Brain size={11} /> Analyze
                            </button>
                          )}
                          {/* Retry if failed */}
                          {log.analysisStatus === 'failed' && (
                            <button
                              className="ch-btn ch-btn-analyze"
                              onClick={() => handleAnalyze(log)}
                              disabled={analyzingIds.has(log.id)}
                            >
                              <Brain size={11} /> Retry
                            </button>
                          )}
                          {/* View Details — only when analysis is done */}
                          {log.analysisStatus === 'completed' && log.analysisResult && (
                            <button
                              className="ch-btn ch-btn-details"
                              onClick={() => openAnalysis(log)}
                            >
                              <BarChart2 size={11} /> View Details
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 10,
            }}>
              {/* Left: record range */}
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} calls
                {selectedIds.size > 0 && (
                  <span style={{ marginLeft: 10, color: '#2563eb', fontWeight: 600 }}>
                    · {selectedIds.size} selected
                  </span>
                )}
              </span>

              {/* Right: page controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  className="ch-btn ch-btn-outline"
                  onClick={() => goToPage(page - 1)}
                  disabled={page === 1}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                >
                  ‹ Prev
                </button>

                {/* Page number buttons — show window of 5 around current page */}
                {(() => {
                  const pages = []
                  let start = Math.max(1, page - 2)
                  let end   = Math.min(totalPages, start + 4)
                  if (end - start < 4) start = Math.max(1, end - 4)
                  if (start > 1) {
                    pages.push(
                      <button key={1} className="ch-btn ch-btn-outline" onClick={() => goToPage(1)}
                        style={{ padding: '4px 9px', fontSize: 12 }}>1</button>
                    )
                    if (start > 2) pages.push(
                      <span key="e1" style={{ fontSize: 12, color: '#94a3b8', padding: '0 2px' }}>…</span>
                    )
                  }
                  for (let p = start; p <= end; p++) {
                    pages.push(
                      <button
                        key={p}
                        className="ch-btn ch-btn-outline"
                        onClick={() => goToPage(p)}
                        style={{
                          padding: '4px 9px', fontSize: 12,
                          background: p === page ? '#e63329' : '#fff',
                          color:      p === page ? '#fff'    : '#374151',
                          borderColor: p === page ? '#e63329' : '#e2e8f0',
                          fontWeight:  p === page ? 700 : 400,
                        }}
                      >
                        {p}
                      </button>
                    )
                  }
                  if (end < totalPages) {
                    if (end < totalPages - 1) pages.push(
                      <span key="e2" style={{ fontSize: 12, color: '#94a3b8', padding: '0 2px' }}>…</span>
                    )
                    pages.push(
                      <button key={totalPages} className="ch-btn ch-btn-outline" onClick={() => goToPage(totalPages)}
                        style={{ padding: '4px 9px', fontSize: 12 }}>{totalPages}</button>
                    )
                  }
                  return pages
                })()}

                <button
                  className="ch-btn ch-btn-outline"
                  onClick={() => goToPage(page + 1)}
                  disabled={page === totalPages}
                  style={{ padding: '4px 10px', fontSize: 12 }}
                >
                  Next ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analysis details modal */}
      {viewLog && (
        <AnalysisModal callLog={viewLog} onClose={() => closeAnalysis()} />
      )}
    </>
  )
}
