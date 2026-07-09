import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, LayoutGrid, List, Download, Plus,
  ChevronDown, SlidersHorizontal, Pencil, Upload, Columns
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import FilterDropdown from '../components/filters/FilterDropdown'
import CreateCompanyModal from '../components/modals/CreateCompanyModal'
import ImportModal from '../components/modals/ImportModal'
import { valueList } from '../utils/multiValue'
import '../styles/contacts.css'

// "+N" badge when a company has more than one email.
const moreCount = (primary, arr) => Math.max(0, valueList(primary, arr).length - 1)
const MoreBadge = ({ n }) => n > 0
  ? <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>+{n}</span>
  : null

const PAGE_SIZE = 25

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

  const [ownerFilter,      setOwnerFilter]      = useState([])
  const [createDateFilter, setCreateDateFilter] = useState([])
  const [leadStatusFilter, setLeadStatusFilter] = useState([])
  const [users, setUsers]                       = useState([])

  // Load users for Company Owner filter
  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
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

  // Tab change resets page
  const switchTab = (key) => { setActiveTab(key); setPage(1); setSelected([]) }

  // Select all toggle
  const allSelected = companies.length > 0 && selected.length === companies.length
  const toggleAll   = () => setSelected(allSelected ? [] : companies.map(c => c.id))
  const toggleOne   = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = ownerFilter.length > 0 || createDateFilter.length > 0 || leadStatusFilter.length > 0

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
            label="Company owner"
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
          <button className="btn-action btn-sm"><Upload size={13} /> Export</button>
          <button className="btn-action btn-sm"><Columns size={13} /> Edit columns</button>
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
              <th>COUNTRY OF ORIGIN</th>
              <th>COMPANY</th>
              <th>INDUSTRY TYPE</th>
              <th>EMAIL</th>
              <th>MOBILE</th>
              <th>LINKEDIN URL</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading...</td></tr>
            ) : companies.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No companies found</td></tr>
            ) : companies.map(c => (
              <tr key={c.id}>
                <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleOne(c.id)} /></td>
                <td>{c.country || '--'}</td>
                <td className="name-cell">
                  <span className="avatar" style={{ fontSize: '10px', letterSpacing: '-0.5px' }}>
                    {(c.name || '??').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="link-style" onClick={() => navigate(`/companies/${c.id}`)}>{c.name}</span>
                </td>
                <td>{c.industryType || '--'}</td>
                <td style={{ color: c.email ? '#3b82f6' : undefined }}>{c.email || '--'}<MoreBadge n={moreCount(c.email, c.emails)} /></td>
                <td style={{ color: c.mobile ? '#3b82f6' : undefined }}>{c.mobile || '--'}</td>
                <td>
                  {c.linkedinUrl
                    ? <a href={c.linkedinUrl} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }} onClick={e => e.stopPropagation()}>LinkedIn</a>
                    : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="contacts-pagination">
        <div className="page-nav">
          <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
            <button key={n} className={`page-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)}>{n}</button>
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
        entity="companies"
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => { fetchCompanies(); setShowImport(false) }}
      />
    </div>
  )
}
