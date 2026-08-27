import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import CreateDealModal from '../components/modals/CreateDealModal'
import ViewDealModal from '../components/modals/ViewDealModal'
import DealImportModal from '../components/modals/DealImportModal'
import EditColumnsMenu from '../components/EditColumnsMenu'
import DealBoard from '../components/DealBoard'
import FilterDropdown from '../components/filters/FilterDropdown'
import DateFilterDropdown, { describeDateToken } from '../components/filters/DateFilterDropdown'
import { useDropdownOptions } from '../hooks/useDropdownOptions'
import { renderCustomCell } from '../utils/customFieldRender'
import { formatCurrency } from '../utils/formatCurrency'
import { dealFlagsLabel } from '../utils/dealFlags'
import { exportCSV, exportXLSX, exportJSON, exportPDF } from '../utils/exportUtils'
import '../styles/deals.css'

const COLUMNS_STORAGE_KEY = 'mwz_deals_visible_columns'

// The two columns the table always leads with, in this order: Company name
// first, then Deal name. Pinned rather than toggleable, so neither can be
// switched off and leave the row without an identity.
const PINNED_COLUMN_KEYS = ['companyName', 'title']
const VIEW_STORAGE_KEY = 'mwz_deals_view_mode'

const DEFAULT_COLUMNS = [
  'companyName', 'clientType', 'contactPerson', 'serviceRequirement',
  'opportunityType', 'stage', 'strategicImportance', 'expectedOutcome',
  'value', '_flags',
]

const BOARD_COLUMNS_STORAGE_KEY = 'mwz_deals_board_visible_columns'
const DEFAULT_BOARD_COLUMNS = ['companyName', 'contactPerson', '_flags', 'value', 'ownerId']

const DEAL_OWNER_COLUMN = { key: 'ownerId', label: 'Deal Owner' }
const DEAL_FLAGS_COLUMN = { key: '_flags', label: 'POC / Proposal Shared' }
const POC_OPTIONS      = [{ value: 'yes', label: 'POC done' }, { value: 'no', label: 'No POC' }]
const PROPOSAL_OPTIONS = [{ value: 'yes', label: 'Proposal shared' }, { value: 'no', label: 'Not shared' }]
const DATE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_7', label: 'Last 7 Days' },
  { value: 'last_14', label: 'Last 14 Days' },
  { value: 'last_30', label: 'Last 30 Days' },
  { value: 'last_90', label: 'Last 90 Days' },
  { value: 'last_365', label: 'Last 12 Months' },
]

