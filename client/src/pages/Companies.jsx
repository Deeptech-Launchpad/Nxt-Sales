import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, LayoutGrid, List, Download, Plus,
  ChevronDown, SlidersHorizontal, Pencil, Upload, Trash2, Star,
  ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, X, ArrowRight,
  CheckCircle2, History, Building2, Briefcase, UserX, Layers
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { useDropdownOptions } from '../hooks/useDropdownOptions'
import FilterDropdown from '../components/filters/FilterDropdown'
import DateFilterDropdown, { describeDateToken } from '../components/filters/DateFilterDropdown'
import AddFilterMenu from '../components/filters/AddFilterMenu'
import CreateCompanyModal from '../components/modals/CreateCompanyModal'
import ImportModal from '../components/modals/ImportModal'
import EditColumnsMenu from '../components/EditColumnsMenu'
import { valueList } from '../utils/multiValue'
import { exportCSV, exportXLSX, exportJSON, exportPDF } from '../utils/exportUtils'
import { renderCustomCell } from '../utils/customFieldRender'
import '../styles/contacts.css'
import '../styles/companies.css'
import '../styles/recents.css'

// "+N" badge when a company has more than one email.
const moreCount = (primary, arr) => Math.max(0, valueList(primary, arr).length - 1)
const MoreBadge = ({ n }) => n > 0
  ? <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>+{n}</span>
  : null

// Check if company is newly created (within 24 hours)
const isNewCompany = (createdAt) => {
  if (!createdAt) return false
  const created = new Date(createdAt)
  const now = new Date()
  const hoursOld = (now - created) / (1000 * 60 * 60)
  return hoursOld < 24
}

const NewBadge = ({ createdAt }) => isNewCompany(createdAt)
  ? <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#ffffff', background: '#10b981', borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap' }}>New</span>
  : null

function AdvancedTextFilter({ label, value, onChange, placeholder }) {
  return (
    <label className="advanced-field">
      <span>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {value && <button type="button" aria-label={`Clear ${label}`} onClick={() => onChange('')}><X size={11} /></button>}
    </label>
  )
}

const COLUMNS_STORAGE_KEY = 'mwz_companies_visible_columns'
const VIEW_STORAGE_KEY = 'mwz_companies_view'
const DEFAULT_COLUMNS = ['country', 'industry', 'email', 'phone', 'domain', 'cms', 'remarks']
const SORTABLE_COLUMN_KEYS = new Set(['name', 'email', 'phone', 'industry', 'leadStatus', 'status', 'domain', 'country', 'cms', 'remarks', 'createdAt', 'updatedAt'])

// Optional filters offered behind the "+" button — not shown by default,
// added/removed by the user via AddFilterMenu. Extend this list to offer
// more optional filters later without touching the always-on ones
// (Lead Owner / Create date / Lead status) at all.
const OPTIONAL_FILTERS_STORAGE_KEY = 'mwz_companies_optional_filters'
const OPTIONAL_FILTER_DEFS = [
  { key: 'industry', label: 'Industry' },
  { key: 'country',  label: 'Country' },
  { key: 'hasDeal',  label: 'Deals Created' },
]

// Not admin-managed like Industry/Country — a fixed yes/no choice, so no
// useDropdownOptions call needed for it.
const HAS_DEAL_OPTIONS = [
  { value: 'yes', label: 'Has deal' },
  { value: 'no',  label: 'No deal' },
]

// Lead Owner (ownerId) is intentionally excluded from the server's dynamic
// Company field list — that list is shared with the Import Template, and
// ownerId has its own dropdown/name-matching logic there that must not be
// touched. This is a client-side-only column entry so "Edit Columns" can
// offer it without affecting Import, Create, or Edit Company in any way.
const LEAD_OWNER_COLUMN = { key: 'ownerId', label: 'Lead Owner' }

// deletedAt is an internal system field (Recycle Bin / auto-cleanup only) —
// never a user-facing column. Hidden from Edit Columns the same way as the
// retired fields above; the database column, backend, and Recycle Bin logic
// are untouched.
const INTERNAL_COLUMN_KEYS = new Set(['deletedAt'])

