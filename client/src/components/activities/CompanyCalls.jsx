import { useState, useEffect } from 'react'
import { Phone, PhoneIncoming, PhoneOutgoing, Loader2, RefreshCw } from 'lucide-react'
import api from '../../api/client'

// Company → Calls tab.
//
// Reads the SAME CallLog rows the global Calls page uses, scoped with
// ?companyId= — no duplicate call records are created anywhere, and anything
// synced from CallHippo shows up here automatically.
//
// Each row carries the reach status computed server-side from prior calls to
// the same number:
//   NR = New Reach      — no earlier call to this number
//   AR = Already Reached — earlier calls exist; the previous-call history for
//                          that contact is shown inline.

function ReachBadge({ status }) {
  const isNew = status === 'NR'
  const s = isNew
    ? { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe', text: 'NR · New Reach' }
    : { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', text: 'AR · Already Reached' }
  if (!status) return null
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
    }}>
      {s.text}
    </span>
  )
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtDuration(sec) {
  if (!sec && sec !== 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${String(s).padStart(2, '0')}s`
}

export default function CompanyCalls({ companyId }) {
  const [logs, setLogs]       = useState([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const load = () => {
    if (!companyId) return
    setLoading(true); setError('')
    api.get('/callhippo/logs', { params: { companyId, limit: 100 } })
      .then(r => { setLogs(r.data.logs || []); setTotal(r.data.total || 0) })
      .catch(err => setError(err?.response?.data?.message || 'Could not load calls for this company.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Group by the number dialled so an AR contact's earlier calls sit together
  // under the most recent one, rather than being scattered through the list.
  const groups = (() => {
    const byNumber = new Map()
    for (const l of logs) {
      const key = l.toNumber || l.fromNumber || '(unknown)'
      if (!byNumber.has(key)) byNumber.set(key, [])
      byNumber.get(key).push(l)
    }
    return [...byNumber.entries()].map(([number, calls]) => ({
      number,
      calls,                       // already newest-first from the API
      latest: calls[0],
      previous: calls.slice(1),    // the "previous call history" for an AR contact
    }))
  })()

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          {loading ? 'Loading calls…' : `${total} call${total === 1 ? '' : 's'} for this company`}
        </span>
        <button
          onClick={load}
          disabled={loading}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, padding: '6px 11px', fontSize: 12.5, fontWeight: 600, color: '#334155', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '9px 12px', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!loading && logs.length === 0 && !error && (
        <div className="empty-assoc">
          <p>No calls logged for this company yet. Calls appear here automatically once CallHippo syncs them.</p>
        </div>
      )}

      {groups.map(g => (
        <div key={g.number} style={{ border: '1px solid #eef1f5', borderRadius: 9, marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 13px', background: '#fafbfc', borderBottom: g.previous.length ? '1px solid #eef1f5' : 'none', flexWrap: 'wrap' }}>
            <Phone size={13} color="#64748b" />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a' }}>{g.number}</span>
            <ReachBadge status={g.latest.reachStatus} />
            <span style={{ fontSize: 11.5, color: '#94a3b8', marginLeft: 'auto' }}>
              {g.calls.length} call{g.calls.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Most recent call */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', flexWrap: 'wrap' }}>
            {g.latest.direction === 'inbound'
              ? <PhoneIncoming size={13} color="#8b5cf6" />
              : <PhoneOutgoing size={13} color="#3b82f6" />}
            <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{fmtDateTime(g.latest.callDate)}</span>
            <span style={{ fontSize: 12.5, color: '#64748b' }}>{g.latest.status || '—'}</span>
            <span style={{ fontSize: 12.5, color: '#64748b' }}>{fmtDuration(g.latest.duration)}</span>
            {g.latest.agentName && <span style={{ fontSize: 12.5, color: '#94a3b8' }}>· {g.latest.agentName}</span>}
            {g.latest.recordingUrl && (
              <audio controls src={g.latest.recordingUrl} style={{ height: 30, marginLeft: 'auto', maxWidth: 260 }} />
            )}
          </div>

          {/* Previous calls — only present for an AR (Already Reached) contact */}
          {g.previous.length > 0 && (
            <div style={{ borderTop: '1px dashed #e2e8f0', background: '#fcfcfd' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', padding: '8px 13px 4px' }}>
                Previous calls ({g.previous.length})
              </div>
              {g.previous.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 13px', fontSize: 12.5, color: '#475569', flexWrap: 'wrap' }}>
                  {c.direction === 'inbound'
                    ? <PhoneIncoming size={12} color="#a78bfa" />
                    : <PhoneOutgoing size={12} color="#93c5fd" />}
                  <span>{fmtDateTime(c.callDate)}</span>
                  <span>{c.status || '—'}</span>
                  <span>{fmtDuration(c.duration)}</span>
                  {c.agentName && <span style={{ color: '#94a3b8' }}>· {c.agentName}</span>}
                  {c.recordingUrl && (
                    <audio controls src={c.recordingUrl} style={{ height: 26, marginLeft: 'auto', maxWidth: 220 }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
