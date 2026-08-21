import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, Briefcase, CheckCircle, XCircle, Target, FileCheck,
  Building2, Wallet, ArrowRight, Upload, ChevronDown,
} from 'lucide-react'
import api from '../api/client'
import { formatCurrency } from '../utils/formatCurrency'
import { exportCSV, exportXLSX, exportJSON, exportPDF } from '../utils/exportUtils'
import DealImportModal from '../components/modals/DealImportModal'
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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
// Year list is generated around the current year rather than hardcoded so it
// never goes stale.
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 7 }, (_, i) => CURRENT_YEAR - 5 + i)

// Columns written to every export format. Covers all Deal fields the system
// stores, with the company/owner relations flattened to their names.
const EXPORT_COLUMNS = [
  { key: 'title',               header: 'Title' },
  { key: '_companyName',        header: 'Company' },
  { key: 'companyName',         header: 'Company Name (text)' },
  { key: 'domainName',          header: 'Domain Name' },
  { key: 'stage',               header: 'Stage' },
  { key: 'value',               header: 'Value' },
  { key: 'currency',            header: 'Currency' },
  { key: 'country',             header: 'Country' },
  { key: 'clientType',          header: 'Client Type' },
  { key: 'contactPerson',       header: 'Contact Person' },
  { key: 'contactPhone',        header: 'Contact Phone' },
  { key: 'contactEmail',        header: 'Contact Email' },
  { key: 'serviceRequirement',  header: 'Service Requirement' },
  { key: 'clientWebsiteUrl',    header: 'Client Website URL' },
  { key: 'opportunityType',     header: 'Opportunity Type' },
  { key: 'strategicImportance', header: 'Strategic Importance' },
  { key: 'expectedOutcome',     header: 'Expected Outcome' },
  { key: '_poc',                header: 'POC' },
  { key: '_proposalShared',     header: 'Proposal Shared' },
  { key: '_openDate',           header: 'Deal Open Date' },
  { key: '_pocReceivedDate',    header: 'POC Received Date' },
  { key: '_pocDeliveredDate',   header: 'POC Delivered Date' },
  { key: '_ownerName',          header: 'Deal Owner' },
  { key: 'notes',               header: 'Notes' },
  { key: '_createdAt',          header: 'Created Date' },
]

const dateOnly = (v) => (v ? String(v).slice(0, 10) : '')

