import { useEffect, useState } from 'react'
import api from '../../api/client'

// Companies → Warm Leads (2026-10-30).
//
// Results written by the Marketing AI Agent (server/src/routes/marketingWarmLeads.js).
// This page only SHOWS them: the evaluation is started, approved and paced in
// the Marketing AI Agent. Every value shown here is what that evaluation
// recorded; when something was not found it says so instead of guessing.

export const WARM_STATUS_OPTIONS = [
  { value: 'warm',               label: 'Warm leads' },
  { value: 'early_signal',       label: 'Early signal / Needs review' },
  { value: 'cold',               label: 'Cold' },
  { value: 'insufficient_data',  label: 'Not enough data' },
  { value: 'existing_customer',  label: 'Existing customer' },
  { value: 'active_opportunity', label: 'Active opportunity' },
  { value: 'do_not_contact',     label: 'Do not contact' },
  { value: 'failed',             label: 'Evaluation failed (retry)' },
  { value: 'all',                label: 'All evaluated' },
]

const CLASS_LABEL = {
  warm: 'Warm',
  early_signal: 'Early signal — needs review',
  cold: 'Cold',
  insufficient_data: 'Not enough data',
  existing_customer: 'Existing customer',
  active_opportunity: 'Active opportunity',
  do_not_contact: 'Do not contact',
}
const DEEP_LABEL = {
  done: 'Web research done',
  not_needed: 'Web research not needed',
  skipped_cap: 'Web research pending (batch limit)',
  skipped_ceiling: 'Web research incomplete (Gemini call limit)',
  failed: 'Web research failed',
}

const fmtDate = (v) => (v ? new Date(v).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

function ClassChip({ e }) {
  if (!e) return <span className="warm-chip">Not evaluated</span>
  if (e.evaluationStatus === 'failed') return <span className="warm-chip failed">Failed — retry</span>
  return <span className={`warm-chip ${e.classification}`}>{CLASS_LABEL[e.classification] || e.classification}</span>
}

/** Summary above the list: the latest runs and the totals, plus the status choice. */
export function WarmLeadsPanel({ warmStatus, onWarmStatus }) {
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let live = true
    api.get('/marketing-warm-leads/summary')
      .then(({ data }) => { if (live) setSummary(data) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [])

  const latest = summary?.runs?.[0]
  const test = summary?.runs?.find(r => r.kind === 'test')
  const t = summary?.totals
  return (
    <div className="warm-leads-panel">
      <div className="warm-leads-summary">
        {error ? (
          <span>The warm-lead summary could not be loaded.</span>
        ) : !summary ? (
          <span>Loading warm-lead summary…</span>
        ) : !latest ? (
          <span>No company has been evaluated yet. Evaluations are started from the Marketing AI Agent (Settings → Warm leads).</span>
        ) : (
          <>
            <span><b>{t.warm}</b> warm</span>
            <span><b>{t.earlySignal ?? 0}</b> early signal</span>
            <span><b>{t.cold}</b> cold</span>
            <span><b>{t.insufficient}</b> not enough data</span>
            <span><b>{t.existingCustomer ?? 0}</b> existing customer</span>
            <span><b>{t.activeOpportunity ?? 0}</b> active opportunity</span>
            <span><b>{t.doNotContact ?? 0}</b> do not contact</span>
            <span><b>{t.failed}</b> failed</span>
            <span className="warm-leads-run">
              Latest run: {latest.kind === 'test' ? `${latest.total}-company test sample` : latest.kind === 'retry' ? 'retry' : 'batch'} · {latest.status} · {latest.processed}/{latest.total} processed · {fmtDate(latest.finishedAt || latest.startedAt || latest.createdAt)}
            </span>
            {test && (
              <span className={`warm-leads-approval ${test.approvedAt ? 'ok' : 'wait'}`}>
                {test.approvedAt ? `Test approved ${fmtDate(test.approvedAt)}` : 'Test results awaiting approval — the full evaluation has not started'}
              </span>
            )}
          </>
        )}
      </div>
      <label className="warm-leads-status">
        Show
        <select aria-label="Warm lead status" value={warmStatus} onChange={e => onWarmStatus(e.target.value)}>
          {WARM_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    </div>
  )
}

export function WarmLeadHeaderCells() {
  return (
    <>
      <th className="warm-col">WARM LEAD</th>
      <th className="warm-col-reasons">REASONS AND SIGNALS</th>
      <th className="warm-col">EVALUATED</th>
    </>
  )
}

function Reasons({ e }) {
  if (!e) return <span className="warm-dim">—</span>
  if (e.evaluationStatus === 'failed') return <span className="warm-dim">{e.error || 'The evaluation failed; no reason was recorded.'}</span>
  const reasons = Array.isArray(e.reasons) ? e.reasons : []
  return (
    <div className="warm-reasons">
      {e.summary && <div className="warm-summary">{e.summary}</div>}
      {reasons.length === 0 ? (
        <span className="warm-dim">No signal was found.</span>
      ) : (
        <ul>
          {reasons.map((r, i) => (
            <li key={i} className={r.polarity}>
              <span className="warm-points">{r.points > 0 ? `+${r.points}` : r.points}</span>{' '}
              {r.summary}
              {r.evidence && <span className="warm-dim"> — {r.evidence}</span>}
              {r.observedAt && <span className="warm-dim"> ({String(r.observedAt).slice(0, 10)}{r.freshness && r.freshness !== 'unknown' ? `, ${r.freshness}` : ''})</span>}
              {r.sourceUrl && <> <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">source</a></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function WarmLeadCells({ c }) {
  const e = c.leadEvaluation
  return (
    <>
      <td className="warm-col">
        <ClassChip e={e} />
        {e?.score != null && <div className="warm-score">Score {e.score}/100</div>}
        {e?.confidence && <div className="warm-dim">{e.confidence} confidence</div>}
      </td>
      <td className="warm-col-reasons"><Reasons e={e} /></td>
      <td className="warm-col">
        <div>{e?.evaluationStatus === 'failed' ? 'Failed' : e ? 'Evaluated' : '—'}</div>
        <div className="warm-dim">{fmtDate(e?.evaluatedAt)}</div>
        {e?.deepCheck && <div className="warm-dim">{DEEP_LABEL[e.deepCheck] || e.deepCheck}</div>}
      </td>
    </>
  )
}

export function WarmLeadGridRows({ c }) {
  const e = c.leadEvaluation
  return (
    <>
      <div className="grid-field-row"><span>Warm lead</span><strong><ClassChip e={e} />{e?.score != null && ` ${e.score}/100`}{e?.confidence && ` · ${e.confidence}`}</strong></div>
      <div className="grid-field-row"><span>Reasons</span><strong><Reasons e={e} /></strong></div>
      <div className="grid-field-row"><span>Evaluated</span><strong>{fmtDate(e?.evaluatedAt)}</strong></div>
    </>
  )
}
