import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, LayoutGrid, List, Download, Plus,
  ChevronDown, SlidersHorizontal, Pencil, Upload, Columns
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/client'
import FilterDropdown from '../../components/filters/FilterDropdown'
import CreateContactModal from '../../components/modals/CreateContactModal'
import ImportModal from '../../components/modals/ImportModal'
import { exportCSV, exportXLSX, exportJSON, exportPDF } from '../../utils/exportUtils'
import { valueList } from '../../utils/multiValue'

// "+N" badge when a record has more than one email/phone.
const moreCount = (primary, arr) => Math.max(0, valueList(primary, arr).length - 1)
const MoreBadge = ({ n }) => n > 0
  ? <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>+{n}</span>
  : null
import '../../styles/contacts.css'

const PAGE_SIZE = 25

// ── Date filter options ───────────────────────────────────
const DATE_OPTIONS = [
  { value: 'today',      label: 'Today'          },
  { value: 'yesterday',  label: 'Yesterday'      },
  { value: 'tomorrow',   label: 'Tomorrow'       },
  { value: 'this_week',  label: 'This Week'      },
  { value: 'last_week',  label: 'Last Week'      },
  { value: 'this_month', label: 'This Month'     },
  { value: 'last_month', label: 'Last Month'     },
  { value: 'this_year',  label: 'This Year'      },
  { value: 'last_year',  label: 'Last Year'      },
  { value: 'last_7',     label: 'Last 7 Days'    },
  { value: 'last_14',    label: 'Last 14 Days'   },
  { value: 'last_30',    label: 'Last 30 Days'   },
  { value: 'last_60',    label: 'Last 60 Days'   },
  { value: 'last_90',    label: 'Last 90 Days'   },
  { value: 'last_180',   label: 'Last 180 Days'  },
  { value: 'last_365',   label: 'Last 365 Days'  },
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
  { key: 'all',        label: 'All contacts'        },
  { key: 'mine',       label: 'My contacts'         },
  { key: 'unassigned', label: 'Unassigned contacts' },
]

