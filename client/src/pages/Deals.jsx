import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, List, LayoutGrid, Upload, ChevronDown } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import CreateDealModal from '../components/modals/CreateDealModal'
import ViewDealModal from '../components/modals/ViewDealModal'
import EditColumnsMenu from '../components/EditColumnsMenu'
import DealBoard from '../components/DealBoard'
import FilterDropdown from '../components/filters/FilterDropdown'
import { useDropdownOptions } from '../hooks/useDropdownOptions'
import { renderCustomCell } from '../utils/customFieldRender'
import { formatCurrency } from '../utils/formatCurrency'
import { dealFlagsLabel } from '../utils/dealFlags'
import { exportCSV, exportXLSX, exportJSON, exportPDF } from '../utils/exportUtils'
import DealImportModal from '../components/modals/DealImportModal'

const COLUMNS_STORAGE_KEY = 'mwz_deals_visible_columns'
const VIEW_STORAGE_KEY = 'mwz_deals_view_mode'
// Matches exactly what the table showed before this became dynamic — every
// column already visible stays visible by default; nothing is hidden by
// this change. 'title' is always shown (like Company's 'name'), so it's
// deliberately not in this list.
const DEFAULT_COLUMNS = [
  'companyName', 'clientType', 'contactPerson', 'serviceRequirement',
  'opportunityType', 'stage', 'strategicImportance', 'expectedOutcome',
  'value', '_flags',
]

// Board view's Edit Columns is a SEPARATE selection from List's (Update 9) —
// a card has far less room than a table row, so defaulting board to every
// field List happens to show would clutter it. Default matches exactly what
// the card already rendered before this became configurable, so existing
// Board layout is unchanged until a user opts into more fields.
const BOARD_COLUMNS_STORAGE_KEY = 'mwz_deals_board_visible_columns'
const DEFAULT_BOARD_COLUMNS = ['companyName', 'contactPerson', '_flags', 'value', 'ownerId']

// Deal Owner (ownerId) is intentionally excluded from the server's dynamic
// Deal field list (same reasoning as Company's ownerId exclusion) — this is
// a client-side-only column entry so Edit Columns can offer it.
const DEAL_OWNER_COLUMN = { key: 'ownerId', label: 'Deal Owner' }

// Combined display of the poc/proposalShared booleans (each of which is
// also independently toggleable as its own Yes/No column via the server's
// dynamic Deal field list) — client-side-only, same pattern as Deal Owner.
const DEAL_FLAGS_COLUMN = { key: '_flags', label: 'POC / Proposal Shared' }

// Deep-link targets used by the Deals Dashboard cards (/deals?focus=poc).
// Kept as data so a new dashboard card only needs an entry here, and so the
// same predicate drives both the filtering and the removable chip label.
// Month/Year picker (Update 1) — generated around the current year so it
// never goes stale.
const DEAL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DEAL_CURRENT_YEAR = new Date().getFullYear()
const DEAL_YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => DEAL_CURRENT_YEAR - 5 + i)

const FOCUS_FILTERS = {
  active:   { label: 'Active deals',    test: d => !/won|lost/i.test(d.stage || '') },
  won:      { label: 'Won deals',       test: d => /won/i.test(d.stage || '') },
  lost:     { label: 'Lost deals',      test: d => /lost/i.test(d.stage || '') },
  poc:      { label: 'POC',             test: d => !!d.poc },
  proposal: { label: 'Proposal Shared', test: d => !!d.proposalShared },
}

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

