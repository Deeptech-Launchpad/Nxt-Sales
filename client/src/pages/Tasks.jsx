import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, AlertTriangle, Clock, CalendarClock, CheckCircle2, Upload, Download, ChevronDown, ListTodo, ArrowRight } from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import TaskModal from '../components/activities/TaskModal'
import EditColumnsMenu from '../components/EditColumnsMenu'
import DataImportModal from '../components/modals/DataImportModal'
import { renderCustomCell } from '../utils/customFieldRender'
import { useDropdownOptions } from '../hooks/useDropdownOptions'
import { exportCSV, exportXLSX, exportJSON, exportPDF } from '../utils/exportUtils'
import '../styles/contacts.css'
import '../styles/tasks.css'

const PAGE_SIZE = 50
const COLUMNS_STORAGE_KEY = 'mwz_tasks_visible_columns'
const DEFAULT_COLUMNS = []

// Export dropdown for Tasks — same exportUtils / CSV-Excel-JSON-PDF choices
// as Companies/Deals, styled inline to match this page's existing bespoke
// button look (its own convention, not the shared .btn-action other list
// pages use).
function TasksExportMenu({ fetchAllForExport, columns }) {
  const [open, setOpen]           = useState(false)
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
      fn(records, 'tasks', columns, ...extraArgs)
    } catch {
      // fetch failed — nothing to export; same lightweight error handling as other list pages
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="tasks-export-wrap" ref={ref}>
      <button
        className="tasks-secondary-btn"
        onClick={() => setOpen(o => !o)}
        disabled={exporting}
      >
        <Download size={14} /> {exporting ? 'Exporting…' : 'Export'} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="tasks-export-menu">
          {[
            { label: 'Export as CSV',   fn: () => run(exportCSV) },
            { label: 'Export as Excel', fn: () => run(exportXLSX, ['Tasks']) },
            { label: 'Export as JSON',  fn: () => run(exportJSON) },
            { label: 'Export as PDF',   fn: () => run(exportPDF, ['Tasks Export — NXT Sales']) },
          ].map(item => (
            <button key={item.label} onClick={item.fn}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
  const [taskSummary, setTaskSummary] = useState({ all: 0, today: 0, overdue: 0, upcoming: 0 })

  const [taskTab, setTaskTab] = useState('all') // 'all' | 'mine'
  const [search, setSearch]             = useState('')
  const [bucket, setBucket]             = useState('today') // '' | 'today' | 'overdue' | 'upcoming'
  const [showCompleted, setShowCompleted] = useState(false)
  const [assigneeFilter, setAssigneeFilter] = useState('')
  // Country comes from the linked company, and the options are the same
  // managed 'company.country' list Companies and Deals filter on.
  const [countryFilter, setCountryFilter] = useState('')
  const { options: countryOptions } = useDropdownOptions('company.country')

  const [showCreate, setShowCreate] = useState(false)
  const [editTask, setEditTask]     = useState(null)
  const [showImport, setShowImport] = useState(false)

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

  const fetchTaskSummary = useCallback(() => {
    const base = {
      type: 'task', page: 1, limit: 1,
      ...(effectiveAssigneeId && { assignedToId: effectiveAssigneeId }),
      ...(countryFilter && { country: countryFilter }),
    }
    Promise.all([
      api.get('/activities', { params: base }),
      api.get('/activities', { params: { ...base, bucket: 'today' } }),
      api.get('/activities', { params: { ...base, bucket: 'overdue' } }),
      api.get('/activities', { params: { ...base, bucket: 'upcoming' } }),
    ]).then(([all, today, overdue, upcoming]) => setTaskSummary({
      all: all.data?.total || 0,
      today: today.data?.total || 0,
      overdue: overdue.data?.total || 0,
      upcoming: upcoming.data?.total || 0,
    })).catch(() => {})
  }, [effectiveAssigneeId, countryFilter])

  useEffect(() => { fetchTaskSummary() }, [fetchTaskSummary])

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
        ...(countryFilter && { country: countryFilter }),
      },
    })
      .then(r => { setTasks(r.data.items || []); setTotal(r.data.total || 0) })
      .catch(() => { setTasks([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [page, search, bucket, showCompleted, effectiveAssigneeId, countryFilter])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // Export: GET /activities caps limit at 200/request (no dedicated no-limit
  // export route like Companies/Deals have) — walk every page matching the
  // current tab/bucket/search/assignee/showCompleted filters, same approach
  // used for the Inbox and Calls exports.
  const EXPORT_LIMIT = 200
  const fetchAllForExport = useCallback(async () => {
    const collected = []
    let p = 1
    while (true) {
      const { data } = await api.get('/activities', {
        params: {
          type: 'task',
          page: p,
          limit: EXPORT_LIMIT,
          ...(search.trim() && { search: search.trim() }),
          ...(bucket && { bucket }),
          ...(showCompleted && { showCompleted: 'true' }),
          ...(effectiveAssigneeId && { assignedToId: effectiveAssigneeId }),
          ...(countryFilter && { country: countryFilter }),
        },
      })
      const batch = data.items || []
      collected.push(...batch.map(t => ({
        ...t,
        companyName: t.company?.name || null,
        country:     t.company?.country || null,
        assignedToName: t.assignedTo?.name || 'Unassigned',
        statusLabel: STATUS_PILL[deriveStatus(t)].label,
      })))
      if (batch.length === 0 || collected.length >= (data.total || 0)) break
      p += 1
    }
    return collected
  }, [search, bucket, showCompleted, effectiveAssigneeId, countryFilter])

  const EXPORT_COLUMNS = [
    { key: 'title',           header: 'Task' },
    { key: 'companyName',     header: 'Company' },
    { key: 'country',         header: 'Country' },
    { key: 'dueDate',         header: 'Due Date & Time' },
    { key: 'assignedToName',  header: 'Assigned To' },
    { key: 'statusLabel',     header: 'Status' },
    { key: 'body',            header: 'Description' },
    { key: 'autoCompleteOverdue', header: 'Auto-complete when overdue' },
  ]

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task? This action cannot be undone.')) return
    try {
      await api.delete(`/activities/${taskId}`)
      fetchTasks()
      fetchTaskSummary()
    } catch {
      // no-op — matches the lightweight error handling style already used on Deals/Companies
    }
  }

  const handleOpenTask = (t) => {
    if (t.companyId) navigate(`/companies/${t.companyId}`)
    else setEditTask(t)
  }

  const switchBucket = (b) => { setBucket(b); setPage(1) }
  const clearFilters = () => { setSearch(''); setBucket('today'); setShowCompleted(false); setAssigneeFilter(''); setCountryFilter(''); setPage(1) }
  const filtersActive = search || bucket !== 'today' || showCompleted || assigneeFilter || countryFilter

  return (
    <div className="tasks-workspace">
      <header className="tasks-hero">
        <div className="tasks-hero-copy">
          <span className="tasks-eyebrow"><ListTodo size={14} /> Task command center</span>
          <h1>Turn every next step into progress</h1>
          <p>Prioritize what matters, stay ahead of deadlines and keep every customer commitment moving.</p>
        </div>
        <div className="tasks-hero-actions">
          <button
            className="tasks-secondary-btn"
            onClick={() => setShowImport(true)}
          >
            <Upload size={14} /> Import
          </button>
          <TasksExportMenu fetchAllForExport={fetchAllForExport} columns={EXPORT_COLUMNS} />
          <button
            className="tasks-create-btn"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={15} /> Create task <ArrowRight size={14} />
          </button>
        </div>
      </header>

      <section className="tasks-summary-grid" aria-label="Task overview">
        {[
          { key: 'all', label: 'Open tasks', value: taskSummary.all, Icon: ListTodo },
          { key: 'today', label: 'Due today', value: taskSummary.today, Icon: Clock },
          { key: 'overdue', label: 'Needs attention', value: taskSummary.overdue, Icon: AlertTriangle },
          { key: 'upcoming', label: 'Coming up', value: taskSummary.upcoming, Icon: CalendarClock },
        ].map(metric => <article key={metric.key} className={`tasks-summary-card ${metric.key}`}><span><metric.Icon size={16} /></span><div><small>{metric.label}</small><strong>{metric.value.toLocaleString()}</strong></div></article>)}
      </section>

      <section className="tasks-data-shell">
      <div className="tasks-viewbar">
      <div className="tasks-tabs" role="tablist">
        <button
          role="tab" aria-selected={taskTab === 'all'}
          onClick={() => switchTab('all')}
        >
          All tasks <span>{taskTab === 'all' && !loading ? total : taskSummary.all}</span>
        </button>
        <button
          role="tab" aria-selected={taskTab === 'mine'}
          onClick={() => switchTab('mine')}
        >
          My Tasks
        </button>
      </div>

      {/* Today / Overdue / Upcoming / All — replaces the old status filter */}
      <div className="tasks-buckets">
        {BUCKETS.map(({ key, label, Icon }) => {
          const active = bucket === key
          return (
            <button
              key={key || 'all'}
              className={`${key || 'all'}${active ? ' active' : ''}`}
              onClick={() => switchBucket(key)}
            >
              {Icon && <Icon size={12} />} {label}
            </button>
          )
        })}
      </div>
      </div>

      <div className="tasks-filterbar">
        <div className="tasks-search">
          <Search size={13} />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search task, company or assignee…"
          />
        </div>

        {taskTab === 'all' && (
          <select className="tasks-assignee-select" value={assigneeFilter} onChange={e => { setAssigneeFilter(e.target.value); setPage(1) }}>
            <option value="">All assignees</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}

        <select
          className="tasks-assignee-select"
          value={countryFilter}
          onChange={e => { setCountryFilter(e.target.value); setPage(1) }}
          title="Filter by the linked company's country"
        >
          <option value="">All countries</option>
          {countryOptions.map(c => <option key={c.id || c.value} value={c.value}>{c.label}</option>)}
        </select>

        <label className="tasks-completed-toggle">
          <input type="checkbox" checked={showCompleted} onChange={e => { setShowCompleted(e.target.checked); setPage(1) }} />
          Show completed
        </label>

        {filtersActive && (
          <button className="tasks-clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        )}

        <div className="tasks-columns-control">
          <EditColumnsMenu fields={taskFields} visibleColumns={visibleColumns} onSave={saveVisibleColumns} alwaysShownKey="title" />
        </div>
      </div>

      <div className="tasks-table-wrap">
        <table className="tasks-table">
          <thead>
            <tr>
              <th>Task</th><th>Company</th><th>Country</th><th>Due date & time</th><th>Assigned to</th><th>Status</th>
              {orderedVisibleFields.map(f => <th key={f.key}>{f.label}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="tasks-empty" colSpan={7 + orderedVisibleFields.length}>Loading tasks…</td></tr>
            ) : tasks.length === 0 ? (
              <tr><td className="tasks-empty" colSpan={7 + orderedVisibleFields.length}>
                {total === 0 ? 'No tasks yet.' : 'No tasks match your filters.'}
              </td></tr>
            ) : tasks.map((t, i) => {
              const status = deriveStatus(t)
              return (
                <tr key={t.id} className={`task-row status-${status}`}>
                  <td className="task-title-cell" data-label="Task" onClick={() => handleOpenTask(t)}><div>{t.title || '(untitled)'}</div></td>
                  <td className="task-company-cell" data-label="Company"><div>{t.company?.name || '--'}</div></td>
                  <td className="task-country-cell" data-label="Country"><div>{t.company?.country || '--'}</div></td>
                  <td className="task-due-cell" data-label="Due"><div><Clock size={11} />{fmtDateTime(t.dueDate)}</div></td>
                  <td className="task-assignee-cell" data-label="Assigned to"><div>{t.assignedTo?.name ? <><i>{t.assignedTo.name.slice(0,1).toUpperCase()}</i>{t.assignedTo.name}</> : <span>Unassigned</span>}</div></td>
                  <td className="task-status-cell" data-label="Status">
                    <span className={`task-status-pill ${status}`}>
                      {status === 'completed' && <CheckCircle2 size={11} style={{ marginRight: 4, verticalAlign: -1 }} />}
                      {STATUS_PILL[status].label}
                    </span>
                  </td>
                  {orderedVisibleFields.map(f => <td className="task-optional-cell" data-label={f.label} key={f.key}><div>{renderTaskCell(f, t)}</div></td>)}
                  <td className="task-actions-cell">
                    <button
                      onClick={() => setEditTask(t)} title="Edit task"
                    ><Pencil size={14} /></button>
                    <button
                      className="danger" onClick={() => handleDelete(t.id)} title="Delete task"
                    ><Trash2 size={14} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="tasks-pagination">
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            {pageWindow(page, totalPages).map((n, i, arr) => (
              <span key={n} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && arr[i - 1] !== n - 1 && <span style={{ padding: '0 4px', color: '#667085' }}>…</span>}
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
        <TaskModal onClose={() => setShowCreate(false)} onSaved={() => { fetchTasks(); fetchTaskSummary() }} />
      )}

      {editTask && (
        <TaskModal activity={editTask} onClose={() => setEditTask(null)} onSaved={() => { fetchTasks(); fetchTaskSummary() }} />
      )}

      <DataImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={fetchTasks}
        entityLabel="Tasks"
        fieldsUrl="/activities/task-import-fields"
        importUrl="/activities/task-import"
        payloadKey="tasks"
        templateName="tasks"
      />
    </div>
  )
}
