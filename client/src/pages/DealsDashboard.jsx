import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, Briefcase, CheckCircle, XCircle, Target, FileCheck,
  Building2, Wallet, ArrowRight,
} from 'lucide-react'
import api from '../api/client'
import { formatCurrency } from '../utils/formatCurrency'
import '../styles/dashboard.css'

// Deals Dashboard — every deal-specific metric, moved off the Main Dashboard
// so that page stays a general overview and these live in one place.
//
// Figures come from GET /api/dashboard/deal-stats, which counts DB-side. The
// Main Dashboard previously derived its deal cards by fetching the entire
// /deals list into the browser; this deliberately does not repeat that.
//
// Every card is clickable and deep-links into the Deals list with a `focus`
// query param (see FOCUS_FILTERS in Deals.jsx), so "POC = 63" opens exactly
// those 63 deals rather than the unfiltered list.

export default function DealsDashboard() {
  const navigate = useNavigate()
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    let alive = true
    api.get('/dashboard/deal-stats')
      .then(r => { if (alive) setStats(r.data) })
      .catch(err => { if (alive) setError(err?.response?.data?.message || 'Could not load deal statistics.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const cards = [
    { label: 'Total Deals',        value: stats?.totalDeals,          Icon: TrendingUp, color: '#fef9ee', iconColor: '#f59e0b', to: '/deals' },
    { label: 'Active Deals',       value: stats?.activeDeals,         Icon: Briefcase,  color: '#f0fdf4', iconColor: '#22c55e', to: '/deals?focus=active' },
    { label: 'Won Deals',          value: stats?.wonDeals,            Icon: CheckCircle, color: '#fff1f2', iconColor: '#e63329', to: '/deals?focus=won' },
    { label: 'Lost Deals',         value: stats?.lostDeals,           Icon: XCircle,    color: '#fef2f2', iconColor: '#ef4444', to: '/deals?focus=lost' },
    { label: 'POC',                value: stats?.pocDeals,            Icon: Target,     color: '#eff6ff', iconColor: '#3b82f6', to: '/deals?focus=poc' },
    { label: 'Proposal Shared',    value: stats?.proposalSharedDeals, Icon: FileCheck,  color: '#f5f3ff', iconColor: '#8b5cf6', to: '/deals?focus=proposal' },
    // Was on the Main Dashboard's KPI row; deal-specific, so it moved here.
    { label: 'Deals in Progress',  value: stats?.activeDeals,         Icon: Briefcase,  color: '#ecfeff', iconColor: '#06b6d4', to: '/deals?focus=active' },
    { label: 'Won Clients (Month)', value: stats?.wonClientsThisMonth, Icon: CheckCircle, color: '#f0fdf4', iconColor: '#16a34a', to: '/deals?focus=won' },
  ]

  const maxStage = Math.max(1, ...(stats?.stageBreakdown || []).map(s => s.count))

  return (
    <div className="dashboard">
      <div>
        <h1 className="dash-greeting">Deals Dashboard</h1>
        <p className="dash-sub">Pipeline metrics at a glance — click any card to open the matching deals.</p>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 13px' }}>
          {error}
        </div>
      )}

      <div className="stats-grid">
        {cards.map(({ label, value, Icon, color, iconColor, to }) => (
          <div
            key={label}
            className="stat-card"
            role="button"
            tabIndex={0}
            title={`View ${label}`}
            onClick={() => navigate(to)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(to) } }}
            style={{ cursor: 'pointer', transition: 'transform .12s, box-shadow .12s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.10)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '' }}
          >
            <div className="stat-icon-wrap" style={{ background: color }}>
              <Icon size={17} color={iconColor} />
            </div>
            <div className="stat-value">{loading ? '—' : (value ?? 0)}</div>
            <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {label} <ArrowRight size={11} color="#cbd5e1" />
            </div>
          </div>
        ))}
      </div>

      <div className="dash-row">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Deals by Stage</span>
            <button className="panel-link" onClick={() => navigate('/deals')}>View all</button>
          </div>
          <div style={{ padding: '4px 0' }}>
            {loading ? (
              <p className="activity-time" style={{ padding: '8px 0' }}>Loading…</p>
            ) : (stats?.stageBreakdown || []).length === 0 ? (
              <p className="activity-time" style={{ padding: '8px 0' }}>No deals yet.</p>
            ) : stats.stageBreakdown.map(s => (
              <div key={s.stage} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                <span style={{ fontSize: 13, color: '#334155', width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.stage}
                </span>
                <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ width: `${(s.count / maxStage) * 100}%`, height: '100%', background: '#3b82f6', borderRadius: 99 }} />
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a', width: 40, textAlign: 'right' }}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Recent Deals</span>
            <button className="panel-link" onClick={() => navigate('/deals')}>View all</button>
          </div>
          <div className="activity-list">
            {loading ? (
              <p className="activity-time" style={{ padding: '8px 0' }}>Loading…</p>
            ) : (stats?.recent || []).length === 0 ? (
              <p className="activity-time" style={{ padding: '8px 0' }}>No deals yet.</p>
            ) : stats.recent.map(d => (
              <div
                key={d.id}
                className="activity-item"
                style={{ cursor: d.company?.id ? 'pointer' : 'default' }}
                onClick={() => d.company?.id && navigate(`/companies/${d.company.id}`)}
              >
                <div className="activity-dot" style={{ background: '#fef9ee' }}>
                  <TrendingUp size={15} color="#f59e0b" />
                </div>
                <div className="activity-body">
                  <p className="activity-text"><strong>{d.title}</strong> — {d.stage}</p>
                  <p className="activity-time">
                    {d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                    {d.company?.name ? ` · ${d.company.name}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><span className="panel-title">Pipeline Summary</span></div>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', padding: '10px 0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Wallet size={16} color="#16a34a" />
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Total Pipeline Value</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                {loading ? '—' : formatCurrency(stats?.totalValue || 0, 'USD')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Building2 size={16} color="#8b5cf6" />
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>Deals With No Company</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{loading ? '—' : (stats?.dealsWithoutCompany ?? 0)}</div>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6 }}>
          A deal's company link is optional, so deals with no company never appear under any company record —
          this is why the deal count and the “companies with a deal” count legitimately differ.
        </p>
      </div>
    </div>
  )
}