// Export menu — reuses the shared exportUtils helpers (the same ones the
// Companies list uses), fed by GET /api/deals/export so it always covers every
// deal, not just what happens to be loaded on screen.
function DealExportMenu() {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const run = async (fn, extraArgs = []) => {
    setOpen(false); setExporting(true)
    try {
      const { data } = await api.get('/deals/export')
      const records = (data.deals || []).map(d => ({
        ...d,
        _companyName: d.company?.name || '',
        _ownerName: d.owner?.name || '',
        _poc: d.poc ? 'Yes' : 'No',
        _proposalShared: d.proposalShared ? 'Yes' : 'No',
        _openDate: dateOnly(d.openDate),
        _pocReceivedDate: dateOnly(d.pocReceivedDate),
        _pocDeliveredDate: dateOnly(d.pocDeliveredDate),
        _createdAt: dateOnly(d.createdAt),
      }))
      fn(records, 'deals', EXPORT_COLUMNS, ...extraArgs)
    } catch {
      // fetch failed — nothing to export; same lightweight handling the
      // Companies export menu uses.
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={exporting}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, color: '#334155', cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
      >
        <Upload size={13} /> {exporting ? 'Exporting…' : 'Export'} <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 3000, minWidth: 170, overflow: 'hidden' }}>
          {[
            { label: 'Export as CSV',   fn: () => run(exportCSV) },
            { label: 'Export as Excel', fn: () => run(exportXLSX, ['Deals']) },
            { label: 'Export as JSON',  fn: () => run(exportJSON) },
            { label: 'Export as PDF',   fn: () => run(exportPDF, ['Deals Export — NXT MarketingWiz']) },
          ].map(item => (
            <button key={item.label} onClick={item.fn}
              style={{ display: 'block', width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', textAlign: 'left', fontSize: 13, color: '#334155', cursor: 'pointer', fontFamily: 'DM Sans,system-ui,sans-serif' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DealsDashboard() {
  const navigate = useNavigate()
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  // Month/Year filter - reports on Deal Open Date (see /dashboard/deal-stats).
  // '' means "no filter"; a month can only be chosen once a year is set.
  const [year, setYear]   = useState('')
  const [month, setMonth] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.get('/dashboard/deal-stats', {
      params: { ...(year && { year }), ...(year && month && { month }) },
    })
      .then(r => { if (alive) setStats(r.data) })
      .catch(err => { if (alive) setError(err?.response?.data?.message || 'Could not load deal statistics.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [year, month, reloadKey])

  const cards = [
    { label: 'Total Deals',        value: stats?.totalDeals,          Icon: TrendingUp, color: '#fef9ee', iconColor: '#f59e0b', to: '/deals' },
    { label: 'Active Deals',       value: stats?.activeDeals,         Icon: Briefcase,  color: '#f0fdf4', iconColor: '#22c55e', to: '/deals?focus=active' },
    { label: 'Won Deals',          value: stats?.wonDeals,            Icon: CheckCircle, color: '#fff1f2', iconColor: '#e63329', to: '/deals?focus=won' },
    { label: 'Lost Deals',         value: stats?.lostDeals,           Icon: XCircle,    color: '#fef2f2', iconColor: '#ef4444', to: '/deals?focus=lost' },
    { label: 'POC',                value: stats?.pocDeals,            Icon: Target,     color: '#eff6ff', iconColor: '#3b82f6', to: '/deals?focus=poc' },
    { label: 'Proposal Shared',    value: stats?.proposalSharedDeals, Icon: FileCheck,  color: '#f5f3ff', iconColor: '#8b5cf6', to: '/deals?focus=proposal' },
  ]

  // Carry the active period into the Deals list so a card's number and the
  // list it opens always agree.
  const period = year ? `&year=${year}${month ? `&month=${month}` : ''}` : ''
  const withPeriod = (to) => (period ? (to.includes('?') ? to + period : to + '?' + period.slice(1)) : to)

  const maxStage = Math.max(1, ...(stats?.stageBreakdown || []).map(s => s.count))

  return (
    <div className="dashboard">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 className="dash-greeting">Deals Dashboard</h1>
          <p className="dash-sub">Pipeline metrics at a glance — click any card to open the matching deals.</p>
        </div>

        {/* Month / Year filter — reports on Deal Open Date, not the date the
            record was created. Month is only selectable once a year is chosen,
            since "March" alone has no meaning here. */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Import / Export — same export helpers the Companies list uses. */}
          <button
            onClick={() => setShowImport(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, color: '#334155', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Upload size={13} /> Import
          </button>
          <DealExportMenu />

          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginLeft: 6 }}>Deal Open Date</span>
          <select
            value={year}
            onChange={e => { setYear(e.target.value); if (!e.target.value) setMonth('') }}
            style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', color: '#0f172a', background: '#fff' }}
          >
            <option value="">All years</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            disabled={!year}
            title={year ? undefined : 'Choose a year first'}
            style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', color: year ? '#0f172a' : '#94a3b8', background: year ? '#fff' : '#f8fafc' }}
          >
            <option value="">All months</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          {year && (
            <button
              onClick={() => { setYear(''); setMonth('') }}
              style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, padding: '7px 11px', fontSize: 12.5, fontWeight: 600, color: '#334155', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {stats?.filter && stats.undatedDeals > 0 && (
        <div style={{ fontSize: 12.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '9px 12px' }}>
          Showing deals whose <strong>Deal Open Date</strong> falls in{' '}
          {stats.filter.month ? `${MONTHS[stats.filter.month - 1]} ` : ''}{stats.filter.year}.
          {' '}{stats.undatedDeals} deal{stats.undatedDeals === 1 ? ' has' : 's have'} no Deal Open Date set and
          {stats.undatedDeals === 1 ? ' is' : ' are'} excluded from these figures.
        </div>
      )}

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
            onClick={() => navigate(withPeriod(to))}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(withPeriod(to)) } }}
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

      <DealImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => setReloadKey(k => k + 1)}
      />
    </div>
  )
}
