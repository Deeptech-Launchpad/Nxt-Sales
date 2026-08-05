import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import TaskModal from '../components/activities/TaskModal'
import '../styles/contacts.css'

const PAGE_SIZE = 50

const STATUS_LABELS   = { not_started: 'Pending', in_progress: 'In Progress', completed: 'Completed' }
const PRIORITY_LABELS = { none: 'None', low: 'Low', medium: 'Medium', high: 'High' }
// Soft pastel badge palette — background + matching darker text + a faint
// border in the same hue for definition, instead of a flat alpha overlay.
const PRIORITY_COLORS = {
  none:   { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' },
  low:    { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  medium: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  high:   { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
}
const STATUS_COLORS = {
  not_started: { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' },
  in_progress: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
  completed:   { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
}

// Compact page-number window, same approach Companies.jsx uses — showing
// every page individually doesn't scale once tasks accumulate.
function pageWindow(current, total) {
  const pages = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2])
  return [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'
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
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter]     = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [editTask, setEditTask]     = useState(null)

  const switchTab = (tab) => { setTaskTab(tab); setPage(1) }

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
  }, [])

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
        ...(statusFilter && { status: statusFilter }),
        ...(effectiveAssigneeId && { assignedToId: effectiveAssigneeId }),
      },
    })
      .then(r => { setTasks(r.data.items || []); setTotal(r.data.total || 0) })
      .catch(() => { setTasks([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [page, search, statusFilter, effectiveAssigneeId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // Priority isn't a server filter (kept client-side over the current page —
  // status/assignee/search are the high-cardinality filters worth pushing to
  // the DB; priority only has 4 values and this page is already paginated).
  const visibleTasks = priorityFilter ? tasks.filter(t => (t.priority || 'none') === priorityFilter) : tasks

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

  const clearFilters = () => { setSearch(''); setStatusFilter(''); setPriorityFilter(''); setAssigneeFilter(''); setPage(1) }

  const cellTh = { padding: '13px 18px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.5px', whiteSpace: 'nowrap' }
  const cellTd = { padding: '14px 18px', color: '#334155', whiteSpace: 'nowrap', fontSize: 14 }
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

        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }} style={filterSelect}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={filterSelect}>
          <option value="">All priorities</option>
          {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

        {taskTab === 'all' && (
          <select value={assigneeFilter} onChange={e => { setAssigneeFilter(e.target.value); setPage(1) }} style={filterSelect}>
            <option value="">All assignees</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}

        {(search || statusFilter || priorityFilter || assigneeFilter) && (
          <button onClick={clearFilters} style={{ border: 'none', background: 'transparent', color: '#e63329', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear filters
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #eef1f5', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #eef1f5' }}>
            <tr>
              <th style={cellTh}>Task</th>
              <th style={cellTh}>Company</th>
              <th style={cellTh}>Due date</th>
              <th style={cellTh}>Assigned to</th>
              <th style={cellTh}>Priority</th>
              <th style={cellTh}>Status</th>
              <th style={cellTh}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Loading tasks…</td></tr>
            ) : visibleTasks.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                {total === 0 ? 'No tasks yet.' : 'No tasks match your filters.'}
              </td></tr>
            ) : visibleTasks.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: i < visibleTasks.length - 1 ? '1px solid #f4f6f8' : 'none', transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ ...cellTd, color: '#e63329', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleOpenTask(t)}>{t.title || '(untitled)'}</td>
                <td style={cellTd}>{t.company?.name || '--'}</td>
                <td style={cellTd}>{fmtDate(t.dueDate)}</td>
                <td style={cellTd}>{t.assignedTo?.name || 'Unassigned'}</td>
                <td style={cellTd}><span style={pillStyle(PRIORITY_COLORS[t.priority || 'none'])}>{PRIORITY_LABELS[t.priority || 'none']}</span></td>
                <td style={cellTd}><span style={pillStyle(STATUS_COLORS[t.taskStatus || 'not_started'])}>{STATUS_LABELS[t.taskStatus || 'not_started']}</span></td>
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
            ))}
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
