import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, LayoutGrid, List, Download, Plus,
  ChevronDown, SlidersHorizontal, Pencil, Upload, Columns, Trash2
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import FilterDropdown from '../components/filters/FilterDropdown'
import CreateCompanyModal from '../components/modals/CreateCompanyModal'
import ImportModal from '../components/modals/ImportModal'
import { valueList } from '../utils/multiValue'
import { exportCSV, exportXLSX, exportJSON, exportPDF } from '../utils/exportUtils'
import '../styles/contacts.css'

// "+N" badge when a company has more than one email.
const moreCount = (primary, arr) => Math.max(0, valueList(primary, arr).length - 1)
const MoreBadge = ({ n }) => n > 0
  ? <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>+{n}</span>
  : null

const COLUMNS_STORAGE_KEY = 'mwz_companies_visible_columns'
const DEFAULT_COLUMNS = ['country', 'industry', 'email', 'phone', 'domain']

// Lead Owner (ownerId) is intentionally excluded from the server's dynamic
// Company field list — that list is shared with the Import Template, and
// ownerId has its own dropdown/name-matching logic there that must not be
// touched. This is a client-side-only column entry so "Edit Columns" can
// offer it without affecting Import, Create, or Edit Company in any way.
const LEAD_OWNER_COLUMN = { key: 'ownerId', label: 'Lead Owner' }

// These Company fields are no longer part of the current workflow — hidden
// from Edit Columns (and Create/Edit Company) but left in the schema/Export,
// since they were never asked to be removed from Export or the database.
const RETIRED_COLUMN_KEYS = new Set([
  'industryType', 'companyType', 'leadType', 'employeeCount', 'revenue',
  'city', 'stateRegion', 'postalCode', 'timeZone', 'originalTrafficSource',
  'description', 'lifecycleStage', 'linkedinUrl',
])

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

// ── Edit Columns dropdown — shows every Create-Company field as a checkbox;
// Save updates the visible table columns and remembers the choice.
function EditColumnsMenu({ fields, visibleColumns, onSave }) {
  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState(visibleColumns)
  const ref = useRef(null)

  useEffect(() => { if (open) setDraft(visibleColumns) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const toggle = (key) => setDraft(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const save   = () => { onSave(draft); setOpen(false) }

  const toggleable = fields.filter(f => f.key !== 'name') // Company name column is always shown

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn-action btn-sm" onClick={() => setOpen(o => !o)}>
        <Columns size={13} /> Edit columns
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 3000, minWidth: 240, maxHeight: 340, overflowY: 'auto', padding: 8 }}>
          {toggleable.map(f => (
            <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontSize: 13, color: '#334155', cursor: 'pointer', borderRadius: 4 }}>
              <input type="checkbox" checked={draft.includes(f.key)} onChange={() => toggle(f.key)} />
              {f.label}
            </label>
          ))}
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 6, paddingTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={save}>Save</button>
          </div>
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
  { value: 'tomorrow',   label: 'Tomorrow'       },
  { value: 'this_week',  label: 'This Week'      },
  { value: 'last_7',     label: 'Last 7 Days'    },
  { value: 'last_30',    label: 'Last 30 Days'   },
  { value: 'last_90',    label: 'Last 90 Days'   },
]

const LEAD_STATUS_OPTIONS = [
  { value: 'New',                  label: 'New'                  },
  { value: 'Open',                 label: 'Open'                 },
  { value: 'In Progress',          label: 'In Progress'          },
  { value: 'Open Deal',            label: 'Open Deal'            },
  { value: 'Unqualified',          label: 'Unqualified'          },
  { value: 'Attempted to Contact', label: 'Attempted to Contact' },
  { value: 'Connected',            label: 'Connected'            },
  { value: 'Bad Timing',           label: 'Bad Timing'           },
  { value: 'Unassigned',           label: 'Unassigned'           },
]

const TABS = [
  { key: 'all',        label: 'All companies'        },
  { key: 'mine',       label: 'My companies'         },
  { key: 'unassigned', label: 'Unassigned companies' },
]

