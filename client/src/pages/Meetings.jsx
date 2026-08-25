import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, CalendarDays, Clock, CheckCircle2, XCircle, ArrowRight, Video } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import MeetingModal from '../components/activities/MeetingModal'
import EditColumnsMenu from '../components/EditColumnsMenu'
import DateFilterDropdown from '../components/filters/DateFilterDropdown'
import { renderCustomCell } from '../utils/customFieldRender'
import '../styles/contacts.css'
import '../styles/meetings.css'

const PAGE_SIZE = 50
const COLUMNS_STORAGE_KEY = 'mwz_meetings_visible_columns'
const DEFAULT_COLUMNS = []
const DATE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'next_7', label: 'Next 7 days' },
  { value: 'next_30', label: 'Next 30 days' },
]

function meetingDateParams(token) {
  if (!token) return {}
  const now = new Date()
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const endOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  const today = startOfDay(now)
  let from, to
  if (token === 'today') { from = today; to = endOfDay(today) }
  else if (token === 'this_week') { from = new Date(today); from.setDate(today.getDate() - today.getDay()); to = new Date(from.getTime() + 7 * 86400000 - 1) }
  else if (/^last_(7|30)$/.test(token)) { from = new Date(now.getTime() - Number(token.slice(5)) * 86400000); to = now }
  else if (/^next_(7|30)$/.test(token)) { from = now; to = new Date(now.getTime() + Number(token.slice(5)) * 86400000) }
  else {
    const range = token.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/)
    const day = token.match(/^\d{4}-\d{2}-\d{2}$/)
    const month = token.match(/^(\d{4})-(\d{2})$/)
    if (range) { from = startOfDay(new Date(`${range[1]}T00:00:00`)); to = endOfDay(new Date(`${range[2]}T00:00:00`)) }
    else if (day) { from = startOfDay(new Date(`${token}T00:00:00`)); to = endOfDay(from) }
    else if (month) { from = new Date(Number(month[1]), Number(month[2]) - 1, 1); to = new Date(Number(month[1]), Number(month[2]), 0, 23, 59, 59, 999) }
    else if (/^\d{4}$/.test(token)) { from = new Date(Number(token), 0, 1); to = new Date(Number(token), 11, 31, 23, 59, 59, 999) }
  }
  return from && to ? { dateFrom: from.toISOString(), dateTo: to.toISOString() } : {}
}

// meetingStatus is stored as scheduled/completed/cancelled — the user-facing
// Upcoming/Completed/Cancelled labels are a display-only mapping, same
// approach as Tasks' Pending/In Progress/Completed and Deals' stage labels.
const STATUS_LABELS = { scheduled: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' }
const STATUS_COLORS = {
  scheduled: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  completed: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  cancelled: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
}

// Compact page-number window, same approach Companies.jsx/Tasks.jsx use.
function pageWindow(current, total) {
  const pages = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2])
  return [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
}

function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '--'
}