export default function Deals() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [deals, setDeals]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editDeal, setEditDeal]   = useState(null)
  const [viewDeal, setViewDeal]   = useState(null)
  const [dealFields, setDealFields] = useState([])
  const [search, setSearch]       = useState('')
  const [countryFilter, setCountryFilter] = useState([])
  const [dealsTab, setDealsTab]   = useState('all') // 'all' | 'mine'
  // Set by the Deals Dashboard cards. Lives in the URL (not state) so the
  // filtered view is shareable, survives a browser refresh, and Back returns
  // to the dashboard rather than silently dropping the filter.
  const [searchParams, setSearchParams] = useSearchParams()
  const focusKey  = searchParams.get('focus')
  // Deal Open Date period, carried from the Deals Dashboard cards so the list
  // shows exactly the deals the card counted.
  const yearParam  = parseInt(searchParams.get('year'), 10)
  const monthParam = parseInt(searchParams.get('month'), 10)
  const hasPeriod  = Number.isFinite(yearParam)
  const focus     = FOCUS_FILTERS[focusKey] || null
  const [viewMode, setViewMode]   = useState(() => localStorage.getItem(VIEW_STORAGE_KEY) || 'list')
  const [showImport, setShowImport] = useState(false)
  const [reloadKey, setReloadKey]   = useState(0)

  // Same shared 'company.country' dropdown list CreateDealModal already uses
  // for a Deal's own (denormalized) country field — not a separate list.
  const { options: countryValues } = useDropdownOptions('company.country')
  const countryOptions = countryValues.map(o => ({ value: o.value, label: o.label }))
  // Client Type stores a stable value separate from its current display
  // label (Settings → Dropdown Lists can rename the label without touching
  // the stored value) — this table was rendering the raw stored value
  // directly, so it could show a different Client Type than Edit Deal's
  // <select> (which already resolves value -> current label). See the
  // matching fix/comment in ViewDealModal.jsx for the full explanation.
  const { options: clientTypeValues } = useDropdownOptions('deal.clientType')

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

  // reloadKey bumps after a successful import so the newly-created deals show
  // up without a manual refresh.
  useEffect(() => { fetchDeals() }, [fetchDeals, reloadKey])

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
      const matchesFocus = !focus || focus.test(d)
      // Deals with no Deal Open Date cannot belong to a period, so they are
      // excluded while a period filter is active - matching the dashboard.
      let matchesPeriod = true
      if (hasPeriod) {
        if (!d.openDate) matchesPeriod = false
        else {
          const od = new Date(d.openDate)
          matchesPeriod = od.getFullYear() === yearParam
            && (!Number.isFinite(monthParam) || od.getMonth() + 1 === monthParam)
        }
      }
      return matchesSearch && matchesCountry && matchesFocus && matchesPeriod
    })
  })()

  // All Deals can now show deals owned by any user, so initials must be
  // computed per-deal from its own owner (d.owner.name), not the logged-in
  // user's name shown on every row.
  const initialsFor = (name) => (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—'

  const editColumnsFields = [...dealFields, DEAL_OWNER_COLUMN, DEAL_FLAGS_COLUMN]
  const orderedVisibleFields = editColumnsFields.filter(f => visibleColumns.includes(f.key))
  const orderedBoardFields = editColumnsFields.filter(f => boardVisibleColumns.includes(f.key))

  function renderDealCell(f, d) {
    if (f.key === 'companyName') {
      const name = d.companyName || d.company?.name || '--'
      return d.domainName ? `${name} / ${d.domainName}` : name
    }
    if (f.key === 'ownerId') return initialsFor(d.owner?.name)
    if (f.key === 'clientType') {
      if (!d.clientType) return '--'
      return clientTypeValues.find(o => o.value === d.clientType)?.label ?? d.clientType
    }
    if (f.key === 'value') return formatCurrency(d.value, d.currency)
    if (f.key === '_flags') return dealFlagsLabel(d) || '--'
    if (f.key === 'poc' || f.key === 'proposalShared') return d[f.key] ? 'Yes' : 'No'
    if (f.key === 'pocReceivedDate' || f.key === 'pocDeliveredDate') return renderCustomCell('date', d[f.key])
    if (f.key.startsWith('custom.')) return renderCustomCell(f.type, d[f.key])
    const v = d[f.key]
    if (Array.isArray(v)) return v.length ? v.join(', ') : '--'
    return (v === null || v === undefined || v === '') ? '--' : String(v)
  }

  const cellTh = { padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap' }
  // display must stay the default (table-cell) on a <td> — -webkit-box
  // (needed for line-clamp) isn't compatible with table-cell and breaks the
  // whole table's column layout. Line-clamp goes on an inner wrapper via
  // cellClamp instead, never directly on the <td>.
  const cellTd = { padding: '13px 16px', color: '#334155', whiteSpace: 'normal', overflowWrap: 'anywhere', maxWidth: 260, fontSize: 13.5 }
  const cellClamp = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', overflowWrap: 'anywhere' }
  const iconBtn = { border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', transition: 'background .12s' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, background: '#fff', borderRadius: 12, padding: 26, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 18, borderBottom: '1px solid #eef1f5' }}>
        <div>
          <h1 style={{ fontSize: 23, fontWeight: 700, color: '#0f172a', letterSpacing: '-.2px', display: 'flex', alignItems: 'center', gap: 10 }}>
            Deals
            {/* Arrived from a Deals Dashboard card — show what's being filtered
                and let the user clear it without going back. */}
            {focus && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 99, padding: '3px 10px' }}>
                {focus.label}
                <button
                  title="Clear this filter"
                  onClick={() => { const p = new URLSearchParams(searchParams); p.delete('focus'); setSearchParams(p, { replace: true }) }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#1d4ed8', padding: 0, display: 'flex', fontSize: 14, lineHeight: 1 }}
                >
                  ×
                </button>
              </span>
            )}
          </h1>
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
            {loading ? 'Loading…' : (
              <>
                {filteredDeals.length} record{filteredDeals.length === 1 ? '' : 's'}
                {' · '}{filteredDeals.filter(d => d.poc).length} POC
                {' · '}{filteredDeals.filter(d => d.proposalShared).length} Proposal Shared
              </>
            )}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {viewMode === 'list' && (
            <EditColumnsMenu fields={editColumnsFields} visibleColumns={visibleColumns} onSave={saveVisibleColumns} alwaysShownKey="title" />
          )}
          {viewMode === 'board' && (
            <EditColumnsMenu fields={editColumnsFields} visibleColumns={boardVisibleColumns} onSave={saveBoardVisibleColumns} alwaysShownKey="title" />
          )}
          {/* Import / Export live here on the Deals page only — not on the
              Deals Dashboard, which stays focused on summary cards/charts. */}
          <button
            onClick={() => setShowImport(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Upload size={13} /> Import
          </button>
          <DealExportMenu />
          <button
            onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: '#e63329', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', boxShadow: '0 1px 2px rgba(230,51,41,0.25)', transition: 'background .12s, box-shadow .12s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#c0271e'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(230,51,41,0.35)' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#e63329'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(230,51,41,0.25)' }}
          >
            <Plus size={14} /> Create deal
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, paddingBottom: 14, borderBottom: '1px solid #eef1f5', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <button
            onClick={() => setDealsTab('all')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
              color: dealsTab === 'all' ? '#0f172a' : '#94a3b8', borderBottom: `2px solid ${dealsTab === 'all' ? '#e63329' : 'transparent'}`, paddingBottom: 10, transition: 'color .12s, border-color .12s' }}
          >
            All deals
          </button>
          <button
            onClick={() => setDealsTab('mine')}
            title="Deals on companies where you're the Lead Owner"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
              color: dealsTab === 'mine' ? '#0f172a' : '#94a3b8', borderBottom: `2px solid ${dealsTab === 'mine' ? '#e63329' : 'transparent'}`, paddingBottom: 10, transition: 'color .12s, border-color .12s' }}
          >
            My deals
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingBottom: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search deals…"
              style={{ padding: '8px 12px 8px 32px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, width: 230, fontFamily: 'inherit', transition: 'border-color .12s, box-shadow .12s' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#e63329'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(230,51,41,0.10)' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          <FilterDropdown
            label="Country"
            options={countryOptions}
            selected={countryFilter}
            onChange={setCountryFilter}
          />

          {/* Month/Year — filters on Deal Open Date (see FOCUS_FILTERS /
              matchesPeriod above), not Created Date. Values live in the URL so
              a Deals Dashboard card link (?year=&month=) and a manually picked
              filter here behave identically and survive a refresh. */}
          <select
            value={Number.isFinite(yearParam) ? yearParam : ''}
            onChange={e => {
              const p = new URLSearchParams(searchParams)
              if (e.target.value) p.set('year', e.target.value); else p.delete('year')
              p.delete('month')
              setSearchParams(p, { replace: true })
            }}
            style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: '#0f172a', background: '#fff' }}
          >
            <option value="">All years</option>
            {DEAL_YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={Number.isFinite(monthParam) ? monthParam : ''}
            onChange={e => {
              const p = new URLSearchParams(searchParams)
              if (e.target.value) p.set('month', e.target.value); else p.delete('month')
              setSearchParams(p, { replace: true })
            }}
            disabled={!hasPeriod}
            title={hasPeriod ? undefined : 'Choose a year first'}
            style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', color: hasPeriod ? '#0f172a' : '#94a3b8', background: hasPeriod ? '#fff' : '#f8fafc' }}
          >
            <option value="">All months</option>
            {DEAL_MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>

          <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <button
              onClick={() => setView('list')}
              title="List view"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, transition: 'background .12s, color .12s',
                background: viewMode === 'list' ? '#e63329' : '#fff', color: viewMode === 'list' ? '#fff' : '#64748b' }}
            >
              <List size={13} /> List
            </button>
            <button
              onClick={() => setView('board')}
              title="Board view"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, transition: 'background .12s, color .12s',
                background: viewMode === 'board' ? '#e63329' : '#fff', color: viewMode === 'board' ? '#fff' : '#64748b' }}
            >
              <LayoutGrid size={13} /> Board
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'board' ? (
        loading ? (
          <p style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13.5 }}>Loading deals…</p>
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
      <div style={{ overflowX: 'auto', border: '1px solid #eef1f5', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #eef1f5' }}>
            <tr>
              <th style={cellTh}>DEAL NAME</th>
              {orderedVisibleFields.map(f => <th key={f.key} style={cellTh}>{f.label.toUpperCase()}</th>)}
              <th style={cellTh}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={2 + orderedVisibleFields.length} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13.5 }}>Loading deals…</td></tr>
            ) : filteredDeals.length === 0 ? (
              <tr><td colSpan={2 + orderedVisibleFields.length} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13.5 }}>{deals.length === 0 ? (dealsTab === 'mine' ? 'No deals on companies you own yet.' : 'No deals yet.') : 'No deals match your search.'}</td></tr>
            ) : filteredDeals.map((d, i) => (
              <tr key={d.id} style={{ borderBottom: i < filteredDeals.length - 1 ? '1px solid #f4f6f8' : 'none', transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ ...cellTd, color: '#e63329', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleOpenDeal(d)}><div style={cellClamp}>{d.title}</div></td>
                {orderedVisibleFields.map(f => <td key={f.key} style={cellTd}><div style={cellClamp}>{renderDealCell(f, d)}</div></td>)}
                <td style={{ ...cellTd, display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setEditDeal(d)} title="Edit deal" style={{ ...iconBtn, color: '#64748b' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  ><Pencil size={14} /></button>
                  <button
                    onClick={() => handleDelete(d.id)} title="Delete deal" style={{ ...iconBtn, color: '#ef4444' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  ><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {showCreate && (
        <CreateDealModal
          onClose={() => setShowCreate(false)}
          onSaved={() => fetchDeals()}
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

      <DealImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => setReloadKey(k => k + 1)}
      />
    </div>
  )
}
