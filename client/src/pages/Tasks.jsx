import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, AlertTriangle, Clock, CalendarClock, CheckCircle2 } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import TaskModal from '../components/activities/TaskModal'
import EditColumnsMenu from '../components/EditColumnsMenu'
import { renderCustomCell } from '../utils/customFieldRender'
import '../styles/contacts.css'

const PAGE_SIZE = 50
const COLUMNS_STORAGE_KEY = 'mwz_tasks_visible_columns'
const DEFAULT_COLUMNS = []

// Today / Overdue / Upcoming replaces the old Pending / In Progress /
// Completed status model — bucket is derived from dueDate, not a stored
// field. "Completed" is a 4th, visually-distinct state layered on top of
// whichever bucket a task's dueDate would otherwise put it in.
const BUCKETS = [
  { key: 'today',    label: 'Today',    Icon: Clock },
  { key: 'overdue',  label: 'Overdue',  Icon: AlertTriangle },
  { key: 'upcoming', label: 'Upcoming', Icon: CalendarClock },
  { key: '',         label: 'All',      Icon: null },
]

// Soft pastel badge palette, same visual language the old status pills used.
const STATUS_PILL = {
  completed: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0', label: 'Completed' },
  overdue:   { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', label: 'Overdue' },
  today:     { bg: '#fffbeb', text: '#d97706', border: '#fde68a', label: 'Today' },
  upcoming:  { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe', label: 'Upcoming' },
}

// A row's visual status is derived client-side from taskStatus + dueDate —
// same signal the server buckets on, just recomputed for display so a task
// fetched under "All" (no server-side bucket) still shows the right pill.
function deriveStatus(t) {
  if (t.taskStatus === 'completed') return 'completed'
  if (!t.dueDate) return 'upcoming'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTomorrow = new Date(startOfToday.getTime() + 86400000)
  const due = new Date(t.dueDate)
  if (due < startOfToday) return 'overdue'
  if (due < startOfTomorrow) return 'today'
  return 'upcoming'
}

// Compact page-number window, same approach Companies.jsx uses — showing
// every page individually doesn't scale once tasks accumulate.
function pageWindow(current, total) {
  const pages = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2])
  return [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
}

function fmtDateTime(d) {
  if (!d) return '--'
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function Tasks() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tasks, setTasks]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [users, setUsers]     = useState([])

  const [taskTab, setTaskTab] = useState('all') // 'all' | 'mine'
  const [search, setSearch]             = useState('')
  const [bucket, setBucket]             = useState('today') // '' | 'today' | 'overdue' | 'upcoming'
  const [showCompleted, setShowCompleted] = useState(false)
  const [assigneeFilter, setAssigneeFilter] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [editTask, setEditTask]     = useState(null)

  // Toggleable columns (Description, Auto-complete, + every active Task
  // custom field) — Task/Company/Assigned to/Due date/Status stay fixed,
  // same reasoning Companies.jsx keeps its own name column non-toggleable.
  const [taskFields, setTaskFields] = useState([])
  const [visibleColumns, setVisibleColumns] = useState(() => {
    try { return JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY)) || DEFAULT_COLUMNS } catch { return DEFAULT_COLUMNS }
  })
  const saveVisibleColumns = (cols) => {
    setVisibleColumns(cols)
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(cols))
  }

  const switchTab = (tab) => { setTaskTab(tab); setPage(1) }

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
    api.get('/activities/import-fields', { params: { type: 'task' } }).then(r => setTaskFields(r.data.fields || [])).catch(() => {})
  }, [])

  const orderedVisibleFields = taskFields.filter(f => visibleColumns.includes(f.key))
  const renderTaskCell = (f, t) => {
    if (f.key.startsWith('custom.')) return renderCustomCell(f.type, t[f.key])
    if (f.key === 'autoCompleteOverdue') return t.autoCompleteOverdue ? 'On' : 'Off'
    if (f.key === 'body') return t.body || '--'
    return t[f.key] ?? '--'
  }

  // "My Tasks" forces assignedToId to the current user, taking priority over
  // the Assigned To filter (which is hidden while that tab is active — see
  // render below) so there's never an ambiguous combination of the two.
  const effectiveAssigneeId = taskTab === 'mine' ? user?.id : assigneeFilter

  const fetchTasks = useCallback(() => {
    setLoading(true)
    api.get('/activities', {
      params: {
        type: 'task',
        page,
        limit: PAGE_SIZE,
        ...(search.trim() && { search: search.trim() }),
        ...(bucket && { bucket }),
        ...(showCompleted && { showCompleted: 'true' }),
        ...(effectiveAssigneeId && { assignedToId: effectiveAssigneeId }),
      },
    })
      .then(r => { setTasks(r.data.items || []); setTotal(r.data.total || 0) })
      .catch(() => { setTasks([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [page, search, bucket, showCompleted, effectiveAssigneeId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task? This action cannot be undone.')) return
    try {
      await api.delete(`/activities/${taskId}`)
      fetchTasks()
    } catch {
      // no-op — matches the lightweight error handling style already used on Deals/Companies
    }
  }

  const handleOpenTask = (t) => {
    if (t.companyId) navigate(`/companies/${t.companyId}`)
    else setEditTask(t)
  }

  const switchBucket = (b) => { setBucket(b); setPage(1) }
  const clearFilters = () => { setSearch(''); setBucket('today'); setShowCompleted(false); setAssigneeFilter(''); setPage(1) }
  const filtersActive = search || bucket !== 'today' || showCompleted || assigneeFilter

  const cellTh = { padding: '13px 18px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }
  // display must stay the default (table-cell) on a <td> — -webkit-box
  // (needed for line-clamp) isn't compatible with table-cell and breaks the
  // whole table's column layout. Line-clamp goes on an inner wrapper via
  // cellClamp instead, never directly on the <td>.
  const cellTd = { padding: '14px 18px', color: '#334155', whiteSpace: 'normal', overflowWrap: 'anywhere', maxWidth: 260, fontSize: 14 }
  const cellClamp = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', overflowWrap: 'anywhere' }
  const iconBtn = { border: 'none', background: 'transparent', cursor: 'pointer', padding: 7, borderRadius: 7, display: 'flex', transition: 'background .12s' }
  const filterSelect = { padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', color: '#334155', background: '#fff', cursor: 'pointer', transition: 'border-color .12s' }
  const pillStyle = (c) => ({ fontSize: 12, fontWeight: 700, color: c.text, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 20, padding: '4px 11px', display: 'inline-block' })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 18, borderBottom: '1px solid #eef1f5' }}>
        <div>
          <h1 style={{ fontSize: 23, fontWeight: 700, color: '#0f172a', letterSpacing: '-.2px' }}>Tasks</h1>
          <span style={{ fontSize: 13.5, color: '#94a3b8', fontWeight: 500 }}>{loading ? 'Loading…' : `${total} task${total === 1 ? '' : 's'}`}</span>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: '#e63329', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', boxShadow: '0 1px 2px rgba(230,51,41,0.25)', transition: 'background .12s, box-shadow .12s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#c0271e'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(230,51,41,0.35)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#e63329'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(230,51,41,0.25)' }}
        >
          <Plus size={14} /> Create task
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'center', paddingBottom: 2, borderBottom: '1px solid #eef1f5' }}>
        <button
          onClick={() => switchTab('all')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
            color: taskTab === 'all' ? '#0f172a' : '#94a3b8', borderBottom: `2px solid ${taskTab === 'all' ? '#e63329' : 'transparent'}`, paddingBottom: 10, transition: 'color .12s, border-color .12s' }}
        >
          All Tasks
        </button>
        <button
          onClick={() => switchTab('mine')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
            color: taskTab === 'mine' ? '#0f172a' : '#94a3b8', borderBottom: `2px solid ${taskTab === 'mine' ? '#e63329' : 'transparent'}`, paddingBottom: 10, transition: 'color .12s, border-color .12s' }}
        >
          My Tasks
        </button>
      </div>

      {/* Today / Overdue / Upcoming / All — replaces the old status filter */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {BUCKETS.map(({ key, label, Icon }) => {
          const active = bucket === key
          const c = key ? STATUS_PILL[key] : { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' }
          return (
            <button
              key={key || 'all'}
              onClick={() => switchBucket(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all .12s',
                border: `1.5px solid ${active ? c.border : '#e2e8f0'}`,
                background: active ? c.bg : '#fff',
                color: active ? c.text : '#64748b',
              }}
            >
              {Icon && <Icon size={13} />} {label}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search tasks…"
            style={{ padding: '9px 13px 9px 33px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, width: 240, fontFamily: 'inherit', transition: 'border-color .12s, box-shadow .12s' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#e63329'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(230,51,41,0.10)' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
          />
        </div>

        {taskTab === 'all' && (
          <select value={assigneeFilter} onChange={e => { setAssigneeFilter(e.target.value); setPage(1) }} style={filterSelect}>
            <option value="">All assignees</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showCompleted} onChange={e => { setShowCompleted(e.target.checked); setPage(1) }} style={{ width: 14, height: 14, accentColor: '#0d9488' }} />
          Show completed
        </label>

        {filtersActive && (
          <button onClick={clearFilters} style={{ border: 'none', background: 'transparent', color: '#e63329', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear filters
          </button>
        )}

        <div style={{ marginLeft: 'auto' }}>
          <EditColumnsMenu fields={taskFields} visibleColumns={visibleColumns} onSave={saveVisibleColumns} alwaysShownKey="title" />
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #eef1f5', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #eef1f5' }}>
            <tr>
              <th style={cellTh}>Task</th>
              <th style={cellTh}>Company</th>
              <th style={cellTh}>Country</th>
              <th style={cellTh}>Due date & time</th>
              <th style={cellTh}>Assigned to</th>
              <th style={cellTh}>Status</th>
              {orderedVisibleFields.map(f => <th key={f.key} style={cellTh}>{f.label}</th>)}
              <th style={cellTh}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7 + orderedVisibleFields.length} style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Loading tasks…</td></tr>
            ) : tasks.length === 0 ? (
              <tr><td colSpan={7 + orderedVisibleFields.length} style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                {total === 0 ? 'No tasks yet.' : 'No tasks match your filters.'}
              </td></tr>
            ) : tasks.map((t, i) => {
              const status = deriveStatus(t)
              return (
                <tr key={t.id} style={{ borderBottom: i < tasks.length - 1 ? '1px solid #f4f6f8' : 'none', transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...cellTd, color: '#e63329', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleOpenTask(t)}><div style={cellClamp}>{t.title || '(untitled)'}</div></td>
                  <td style={cellTd}><div style={cellClamp}>{t.company?.name || '--'}</div></td>
                  <td style={cellTd}><div style={cellClamp}>{t.company?.country || '--'}</div></td>
                  <td style={cellTd}><div style={cellClamp}>{fmtDateTime(t.dueDate)}</div></td>
                  <td style={cellTd}><div style={cellClamp}>{t.assignedTo?.name || 'Unassigned'}</div></td>
                  <td style={cellTd}>
                    <span style={pillStyle(STATUS_PILL[status])}>
                      {status === 'completed' && <CheckCircle2 size={11} style={{ marginRight: 4, verticalAlign: -1 }} />}
                      {STATUS_PILL[status].label}
                    </span>
                  </td>
                  {orderedVisibleFields.map(f => <td key={f.key} style={cellTd}><div style={cellClamp}>{renderTaskCell(f, t)}</div></td>)}
                  <td style={{ ...cellTd, display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => setEditTask(t)} title="Edit task" style={{ ...iconBtn, color: '#64748b' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    ><Pencil size={14} /></button>
                    <button
                      onClick={() => handleDelete(t.id)} title="Delete task" style={{ ...iconBtn, color: '#ef4444' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    ><Trash2 size={14} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

      {showCreate && (
        <TaskModal onClose={() => setShowCreate(false)} onSaved={() => fetchTasks()} />
      )}

      {editTask && (
        <TaskModal activity={editTask} onClose={() => setEditTask(null)} onSaved={() => fetchTasks()} />
      )}
    </div>
  )
}