export default function Meetings() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [meetings, setMeetings] = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [users, setUsers]       = useState([])
  const [meetingSummary, setMeetingSummary] = useState({ all: 0, scheduled: 0, completed: 0, cancelled: 0 })

  const [meetingTab, setMeetingTab] = useState('all') // 'all' | 'mine'
  const [search, setSearch]                 = useState('')
  const [statusFilter, setStatusFilter]     = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [dateFilter, setDateFilter] = useState([])

  const [showCreate, setShowCreate] = useState(false)
  const [editMeeting, setEditMeeting] = useState(null)

  // Toggleable columns (Description, End Time, Location, Participants, Meet
  // Link, + every active Meeting custom field) — Meeting/Company/Assigned
  // to/Date & time/Status stay fixed, same reasoning Companies.jsx keeps its
  // own name column non-toggleable.
  const [meetingFields, setMeetingFields] = useState([])
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try { return JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY)) || DEFAULT_COLUMNS } catch { return DEFAULT_COLUMNS }
  })
  const saveVisibleColumns = (cols) => {
    setVisibleColumns(cols)
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(cols))
  }

  const switchTab = (tab) => { setMeetingTab(tab); setPage(1) }

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
    api.get('/activities/import-fields', { params: { type: 'meeting' } }).then(r => setMeetingFields(r.data.fields || [])).catch(() => {})
  }, [])

  const orderedVisibleFields = meetingFields.filter(f => visibleColumns.includes(f.key))
  const renderMeetingCell = (f, m) => {
    if (f.key.startsWith('custom.')) return renderCustomCell(f.type, m[f.key])
    if (f.key === 'endTime') return fmtDateTime(m.endTime)
    if (f.key === 'meetLink' && m.meetLink) return <a href={m.meetLink} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#1a73e8' }}>Join</a>
    return m[f.key] ?? '--'
  }

  // "My Meetings" forces assignedToId to the current user, taking priority
  // over the Assigned To filter (hidden while that tab is active), matching
  // the exact pattern Tasks.jsx already established.
  const effectiveAssigneeId = meetingTab === 'mine' ? user?.id : assigneeFilter

  const fetchMeetingSummary = useCallback(() => {
    const base = { type: 'meeting', page: 1, limit: 1, ...(effectiveAssigneeId && { assignedToId: effectiveAssigneeId }) }
    Promise.all([
      api.get('/activities', { params: base }),
      api.get('/activities', { params: { ...base, status: 'scheduled' } }),
      api.get('/activities', { params: { ...base, status: 'completed' } }),
      api.get('/activities', { params: { ...base, status: 'cancelled' } }),
    ]).then(([all, scheduled, completed, cancelled]) => setMeetingSummary({
      all: all.data?.total || 0,
      scheduled: scheduled.data?.total || 0,
      completed: completed.data?.total || 0,
      cancelled: cancelled.data?.total || 0,
    })).catch(() => {})
  }, [effectiveAssigneeId])
  useEffect(() => { fetchMeetingSummary() }, [fetchMeetingSummary])

  const fetchMeetings = useCallback(() => {
    setLoading(true)
    api.get('/activities', {
      params: {
        type: 'meeting',
        page,
        limit: PAGE_SIZE,
        ...(search.trim() && { search: search.trim() }),
        ...(statusFilter && { status: statusFilter }),
        ...(effectiveAssigneeId && { assignedToId: effectiveAssigneeId }),
        ...meetingDateParams(dateFilter[0]),
      },
    })
      .then(r => { setMeetings(r.data.items || []); setTotal(r.data.total || 0) })
      .catch(() => { setMeetings([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [page, search, statusFilter, effectiveAssigneeId, dateFilter])

  useEffect(() => { fetchMeetings() }, [fetchMeetings])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleDelete = async (meetingId) => {
    if (!window.confirm('Delete this meeting? This action cannot be undone.')) return
    try {
      await api.delete(`/activities/${meetingId}`)
      fetchMeetings()
      fetchMeetingSummary()
    } catch {
      // no-op — matches the lightweight error handling style already used on Tasks/Deals/Companies
    }
  }

  const handleOpenMeeting = (m) => {
    if (m.companyId) navigate(`/companies/${m.companyId}`)
    else setEditMeeting(m)
  }

  const clearFilters = () => { setSearch(''); setStatusFilter(''); setAssigneeFilter(''); setDateFilter([]); setPage(1) }

  return (
    <div className="meetings-workspace">
      <header className="meetings-hero">
        <div className="meetings-hero-copy">
          <span className="meetings-eyebrow"><CalendarDays size={14} /> Schedule workspace</span>
          <h1>Make every meeting count</h1>
          <p>Plan customer conversations, keep ownership clear and turn every discussion into a confident next step.</p>
        </div>
        <button
          className="meetings-create-btn"
          onClick={() => setShowCreate(true)}
        >
          <Plus size={15} /> Create meeting <ArrowRight size={14} />
        </button>
      </header>

      <section className="meetings-summary-grid" aria-label="Meeting overview">
        {[
          { key: 'all', label: 'All meetings', value: meetingSummary.all, Icon: CalendarDays },
          { key: 'scheduled', label: 'Upcoming', value: meetingSummary.scheduled, Icon: Clock },
          { key: 'completed', label: 'Completed', value: meetingSummary.completed, Icon: CheckCircle2 },
          { key: 'cancelled', label: 'Cancelled', value: meetingSummary.cancelled, Icon: XCircle },
        ].map(metric => <article key={metric.key} className={`meetings-summary-card ${metric.key}`}><span><metric.Icon size={16} /></span><div><small>{metric.label}</small><strong>{metric.value.toLocaleString()}</strong></div></article>)}
      </section>

      <section className="meetings-data-shell">
      <div className="meetings-viewbar">
      <div className="meetings-tabs" role="tablist">
        <button
          role="tab" aria-selected={meetingTab === 'all'}
          onClick={() => switchTab('all')}
        >
          All meetings <span>{meetingTab === 'all' && !loading ? total : meetingSummary.all}</span>
        </button>
        <button
          role="tab" aria-selected={meetingTab === 'mine'}
          onClick={() => switchTab('mine')}
        >
          My Meetings
        </button>
      </div>
      <span className="meetings-view-hint"><Video size={13} /> Keep follow-ups connected to every conversation</span>
      </div>

      <div className="meetings-filterbar">
        <div className="meetings-search">
          <Search size={13} />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search meeting, company or assignee…"
          />
        </div>

        <div className="meetings-date-filter"><DateFilterDropdown label="Date" presets={DATE_OPTIONS} value={dateFilter[0] || ''} onChange={value => { setDateFilter(value); setPage(1) }} /></div>

        <select className="meetings-filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        {meetingTab === 'all' && (
          <select className="meetings-filter-select" value={assigneeFilter} onChange={e => { setAssigneeFilter(e.target.value); setPage(1) }}>
            <option value="">All assignees</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}

        {Boolean(search || statusFilter || assigneeFilter || dateFilter.length) && (
          <button className="meetings-clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        )}

        <div className="meetings-columns-control">
          <EditColumnsMenu fields={meetingFields} visibleColumns={visibleColumns} onSave={saveVisibleColumns} alwaysShownKey="title" />
        </div>
      </div>

      <div className="meetings-table-wrap">
        <table className="meetings-table">
          <thead>
            <tr>
              <th>Meeting</th><th>Company</th><th>Date &amp; time</th><th>Assigned to</th><th>Status</th>
              {orderedVisibleFields.map(f => <th key={f.key}>{f.label}</th>)}<th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="meetings-empty-cell" colSpan={6 + orderedVisibleFields.length}>Loading meetings…</td></tr>
            ) : meetings.length === 0 ? (
              <tr><td className="meetings-empty-cell" colSpan={6 + orderedVisibleFields.length}>
                <div className="meetings-empty-state">
                  <span><CalendarDays size={22} /></span>
                  <strong>{total === 0 ? 'Your schedule is ready' : 'No meetings match these filters'}</strong>
                  <p>{total === 0 ? 'Create your first meeting and keep the next customer conversation moving.' : 'Try adjusting the date, status or search to find the meeting you need.'}</p>
                  {total === 0 ? <button onClick={() => setShowCreate(true)}><Plus size={13} /> Schedule a meeting</button> : <button onClick={clearFilters}>Clear filters</button>}
                </div>
              </td></tr>
            ) : meetings.map(m => {
              const status = m.meetingStatus || 'scheduled'
              return <tr key={m.id} className={`meeting-row status-${status}`}>
                <td className="meeting-title-cell" data-label="Meeting" onClick={() => handleOpenMeeting(m)}>{m.title || '(untitled)'}</td>
                <td className="meeting-company-cell" data-label="Company">{m.company?.name || '--'}</td>
                <td className="meeting-date-cell" data-label="Date & time"><span><Clock size={11} />{fmtDateTime(m.startTime)}</span></td>
                <td className="meeting-assignee-cell" data-label="Assigned to">{m.assignedTo?.name ? <span><i>{m.assignedTo.name.slice(0,1).toUpperCase()}</i>{m.assignedTo.name}</span> : <em>Unassigned</em>}</td>
                <td className="meeting-status-cell" data-label="Status"><span className={`meeting-status-pill ${status}`}>{STATUS_LABELS[status]}</span></td>
                {orderedVisibleFields.map(f => <td className="meeting-optional-cell" data-label={f.label} key={f.key}>{renderMeetingCell(f, m)}</td>)}
                <td className="meeting-actions-cell">
                  <button
                    onClick={() => setEditMeeting(m)} title="Edit meeting"
                  ><Pencil size={14} /></button>
                  <button
                    className="danger" onClick={() => handleDelete(m.id)} title="Delete meeting"
                  ><Trash2 size={14} /></button>
                </td>
              </tr>
            } )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="meetings-pagination">
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            {pageWindow(page, totalPages).map((n, i, arr) => (
              <span key={n} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && arr[i - 1] !== n - 1 && <span style={{ padding: '0 4px', color: '#cbd5e1' }}>…</span>}
                <button className={`page-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)}>{n}</button>
              </span>
            ))}
            <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
          <span className="per-page">{PAGE_SIZE} per page</span>
        </div>
      )}
      </section>

      {showCreate && (
        <MeetingModal onClose={() => setShowCreate(false)} onSaved={() => { fetchMeetings(); fetchMeetingSummary() }} />
      )}

      {editMeeting && (
        <MeetingModal activity={editMeeting} onClose={() => setEditMeeting(null)} onSaved={() => { fetchMeetings(); fetchMeetingSummary() }} />
      )}
    </div>
  )
}