// ── Export format dropdown ────────────────────────────────
function ExportMenu({ contacts, selected }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const records = selected.length > 0 ? contacts.filter(c => selected.includes(c.id)) : contacts

  const fmt = (fn) => { fn(records); setOpen(false) }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn-action btn-sm" onClick={() => setOpen(o => !o)}>
        <Upload size={13} /> Export <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 3000, minWidth: 160, overflow: 'hidden' }}>
          {[
            { label: 'Export as CSV',   fn: () => fmt(exportCSV)  },
            { label: 'Export as Excel', fn: () => fmt(exportXLSX) },
            { label: 'Export as JSON',  fn: () => fmt(exportJSON)  },
            { label: 'Export as PDF',   fn: () => fmt(exportPDF)  },
          ].map(item => (
            <button key={item.label} onClick={item.fn}
              style={{ display: 'block', width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', textAlign: 'left', fontSize: 13, color: '#334155', cursor: 'pointer', fontFamily: 'DM Sans,system-ui,sans-serif' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {item.label}
            </button>
          ))}
          {selected.length > 0 && (
            <div style={{ padding: '6px 14px', fontSize: 11, color: '#94a3b8', borderTop: '1px solid #f1f5f9' }}>
              {selected.length} selected row(s)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────
export default function Contacts() {
  const navigate      = useNavigate()
  const { user }      = useAuth()

  const [contacts, setContacts]     = useState([])
  const [total, setTotal]           = useState(0)
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [view, setView]             = useState('table')
  const [activeTab, setActiveTab]   = useState('all')
  const [page, setPage]             = useState(1)
  const [selected, setSelected]     = useState([])

  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)

  // Filter state
  const [ownerFilter,      setOwnerFilter]      = useState([])
  const [createDateFilter, setCreateDateFilter] = useState([])
  const [leadStatusFilter, setLeadStatusFilter] = useState([])
  const [users, setUsers] = useState([])

  // Load users for Contact Owner filter
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

  // Fetch contacts from API
  const fetchContacts = useCallback(async () => {
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
      const { data } = await api.get('/contacts', { params })
      setContacts(data.contacts || [])
      setTotal(data.total || 0)
    } catch {
      setContacts([])
    } finally {
      setLoading(false)
    }
  }, [page, activeTab, search, ownerFilter, leadStatusFilter, createDateFilter])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  // Tab change resets page
  const switchTab = (key) => { setActiveTab(key); setPage(1); setSelected([]) }

  // Select all toggle
  const allSelected = contacts.length > 0 && selected.length === contacts.length
  const toggleAll   = () => setSelected(allSelected ? [] : contacts.map(c => c.id))
  const toggleOne   = (id) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = ownerFilter.length > 0 || createDateFilter.length > 0 || leadStatusFilter.length > 0

  return (
    <div className="contacts-container">

      {/* ── Header ── */}
      <div className="contacts-header">
        <div className="header-left">
          <h1 className="contacts-title">
            Contacts <ChevronDown size={18} style={{ verticalAlign: 'middle', color: '#64748b' }} />
          </h1>
          <span className="records-count">{total} records</span>
        </div>
        <div className="header-actions">
          <button className="btn-action" onClick={() => setShowImport(true)}>
            <Download size={14} /> Import
          </button>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create contact
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
        <button className="tab-add">+ Add view (3/5)</button>
        <button className="tab-add" style={{ marginLeft: 8 }}>All Views</button>
      </div>

      {/* ── Filter chips row ── */}
      <div className="filter-chips-row">
        <div className="chips-left">
          <FilterDropdown
            label="Contact owner"
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
            label="Last activity date"
            options={DATE_OPTIONS}
            selected={[]}
            onChange={() => {}}
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
              placeholder="Search contacts"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <ExportMenu contacts={contacts} selected={selected} />
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
              <th>NAME</th>
              <th>EMAIL</th>
              <th>PHONE NUMBER</th>
              <th>CONTACT OWNER</th>
              <th>PRIMARY COMPANY</th>
              <th>LAST ACTIVITY DATE</th>
              <th>LEAD STATUS</th>
              <th>CREATE DATE <ChevronDown size={11} style={{ verticalAlign: 'middle' }} /></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading...</td></tr>
            ) : contacts.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No contacts found</td></tr>
            ) : contacts.map(c => {
              const displayName = c.name || `${c.firstName||''} ${c.lastName||''}`.trim() || c.email
              const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
              const ownerName = c.owner?.name || '--'
              const ownerInitials = ownerName !== '--' ? ownerName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : null
              const createdAt = c.createdAt ? new Date(c.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '--'

              return (
                <tr key={c.id} style={{ background: selected.includes(c.id) ? '#eff6ff' : undefined }}>
                  <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleOne(c.id)} /></td>
                  <td className="name-cell">
                    <span className="avatar">{initials}</span>
                    <span className="link-style" onClick={() => navigate(`/contacts/${c.id}`)}>{displayName}</span>
                  </td>
                  <td><a href={`mailto:${c.email}`} className="link">{c.email}</a><MoreBadge n={moreCount(c.email, c.emails)} /></td>
                  <td>{c.phone || '--'}<MoreBadge n={moreCount(c.phone, c.phones)} /></td>
                  <td>
                    {ownerInitials && <span className="owner-badge">{ownerInitials}</span>}{' '}
                    {ownerName}
                  </td>
                  <td>
                    {c.company
                      ? <span className="link-style">{c.company}</span>
                      : <span style={{ color: '#94a3b8' }}>--</span>}
                  </td>
                  <td style={{ color: '#94a3b8' }}>--</td>
                  <td>{c.leadStatus || '--'}</td>
                  <td>{createdAt}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="contacts-pagination">
        <div className="page-nav">
          <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(n => (
            <button key={n} className={`page-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)}>{n}</button>
          ))}
          {totalPages > 10 && <span style={{ padding: '0 4px', color: '#94a3b8' }}>...</span>}
          <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
        <span className="per-page">{PAGE_SIZE} per page</span>
      </div>

      {/* ── Modals ── */}
      <CreateContactModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={async (form) => {
          await api.post('/contacts', form)
          fetchContacts()
        }}
      />

      <ImportModal
        entity="contacts"
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => { fetchContacts(); setShowImport(false) }}
      />
    </div>
  )
}
