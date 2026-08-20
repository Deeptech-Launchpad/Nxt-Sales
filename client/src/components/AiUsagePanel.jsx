import { useState, useEffect, useCallback } from 'react'
import { BarChart3, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import { fetchAiUsageSummary, featureLabel } from '../utils/aiUsage'

// AI Usage / Token Consumption panel (Email Tool → Settings).
//
// Every figure shown comes from the usage metadata the AI provider itself
// returned and was persisted server-side per user — nothing is estimated here.
// Cost is deliberately NOT shown: the Gemini/OpenAI/Anthropic generateContent
// responses carry token counts but no pricing, so any cost figure would be an
// invented number.

const WINDOWS = [
  { days: 7,   label: '7 days'  },
  { days: 30,  label: '30 days' },
  { days: 90,  label: '90 days' },
  { days: 365, label: '1 year'  },
]

const n = (v) => (v || 0).toLocaleString('en-IN')

function fmtDateTime(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const CARD = {
  flex: 1, minWidth: 120, background: '#f8fafc', border: '1px solid #e2e8f0',
  borderRadius: 8, padding: '10px 12px',
}
const CARD_LABEL = { fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }
const CARD_VALUE = { fontSize: 19, fontWeight: 700, color: '#0f172a', marginTop: 2 }
const TH = { textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }
const TD = { fontSize: 12.5, color: '#0f172a', padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }
const NUM = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const SECTION_TITLE = { fontSize: 11.5, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '.4px', margin: '18px 0 6px' }

function Table({ head, rows, empty }) {
  if (!rows.length) return <div style={{ fontSize: 12.5, color: '#94a3b8', padding: '4px 2px' }}>{empty}</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{head.map((h, i) => (
          <th key={i} style={{ ...TH, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
        ))}</tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  )
}

export default function AiUsagePanel() {
  const [days, setDays]       = useState(30)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const load = useCallback((d) => {
    setLoading(true); setError('')
    fetchAiUsageSummary(d)
      .then(setData)
      .catch(err => setError(err?.response?.data?.message || 'Could not load AI usage.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(days) }, [days, load])

  const t = data?.totals

  return (
    <div className="et-settings-card">
      <div className="et-settings-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <BarChart3 size={15} color="#0d9488" />
        AI Usage &amp; Token Consumption
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            className="et-input"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
            value={days}
            onChange={e => setDays(Number(e.target.value))}
          >
            {WINDOWS.map(w => <option key={w.days} value={w.days}>Last {w.label}</option>)}
          </select>
          <button className="et-btn" style={{ flex: 'none', padding: '5px 10px' }} onClick={() => load(days)} disabled={loading}>
            {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '9px 12px' }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>{error}</span>
        </div>
      )}

      {loading && !data && <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Loading usage…</div>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={CARD}><div style={CARD_LABEL}>Total tokens</div><div style={CARD_VALUE}>{n(t.totalTokens)}</div></div>
            <div style={CARD}><div style={CARD_LABEL}>Input tokens</div><div style={CARD_VALUE}>{n(t.promptTokens)}</div></div>
            <div style={CARD}><div style={CARD_LABEL}>Output tokens</div><div style={CARD_VALUE}>{n(t.outputTokens)}</div></div>
            <div style={CARD}><div style={CARD_LABEL}>AI requests</div><div style={CARD_VALUE}>{n(t.requests)}</div></div>
          </div>

          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
            Your usage only, for the selected window. All time: {n(data.allTime.totalTokens)} tokens across {n(data.allTime.requests)} requests.
          </div>

          {data.requestsWithoutUsageData > 0 && (
            <div style={{ fontSize: 11.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', marginTop: 8 }}>
              {n(data.requestsWithoutUsageData)} request{data.requestsWithoutUsageData === 1 ? '' : 's'} in this window returned
              no token metadata from the AI provider. They are counted as requests but contribute 0 tokens, so the totals above
              understate actual consumption by that amount. Nothing is estimated to fill the gap.
            </div>
          )}

          <div style={SECTION_TITLE}>Usage by feature</div>
          <Table
            head={['Feature', 'Requests', 'Input', 'Output', 'Total']}
            empty="No AI usage recorded yet."
            rows={data.byFeature.map(f => (
              <tr key={f.feature}>
                <td style={TD}>{featureLabel(f.feature)}</td>
                <td style={NUM}>{n(f.requests)}</td>
                <td style={NUM}>{n(f.promptTokens)}</td>
                <td style={NUM}>{n(f.outputTokens)}</td>
                <td style={{ ...NUM, fontWeight: 600 }}>{n(f.totalTokens)}</td>
              </tr>
            ))}
          />

          <div style={SECTION_TITLE}>Usage by model</div>
          <Table
            head={['Model', 'Requests', 'Input', 'Output', 'Total']}
            empty="No AI usage recorded yet."
            rows={data.byModel.map(m => (
              <tr key={m.provider + m.model}>
                <td style={TD}>{m.model} <span style={{ color: '#94a3b8', fontSize: 11 }}>({m.provider})</span></td>
                <td style={NUM}>{n(m.requests)}</td>
                <td style={NUM}>{n(m.promptTokens)}</td>
                <td style={NUM}>{n(m.outputTokens)}</td>
                <td style={{ ...NUM, fontWeight: 600 }}>{n(m.totalTokens)}</td>
              </tr>
            ))}
          />

          <div style={SECTION_TITLE}>Daily history</div>
          <Table
            head={['Date', 'Requests', 'Input', 'Output', 'Total']}
            empty="No AI usage recorded yet."
            rows={data.daily.map(d => (
              <tr key={d.day}>
                <td style={TD}>{d.day}</td>
                <td style={NUM}>{n(d.requests)}</td>
                <td style={NUM}>{n(d.promptTokens)}</td>
                <td style={NUM}>{n(d.outputTokens)}</td>
                <td style={{ ...NUM, fontWeight: 600 }}>{n(d.totalTokens)}</td>
              </tr>
            ))}
          />

          <div style={SECTION_TITLE}>Recent AI requests</div>
          <Table
            head={['When', 'Feature', 'Model', 'Input', 'Output', 'Total']}
            empty="No AI usage recorded yet."
            rows={data.recent.map(r => (
              <tr key={r.id}>
                <td style={TD}>{fmtDateTime(r.createdAt)}</td>
                <td style={TD}>{featureLabel(r.feature)}</td>
                <td style={TD}>{r.model}</td>
                <td style={NUM}>{n(r.promptTokens)}</td>
                <td style={NUM}>{n(r.outputTokens)}</td>
                <td style={{ ...NUM, fontWeight: 600 }}>
                  {r.hasUsageData ? n(r.totalTokens) : <span style={{ color: '#b45309' }} title="Provider returned no token metadata">n/a</span>}
                </td>
              </tr>
            ))}
          />

          <div style={{ fontSize: 11, color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 14 }}>
            Token counts are reported by the AI provider itself and stored per user on the server, so they persist across
            refreshes and devices. Cost is not shown because the AI APIs return token counts but no pricing — showing a
            figure would mean inventing it.
          </div>
        </>
      )}
    </div>
  )
}