// ── Export dropdown — always fetches the FULL filtered dataset from the
// server first, not just the current page.
function CompanyExportMenu({ fetchAllForExport, columns }) {
  const [open, setOpen]       = useState(false)
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
      fn(records, 'companies', columns, ...extraArgs)
    } catch {
      // fetch failed — nothing to export; silently no-op (matches existing
      // lightweight error handling style used elsewhere on this page)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn-action btn-sm" onClick={() => setOpen(o => !o)} disabled={exporting}>
        <Upload size={13} /> {exporting ? 'Exporting…' : 'Export'} <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 3000, minWidth: 170, overflow: 'hidden' }}>
          {[
            { label: 'Export as CSV',   fn: () => run(exportCSV) },
            { label: 'Export as Excel', fn: () => run(exportXLSX, ['Companies']) },
            { label: 'Export as JSON',  fn: () => run(exportJSON) },
            { label: 'Export as PDF',   fn: () => run(exportPDF, ['Companies Export — NXT MarketingWiz']) },
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

const PAGE_SIZE = 100

// Compact page-number window (current ±2, plus first/last) so the pager stays
// fast to render even with thousands of pages — showing every page number
// individually (as the old 25/page control did) doesn't scale to 10,000+ records.
function pageWindow(current, total) {
  const pages = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2])
  return [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
}

const DATE_OPTIONS = [
  { value: 'today',      label: 'Today'          },
  { value: 'yesterday',  label: 'Yesterday'      },
  { value: 'this_week',  label: 'This Week'      },
  { value: 'last_7',     label: 'Last 7 Days'    },
  { value: 'last_14',    label: 'Last 14 Days'   },
  { value: 'last_30',    label: 'Last 30 Days'   },
  { value: 'last_60',    label: 'Last 60 Days'   },
  { value: 'last_90',    label: 'Last 90 Days'   },
  { value: 'last_180',   label: 'Last 6 Months'  },
  { value: 'last_365',   label: 'Last 12 Months' },
]

// 'Unassigned' is a filter-only pseudo-value meaning "no status set" — it's
// never stored on a Company record, so it stays a hardcoded filter option
// rather than a managed dropdown value (see useDropdownOptions('company.leadStatus')
// for the real, admin-managed list this is appended to below).
const UNASSIGNED_STATUS_OPTION = { value: 'Unassigned', label: 'Unassigned' }

const TABS = [
  { key: 'all',        label: 'All companies'        },
  { key: 'mine',       label: 'My companies'         },
  { key: 'unassigned', label: 'Unassigned companies' },
  { key: 'favorites',  label: '★ Favorites'          },
]

export default function Companies({ recentsMode = false }) {
  const navigate      = useNavigate()
  const { user }      = useAuth()
  const { options: leadStatusValues } = useDropdownOptions('company.leadStatus')
  const leadStatusOptions = [
    ...leadStatusValues.map(s => ({ value: s.value, label: s.label })),
    UNASSIGNED_STATUS_OPTION,
  ]

  const [companies, setCompanies]     = useState([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [view, setView]               = useState(() => localStorage.getItem(VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'table')
  const [activeTab, setActiveTab]     = useState('all')
  const [page, setPage]               = useState(1)
  const [selected, setSelected]       = useState([])
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [sortBy, setSortBy] = useState(recentsMode ? 'createdAt' : '')
  const [sortDir, setSortDir] = useState(recentsMode ? 'desc' : 'asc')

  const [showCreate, setShowCreate]   = useState(false)
  const [showImport, setShowImport]   = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [recycleBinCount, setRecycleBinCount] = useState(0)
  const [recentCounts, setRecentCounts] = useState({ today: 0, last7: 0 })
  const [companySummary, setCompanySummary] = useState({ total: 0, withDeals: 0, unassigned: 0, withCms: 0 })

  const [ownerFilter,      setOwnerFilter]      = useState([])
  const [createDateFilter, setCreateDateFilter] = useState([])
  const [leadStatusFilter, setLeadStatusFilter] = useState([])
  const [industryFilter,   setIndustryFilter]   = useState([])
  const [countryFilter,    setCountryFilter]    = useState([])
  const [hasDealFilter,    setHasDealFilter]    = useState([])
  const [cmsFilter,        setCmsFilter]        = useState([])
  const [cmsOptions,       setCmsOptions]       = useState([])
  const [remarksFilter,    setRemarksFilter]    = useState([])
  const [remarksOptions,   setRemarksOptions]   = useState([])
  const [websiteFilter,    setWebsiteFilter]    = useState('')
  const [phoneFilter,      setPhoneFilter]      = useState('')
  const [emailFilter,      setEmailFilter]      = useState('')
  const [updatedDateFilter,setUpdatedDateFilter]= useState([])
  const [lastActivityFilter,setLastActivityFilter] = useState([])
  const { options: ownerDropdownOptions } = useDropdownOptions('company.ownerId')
  const { options: industryValues } = useDropdownOptions('company.industry')
  const { options: countryValues }  = useDropdownOptions('company.country')
  const industryOptions = industryValues.map(o => ({ value: o.value, label: o.label }))
  const countryOptions  = countryValues.map(o => ({ value: o.value, label: o.label }))

  useEffect(() => {
    Promise.all([
      api.get('/companies/filter-options/cms'),
      api.get('/companies/filter-options/remarks'),
    ]).then(([cmsResponse, remarksResponse]) => {
      setCmsOptions(cmsResponse.data?.options || [])
      setRemarksOptions(remarksResponse.data?.options || [])
    }).catch(() => {
      setCmsOptions([])
      setRemarksOptions([])
    })
  }, [])

  // Which OPTIONAL filters (Industry/Country) are currently shown in the
  // toolbar, chosen via the "+" button — persisted so the choice sticks
  // across reloads, same pattern as visibleColumns below.
  const [activeOptionalFilters, setActiveOptionalFilters] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPTIONAL_FILTERS_STORAGE_KEY))
      return Array.isArray(saved) ? saved : []
    } catch {
      return []
    }
  })
  const saveActiveOptionalFilters = (keys) => {
    // Removing a filter also clears its current selection immediately, so
    // "removing a selected filter removes its filtering effect" — not just
    // hides the chip while still filtering underneath.
    if (!keys.includes('industry')) setIndustryFilter([])
    if (!keys.includes('country'))  setCountryFilter([])
    if (!keys.includes('hasDeal'))  setHasDealFilter([])
    setActiveOptionalFilters(keys)
    localStorage.setItem(OPTIONAL_FILTERS_STORAGE_KEY, JSON.stringify(keys))
    setPage(1)
  }

  // Dynamic field list (all Create-Company fields) + user's chosen visible columns
  const [companyFields, setCompanyFields]     = useState([])
  const [visibleColumns, setVisibleColumns]   = useState(() => {
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

  // Recycle Bin badge count — refreshed on mount and after any delete action
  // on this page (deleting moves companies into the bin, changing the count).
  const fetchRecycleBinCount = useCallback(() => {
    api.get('/companies/recycle-bin').then(r => setRecycleBinCount(r.data.total || 0)).catch(() => {})
  }, [])
  useEffect(() => { fetchRecycleBinCount() }, [fetchRecycleBinCount])

  useEffect(() => {
    if (!recentsMode) return
    Promise.all([
      api.get('/companies', { params: { page: 1, limit: 1, createDate: 'today' } }),
      api.get('/companies', { params: { page: 1, limit: 1, createDate: 'last_7' } }),
    ]).then(([todayResponse, weekResponse]) => {
      setRecentCounts({
        today: todayResponse.data?.total || 0,
        last7: weekResponse.data?.total || 0,
      })
    }).catch(() => {})
  }, [recentsMode])

  useEffect(() => {
    if (recentsMode) return
    api.get('/companies/summary')
      .then(response => setCompanySummary(response.data || {}))
      .catch(() => {})
  }, [recentsMode])

  // Load the dynamic Company field list (same one Create/Import already use)
  useEffect(() => {
    api.get('/companies/import-fields').then(r => setCompanyFields(r.data.fields || [])).catch(() => {})
  }, [])

  const ownerOptions = [
    { value: user?.id || 'me', label: `Me (${user?.name || 'You'})` },
    // ownerDropdownOptions' own permanent Unassigned entry (value: '') is
    // excluded here — this filter uses the 'unassigned' sentinel value below
    // instead, which buildCompanyWhere interprets server-side (ownerId: null).
    ...ownerDropdownOptions
      .filter(o => o.value !== user?.id && o.value !== '')
      .map(o => ({ value: o.value, label: o.label })),
    { value: 'unassigned', label: 'Unassigned' },
  ]

  // Fetch companies from API
  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        view: activeTab === 'all' ? undefined : activeTab,
        ...(search && { search }),
        ...(ownerFilter.length      > 0 && { owners:       ownerFilter.join(',') }),
        ...(leadStatusFilter.length > 0 && { leadStatuses: leadStatusFilter.join(',') }),
        ...(createDateFilter.length > 0 && { createDate:   createDateFilter[0] }),
        // Array, not comma-joined — several industry values contain a
        // literal comma in their own name (e.g. "Construction, Building
        // Materials"), which a joined string would shred on the backend.
        ...(industryFilter.length   > 0 && { industries:   industryFilter }),
        ...(countryFilter.length    > 0 && { countries:    countryFilter.join(',') }),
        ...(hasDealFilter.length    > 0 && { hasDeal:      hasDealFilter[0] }),
        ...(cmsFilter.length > 0    && { cmsValues:    cmsFilter.join(',') }),
        ...(remarksFilter.length > 0 && { remarksValues: remarksFilter }),
        ...(websiteFilter.trim()    && { website:      websiteFilter.trim() }),
        ...(phoneFilter.trim()      && { phone:        phoneFilter.trim() }),
        ...(emailFilter.trim()      && { email:        emailFilter.trim() }),
        ...(updatedDateFilter.length > 0 && { updatedDate: updatedDateFilter[0] }),
        ...(lastActivityFilter.length > 0 && { lastActivity: lastActivityFilter[0] }),
        ...(sortBy && { sortBy, sortDir }),
      }
      const { data } = await api.get('/companies', { params })
      setCompanies(data.companies || [])
      setTotal(data.total || 0)
    } catch {
      setCompanies([])
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, search, ownerFilter, leadStatusFilter, createDateFilter, industryFilter, countryFilter, hasDealFilter, cmsFilter, remarksFilter, websiteFilter, phoneFilter, emailFilter, updatedDateFilter, lastActivityFilter, sortBy, sortDir])

  useEffect(() => { fetchCompanies() }, [fetchCompanies])

  // Carried to Company Details via navigate(..., { state }) so its
  // Previous/Next buttons can walk this exact filtered/sorted/tab-scoped
  // list — same param shape fetchCompanies sends, minus page/limit (the
  // neighbor lookup isn't page-bound, only filter-bound).
  const listContext = {
    view: activeTab === 'all' ? undefined : activeTab,
    ...(search && { search }),
    ...(ownerFilter.length      > 0 && { owners:       ownerFilter.join(',') }),
    ...(leadStatusFilter.length > 0 && { leadStatuses: leadStatusFilter.join(',') }),
    ...(createDateFilter.length > 0 && { createDate:   createDateFilter[0] }),
    ...(industryFilter.length   > 0 && { industries:   industryFilter }),
    ...(countryFilter.length    > 0 && { countries:    countryFilter.join(',') }),
    ...(hasDealFilter.length    > 0 && { hasDeal:      hasDealFilter[0] }),
    ...(cmsFilter.length > 0    && { cmsValues:    cmsFilter.join(',') }),
    ...(remarksFilter.length > 0 && { remarksValues: remarksFilter }),
    ...(websiteFilter.trim()    && { website:      websiteFilter.trim() }),
    ...(phoneFilter.trim()      && { phone:        phoneFilter.trim() }),
    ...(emailFilter.trim()      && { email:        emailFilter.trim() }),
    ...(updatedDateFilter.length > 0 && { updatedDate: updatedDateFilter[0] }),
    ...(lastActivityFilter.length > 0 && { lastActivity: lastActivityFilter[0] }),
    ...(sortBy && { sortBy, sortDir }),
  }
  const openCompany = (id) => navigate(`/companies/${id}`, { state: { listContext } })

  // Export: fetch EVERY company matching the current filters/search (no page
  // limit) — the dedicated /companies/export endpoint mirrors the same filter
  // logic as the paginated list so "current filters" always matches exactly.
  const fetchAllForExport = useCallback(async () => {
    const params = {
      view: activeTab === 'all' ? undefined : activeTab,
      ...(search && { search }),
      ...(ownerFilter.length      > 0 && { owners:       ownerFilter.join(',') }),
      ...(leadStatusFilter.length > 0 && { leadStatuses: leadStatusFilter.join(',') }),
      ...(createDateFilter.length > 0 && { createDate:   createDateFilter[0] }),
      ...(industryFilter.length   > 0 && { industries:   industryFilter }),
      ...(countryFilter.length    > 0 && { countries:    countryFilter.join(',') }),
      ...(hasDealFilter.length    > 0 && { hasDeal:      hasDealFilter[0] }),
      ...(cmsFilter.length > 0    && { cmsValues:    cmsFilter.join(',') }),
      ...(remarksFilter.length > 0 && { remarksValues: remarksFilter }),
      ...(websiteFilter.trim()    && { website:      websiteFilter.trim() }),
      ...(phoneFilter.trim()      && { phone:        phoneFilter.trim() }),
      ...(emailFilter.trim()      && { email:        emailFilter.trim() }),
      ...(updatedDateFilter.length > 0 && { updatedDate: updatedDateFilter[0] }),
      ...(lastActivityFilter.length > 0 && { lastActivity: lastActivityFilter[0] }),
      ...(sortBy && { sortBy, sortDir }),
    }
    const { data } = await api.get('/companies/export', { params })
    return data.companies || []
  }, [activeTab, search, ownerFilter, leadStatusFilter, createDateFilter, industryFilter, countryFilter, hasDealFilter, cmsFilter, remarksFilter, websiteFilter, phoneFilter, emailFilter, updatedDateFilter, lastActivityFilter, sortBy, sortDir])

  // Tab change resets page
  const switchTab = (key) => { setActiveTab(key); setPage(1); setSelected([]) }
  const switchView = (nextView) => {
    setView(nextView)
    setSelected([])
    localStorage.setItem(VIEW_STORAGE_KEY, nextView)
  }

  // Select all toggle
  const allSelected = companies.length > 0 && selected.length === companies.length
  const toggleAll   = () => setSelected(allSelected ? [] : companies.map(c => c.id))
  const toggleOne   = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const toggleFavorite = async (e, id) => {
    e.stopPropagation()
    const { data } = await api.patch(`/companies/${id}/favorite`)
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, isFavorite: data.isFavorite } : c))
  }

  const deleteSelected = async () => {
    if (!selected.length) return
    if (!window.confirm(`Move ${selected.length} selected compan${selected.length === 1 ? 'y' : 'ies'} to the Recycle Bin? You can restore them within 30 days.`)) return
    setDeleting(true)
    try {
      await api.delete('/companies/bulk', { data: { ids: selected } })
      setSelected([])
      fetchCompanies()
      fetchRecycleBinCount()
    } catch {
      // no-op — matches existing lightweight error handling style on this page
    } finally {
      setDeleting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = ownerFilter.length > 0 || createDateFilter.length > 0 || leadStatusFilter.length > 0
    || industryFilter.length > 0 || countryFilter.length > 0 || hasDealFilter.length > 0
    || cmsFilter.length > 0 || remarksFilter.length > 0 || websiteFilter || phoneFilter || emailFilter
    || updatedDateFilter.length > 0 || lastActivityFilter.length > 0

  const clearAllFilters = () => {
    setOwnerFilter([]); setCreateDateFilter([]); setLeadStatusFilter([])
    setIndustryFilter([]); setCountryFilter([]); setHasDealFilter([])
    setCmsFilter([]); setRemarksFilter([]); setWebsiteFilter(''); setPhoneFilter(''); setEmailFilter('')
    setUpdatedDateFilter([]); setLastActivityFilter([]); setPage(1)
  }
  const clearOneFilter = (setter, emptyValue) => { setter(emptyValue); setPage(1) }

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
    setPage(1)
  }

  const SortIcon = ({ column }) => sortBy === column
    ? (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
    : <ArrowUpDown size={12} />

  // Export always includes every Company field (a superset of the visible
  // table columns) — except 'phone', the legacy primary-scalar mirror of the
  // 'phones' array (we've fully migrated to the multi-value field, so only
  // Phones should appear), and 'deletedAt', an internal Recycle Bin field
  // that should never appear in a normal Company export.
  const exportColumns = companyFields
    .filter(f => f.key !== 'phone' && f.key !== 'deletedAt')
    .map(f => ({ key: f.key, header: f.label }))
  // Edit Columns offers Lead Owner alongside the server's dynamic field list —
  // client-side only, doesn't touch Export/Import's field list.
  // 'emails'/'phones' are the raw storage arrays behind the 'email'/'phone'
  // columns (which already show the primary value + a "+N" badge for the
  // rest) — hidden here to avoid a duplicate, differently-formatted column
  // for the same data. Export still gets the full list via exportColumns.
  const editColumnsFields = [
    ...companyFields.filter(f => f.key !== 'emails' && f.key !== 'phones' && !INTERNAL_COLUMN_KEYS.has(f.key)),
    LEAD_OWNER_COLUMN,
  ]
  // Table columns shown, in the field list's canonical order (not toggle order)
  const orderedVisibleFields = editColumnsFields.filter(f => visibleColumns.includes(f.key))

  function renderCompanyCell(f, c) {
    if (f.key === 'email') {
      return <>{c.email || '--'}<MoreBadge n={moreCount(c.email, c.emails)} /></>
    }
    if (f.key === 'phone') {
      return <>{c.phone || '--'}<MoreBadge n={moreCount(c.phone, c.phones)} /></>
    }
    if (f.key === 'ownerId') {
      return c.owner?.name
        ? <span className="company-owner-cell"><i>{c.owner.name.slice(0, 1).toUpperCase()}</i>{c.owner.name}</span>
        : <span className="company-empty-value">Unassigned</span>
    }
    if (f.key === 'cms') {
      const value = String(c.cms || '').trim()
      return value && value !== '--'
        ? <span className="company-data-pill cms-pill"><Layers size={11} />{value}</span>
        : <span className="company-empty-value">Not identified</span>
    }
    if (f.key === 'leadStatus' || f.key === 'status') {
      const value = String(c[f.key] || '').trim()
      const tone = /won|active|qualified/i.test(value) ? 'positive' : /lost|inactive/i.test(value) ? 'negative' : 'neutral'
      return value
        ? <span className={`company-data-pill status-pill ${tone}`}>{value}</span>
        : <span className="company-empty-value">Not set</span>
    }
    if (f.key === 'remarks') {
      const value = String(c.remarks || '').trim()
      const tone = /less data|missing|incomplete/i.test(value) ? 'attention' : 'neutral'
      return value && value !== '--'
        ? <span className={`company-data-pill remark-pill ${tone}`}>{value}</span>
        : <span className="company-empty-value">No remarks</span>
    }
    if (f.key.startsWith('custom.')) return renderCustomCell(f.type, c[f.key])
    const v = c[f.key]
    if (Array.isArray(v)) return v.length ? v.join(', ') : '--'
    return (v === null || v === undefined || v === '') ? '--' : String(v)
  }

  function companyCellTitle(f, c) {
    if (f.key === 'email') return valueList(c.email, c.emails).join('; ') || '--'
    if (f.key === 'phone') return valueList(c.phone, c.phones).join('; ') || '--'
    if (f.key === 'ownerId') return c.owner?.name || '--'
    const value = c[f.key]
    if (Array.isArray(value)) return value.join(', ')
    return value === null || value === undefined || value === '' ? '--' : String(value)
  }

  return (
    <div className={`contacts-container companies-page${recentsMode ? ' recents-workspace' : ''}`}>

      {/* ── Header ── */}
      {recentsMode ? (
        <>
          <section className="recents-hero">
            <div className="recents-hero-copy">
              <span className="recents-eyebrow"><History size={13} /> Recently added</span>
              <h1>See what’s new in your CRM</h1>
              <p>Every newly created company appears here first, so your team can discover fresh accounts and take action quickly.</p>
              <div className="recents-hero-meta">
                <span><CheckCircle2 size={14} /> Newest companies first</span>
                <span><CheckCircle2 size={14} /> “New” tag for the first 24 hours</span>
              </div>
            </div>
            <div className="recents-hero-actions">
              <button type="button" className="recents-import-primary" onClick={() => setShowCreate(true)}>
                <Plus size={18} /> Create company <ArrowRight size={16} />
              </button>
              <button type="button" className="recents-create-secondary" onClick={() => navigate('/companies')}>
                View all companies
              </button>
            </div>
            <div className="recents-hero-stats">
              <div><span>Total records</span><strong>{total.toLocaleString()}</strong></div>
              <div><span>Added today</span><strong>{recentCounts.today.toLocaleString()}</strong></div>
              <div><span>Added last 7 days</span><strong>{recentCounts.last7.toLocaleString()}</strong></div>
            </div>
          </section>

          <div className="recents-list-heading">
            <div><span className="recents-eyebrow">Fresh accounts</span><h2>Recently created companies</h2><p>Latest created records appear first. Companies under 24 hours old carry a “New” tag.</p></div>
            <div className="recents-list-actions">
              <button className="btn-action" onClick={() => navigate('/companies/recycle-bin')}><Trash2 size={14} /> Recycle Bin{recycleBinCount > 0 ? ` (${recycleBinCount})` : ''}</button>
              <button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} /> Create company</button>
            </div>
          </div>
        </>
      ) : <>
        <section className="companies-hero">
          <div className="companies-hero-copy">
            <span className="companies-hero-eyebrow"><Building2 size={14} /> Account workspace</span>
            <h1>Know every company.<br />Grow every relationship.</h1>
            <p>Keep account context, ownership and opportunities in one focused workspace built for action.</p>
          </div>
          <div className="companies-hero-actions">
            <div className="companies-hero-secondary-actions">
              <button onClick={() => navigate('/companies/recycle-bin')}>
                <Trash2 size={15} /> Recycle Bin{recycleBinCount > 0 ? ` (${recycleBinCount})` : ''}
              </button>
              <button onClick={() => setShowImport(true)}><Download size={15} /> Import</button>
            </div>
            <button className="companies-hero-primary" onClick={() => setShowCreate(true)}>
              <Plus size={17} /> Create company <ArrowRight size={15} />
            </button>
          </div>
        </section>

        <section className="company-summary-grid" aria-label="Company overview">
          <article className="company-summary-card total"><span><Building2 size={17} /></span><div><small>Total companies</small><strong>{Number(companySummary.total || total).toLocaleString()}</strong><p>Your complete account database</p></div></article>
          <article
            className="company-summary-card deals"
            onClick={() => {
              setHasDealFilter(['yes'])
              if (!activeOptionalFilters.includes('hasDeal')) {
                const next = [...activeOptionalFilters, 'hasDeal']
                setActiveOptionalFilters(next)
                localStorage.setItem(OPTIONAL_FILTERS_STORAGE_KEY, JSON.stringify(next))
              }
              setPage(1)
            }}
            style={{ cursor: 'pointer' }}
            title="Click to filter companies linked to deals"
          >
            <span><Briefcase size={17} /></span><div><small>With active context</small><strong>{Number(companySummary.withDeals || 0).toLocaleString()}</strong><p>Companies linked to deals</p></div>
          </article>
          <article className="company-summary-card owner"><span><UserX size={17} /></span><div><small>Needs an owner</small><strong>{Number(companySummary.unassigned || 0).toLocaleString()}</strong><p>Ready for team assignment</p></div></article>
          <article className="company-summary-card cms"><span><Layers size={17} /></span><div><small>CMS identified</small><strong>{Number(companySummary.withCms || 0).toLocaleString()}</strong><p>Technology data available</p></div></article>
        </section>

        {selected.length > 0 && (
          <div className="company-bulk-bar">
            <span><CheckCircle2 size={15} /> {selected.length} compan{selected.length === 1 ? 'y' : 'ies'} selected</span>
            {selected.length > 0 && (
              <button onClick={deleteSelected} disabled={deleting}><Trash2 size={14} /> {deleting ? 'Moving…' : 'Move to Recycle Bin'}</button>
            )}
          </div>
        )}
      </>}

      <section className="companies-data-shell">

      {/* ── Tabs ── */}
      <div className="filter-tabs">
        {TABS.map(t => (
          <button type="button" key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => switchTab(t.key)}>
            {recentsMode ? ({ all: 'All recent records', mine: 'My recent records', unassigned: 'Unassigned records' }[t.key]) : t.label}
          </button>
        ))}
      </div>

      {/* ── Filter chips row ── */}
      <div className="filter-chips-row">
        <div className="chips-left">
          <FilterDropdown
            label="Lead Owner"
            options={ownerOptions}
            selected={ownerFilter}
            onChange={v => { setOwnerFilter(v); setPage(1) }}
          />
          <FilterDropdown
            label="CMS platform"
            options={cmsOptions}
            selected={cmsFilter}
            onChange={v => { setCmsFilter(v); setPage(1) }}
          />
          <FilterDropdown
            label="Remarks"
            options={remarksOptions}
            selected={remarksFilter}
            onChange={v => { setRemarksFilter(v); setPage(1) }}
          />
          <DateFilterDropdown
            label="Created date"
            presets={DATE_OPTIONS}
            value={createDateFilter[0] || ''}
            onChange={v => { setCreateDateFilter(v); setPage(1) }}
          />
          <FilterDropdown
            label="Lead status"
            options={leadStatusOptions}
            selected={leadStatusFilter}
            onChange={v => { setLeadStatusFilter(v); setPage(1) }}
          />
          {activeOptionalFilters.includes('industry') && (
            <FilterDropdown
              label="Industry"
              options={industryOptions}
              selected={industryFilter}
              onChange={v => { setIndustryFilter(v); setPage(1) }}
            />
          )}
          {activeOptionalFilters.includes('country') && (
            <FilterDropdown
              label="Country"
              options={countryOptions}
              selected={countryFilter}
              onChange={v => { setCountryFilter(v); setPage(1) }}
            />
          )}
          {activeOptionalFilters.includes('hasDeal') && (
            <FilterDropdown
              label="Deals Created"
              options={HAS_DEAL_OPTIONS}
              selected={hasDealFilter}
              onChange={v => { setHasDealFilter(v); setPage(1) }}
              searchable={false}
              singleSelect
            />
          )}
          <AddFilterMenu fields={OPTIONAL_FILTER_DEFS} activeKeys={activeOptionalFilters} onSave={saveActiveOptionalFilters} />
          <button className="filter-chip chip-icon" title="Edit filters"><Pencil size={13} /></button>
          <button className={`filter-chip advanced-filter${showAdvancedFilters ? ' active' : ''}`} onClick={() => setShowAdvancedFilters(v => !v)}>
            <SlidersHorizontal size={13} /> Advanced filters
            {hasFilters && <span className="filter-count-dot" />}
            <ChevronDown size={11} className={showAdvancedFilters ? 'rotated' : ''} />
          </button>
          {hasFilters && (
            <button className="filter-chip clear-filter-btn" onClick={clearAllFilters}>
              Clear all
            </button>
          )}
        </div>

        <div className="chips-right">
          <div className="search-box">
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search companies"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <CompanyExportMenu fetchAllForExport={fetchAllForExport} columns={exportColumns} />
          <EditColumnsMenu fields={editColumnsFields} visibleColumns={visibleColumns} onSave={saveVisibleColumns} />
          <div className="view-toggle">
            <button aria-label="Table view" title="Table view" className={`view-btn ${view === 'table' ? 'active' : ''}`} onClick={() => switchView('table')}><List size={13} /></button>
            <button aria-label="Grid view" title="Grid view" className={`view-btn ${view === 'grid'  ? 'active' : ''}`} onClick={() => switchView('grid')}><LayoutGrid size={13} /></button>
          </div>
        </div>
      </div>

      {showAdvancedFilters && (
        <div className="advanced-filters-panel">
          <div className="advanced-filters-head">
            <div><strong>Advanced Filters</strong><span>Combine multiple conditions to narrow the company list.</span></div>
            <button type="button" className="advanced-close" onClick={() => setShowAdvancedFilters(false)} aria-label="Close Advanced Filters"><X size={14} /></button>
          </div>
          <div className="advanced-filter-grid">
            {!activeOptionalFilters.includes('industry') && <FilterDropdown label="Industry" options={industryOptions} selected={industryFilter} onChange={v => { setIndustryFilter(v); setPage(1) }} />}
            {!activeOptionalFilters.includes('country') && <FilterDropdown label="Country" options={countryOptions} selected={countryFilter} onChange={v => { setCountryFilter(v); setPage(1) }} />}
            {!activeOptionalFilters.includes('hasDeal') && <FilterDropdown label="Deals Created" options={HAS_DEAL_OPTIONS} selected={hasDealFilter} onChange={v => { setHasDealFilter(v); setPage(1) }} searchable={false} singleSelect />}
            <AdvancedTextFilter label="Website" value={websiteFilter} onChange={v => { setWebsiteFilter(v); setPage(1) }} placeholder="Domain or URL" />
            <AdvancedTextFilter label="Phone" value={phoneFilter} onChange={v => { setPhoneFilter(v); setPage(1) }} placeholder="Contains number" />
            <AdvancedTextFilter label="Email" value={emailFilter} onChange={v => { setEmailFilter(v); setPage(1) }} placeholder="Contains email" />
            <DateFilterDropdown label="Updated date" presets={DATE_OPTIONS} value={updatedDateFilter[0] || ''} onChange={v => { setUpdatedDateFilter(v); setPage(1) }} />
            <DateFilterDropdown label="Last activity date" presets={DATE_OPTIONS} value={lastActivityFilter[0] || ''} onChange={v => { setLastActivityFilter(v); setPage(1) }} />
          </div>
          <div className="advanced-filters-foot">
            <span>{hasFilters ? 'Filters apply instantly to the table and export.' : 'No advanced filters applied.'}</span>
            {hasFilters && <button type="button" onClick={clearAllFilters}>Clear All</button>}
          </div>
        </div>
      )}

      {hasFilters && (
        <div className="active-filter-strip" aria-label="Active filters">
          <span className="active-filter-label">Active filters</span>
          {ownerFilter.length > 0 && <button onClick={() => clearOneFilter(setOwnerFilter, [])}>Lead Owner · {ownerFilter.length}<X size={10} /></button>}
          {createDateFilter.length > 0 && <button onClick={() => clearOneFilter(setCreateDateFilter, [])}>Created · {describeDateToken(createDateFilter[0], DATE_OPTIONS)}<X size={10} /></button>}
          {leadStatusFilter.length > 0 && <button onClick={() => clearOneFilter(setLeadStatusFilter, [])}>Lead status · {leadStatusFilter.length}<X size={10} /></button>}
          {industryFilter.length > 0 && <button onClick={() => clearOneFilter(setIndustryFilter, [])}>Industry · {industryFilter.length}<X size={10} /></button>}
          {countryFilter.length > 0 && <button onClick={() => clearOneFilter(setCountryFilter, [])}>Country · {countryFilter.length}<X size={10} /></button>}
          {hasDealFilter.length > 0 && <button onClick={() => clearOneFilter(setHasDealFilter, [])}>Deals Created<X size={10} /></button>}
          {cmsFilter.length > 0 && <button onClick={() => clearOneFilter(setCmsFilter, [])}>CMS · {cmsFilter.length === 1 ? cmsFilter[0] : `${cmsFilter.length} selected`}<X size={10} /></button>}
          {remarksFilter.length > 0 && <button onClick={() => clearOneFilter(setRemarksFilter, [])}>Remarks · {remarksFilter.length === 1 ? remarksFilter[0] : `${remarksFilter.length} selected`}<X size={10} /></button>}
          {websiteFilter && <button onClick={() => clearOneFilter(setWebsiteFilter, '')}>Website<X size={10} /></button>}
          {phoneFilter && <button onClick={() => clearOneFilter(setPhoneFilter, '')}>Phone<X size={10} /></button>}
          {emailFilter && <button onClick={() => clearOneFilter(setEmailFilter, '')}>Email<X size={10} /></button>}
          {updatedDateFilter.length > 0 && <button onClick={() => clearOneFilter(setUpdatedDateFilter, [])}>Updated · {describeDateToken(updatedDateFilter[0], DATE_OPTIONS)}<X size={10} /></button>}
          {lastActivityFilter.length > 0 && <button onClick={() => clearOneFilter(setLastActivityFilter, [])}>Last activity · {describeDateToken(lastActivityFilter[0], DATE_OPTIONS)}<X size={10} /></button>}
          <button className="strip-clear" onClick={clearAllFilters}>Clear All</button>
        </div>
      )}

      {/* ── Table / Grid ── */}
      {view === 'table' ? (
      <div className="contacts-table-wrapper">
        <table className="contacts-table">
          <thead>
            <tr>
              <th className="select-column"><input type="checkbox" aria-label="Select all companies" checked={allSelected} onChange={toggleAll} /></th>
              <th className="pin-column" />
              <th>
                <button type="button" className={`sort-button${sortBy === 'name' ? ' active' : ''}`} onClick={() => toggleSort('name')}>
                  COMPANY <SortIcon column="name" />
                </button>
              </th>
              {orderedVisibleFields.map(f => (
                <th key={f.key}>
                  {SORTABLE_COLUMN_KEYS.has(f.key) ? (
                    <button type="button" className={`sort-button${sortBy === f.key ? ' active' : ''}`} onClick={() => toggleSort(f.key)}>
                      {f.label.toUpperCase()} <SortIcon column={f.key} />
                    </button>
                  ) : f.label.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 9 }).map((_, row) => (
                <tr className="company-skeleton-row" key={row} aria-label={row === 0 ? 'Loading...' : undefined}>
                  {Array.from({ length: 3 + orderedVisibleFields.length }).map((__, cell) => <td key={cell}><span /></td>)}
                </tr>
              ))
            ) : companies.length === 0 ? (
              <tr><td colSpan={3 + orderedVisibleFields.length} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No companies found</td></tr>
            ) : companies.map(c => (
              <tr key={c.id} className={selected.includes(c.id) ? 'selected-row' : ''}>
                <td className="select-column"><input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.includes(c.id)} onChange={() => toggleOne(c.id)} /></td>
                <td>
                  <button
                    onClick={e => toggleFavorite(e, c.id)}
                    title={c.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                    className="pin-button"
                  >
                    <Star size={15} color={c.isFavorite ? '#f59e0b' : '#cbd5e1'} fill={c.isFavorite ? '#f59e0b' : 'none'} />
                  </button>
                </td>
                <td className="name-cell">
                  <span className="avatar" style={{ fontSize: '10px', letterSpacing: '-0.5px' }}>
                    {(c.name || '??').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="company-name-stack">
                    <span className="link-style" title={c.name} onClick={() => openCompany(c.id)}>{c.name}</span>
                    {c._count?.deals > 0 && <small>{c._count.deals} active deal{c._count.deals > 1 ? 's' : ''}</small>}
                  </span>
                  <NewBadge createdAt={c.createdAt} />
                  <button type="button" className="row-open-btn" title="Open company" onClick={() => openCompany(c.id)}><ExternalLink size={12} /></button>
                </td>
                {orderedVisibleFields.map(f => <td key={f.key} data-tooltip={companyCellTitle(f, c)}><div className="cell-clamp">{renderCompanyCell(f, c)}</div></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : (
        <div className="company-grid-view" aria-label="Companies grid">
          <div className="grid-view-toolbar">
            <label><input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all on page</label>
            <span>{companies.length} shown</span>
            <div className="grid-sort-control">
              <select aria-label="Sort companies" value={sortBy} onChange={e => { setSortBy(e.target.value); setSortDir('asc'); setPage(1) }}>
                <option value="">Default order</option>
                {recentsMode && <option value="createdAt">Recently created</option>}
                <option value="name">Company</option>
                {orderedVisibleFields.filter(f => SORTABLE_COLUMN_KEYS.has(f.key)).map(f => <option value={f.key} key={f.key}>{f.label}</option>)}
              </select>
              <button type="button" aria-label="Toggle sort direction" disabled={!sortBy} onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>
                {sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              </button>
            </div>
          </div>
          {loading ? (
            Array.from({ length: 12 }).map((_, index) => <div className="company-grid-card grid-skeleton-card" key={index}><i /><b /><span /><span /><span /></div>)
          ) : companies.length === 0 ? (
            <div className="grid-empty-state">No companies found</div>
          ) : companies.map(c => (
            <article key={c.id} className={`company-grid-card${selected.includes(c.id) ? ' selected' : ''}`}>
              <div className="grid-card-actions">
                <input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.includes(c.id)} onChange={() => toggleOne(c.id)} />
                <button onClick={e => toggleFavorite(e, c.id)} title={c.isFavorite ? 'Remove from favorites' : 'Add to favorites'} className="pin-button">
                  <Star size={14} color={c.isFavorite ? '#f59e0b' : '#cbd5e1'} fill={c.isFavorite ? '#f59e0b' : 'none'} />
                </button>
              </div>
              <div className="grid-company-head">
                <span className="avatar">{(c.name || '??').slice(0, 2).toUpperCase()}</span>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button type="button" className="grid-company-name" title={c.name} onClick={() => openCompany(c.id)}>{c.name}</button>
                    <NewBadge createdAt={c.createdAt} />
                  </div>
                  {c._count?.deals > 0 && <span className="grid-deal-badge" title={`${c._count.deals} deal${c._count.deals > 1 ? 's' : ''} for this company`}>{c._count.deals} deal{c._count.deals > 1 ? 's' : ''}</span>}
                </div>
                <button type="button" className="grid-open-btn" title="Open company" onClick={() => openCompany(c.id)}><ExternalLink size={12} /></button>
              </div>
              <div className="grid-field-list">
                {orderedVisibleFields.map(f => (
                  <div className="grid-field-row" key={f.key} title={companyCellTitle(f, c)}>
                    <span>{f.label}</span><strong>{renderCompanyCell(f, c)}</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      <div className="contacts-pagination">
        <div className="page-nav">
          <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          {pageWindow(page, totalPages).map((n, i, arr) => (
            <span key={n} style={{ display: 'contents' }}>
              {i > 0 && n - arr[i - 1] > 1 && <span className="page-ellipsis" style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>}
              <button className={`page-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)}>{n}</button>
            </span>
          ))}
          <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
        <span className="per-page">{PAGE_SIZE} per page</span>
      </div>
      </section>

      {/* ── Modals ── */}
      <CreateCompanyModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={async (form) => {
          await api.post('/companies', form)
          fetchCompanies()
        }}
      />

      <ImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => { fetchCompanies(); setShowImport(false) }}
      />
    </div>
  )
}