function dateRangeForToken(token) {
  if (!token) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const plusDays = (date, days) => new Date(date.getTime() + days * 86400000)
  if (token === 'today') return [today, plusDays(today, 1)]
  if (token === 'yesterday') return [plusDays(today, -1), today]
  if (token === 'this_week') {
    const mondayOffset = (today.getDay() + 6) % 7
    const monday = plusDays(today, -mondayOffset)
    return [monday, plusDays(monday, 7)]
  }
  const relative = token.match(/^last_(\d+)$/)
  if (relative) return [new Date(now.getTime() - Number(relative[1]) * 86400000), new Date(now.getTime() + 1)]
  const range = token.match(/^(\d{4})-(\d{2})-(\d{2})\.\.(\d{4})-(\d{2})-(\d{2})$/)
  if (range) return [new Date(+range[1], +range[2] - 1, +range[3]), plusDays(new Date(+range[4], +range[5] - 1, +range[6]), 1)]
  const day = token.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (day) { const start = new Date(+day[1], +day[2] - 1, +day[3]); return [start, plusDays(start, 1)] }
  const month = token.match(/^(\d{4})-(\d{2})$/)
  if (month) return [new Date(+month[1], +month[2] - 1, 1), new Date(+month[1], +month[2], 1)]
  if (/^\d{4}$/.test(token)) return [new Date(+token, 0, 1), new Date(+token + 1, 0, 1)]
  return null
}
// A deal's Open Date is a calendar date, but it is stored as a timestamp. Read
// with local getters, 2025-02-01T00:00:00Z is 31 January in New York, so a deal
// opened on the 1st vanishes from its own month. Parsing the ISO date portion
// textually and rebuilding it as LOCAL midnight yields exactly the stored
// calendar date in every timezone, and matches the boundaries that
// dateRangeForToken produces.
function dealOpenLocalDate(value) {
  if (!value) return null
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

const MaterialIcon = ({ children }) => <span className="material-symbols-rounded" aria-hidden="true">{children}</span>

function DealExportMenu({ fetchAllForExport, columns }) {
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
      const records = await fetchAllForExport()
      fn(records, 'deals', columns, ...extraArgs)
    } catch {
      // fetch failed
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="deals-secondary-btn" onClick={() => setOpen(o => !o)} disabled={exporting}>
        <MaterialIcon>download</MaterialIcon> {exporting ? 'Exporting…' : 'Export'} <MaterialIcon>keyboard_arrow_down</MaterialIcon>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 3000, minWidth: 170, overflow: 'hidden' }}>
          {[
            { label: 'Export as CSV',   fn: () => run(exportCSV) },
            { label: 'Export as Excel', fn: () => run(exportXLSX, ['Deals']) },
            { label: 'Export as JSON',  fn: () => run(exportJSON) },
            { label: 'Export as PDF',   fn: () => run(exportPDF, ['Deals Export — NXT Sales']) },
          ].map(item => (
            <button key={item.label} onClick={item.fn}
              style={{ display: 'block', width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', textAlign: 'left', fontSize: 16, color: '#334155', cursor: 'pointer', fontFamily: 'DM Sans,system-ui,sans-serif' }}
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

export default function Deals() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [deals, setDeals]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editDeal, setEditDeal]   = useState(null)
  const [viewDeal, setViewDeal]   = useState(null)
  const [dealFields, setDealFields] = useState([])
  const [search, setSearch]       = useState('')
  const [countryFilter, setCountryFilter] = useState([])
  const [clientTypeFilter, setClientTypeFilter] = useState([])
  const [stageFilter, setStageFilter] = useState([])
  const [opportunityFilter, setOpportunityFilter] = useState([])
  const [strategicFilter, setStrategicFilter] = useState([])
  const [outcomeFilter, setOutcomeFilter] = useState([])
  const [pocFilter, setPocFilter] = useState([])
  const [proposalFilter, setProposalFilter] = useState([])
  const [openDateFilter, setOpenDateFilter] = useState([])
  const [remarksFilter, setRemarksFilter] = useState([])
  const [noCompanyFilter, setNoCompanyFilter] = useState(false)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const moreFiltersRef = useRef(null)
  const [dealsTab, setDealsTab]   = useState('all') // 'all' | 'mine'
  const [viewMode, setViewMode]   = useState(() => localStorage.getItem(VIEW_STORAGE_KEY) || 'list')

  // Same shared 'company.country' dropdown list CreateDealModal already uses
  // for a Deal's own (denormalized) country field — not a separate list.
  const { options: countryValues } = useDropdownOptions('company.country')
  // Same source as every other dropdown-backed filter on this page.
  const { options: remarksValues } = useDropdownOptions('company.remarks')
  const remarksOptions = remarksValues.map(o => ({ value: o.value, label: o.label }))
  const countryOptions = countryValues.map(o => ({ value: o.value, label: o.label }))
  // Client Type stores a stable value separate from its current display
  // label (Settings → Dropdown Lists can rename the label without touching
  // the stored value) — this table was rendering the raw stored value
  // directly, so it could show a different Client Type than Edit Deal's
  // <select> (which already resolves value -> current label). See the
  // matching fix/comment in ViewDealModal.jsx for the full explanation.
  const { options: clientTypeValues } = useDropdownOptions('deal.clientType')
  const { options: stageValues } = useDropdownOptions('deal.stage')
  const { options: opportunityValues } = useDropdownOptions('deal.opportunityType')
  const { options: strategicValues } = useDropdownOptions('deal.strategicImportance')
  const { options: outcomeValues } = useDropdownOptions('deal.expectedOutcome')

  const setView = (v) => { setViewMode(v); localStorage.setItem(VIEW_STORAGE_KEY, v) }

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

  const [boardVisibleColumns, setBoardVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BOARD_COLUMNS_STORAGE_KEY))
      return Array.isArray(saved) && saved.length ? saved : DEFAULT_BOARD_COLUMNS
    } catch {
      return DEFAULT_BOARD_COLUMNS
    }
  })
  const saveBoardVisibleColumns = (cols) => {
    setBoardVisibleColumns(cols)
    localStorage.setItem(BOARD_COLUMNS_STORAGE_KEY, JSON.stringify(cols))
  }

  useEffect(() => {
    api.get('/deals/import-fields').then(r => setDealFields(r.data.fields || [])).catch(() => {})
  }, [])

  const fetchDeals = useCallback(() => {
    setLoading(true)
    api.get('/deals', { params: { view: dealsTab === 'mine' ? 'mine' : undefined } })
      .then(r => setDeals(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDeals([]))
      .finally(() => setLoading(false))
  }, [dealsTab])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  // Deep-link from Deals Dashboard's stat cards (?focus=active|won|lost|poc|proposal)
  // — applied once stage options are loaded (needed to resolve "active" =
  // every stage except Won/Lost) and then stripped from the URL so it
  // doesn't reapply if the user later clears filters and navigates back
  // via browser history.
  useEffect(() => {
    const focus = new URLSearchParams(location.search).get('focus')
    if (!focus) return
    if (focus === 'won') setStageFilter(['Won'])
    else if (focus === 'lost') setStageFilter(['Lost'])
    else if (focus === 'active') {
      if (stageValues.length === 0) return // wait for the dropdown list to load
      setStageFilter(stageValues.map(s => s.value).filter(v => v !== 'Won' && v !== 'Lost'))
    }
    else if (focus === 'poc') setPocFilter(['yes'])
    else if (focus === 'proposal') setProposalFilter(['yes'])
    else if (focus === 'no_company') setNoCompanyFilter(true)
    navigate('/deals', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, stageValues])

  useEffect(() => {
    const close = (event) => { if (moreFiltersRef.current && !moreFiltersRef.current.contains(event.target)) setMoreFiltersOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const handleDelete = async (dealId) => {
    if (!window.confirm('Delete this deal? This action cannot be undone.')) return
    try {
      await api.delete(`/deals/${dealId}`)
      setDeals(prev => prev.filter(d => d.id !== dealId))
    } catch {
      // no-op — matches existing lightweight error handling style on this page
    }
  }

  // List view: clicking a deal's title opens its linked company; a deal
  // with no linked company has nowhere to navigate to, so it falls back to
  // the edit modal instead of a dead click. (Board view no longer uses
  // this — its card click opens the read-only ViewDealModal instead, with
  // company navigation as its own separate icon via goToDealCompany below.)
  const handleOpenDeal = (d) => {
    if (d.companyId) navigate(`/companies/${d.companyId}`)
    else setEditDeal(d)
  }

  // Board view's dedicated "go to company" icon — pure navigation, no
  // edit-modal fallback (the pencil icon already covers that separately).
  const goToDealCompany = (d) => {
    if (d.companyId) navigate(`/companies/${d.companyId}`)
  }

  // Drag-and-drop stage change (Board View) — optimistic update so the board
  // refreshes instantly with no page reload; rolled back if the save fails.
  const handleStageChange = async (deal, newStage) => {
    const prevStage = deal.stage
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage: newStage } : d))
    try {
      await api.put(`/deals/${deal.id}`, { stage: newStage })
    } catch {
      setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage: prevStage } : d))
    }
  }

  // "My Deals" scoping now happens server-side (GET /deals?view=mine, by the
  // deal's own ownerId) — see fetchDeals above. All Deals returns every
  // deal visible to the user with no further client-side owner filtering.

  // Search + Country filter both cover List and Board views identically —
  // Deals.jsx fetches its full dataset once (no server pagination, unlike
  // Companies.jsx) and filters client-side; Board view is handed this same
  // filteredDeals array as a plain prop, so both stay in sync automatically.
  const filteredDeals = (() => {
    const q = search.trim().toLowerCase()
    return deals.filter(d => {
      const matchesSearch = !q || [
        d.title, d.companyName, d.company?.name, d.contactPerson, d.contactEmail, d.domainName,
      ].some(v => v && String(v).toLowerCase().includes(q))
      const matchesCountry = countryFilter.length === 0
        || countryFilter.some(c => (d.country || '').toLowerCase() === c.toLowerCase())
      const matchesClientType = clientTypeFilter.length === 0 || clientTypeFilter.includes(d.clientType)
      const matchesStage = stageFilter.length === 0 || stageFilter.includes(d.stage)
      const matchesOpportunity = opportunityFilter.length === 0 || opportunityFilter.includes(d.opportunityType)
      const matchesStrategic = strategicFilter.length === 0 || strategicFilter.includes(d.strategicImportance)
      const matchesOutcome = outcomeFilter.length === 0 || outcomeFilter.includes(d.expectedOutcome)
      const matchesPoc = pocFilter.length === 0 || pocFilter[0] === (d.poc ? 'yes' : 'no')
      const matchesProposal = proposalFilter.length === 0 || proposalFilter[0] === (d.proposalShared ? 'yes' : 'no')
      const matchesRemarks = remarksFilter.length === 0 || remarksFilter.some(value =>
        String(d.company?.remarks || '').toLowerCase() === String(value).toLowerCase()
      )
      const dateRange = dateRangeForToken(openDateFilter[0])
      // Deal Open Date ONLY — never Created Date. A deal with no Open Date is
      // undated and simply does not match any period; substituting createdAt
      // would file it under a month it was never opened in. The count of such
      // deals is surfaced below so an empty result is explained, not mysterious.
      const dealDate = dealOpenLocalDate(d.openDate)
      const matchesOpenDate = !dateRange || (dealDate && dealDate >= dateRange[0] && dealDate < dateRange[1])
      const matchesNoCompany = !noCompanyFilter || (!d.companyId && !d.companyName)
      return matchesSearch && matchesCountry && matchesClientType && matchesStage && matchesOpportunity && matchesStrategic && matchesOutcome && matchesPoc && matchesProposal && matchesRemarks && matchesOpenDate && matchesNoCompany
    })
  })()

  // Deals with no Deal Open Date can never match a period filter. The original
  // "No deals found" report turned out to be exactly this — every deal had a
  // null openDate — not a broken filter, so the number is shown rather than
  // leaving the user to guess.
  const hasPeriod = openDateFilter.length > 0
  const undatedDealCount = deals.filter(d => !dealOpenLocalDate(d.openDate)).length

  const filterConfigs = [
    { label: 'Country', values: countryFilter, set: setCountryFilter, options: countryOptions },
    { label: 'Client Type', values: clientTypeFilter, set: setClientTypeFilter, options: clientTypeValues },
    { label: 'Stage', values: stageFilter, set: setStageFilter, options: stageValues },
    { label: 'Remarks', values: remarksFilter, set: setRemarksFilter, options: remarksOptions },
    { label: 'Opportunity Type', values: opportunityFilter, set: setOpportunityFilter, options: opportunityValues },
    { label: 'Strategic Importance', values: strategicFilter, set: setStrategicFilter, options: strategicValues },
    { label: 'Expected Outcome', values: outcomeFilter, set: setOutcomeFilter, options: outcomeValues },
    { label: 'POC', values: pocFilter, set: setPocFilter, options: POC_OPTIONS },
    { label: 'Proposal Shared', values: proposalFilter, set: setProposalFilter, options: PROPOSAL_OPTIONS },
  ]
  const hasActiveFilters = Boolean(search.trim()) || openDateFilter.length > 0 || noCompanyFilter || filterConfigs.some(f => f.values.length)
  const clearFilters = () => {
    setSearch(''); setOpenDateFilter([]); setNoCompanyFilter(false); filterConfigs.forEach(f => f.set([])); setMoreFiltersOpen(false)
  }

  // All Deals can now show deals owned by any user, so initials must be
  // computed per-deal from its own owner (d.owner.name), not the logged-in
  // user's name shown on every row.
  const initialsFor = (name) => (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—'

  const editColumnsFields = [...dealFields, DEAL_OWNER_COLUMN, DEAL_FLAGS_COLUMN]
  const orderedVisibleFields = visibleColumns.map(key => editColumnsFields.find(f => f.key === key)).filter(Boolean)
  // Company name and Deal name are rendered as the two pinned leading columns,
  // so they are not repeated among the scrolling ones.
  const listFields = orderedVisibleFields.filter(f => !PINNED_COLUMN_KEYS.includes(f.key))
  // Exactly what the Company column showed before this reorder — the name plus
  // the domain when there is one. Unchanged on purpose: this is a reorder and a
  // restyle, not a change to what the row reports.
  const companyCellText = (d) => {
    const name = d.companyName || d.company?.name || '--'
    return d.domainName ? `${name} / ${d.domainName}` : name
  }
  const orderedBoardFields = boardVisibleColumns.map(key => editColumnsFields.find(f => f.key === key)).filter(Boolean)

  function renderDealCell(f, d) {
    if (f.key === 'companyName') {
      const name = d.companyName || d.company?.name || '--'
      return d.domainName ? `${name} / ${d.domainName}` : name
    }
    if (f.key === 'ownerId') return <span className="deal-owner-avatar" title={d.owner?.name || 'Unassigned'}>{initialsFor(d.owner?.name)}</span>
    if (f.key === 'clientType') {
      if (!d.clientType) return '--'
      return clientTypeValues.find(o => o.value === d.clientType)?.label ?? d.clientType
    }
    if (f.key === 'stage') return <span className={`deal-stage-badge stage-${String(d.stage || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}><i />{d.stage || 'Not set'}</span>
    if (f.key === 'strategicImportance') return d.strategicImportance ? <span className={`deal-importance importance-${String(d.strategicImportance).toLowerCase()}`}>{d.strategicImportance}</span> : '--'
    if (f.key === 'value') return <strong className="deal-value-cell">{formatCurrency(d.value, d.currency)}</strong>
    if (f.key === '_flags') return (d.poc || d.proposalShared) ? <span className="deal-flags">{d.poc && <b>POC</b>}{d.proposalShared && <b>Proposal</b>}</span> : <span className="deal-muted">Not started</span>
    if (f.key === 'poc' || f.key === 'proposalShared') return d[f.key] ? 'Yes' : 'No'
    if (f.key === 'pocReceivedDate' || f.key === 'pocDeliveredDate') return renderCustomCell('date', d[f.key])
    if (f.key.startsWith('custom.')) return renderCustomCell(f.type, d[f.key])
    const v = d[f.key]
    if (Array.isArray(v)) return v.length ? v.join(', ') : '--'
    return (v === null || v === undefined || v === '') ? '--' : String(v)
  }

  const activeDeals = deals.filter(d => !/won|lost/i.test(d.stage || '')).length
  const wonDeals = deals.filter(d => /won/i.test(d.stage || '')).length
  const summaryMetrics = [
    { label: 'All deals', value: deals.length, icon: 'handshake', tone: 'blue' },
    { label: 'Active pipeline', value: activeDeals, icon: 'trending_up', tone: 'green' },
    { label: 'POC completed', value: deals.filter(d => d.poc).length, icon: 'target', tone: 'violet' },
    { label: 'Proposals shared', value: deals.filter(d => d.proposalShared).length, icon: 'description', tone: 'amber' },
    { label: 'Deals won', value: wonDeals, icon: 'verified', tone: 'success' },
  ]

  // Mirrors the table: the two pinned columns first, in the same order, then
  // whatever else is on screen. Naming them explicitly also means an export can
  // never drop Company Name just because an older saved column list omits it.
  const exportColumns = [
    { key: 'companyName', header: 'Company Name' },
    { key: 'title', header: 'Deal Name' },
    ...listFields.map(f => ({ key: f.key, header: f.label }))
  ]

  const fetchAllForExport = async () => {
    const params = {
      view: dealsTab === 'mine' ? 'mine' : undefined,
      search: search || undefined,
      country: countryFilter.length ? countryFilter.join(',') : undefined,
      clientType: clientTypeFilter.length ? clientTypeFilter.join(',') : undefined,
      stage: stageFilter.length ? stageFilter.join(',') : undefined,
      opportunityType: opportunityFilter.length ? opportunityFilter.join(',') : undefined,
      strategicImportance: strategicFilter.length ? strategicFilter.join(',') : undefined,
      expectedOutcome: outcomeFilter.length ? outcomeFilter.join(',') : undefined,
      remarksValues: remarksFilter.length ? remarksFilter : undefined,
      openDate: openDateFilter[0] || undefined,
    }
    const r = await api.get('/deals/export', { params })
    return r.data.deals || []
  }

  return (
    <div className="deals-workspace">
      <header className="deals-header deals-hero">
        <div className="deals-hero-copy">
          <span className="deals-hero-eyebrow"><MaterialIcon>monitoring</MaterialIcon> Revenue workspace</span>
          <h1>Move every deal forward</h1>
          <span className="deals-meta">
            {loading ? 'Loading…' : (
              <>
                Track {filteredDeals.length} deal{filteredDeals.length === 1 ? '' : 's'}, focus on the right opportunities and keep your pipeline moving.
              </>
            )}
          </span>
        </div>
        <div className="deals-header-actions">
          <div className="action-group">
            {viewMode === 'list' && (
              <EditColumnsMenu fields={editColumnsFields} visibleColumns={visibleColumns} onSave={saveVisibleColumns} alwaysShownKey={PINNED_COLUMN_KEYS} defaultColumns={DEFAULT_COLUMNS} />
            )}
            {viewMode === 'board' && (
              <EditColumnsMenu fields={editColumnsFields} visibleColumns={boardVisibleColumns} onSave={saveBoardVisibleColumns} alwaysShownKey={PINNED_COLUMN_KEYS} defaultColumns={DEFAULT_BOARD_COLUMNS} />
            )}
            <DealExportMenu fetchAllForExport={fetchAllForExport} columns={exportColumns} />
            <button className="deals-secondary-btn" onClick={() => setShowImport(true)}>
              <MaterialIcon>upload</MaterialIcon> Import
            </button>
          </div>
          <button className="deals-create-btn" onClick={() => setShowCreate(true)}>
            <MaterialIcon>add</MaterialIcon> Create deal
          </button>
        </div>
      </header>

      <section className="deals-summary" aria-label="Deal summary">
        {summaryMetrics.map(metric => <div key={metric.label} className={`deals-metric tone-${metric.tone}`}><span className="deals-metric-icon"><MaterialIcon>{metric.icon}</MaterialIcon></span><span>{metric.label}</span><strong>{loading ? '—' : metric.value}</strong></div>)}
      </section>

      <section className="deals-data-shell">
      <div className="deals-viewbar">
        <div className="deals-tabs" role="tablist">
          <button role="tab" aria-selected={dealsTab === 'all'} onClick={() => setDealsTab('all')}>All deals <span>{dealsTab === 'all' && !loading ? deals.length : ''}</span></button>
          <button role="tab" aria-selected={dealsTab === 'mine'} onClick={() => setDealsTab('mine')} title="Deals on companies where you're the Lead Owner">My deals <span>{dealsTab === 'mine' && !loading ? deals.length : ''}</span></button>
        </div>

        <div className="deals-view-switch" aria-label="Deal view">
          <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setView('list')} title="List view"><MaterialIcon>view_list</MaterialIcon> List</button>
          <button className={viewMode === 'board' ? 'active' : ''} onClick={() => setView('board')} title="Board view"><MaterialIcon>view_kanban</MaterialIcon> Board</button>
        </div>
      </div>

      <section className="deals-filter-area">
        <div className="deals-filterbar">
          <div className="deals-search">
            <MaterialIcon>search</MaterialIcon>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search deals, companies, contacts..."
            />
          </div>

          <FilterDropdown label="Country" options={countryOptions} selected={countryFilter} onChange={setCountryFilter} />
          <FilterDropdown label="Client Type" options={clientTypeValues} selected={clientTypeFilter} onChange={setClientTypeFilter} />
          <FilterDropdown label="Stage" options={stageValues} selected={stageFilter} onChange={setStageFilter} />
          <FilterDropdown label="Remarks" options={remarksOptions} selected={remarksFilter} onChange={setRemarksFilter} />
          <DateFilterDropdown
            label="Deal date"
            dayLabel="Deal dated"
            yearLabel="Deal dated during"
            presets={DATE_OPTIONS}
            value={openDateFilter[0] || ''}
            onChange={setOpenDateFilter}
          />

          <div className="more-filters-wrap" ref={moreFiltersRef}>
            <button className={`more-filters-btn${moreFiltersOpen ? ' active' : ''}`} onClick={() => setMoreFiltersOpen(v => !v)}><MaterialIcon>tune</MaterialIcon> More filters <MaterialIcon>keyboard_arrow_down</MaterialIcon></button>
            {moreFiltersOpen && (
              <div className="more-filters-panel">
                <div className="more-filters-heading"><div><strong>More filters</strong><span>Refine the current deal view</span></div><button onClick={() => setMoreFiltersOpen(false)} aria-label="Close"><MaterialIcon>close</MaterialIcon></button></div>
                <div className="more-filters-group"><p>Deal</p>
                  <FilterDropdown label="Opportunity Type" options={opportunityValues} selected={opportunityFilter} onChange={setOpportunityFilter} />
                  <FilterDropdown label="Expected Outcome" options={outcomeValues} selected={outcomeFilter} onChange={setOutcomeFilter} />
                  <FilterDropdown label="Strategic Importance" options={strategicValues} selected={strategicFilter} onChange={setStrategicFilter} />
                  <FilterDropdown label="POC" options={POC_OPTIONS} selected={pocFilter} onChange={setPocFilter} searchable={false} singleSelect />
                  <FilterDropdown label="Proposal Shared" options={PROPOSAL_OPTIONS} selected={proposalFilter} onChange={setProposalFilter} searchable={false} singleSelect />
                </div>
                <div className="more-filters-footer"><button onClick={clearFilters}><MaterialIcon>restart_alt</MaterialIcon> Reset</button><button className="apply" onClick={() => setMoreFiltersOpen(false)}>Apply filters</button></div>
              </div>
            )}
          </div>
          {hasActiveFilters && <button className="clear-filters-btn" onClick={clearFilters}>Clear all</button>}
        </div>

        {(openDateFilter.length > 0 || noCompanyFilter || filterConfigs.some(f => f.values.length)) && (
          <div className="active-filter-chips">
            {noCompanyFilter && <button onClick={() => setNoCompanyFilter(false)} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}><span>Filter:</span> No company linked <MaterialIcon>close</MaterialIcon></button>}
            {openDateFilter.length > 0 && <button onClick={() => setOpenDateFilter([])}><span>Deal date:</span> {describeDateToken(openDateFilter[0], DATE_OPTIONS)} <MaterialIcon>close</MaterialIcon></button>}
            {filterConfigs.flatMap(f => f.values.map(value => {
              const label = f.options.find(o => o.value === value)?.label || value
              return <button key={`${f.label}-${value}`} onClick={() => f.set(f.values.filter(v => v !== value))}><span>{f.label}:</span> {label} <MaterialIcon>close</MaterialIcon></button>
            }))}
          </div>
        )}

        {hasPeriod && !loading && undatedDealCount > 0 && (
          <div className="deals-undated-notice">
            <MaterialIcon>info</MaterialIcon>
            <span>
              <strong>{undatedDealCount}</strong> of {deals.length} deal{deals.length === 1 ? '' : 's'}{' '}
              {undatedDealCount === 1 ? 'has' : 'have'} no <strong>Deal Open Date</strong>, so {undatedDealCount === 1 ? 'it is' : 'they are'} not shown while a period filter is active.
            </span>
            <button type="button" onClick={() => setOpenDateFilter([])}>Clear period</button>
          </div>
        )}
      </section>

      {viewMode === 'board' ? (
        loading ? (
          <div className="deals-loading">Loading deals…</div>
        ) : (
          <DealBoard
            deals={filteredDeals}
            onViewDeal={setViewDeal}
            onEdit={setEditDeal}
            onGoToCompany={goToDealCompany}
            onStageChange={handleStageChange}
            getOwnerInitials={d => initialsFor(d.owner?.name)}
            visibleFields={orderedBoardFields}
            renderField={renderDealCell}
          />
        )
      ) : (
      <div className="deals-table-wrap">
        <table className="deals-table">
          <thead>
            <tr>
              <th className="sticky-company-col deal-col-companyName">Company name</th>
              <th className="sticky-deal-col">Deal name</th>
              {listFields.map(f => <th key={f.key} className={`deal-col-${f.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`}>{f.label}</th>)}
              <th className="sticky-actions-col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3 + listFields.length}><div className="deals-loading">Loading deals…</div></td></tr>
            ) : filteredDeals.length === 0 ? (
              <tr><td colSpan={3 + listFields.length}>
                <div className="deals-empty-state"><span className="deals-empty-icon"><MaterialIcon>handshake</MaterialIcon></span>
                  <strong>{deals.length === 0 ? (dealsTab === 'mine' ? 'No deals on companies you own yet.' : 'No deals yet') : 'No deals match these filters'}</strong>
                  <p>{deals.length === 0 ? 'Create your first deal to start building your sales pipeline.' : 'Try adjusting or clearing your filters.'}</p>
                  {deals.length === 0 ? <button className="deals-create-btn compact" onClick={() => setShowCreate(true)}><MaterialIcon>add</MaterialIcon> Create deal</button> : <button className="deals-secondary-btn" onClick={clearFilters}>Clear filters</button>}
                </div>
              </td></tr>
            ) : filteredDeals.map((d, i) => (
              <tr key={d.id}>
                <td className="sticky-company-col deal-col-companyName deal-company-cell" onClick={() => handleOpenDeal(d)}>
                  <div title={companyCellText(d)}>{companyCellText(d)}</div>
                </td>
                <td className="sticky-deal-col deal-title-cell" onClick={() => handleOpenDeal(d)}><div title={d.title}>{d.title}</div></td>
                {listFields.map(f => {
                  const content = renderDealCell(f, d)
                  const title = typeof content === 'string' ? content : undefined
                  const fieldClass = `deal-col-${f.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
                  return <td key={f.key} data-label={f.label} className={`${f.key === 'companyName' ? 'sticky-company-col ' : ''}${fieldClass}`}><div className={`deal-cell-clamp deal-field-${f.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`} title={title}>{content}</div></td>
                })}
                <td className="sticky-actions-col deal-row-actions">
                  <button onClick={() => setEditDeal(d)} title="Edit deal"><MaterialIcon>edit</MaterialIcon></button>
                  <button className="danger" onClick={() => handleDelete(d.id)} title="Delete deal"><MaterialIcon>delete</MaterialIcon></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      </section>

      {showCreate && (
        <CreateDealModal
          onClose={() => setShowCreate(false)}
          onSaved={() => fetchDeals()}
        />
      )}

      {showImport && (
        <DealImportModal
          isOpen={showImport}
          onClose={() => setShowImport(false)}
          onSuccess={() => fetchDeals()}
        />
      )}

      {editDeal && (
        <CreateDealModal
          deal={editDeal}
          onClose={() => setEditDeal(null)}
          onSaved={() => fetchDeals()}
        />
      )}

      {viewDeal && (
        <ViewDealModal
          deal={viewDeal}
          onClose={() => setViewDeal(null)}
        />
      )}
    </div>
  )
}
