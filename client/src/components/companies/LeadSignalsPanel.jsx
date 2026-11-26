import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Radar, RefreshCw, ExternalLink, Loader2 } from 'lucide-react'
import api from '../../api/client'
import { DEEP_LABEL } from './WarmLeads'
import '../../styles/modal.css'
import '../../styles/lead-signals.css'

// Company Details → "Marketing Agent Signals" (2026-11-26).
//
// Shows the Marketing AI Agent's latest evaluation of ONE company and the
// signals behind it, read from GET /api/companies/:id/lead-evaluation
// (server/src/routes/companies.js). Read only: nothing is written from here.
// Same drawer markup, portal and Escape handling as ThreadDrawer.jsx.

export const SIGNAL_CLASS_LABEL = {
  warm: 'Warm',
  early_signal: 'Early signal',
  cold: 'No signal (cold)',
  insufficient_data: 'Not enough data',
  existing_customer: 'Existing customer',
  active_opportunity: 'Active opportunity',
  do_not_contact: 'Do not contact',
  human_review: 'Needs review',
}

const POLARITY_LABEL = { positive: 'Positive', negative: 'Negative', neutral: 'Neutral' }

/** The link only when it is a real http/https web address; anything else (javascript:, data:, …) is never a link. */
export function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const u = new URL(value.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** { key, label } of the badge: a failed evaluation is "Could not be checked", whatever its classification. */
export function classificationBadge(e) {
  if (e?.evaluationStatus === 'failed') return { key: 'failed', label: 'Could not be checked' }
  const key = e?.classification || 'unknown'
  return { key, label: SIGNAL_CLASS_LABEL[key] || 'Unknown' }
}

const fmtDateTime = (v) => {
  if (!v) return '--'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
// observedAt is free text from the agent (usually YYYY-MM-DD): shown as a date when it is one, as written otherwise.
const fmtObserved = (v) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Signal({ r }) {
  const polarity = POLARITY_LABEL[r?.polarity] ? r.polarity : 'neutral'
  const href = safeHttpUrl(r?.sourceUrl)
  const observed = fmtObserved(r?.observedAt)
  const points = Number.isInteger(r?.points) && r.points !== 0 ? (r.points > 0 ? `+${r.points}` : String(r.points)) : null
  return (
    <li className={`lead-signal ${polarity}`} data-polarity={polarity}>
      <div className="lead-signal-head">
        <span className="lead-signal-polarity">{POLARITY_LABEL[polarity]}</span>
        {points && <span className="lead-signal-points">{points}</span>}
        <span className="lead-signal-summary">{r?.summary || r?.signal || 'Signal'}</span>
      </div>
      {r?.evidence && <p className="lead-signal-evidence">{r.evidence}</p>}
      {(observed || href) && (
        <div className="lead-signal-meta">
          {observed && <span>Observed {observed}</span>}
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer">Source<ExternalLink size={12} aria-hidden="true" /></a>
          )}
        </div>
      )}
    </li>
  )
}

/** The evaluation itself (no loading). Exported so it can be rendered on its own. */
export function SignalsView({ evaluation: e }) {
  const badge = classificationBadge(e)
  const reasons = Array.isArray(e?.reasons) ? e.reasons : []
  const failed = e?.evaluationStatus === 'failed'
  return (
    <div className="lead-signals-view">
      <div className="lead-signals-overview">
        <span className={`lead-signals-badge ${badge.key}`}>{badge.label}</span>
        <dl className="lead-signals-facts">
          <div><dt>Score</dt><dd>{e?.score != null ? `${e.score}/100` : '--'}</dd></div>
          <div><dt>Confidence</dt><dd>{e?.confidence ? e.confidence[0].toUpperCase() + e.confidence.slice(1) : '--'}</dd></div>
          <div><dt>Evaluated</dt><dd>{fmtDateTime(e?.evaluatedAt)}</dd></div>
          {e?.deepCheck && <div><dt>Web research</dt><dd>{DEEP_LABEL[e.deepCheck] || e.deepCheck}</dd></div>}
        </dl>
        {e?.summary && <p className="lead-signals-summary">{e.summary}</p>}
        {failed && <p className="lead-signals-error-text">{e?.error || 'The Marketing AI Agent could not check this company; it will be retried.'}</p>}
      </div>

      <h3 className="lead-signals-heading">Signals ({reasons.length})</h3>
      {reasons.length === 0 ? (
        <p className="lead-signals-muted">{failed ? 'No signals were recorded.' : 'No signal was found for this company.'}</p>
      ) : (
        <ul className="lead-signals-list">
          {reasons.map((r, i) => <Signal key={i} r={r} />)}
        </ul>
      )}
    </div>
  )
}

export default function LeadSignalsPanel({ companyId, companyName, onClose }) {
  const [state, setState] = useState({ status: 'loading', evaluation: null, error: '' })
  const [attempt, setAttempt] = useState(0)
  const closeRef = useRef(null)

  useEffect(() => {
    let live = true
    setState({ status: 'loading', evaluation: null, error: '' })
    api.get(`/companies/${encodeURIComponent(companyId)}/lead-evaluation`)
      .then(({ data }) => { if (live) setState({ status: 'ready', evaluation: data?.evaluation || null, error: '' }) })
      .catch((err) => { if (live) setState({ status: 'error', evaluation: null, error: err?.response?.data?.message || 'The Marketing Agent signals could not be loaded.' }) })
    return () => { live = false }
  }, [companyId, attempt])

  // Esc closes the panel (same as ThreadDrawer).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => { closeRef.current?.focus() }, [])

  return createPortal(
    <div className="modal-overlay company-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-drawer company-create-modal lead-signals-modal" role="dialog" aria-modal="true" aria-labelledby="lead-signals-title">
        <div className="modal-header company-modal-header">
          <div className="company-modal-title">
            <span className="company-modal-title-icon"><Radar size={16} /></span>
            <div>
              <h2 id="lead-signals-title">Marketing Agent Signals</h2>
              <p>{companyName ? `${companyName} · ` : ''}as evaluated by the Marketing AI Agent</p>
            </div>
          </div>
          <button ref={closeRef} className="modal-close" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body company-modal-body lead-signals-body">
          {state.status === 'loading' && (
            <div className="lead-signals-state" role="status"><Loader2 size={16} className="lead-signals-spin" /> Loading signals…</div>
          )}
          {state.status === 'error' && (
            <div className="lead-signals-state error" role="alert">
              <span>{state.error}</span>
              <button type="button" className="company-secondary-btn" onClick={() => setAttempt(n => n + 1)}><RefreshCw size={13} /> Retry</button>
            </div>
          )}
          {state.status === 'ready' && !state.evaluation && (
            <div className="lead-signals-state">The Marketing AI Agent has not checked this company yet.</div>
          )}
          {state.status === 'ready' && state.evaluation && <SignalsView evaluation={state.evaluation} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