export default function Companies() {
  const navigate      = useNavigate()
  const { user }      = useAuth()

  const [companies, setCompanies]     = useState([])
  const [total, setTotal]             = useState(0)
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [view, setView]               = useState('table')
  const [activeTab, setActiveTab]     = useState('all')
  const [page, setPage]               = useState(1)
  const [selected, setSelected]       = useState([])

  const [showCreate, setShowCreate]   = useState(false)
  const [showImport, setShowImport]   = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [recycleBinCount, setRecycleBinCount] = useState(0)

  const [ownerFilter,      setOwnerFilter]      = useState([])
  const [createDateFilter, setCreateDateFilter] = useState([])
  const [leadStatusFilter, setLeadStatusFilter] = useState([])
  const [users, setUsers]                       = useState([])

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

  // Load users for Company Owner filter
  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
  }, [])

  // Recycle Bin badge count — refreshed on mount and after any delete action
  // on this page (deleting moves companies into the bin, changing the count).
  const fetchRecycleBinCount = useCallback(() => {
    api.get('/companies/recycle-bin').then(r => setRecycleBinCount(r.data.total || 0)).catch(() => {})
  }, [])
  useEffect(() => { fetchRecycleBinCount() }, [fetchRecycleBinCount])

  // Load the dynamic Company field list (same one Create/Import already use)
  useEffect(() => {
    api.get('/companies/import-fields').then(r => setCompanyFields(r.data.fields || [])).catch(() => {})
  }, [])

  const ownerOptions = [
    { value: user?.id || 'me', label: `Me (${user?.name || 'You'})` },
    ...users
      .filter(u => u.id !== user?.id)
      .map(u => ({ value: u.id, label: u.name })),
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
      }
      const { data } = await api.get('/companies', { params })
      setCompanies(data.companies || [])
      setTotal(data.total || 0)
    } catch {
      setCompanies([])
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, search, ownerFilter, leadStatusFilter, createDateFilter])

  useEffect(() => { fetchCompanies() }, [fetchCompanies])

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
    }
    const { data } = await api.get('/companies/export', { params })
    return data.companies || []
  }, [activeTab, search, ownerFilter, leadStatusFilter, createDateFilter])

  // Tab change resets page
  const switchTab = (key) => { setActiveTab(key); setPage(1); setSelected([]) }

  // Select all toggle
  const allSelected = companies.length > 0 && selected.length === companies.length
  const toggleAll   = () => setSelected(allSelected ? [] : companies.map(c => c.id))
  const toggleOne   = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

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

  // Export always includes every Company field (a superset of the visible
  // table columns).
  const exportColumns = companyFields.map(f => ({ key: f.key, header: f.label }))
  // Edit Columns offers Lead Owner alongside the server's dynamic field list —
  // client-side only, doesn't touch Export/Import's field list.
  // 'emails'/'phones' are the raw storage arrays behind the 'email'/'phone'
  // columns (which already show the primary value + a "+N" badge for the
  // rest) — hidden here to avoid a duplicate, differently-formatted column
  // for the same data. Export still gets the full list via exportColumns.
  const editColumnsFields = [
    ...companyFields.filter(f => f.key !== 'emails' && f.key !== 'phones' && !RETIRED_COLUMN_KEYS.has(f.key) && !INTERNAL_COLUMN_KEYS.has(f.key)),
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
      return c.owner?.name || '--'
    }
    const v = c[f.key]
    if (Array.isArray(v)) return v.length ? v.join(', ') : '--'
    return (v === null || v === undefined || v === '') ? '--' : String(v)
  }

  return (
    <div className="contacts-container">

      {/* ── Header ── */}
      <div className="contacts-header">
        <div className="header-left">
          <h1 className="contacts-title">
            Companies <ChevronDown size={18} style={{ verticalAlign: 'middle', color: '#64748b' }} />
          </h1>
          <span className="records-count">{total} records</span>
        </div>
        <div className="header-actions">
          {selected.length > 0 && (
            <button
              className="btn-action"
              style={{ color: '#ef4444', borderColor: '#fecaca' }}
              onClick={deleteSelected}
              disabled={deleting}
            >
              <Trash2 size={14} /> {deleting ? 'Moving…' : `Delete selected (${selected.length})`}
            </button>
          )}
          <button className="btn-action" onClick={() => navigate('/companies/recycle-bin')}>
            <Trash2 size={14} /> Recycle Bin{recycleBinCount > 0 ? ` (${recycleBinCount})` : ''}
          </button>
          <button className="btn-action" onClick={() => setShowImport(true)}>
            <Download size={14} /> Import
          </button>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create company
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="filter-tabs">
        {TABS.map(t => (
          <div key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => switchTab(t.key)}>
            {t.label}
          </div>
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
            label="Create date"
            options={DATE_OPTIONS}
            selected={createDateFilter}
            onChange={v => { setCreateDateFilter(v); setPage(1) }}
            searchable={false}
          />
          <FilterDropdown
            label="Lead status"
            options={LEAD_STATUS_OPTIONS}
            selected={leadStatusFilter}
            onChange={v => { setLeadStatusFilter(v); setPage(1) }}
          />
          <button className="filter-chip chip-icon" title="Add filter"><Plus size={13} /></button>
          <button className="filter-chip chip-icon" title="Edit filters"><Pencil size={13} /></button>
          <button className="filter-chip advanced-filter"><SlidersHorizontal size={13} /> Advanced filters</button>
          {hasFilters && (
            <button className="filter-chip" style={{ color: '#ef4444', borderColor: '#fecaca' }}
              onClick={() => { setOwnerFilter([]); setCreateDateFilter([]); setLeadStatusFilter([]); setPage(1) }}>
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
            <button className={`view-btn ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}><List size={14} /></button>
            <button className={`view-btn ${view === 'grid'  ? 'active' : ''}`} onClick={() => setView('grid')}><LayoutGrid size={14} /></button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="contacts-table-wrapper">
        <table className="contacts-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
              <th>COMPANY</th>
              {orderedVisibleFields.map(f => <th key={f.key}>{f.label.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={2 + orderedVisibleFields.length} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading...</td></tr>
            ) : companies.length === 0 ? (
              <tr><td colSpan={2 + orderedVisibleFields.length} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No companies found</td></tr>
            ) : companies.map(c => (
              <tr key={c.id}>
                <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleOne(c.id)} /></td>
                <td className="name-cell">
                  <span className="avatar" style={{ fontSize: '10px', letterSpacing: '-0.5px' }}>
                    {(c.name || '??').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="link-style" onClick={() => navigate(`/companies/${c.id}`)}>{c.name}</span>
                </td>
                {orderedVisibleFields.map(f => <td key={f.key}>{renderCompanyCell(f, c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
