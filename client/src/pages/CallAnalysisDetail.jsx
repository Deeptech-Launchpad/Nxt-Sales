import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, Play, RefreshCw, Brain, CheckCircle,
  AlertCircle, Globe, Clock, User, Building, Award, MessageSquare,
  Sparkles, ThumbsUp, AlertTriangle, Lightbulb, CheckSquare, ChevronRight,
  TrendingUp, BarChart2, Volume2, ShieldCheck, Heart
} from 'lucide-react'
import api from '../api/client'
import '../styles/call-analysis.css'

function fmtDuration(sec) {
  if (!sec || sec === 0) return '0s'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

function scoreColor(score) {
  if (score >= 85) return '#22c55e'
  if (score >= 70) return '#3b82f6'
  if (score >= 55) return '#eab308'
  return '#ef4444'
}

function emotionBadgeStyle(emotion) {
  const map = {
    Positive: { bg: '#f0fdf4', color: '#16a34a' },
    Satisfied: { bg: '#f0fdf4', color: '#16a34a' },
    Happy: { bg: '#f0fdf4', color: '#16a34a' },
    Calm: { bg: '#eff6ff', color: '#2563eb' },
    Neutral: { bg: '#f8fafc', color: '#64748b' },
    Confused: { bg: '#fefce8', color: '#ca8a04' },
    Concerned: { bg: '#fff7ed', color: '#ea580c' },
    Frustrated: { bg: '#fef2f2', color: '#dc2626' },
    Angry: { bg: '#fef2f2', color: '#dc2626' },
    Impatient: { bg: '#fef2f2', color: '#dc2626' },
  }
  return map[emotion] || { bg: '#f8fafc', color: '#64748b' }
}

export default function CallAnalysisDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reanalyzing, setReanalyzing] = useState(false)
  const [activeTab, setActiveTab] = useState('original') // 'original' | 'english'
  const [highlightedTime, setHighlightedTime] = useState(null)

  const transcriptRefs = useRef({})

  const fetchAnalysis = async () => {
    setLoading(true)
    setError('')
    try {
      const r = await api.get(`/callhippo/analysis/${id}`)
      setData(r.data)
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load call analysis details.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalysis()
  }, [id])

  const handleReanalyze = async () => {
    setReanalyzing(true)
    try {
      const r = await api.post(`/callhippo/reanalyze/${id}`)
      setData(prev => ({
        ...prev,
        analysisStatus: 'completed',
        analysisResult: r.data.analysisResult,
        analysisError: null,
      }))
    } catch (err) {
      alert(err?.response?.data?.message || 'Re-analysis failed.')
    } finally {
      setReanalyzing(false)
    }
  }

  const jumpToTimestamp = (timestamp) => {
    if (!timestamp) return
    setHighlightedTime(timestamp)
    if (transcriptRefs.current[timestamp]) {
      transcriptRefs.current[timestamp].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  if (loading) {
    return (
      <div className="ca-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
        <RefreshCw size={28} color="#3b82f6" style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
        <h3 style={{ color: '#0f172a', margin: 0, fontSize: 16 }}>Loading Call AI Analysis...</h3>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="ca-container">
        <button className="ca-back-btn" onClick={() => navigate('/calls')}>
          <ArrowLeft size={14} /> Back to Calls
        </button>
        <div style={{ padding: 40, textAlign: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, marginTop: 20 }}>
          <AlertCircle size={32} color="#dc2626" style={{ marginBottom: 8 }} />
          <h3 style={{ color: '#991b1b', margin: '0 0 6px 0' }}>Analysis Unavailable</h3>
          <p style={{ color: '#b91c1c', margin: 0, fontSize: 13 }}>{error || 'Call record not found.'}</p>
        </div>
      </div>
    )
  }

  const result = data.analysisResult || {}
  const scores = result.scores || {}
  const scoreExps = result.scoreExplanations || {}
  const summary = result.summary || {}
  const segments = result.segments || []
  const emotionTimeline = result.emotionTimeline || []
  const keyMoments = result.keyMoments || []
  const whatWentWell = result.whatWentWell || []
  const improvements = result.improvements || []
  const suggestedResponses = result.suggestedResponses || []
  const actionItems = result.actionItems || []

  const isNonEnglish = result.originalLanguage && result.originalLanguage.toLowerCase() !== 'english'

  const scoreCategories = [
    { key: 'communication', label: 'Communication', score: scores.communication ?? 80 },
    { key: 'professionalism', label: 'Professionalism', score: scores.professionalism ?? 85 },
    { key: 'empathy', label: 'Empathy', score: scores.empathy ?? 75 },
    { key: 'listening', label: 'Listening', score: scores.listening ?? 80 },
    { key: 'problemUnderstanding', label: 'Problem Understanding', score: scores.problemUnderstanding ?? 80 },
    { key: 'resolution', label: 'Problem Resolution', score: scores.resolution ?? 80 },
    { key: 'customerSatisfaction', label: 'Customer Satisfaction', score: scores.customerSatisfaction ?? 80 },
    { key: 'efficiency', label: 'Conversation Efficiency', score: scores.efficiency ?? 80 },
  ]

  return (
    <div className="ca-container">
      {/* Navigation Header */}
      <div className="ca-header-bar">
        <button className="ca-back-btn" onClick={() => navigate('/calls')}>
          <ArrowLeft size={14} /> Back to Calls
        </button>
        <div className="ca-actions">
          <button className="ca-btn-reanalyze" onClick={handleReanalyze} disabled={reanalyzing}>
            <RefreshCw size={13} style={{ animation: reanalyzing ? 'spin 1s linear infinite' : 'none' }} />
            {reanalyzing ? 'Re-analysing...' : 'Re-analyse Call'}
          </button>
        </div>
      </div>

      {/* Top Hero Banner */}
      <div className="ca-hero-card">
        <div className="ca-hero-top">
          <div className="ca-hero-meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Brain size={18} color="#60a5fa" />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#60a5fa' }}>
                AI Call Performance Intelligence
              </span>
            </div>
            <h1 className="ca-hero-title">
              Call #{data.callhippoId || data.id.slice(-6)} · {data.company?.name || data.toNumber || 'Call Analysis'}
            </h1>
            <div className="ca-hero-sub">
              <span><Phone size={12} /> {data.direction === 'outbound' ? 'Outbound' : 'Inbound'}</span>
              <span>•</span>
              <span><User size={12} /> Agent: <strong>{data.agentName || 'Unknown Agent'}</strong></span>
              <span>•</span>
              <span><Clock size={12} /> {fmtDate(data.callDate)} ({fmtDuration(data.duration)})</span>
            </div>
          </div>

          <div className="ca-score-pill-large">
            <span className="ca-score-val" style={{ color: scoreColor(result.overallScore ?? 80) }}>
              {result.overallScore ?? 80} / 100
            </span>
            <span className="ca-score-lbl">Overall Score</span>
          </div>
        </div>

        {/* Justification summary */}
        {result.scoreJustification && (
          <p style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.5, margin: '0 0 12px 0', background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: 8 }}>
            <strong>AI Rationale:</strong> {result.scoreJustification}
          </p>
        )}

        {/* Key Badges */}
        <div className="ca-tags-row">
          <span className="ca-badge ca-badge-lang">
            <Globe size={12} /> Spoken Language: <strong>{result.originalLanguage || 'English'}</strong>
          </span>
          <span className="ca-badge ca-badge-outcome">
            <ShieldCheck size={12} /> Outcome: <strong>{result.callOutcome || 'Completed'}</strong>
          </span>
          <span className="ca-badge ca-badge-sentiment">
            <Heart size={12} /> Customer Sentiment: <strong>{result.customerSentiment || 'Neutral'}</strong>
          </span>
          <span className="ca-badge ca-badge-sentiment">
            <User size={12} /> Agent Tone: <strong>{result.agentSentiment || 'Calm'}</strong>
          </span>
        </div>

        {/* Audio Player */}
        {data.recordingUrl && (
          <div className="ca-player-wrap">
            <Volume2 size={18} color="#94a3b8" />
            <audio controls src={data.recordingUrl} preload="metadata" />
          </div>
        )}
      </div>

      {/* Grid 1: Performance Scores Breakdown & AI Call Summary */}
      <div className="ca-grid-2">
        {/* Scores Card */}
        <div className="ca-card">
          <h3 className="ca-card-title">
            <Award size={16} color="#2563eb" /> Performance Score Breakdown
          </h3>
          {scoreCategories.map(cat => (
            <div className="ca-score-item" key={cat.key}>
              <div className="ca-score-row">
                <span>{cat.label}</span>
                <span style={{ color: scoreColor(cat.score), fontWeight: 700 }}>{cat.score} / 100</span>
              </div>
              <div className="ca-progress-track">
                <div
                  className="ca-progress-fill"
                  style={{ width: `${cat.score}%`, background: scoreColor(cat.score) }}
                />
              </div>
              {scoreExps[cat.key] && (
                <div className="ca-score-exp">{scoreExps[cat.key]}</div>
              )}
            </div>
          ))}
        </div>

        {/* Call Summary Card */}
        <div className="ca-card">
          <h3 className="ca-card-title">
            <Sparkles size={16} color="#7c3aed" /> AI Executive Call Summary
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
            <div>
              <strong style={{ color: '#475569', fontSize: 11, display: 'block' }}>REASON FOR CALL</strong>
              <div style={{ color: '#0f172a', fontWeight: 600 }}>{summary.reason || 'General inquiry'}</div>
            </div>
            <div>
              <strong style={{ color: '#475569', fontSize: 11, display: 'block' }}>CUSTOMER REQUIREMENT</strong>
              <div style={{ color: '#0f172a' }}>{summary.customerRequirement || 'Assistance requested'}</div>
            </div>
            <div>
              <strong style={{ color: '#475569', fontSize: 11, display: 'block' }}>MAIN ISSUE DISCUSSED</strong>
              <div style={{ color: '#0f172a' }}>{summary.mainIssue || 'N/A'}</div>
            </div>
            <div>
              <strong style={{ color: '#475569', fontSize: 11, display: 'block' }}>SOLUTION PROVIDED</strong>
              <div style={{ color: '#16a34a', fontWeight: 600 }}>{summary.solution || 'Addressed during call'}</div>
            </div>
            <div>
              <strong style={{ color: '#475569', fontSize: 11, display: 'block' }}>CALL OUTCOME & FOLLOW-UP</strong>
              <div style={{ color: '#0f172a' }}>
                {summary.outcome || 'Call completed'}{' '}
                {summary.followUpRequired && <span style={{ color: '#dc2626', fontWeight: 700 }}>· Follow-up Required</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid 2: Interactive Transcript & Emotion Timeline */}
      <div className="ca-grid-2">
        {/* Transcript Card */}
        <div className="ca-card" style={{ flex: 1 }}>
          <div className="ca-transcript-header">
            <h3 className="ca-card-title" style={{ margin: 0 }}>
              <MessageSquare size={16} color="#2563eb" /> Audio Transcription & Diarization
            </h3>
            {isNonEnglish && (
              <div className="ca-tabs">
                <button
                  className={`ca-tab-btn ${activeTab === 'original' ? 'active' : ''}`}
                  onClick={() => setActiveTab('original')}
                >
                  Original ({result.originalLanguage})
                </button>
                <button
                  className={`ca-tab-btn ${activeTab === 'english' ? 'active' : ''}`}
                  onClick={() => setActiveTab('english')}
                >
                  English Translation
                </button>
              </div>
            )}
          </div>

          <div className="ca-transcript-list">
            {segments.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 20 }}>No transcript segments available.</p>
            ) : (
              segments.map(seg => {
                const emoStyle = emotionBadgeStyle(seg.emotion)
                const isHighlight = highlightedTime === seg.startTime
                return (
                  <div
                    key={seg.id}
                    className={`ca-segment ${isHighlight ? 'highlighted' : ''}`}
                    ref={el => transcriptRefs.current[seg.startTime] = el}
                  >
                    <div className="ca-seg-meta">
                      <span className={seg.speaker === 'Customer' ? 'ca-speaker-customer' : 'ca-speaker-agent'}>
                        {seg.speaker === 'Customer' ? '👤 Customer' : '🎧 Agent'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: emoStyle.bg, color: emoStyle.color, fontWeight: 600 }}>
                          {seg.emotion}
                        </span>
                        <span className="ca-seg-time">{seg.startTime} - {seg.endTime}</span>
                      </div>
                    </div>
                    <div className="ca-seg-text">
                      {activeTab === 'english' ? (seg.englishText || seg.originalText) : seg.originalText}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Emotion Timeline & Key Moments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Emotion Timeline */}
          <div className="ca-card">
            <h3 className="ca-card-title">
              <TrendingUp size={16} color="#eab308" /> Emotion & Tone Timeline
            </h3>
            <div className="ca-timeline">
              {emotionTimeline.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 12 }}>No emotion events detected.</p>
              ) : (
                emotionTimeline.map((item, idx) => (
                  <div className="ca-tl-item" key={idx} onClick={() => jumpToTimestamp(item.timestamp)}>
                    <span className="ca-tl-time">{item.timestamp}</span>
                    <div className="ca-tl-content">
                      <div className="ca-tl-title">
                        {item.speaker}: <span style={{ color: emotionBadgeStyle(item.emotion).color }}>{item.emotion}</span>
                      </div>
                      {item.note && <div className="ca-tl-desc">{item.note}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Key Moments */}
          <div className="ca-card">
            <h3 className="ca-card-title">
              <Clock size={16} color="#06b6d4" /> Key Call Moments
            </h3>
            <div className="ca-timeline">
              {keyMoments.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: 12 }}>No key moments flagged.</p>
              ) : (
                keyMoments.map((km, idx) => (
                  <div className="ca-tl-item" key={idx} onClick={() => jumpToTimestamp(km.timestamp)}>
                    <span className="ca-tl-time">{km.timestamp}</span>
                    <div className="ca-tl-content">
                      <div className="ca-tl-title">{km.label}</div>
                      {km.description && <div className="ca-tl-desc">{km.description}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Grid 3: Coaching & Feedback (What Went Well, Improvements, Suggested Responses) */}
      <div className="ca-grid-2">
        {/* What Went Well */}
        <div className="ca-card">
          <h3 className="ca-card-title" style={{ color: '#16a34a' }}>
            <ThumbsUp size={16} color="#16a34a" /> What Went Well
          </h3>
          <ul style={{ paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
            {whatWentWell.length === 0 ? (
              <li style={{ color: '#94a3b8' }}>Agent maintained standard baseline protocol.</li>
            ) : (
              whatWentWell.map((w, idx) => (
                <li key={idx} style={{ color: '#1e293b' }}>
                  {w.timestamp && (
                    <span
                      onClick={() => jumpToTimestamp(w.timestamp)}
                      style={{ cursor: 'pointer', fontFamily: 'monospace', color: '#2563eb', background: '#eff6ff', padding: '1px 5px', borderRadius: 4, marginRight: 6, fontSize: 11, fontWeight: 700 }}
                    >
                      {w.timestamp}
                    </span>
                  )}
                  <strong>{w.point}</strong> — {w.explanation}
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Needs Improvement */}
        <div className="ca-card">
          <h3 className="ca-card-title" style={{ color: '#dc2626' }}>
            <AlertTriangle size={16} color="#dc2626" /> Needs Improvement
          </h3>
          <ul style={{ paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
            {improvements.length === 0 ? (
              <li style={{ color: '#94a3b8' }}>No major critical errors detected.</li>
            ) : (
              improvements.map((imp, idx) => (
                <li key={idx} style={{ color: '#1e293b' }}>
                  {imp.timestamp && (
                    <span
                      onClick={() => jumpToTimestamp(imp.timestamp)}
                      style={{ cursor: 'pointer', fontFamily: 'monospace', color: '#dc2626', background: '#fef2f2', padding: '1px 5px', borderRadius: 4, marginRight: 6, fontSize: 11, fontWeight: 700 }}
                    >
                      {imp.timestamp}
                    </span>
                  )}
                  <strong>{imp.point}</strong> — {imp.explanation}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Suggested Responses & Action Items */}
      <div className="ca-grid-2">
        {/* Recommended Responses */}
        <div className="ca-card">
          <h3 className="ca-card-title">
            <Lightbulb size={16} color="#eab308" /> Recommended Response Improvements
          </h3>
          {suggestedResponses.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 12 }}>No response replacements required.</p>
          ) : (
            suggestedResponses.map((sug, idx) => (
              <div className="ca-suggestion-card" key={idx}>
                <div className="ca-sug-header">
                  <span
                    onClick={() => jumpToTimestamp(sug.timestamp)}
                    style={{ cursor: 'pointer', fontFamily: 'monospace', color: '#2563eb', background: '#eff6ff', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}
                  >
                    Timestamp: {sug.timestamp}
                  </span>
                </div>
                {sug.customerStatement && (
                  <div className="ca-sug-quote">
                    <strong>Customer:</strong> "{sug.customerStatement}"
                  </div>
                )}
                {sug.agentResponse && (
                  <div className="ca-sug-quote" style={{ background: '#fff0ef', borderLeftColor: '#f87171' }}>
                    <strong>Original Agent:</strong> "{sug.agentResponse}"
                  </div>
                )}
                <div className="ca-sug-better">
                  <strong>💡 AI Recommended Response:</strong> "{sug.recommendedResponse}"
                </div>
                <div className="ca-sug-reason">
                  <strong>Why this is better:</strong> {sug.reason}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Action Items */}
        <div className="ca-card">
          <h3 className="ca-card-title">
            <CheckSquare size={16} color="#16a34a" /> Extracted Follow-Up Action Items
          </h3>
          {actionItems.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 12 }}>No action items extracted from this call.</p>
          ) : (
            <ul className="ca-action-list">
              {actionItems.map((act, idx) => (
                <li className="ca-action-item" key={idx}>
                  <CheckCircle size={14} color="#16a34a" />
                  <span>{act}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
