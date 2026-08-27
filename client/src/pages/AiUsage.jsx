import { useState, useEffect, useRef, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
import {
  BarChart3, RefreshCw, Loader2, AlertCircle, Coins,
  ArrowDownToLine, ArrowUpFromLine, Layers, Sparkles, Users,
} from 'lucide-react'
import { fetchAiUsageSummary, featureLabel } from '../utils/aiUsage'
import '../styles/ai-usage.css'

Chart.register(...registerables)

// AI Usage Dashboard (Marketing → AI Usage).
//
// Reads the existing per-user AiUsage data through the existing
// /api/ai-usage/summary route — all aggregation and cost estimation happen
// server-side, so this page never downloads individual usage rows beyond the
// small "recent requests" list.
//
// Cost figures are ESTIMATES computed from published provider rates
// (server/src/utils/aiPricing.js). Token counts are recorded verbatim from the
// providers and are never modified by costing.

const RANGES = [
  { value: 7,     label: '7 Days'   },
  { value: 30,    label: '30 Days'  },
  { value: 90,    label: '90 Days'  },
  { value: 365,   label: '365 Days' },
  { value: 'all', label: 'All Time' },
]

const n = (v) => (v || 0).toLocaleString('en-IN')

// Sub-cent AI calls are normal, so small amounts keep 4 decimals rather than
// rounding to $0.00 and looking free.
function money(v) {
  const x = Number(v) || 0
  if (x === 0) return '$0.00'
  if (x < 0.01) return '$' + x.toFixed(4)
  return '$' + x.toFixed(2)
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

// Renders a cost cell, or an explicit "Pricing unavailable" when no rate is
// known — never a fabricated 0.
function CostCell({ priced, value, pricingComplete }) {
  if (!priced) return <span className="aiu-na">Pricing unavailable</span>
  return (
    <span className="aiu-cost">
      {money(value)}
      {pricingComplete === false && <span className="aiu-badge aiu-badge-partial" style={{ marginLeft: 6 }}>partial</span>}
    </span>
  )
}

function useChart(canvasRef, config, deps) {
  const instance = useRef(null)
  useEffect(() => {
    if (!canvasRef.current || !config) return
    if (instance.current) instance.current.destroy()
    instance.current = new Chart(canvasRef.current, config)
    return () => { if (instance.current) { instance.current.destroy(); instance.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

// Shared light-theme chart options so both charts read identically.
const axisTicks = { color: '#8B96A8', font: { family: 'Inter', size: 10 } }
const gridLine = { color: 'rgba(15, 34, 74, 0.07)' }
const tooltipStyle = {
  backgroundColor: '#071B52', titleColor: '#FFFFFF', bodyColor: '#DCE6FF',
  borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, padding: 10,
}

export default function AiUsage() {
  const [range, setRange]     = useState(30)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const tokenCanvas = useRef(null)
  const costCanvas  = useRef(null)

  const load = useCallback((r) => {
    setLoading(true); setError('')
    fetchAiUsageSummary(r)
      .then(setData)
      .catch(err => { setError(err?.response?.data?.message || 'Could not load AI usage.'); setData(null) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(range) }, [range, load])

  const daily = data?.daily || []
  const hasDaily = daily.length > 0
  const dailyKey = JSON.stringify(daily.map(d => [d.day, d.promptTokens, d.outputTokens, d.totalCost]))

  // A. Token consumption over time — input vs output, stacked.
  useChart(tokenCanvas, hasDaily ? {
    type: 'bar',
    data: {
      labels: daily.map(d => d.day),
      datasets: [
        { label: 'Input tokens',  data: daily.map(d => d.promptTokens), backgroundColor: '#3267E3', borderRadius: 5, stack: 't' },
        { label: 'Output tokens', data: daily.map(d => d.outputTokens), backgroundColor: '#8065DE', borderRadius: 5, stack: 't' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#68758A', font: { family: 'Inter', size: 10 }, boxWidth: 10, usePointStyle: true } },
        tooltip: tooltipStyle,
      },
      scales: {
        x: { stacked: true, grid: gridLine, ticks: axisTicks },
        y: { stacked: true, beginAtZero: true, grid: gridLine, ticks: { ...axisTicks, precision: 0 } },
      },
    },
  } : null, [dailyKey])

  // B. Estimated cost over time.
  useChart(costCanvas, hasDaily ? {
    type: 'line',
    data: {
      labels: daily.map(d => d.day),
      datasets: [{
        label: 'Estimated cost (USD)',
        data: daily.map(d => d.totalCost),
        borderColor: '#20A875',
        backgroundColor: 'rgba(32, 168, 117, 0.10)',
        fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: '#20A875',
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#68758A', font: { family: 'Inter', size: 10 }, boxWidth: 10, usePointStyle: true } },
        tooltip: {
          ...tooltipStyle,
          callbacks: { label: (c) => ' Estimated cost: ' + money(c.parsed.y) },
        },
      },
      scales: {
        x: { grid: gridLine, ticks: axisTicks },
        y: { beginAtZero: true, grid: gridLine, ticks: { ...axisTicks, callback: (v) => money(v) } },
      },
    },
  } : null, [dailyKey])

  const t = data?.totals

  return (
    <div className="aiu-root">
      <section className="aiu-header">
        <div>
          <div className="aiu-eyebrow"><Sparkles size={13} /> AI operations</div>
          <h1 className="aiu-title">AI usage &amp; spend</h1>
          <div className="aiu-sub">Understand token consumption, feature adoption and estimated AI cost across your workspace.</div>
        </div>
        <div className="aiu-header-actions">
          <div className="aiu-range">
            {RANGES.map(r => (
              <button
                key={r.value}
                className={range === r.value ? 'active' : ''}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button className="aiu-icon-btn" onClick={() => load(range)} disabled={loading}>
            {loading
              ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>
      </section>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {error && (
        <div className="aiu-error" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>{error}</span>
        </div>
      )}

      {loading && !data && <div className="aiu-empty">Loading AI usage…</div>}

      {data && (
        <>
          {/* ── Summary cards ── */}
          <div className="aiu-cards">
            <div className="aiu-card">
              <div className="aiu-card-label"><Layers size={12} /> Total Tokens</div>
              <div className="aiu-card-value">{n(t.totalTokens)}</div>
              <div className="aiu-card-note">All time: {n(data.allTime.totalTokens)}</div>
            </div>
            <div className="aiu-card">
              <div className="aiu-card-label"><ArrowDownToLine size={12} /> Input Tokens</div>
              <div className="aiu-card-value">{n(t.promptTokens)}</div>
              <div className="aiu-card-note">{t.priced ? 'Cost ' + money(t.inputCost) : 'Pricing unavailable'}</div>
            </div>
            <div className="aiu-card">
              <div className="aiu-card-label"><ArrowUpFromLine size={12} /> Output Tokens</div>
              <div className="aiu-card-value">{n(t.outputTokens)}</div>
              <div className="aiu-card-note">{t.priced ? 'Cost ' + money(t.outputCost) : 'Pricing unavailable'}</div>
            </div>
            <div className="aiu-card">
              <div className="aiu-card-label"><Sparkles size={12} /> AI Requests</div>
              <div className="aiu-card-value">{n(t.requests)}</div>
              <div className="aiu-card-note">All time: {n(data.allTime.requests)}</div>
            </div>
            <div className="aiu-card">
              <div className="aiu-card-label"><Coins size={12} /> Estimated Cost</div>
              <div className={`aiu-card-value aiu-cost-value${t.priced ? '' : ' unavailable'}`}>
                {t.priced ? money(t.totalCost) : 'N/A'}
              </div>
              <div className="aiu-card-note">
                {!t.priced
                  ? 'No known pricing for these models'
                  : t.pricingComplete
                    ? 'Input + output, published rates'
                    : `${n(t.unpricedRequests)} request(s) unpriced`}
              </div>
            </div>
          </div>

          {data.requestsWithoutUsageData > 0 && (
            <div className="aiu-warn">
              {n(data.requestsWithoutUsageData)} request{data.requestsWithoutUsageData === 1 ? '' : 's'} in this window
              returned no token metadata from the AI provider. They are counted as requests but contribute 0 tokens,
              so totals and cost understate actual consumption by that amount. Nothing is estimated to fill the gap.
            </div>
          )}

          {/* ── Charts ── */}
          <div className="aiu-grid-2">
            <div className="aiu-panel">
              <div className="aiu-panel-title"><BarChart3 size={14} color="#38BDF8" /> Token Consumption Over Time</div>
              {hasDaily
                ? <div className="aiu-chart"><canvas ref={tokenCanvas} /></div>
                : <div className="aiu-empty">No usage in this period.</div>}
            </div>
            <div className="aiu-panel">
              <div className="aiu-panel-title"><Coins size={14} color="#34D399" /> Estimated AI Cost Over Time</div>
              {hasDaily
                ? <div className="aiu-chart"><canvas ref={costCanvas} /></div>
                : <div className="aiu-empty">No usage in this period.</div>}
            </div>
          </div>

          <div className="aiu-breakdown-grid">
          {/* ── Usage by feature ── */}
          <div className="aiu-panel">
            <div className="aiu-panel-title"><Sparkles size={14} color="#A78BFA" /> Usage by Feature</div>
            {data.byFeature.length === 0 ? <div className="aiu-empty">No AI usage recorded yet.</div> : (
              <div className="aiu-table-wrap">
                <table className="aiu-table">
                  <thead><tr>
                    <th>Feature</th><th className="aiu-num">Requests</th><th className="aiu-num">Input</th>
                    <th className="aiu-num">Output</th><th className="aiu-num">Total</th><th className="aiu-num">Estimated Cost</th>
                  </tr></thead>
                  <tbody>
                    {data.byFeature.map(f => (
                      <tr key={f.feature}>
                        <td>{featureLabel(f.feature)}</td>
                        <td className="aiu-num aiu-dim">{n(f.requests)}</td>
                        <td className="aiu-num aiu-dim">{n(f.promptTokens)}</td>
                        <td className="aiu-num aiu-dim">{n(f.outputTokens)}</td>
                        <td className="aiu-num aiu-strong">{n(f.totalTokens)}</td>
                        <td className="aiu-num"><CostCell priced={f.priced} value={f.totalCost} pricingComplete={f.pricingComplete} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Usage by model ── */}
          <div className="aiu-panel">
            <div className="aiu-panel-title"><Layers size={14} color="#FBBF24" /> Usage by Model</div>
            {data.byModel.length === 0 ? <div className="aiu-empty">No AI usage recorded yet.</div> : (
              <div className="aiu-table-wrap">
                <table className="aiu-table">
                  <thead><tr>
                    <th>Model</th><th>Provider</th><th className="aiu-num">Requests</th><th className="aiu-num">Input</th>
                    <th className="aiu-num">Output</th><th className="aiu-num">Total</th><th className="aiu-num">Estimated Cost</th>
                  </tr></thead>
                  <tbody>
                    {data.byModel.map(m => (
                      <tr key={m.provider + m.model}>
                        <td>{m.model}</td>
                        <td className="aiu-dim">{m.provider}</td>
                        <td className="aiu-num aiu-dim">{n(m.requests)}</td>
                        <td className="aiu-num aiu-dim">{n(m.promptTokens)}</td>
                        <td className="aiu-num aiu-dim">{n(m.outputTokens)}</td>
                        <td className="aiu-num aiu-strong">{n(m.totalTokens)}</td>
                        <td className="aiu-num"><CostCell priced={m.priced} value={m.totalCost} pricingComplete={m.pricingComplete} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          </div>

          {/* ── Usage by user ── */}
          {/* This CRM shares one AI configuration across everyone, so the
              dashboard reports the whole company's consumption; this panel is
              what breaks that shared total back down per person. */}
          <div className="aiu-panel">
            <div className="aiu-panel-title"><Users size={14} color="#F472B6" /> Usage by User</div>
            {(data.byUser || []).length === 0 ? <div className="aiu-empty">No AI usage recorded yet.</div> : (
              <div className="aiu-table-wrap">
                <table className="aiu-table">
                  <thead><tr>
                    <th>User</th><th className="aiu-num">Requests</th><th className="aiu-num">Input</th>
                    <th className="aiu-num">Output</th><th className="aiu-num">Total</th><th className="aiu-num">Estimated Cost</th>
                  </tr></thead>
                  <tbody>
                    {data.byUser.map(u => (
                      <tr key={u.userId}>
                        <td>
                          {u.name}
                          {u.email && <span className="aiu-dim" style={{ marginLeft: 6, fontSize: 14.5 }}>{u.email}</span>}
                        </td>
                        <td className="aiu-num aiu-dim">{n(u.requests)}</td>
                        <td className="aiu-num aiu-dim">{n(u.promptTokens)}</td>
                        <td className="aiu-num aiu-dim">{n(u.outputTokens)}</td>
                        <td className="aiu-num aiu-strong">{n(u.totalTokens)}</td>
                        <td className="aiu-num"><CostCell priced={u.priced} value={u.totalCost} pricingComplete={u.pricingComplete} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Recent requests ── */}
          <div className="aiu-panel">
            <div className="aiu-panel-title"><BarChart3 size={14} color="#2DD4BF" /> Usage Summary — Recent Requests</div>
            {data.recent.length === 0 ? <div className="aiu-empty">No AI usage recorded yet.</div> : (
              <div className="aiu-table-wrap">
                <table className="aiu-table">
                  <thead><tr>
                    <th>Date / Time</th><th>User</th><th>Feature</th><th>Provider</th><th>Model</th>
                    <th className="aiu-num">Input</th><th className="aiu-num">Output</th>
                    <th className="aiu-num">Total</th><th className="aiu-num">Estimated Cost</th>
                  </tr></thead>
                  <tbody>
                    {data.recent.map(r => (
                      <tr key={r.id}>
                        <td className="aiu-dim">{fmtDateTime(r.createdAt)}</td>
                        <td title={r.userEmail || undefined}>{r.userName}</td>
                        <td>{featureLabel(r.feature)}</td>
                        <td className="aiu-dim">{r.provider}</td>
                        <td className="aiu-dim">{r.model}</td>
                        <td className="aiu-num aiu-dim">{n(r.promptTokens)}</td>
                        <td className="aiu-num aiu-dim">{n(r.outputTokens)}</td>
                        <td className="aiu-num aiu-strong">
                          {r.hasUsageData
                            ? n(r.totalTokens)
                            : <span className="aiu-na" title="Provider returned no token metadata">unavailable</span>}
                        </td>
                        <td className="aiu-num"><CostCell priced={r.priced} value={r.totalCost} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="aiu-note">
            Token counts are reported by the AI provider itself. This CRM uses one shared AI configuration for
            everyone, so these figures cover <strong>all users</strong> — the totals above are the whole
            application's consumption, not just yours. Costs are <strong>estimates</strong> calculated from the providers' published per-model
            rates; they exclude tiered/long-context, audio, batch and cache-discount pricing, and a model with no
            known rate is shown as “Pricing unavailable” rather than being guessed at.
          </div>
        </>
      )}
    </div>
  )
}
