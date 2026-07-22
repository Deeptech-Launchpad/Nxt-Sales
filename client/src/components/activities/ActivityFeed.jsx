import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FileText, Mail, Phone, Calendar, CheckSquare,
  Search, SlidersHorizontal, AlertTriangle, ChevronDown, ChevronRight,
  Video, ArrowUpRight, ArrowDownLeft, ExternalLink, RefreshCw, Eye, Play,
} from 'lucide-react'
import api from '../../api/client'
import '../../styles/activity-modals.css'

const SUBTABS = ['All activities', 'Notes', 'Emails', 'Calls', 'Tasks', 'Meetings']
const TYPE_MAP = { Notes: 'note', Emails: 'email', Calls: 'call', Tasks: 'task', Meetings: 'meeting' }

const ICON_MAP = {
  note:    { Icon: FileText,    cls: 'note'    },
  email:   { Icon: Mail,        cls: 'email'   },
  call:    { Icon: Phone,       cls: 'call'    },
  meeting: { Icon: Calendar,    cls: 'meeting' },
  task:    { Icon: CheckSquare, cls: 'task'    },
}

const SUBTAB_ACTIONS = {
  'All activities': [],
  Notes:    [{ label: 'Create a note',  key: 'note'    }],
  Emails:   [{ label: 'Log an email',   key: 'email'   }],
  Calls:    [{ label: 'Log a call',     key: 'call'    }],
  Tasks:    [{ label: 'Create a task',  key: 'task'    }],
  Meetings: [{ label: 'Schedule',       key: 'meeting' }],
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtDuration(sec) {
  if (!sec) return '0 sec'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s} sec`
  if (s === 0) return `${m} min`
  return `${m}m ${s}s`
}

// Group emails with the same threadId into thread objects.
// Emails without threadId stay as standalone items (type: 'activity').
// All non-email activities also stay as standalone items (type: 'activity').
// Returns a flat list sorted by date descending, each item either
// { _type: 'thread', threadId, subject, messages, latestDate }
// or { _type: 'activity', ...activityFields }
function buildDisplayList(activities, query) {
  const q = query.toLowerCase()

  const matches = (a) => {
    if (!q) return true
    return (
      (a.title   || '').toLowerCase().includes(q) ||
      (a.body    || '').toLowerCase().includes(q) ||
      (a.subject || '').toLowerCase().includes(q) ||
      (a.toEmail || '').toLowerCase().includes(q) ||
      (a.fromEmail || '').toLowerCase().includes(q)
    )
  }

  const threadMap = {}   // threadId -> messages[]
  const standalones = [] // non-email or email without threadId

  for (const a of activities) {
    if (a.type === 'email' && a.threadId) {
      if (!threadMap[a.threadId]) threadMap[a.threadId] = []
      threadMap[a.threadId].push(a)
    } else {
      if (matches(a)) standalones.push({ _type: 'activity', ...a })
    }
  }

  const threads = []
  for (const [threadId, msgs] of Object.entries(threadMap)) {
    const sorted = [...msgs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    // thread matches query if any message matches
    const threadMatches = sorted.some(m => matches(m))
    if (!threadMatches) continue

    const latest = sorted[sorted.length - 1]
    const subject = sorted[0].subject || sorted[0].title || 'Email thread'

    threads.push({
      _type:      'thread',
      threadId,
      subject,
      messages:   sorted,
      latestDate: latest.createdAt,
      // use latest message date for date-grouping
      createdAt:  latest.createdAt,
    })
  }

  const all = [...threads, ...standalones]
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return all
}

function groupByDate(items) {
  const groups = {}
  items.forEach(item => {
    const key = formatDate(item.createdAt)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  })
  return Object.entries(groups)
}

function fmtDateTime(iso) {
  if (!iso) return ''
  return `${formatDate(iso)} ${formatTime(iso)}`
}

// Open-tracking readout for outbound emails: count + first/last opened + history.
function OpenTracking({ act, showHistory = false }) {
  if (!act || act.direction !== 'outbound') return null
  const count = act.openCount || 0

  if (count === 0) {
    return (
      <div className="af-meta" style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8' }}>
        <Eye size={12} /> Not opened yet
      </div>
    )
  }

  const history = Array.isArray(act.openHistory) ? act.openHistory : []

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#16a34a' }}>
          <Eye size={12} /> Opened {count}×
        </span>
        {act.firstOpenedAt && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>first {fmtDateTime(act.firstOpenedAt)}</span>
        )}
        {act.lastOpenedAt && count > 1 && (
          <span style={{ fontSize: 11, color: '#94a3b8' }}>· last {fmtDateTime(act.lastOpenedAt)}</span>
        )}
      </div>
      {showHistory && history.length > 0 && (
        <div style={{ marginTop: 6, paddingLeft: 6, borderLeft: '2px solid #e2e8f0' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 3px 8px' }}>
            Open history
          </div>
          {history.slice().reverse().map((h, i) => (
            <div key={i} style={{ fontSize: 11, color: '#64748b', padding: '2px 0 2px 8px' }}>
              {fmtDateTime(h.at)}{h.ip ? ` · ${h.ip}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmailStatusBadge({ status }) {
  const colors = {
    sent:      { bg: '#eff6ff', text: '#3b82f6' },
    delivered: { bg: '#f0fdf4', text: '#22c55e' },
    opened:    { bg: '#fefce8', text: '#eab308' },
    replied:   { bg: '#f0fdf4', text: '#10b981' },
    received:  { bg: '#f5f3ff', text: '#8b5cf6' },
  }
  const c = colors[status] || { bg: '#f8fafc', text: '#64748b' }
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: c.bg, color: c.text, textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>
      {status}
    </span>
  )
}

// Single message row inside a thread
function ThreadMessage({ msg, isLast }) {
  const [open, setOpen] = useState(isLast) // latest message open by default
  const isInbound = msg.direction === 'inbound'

  return (
    <div
      onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
      style={{
        borderTop: '1px solid #f1f5f9',
        padding: '8px 12px',
        cursor: 'pointer',
        background: open ? '#fafbff' : 'transparent',
      }}
    >
      {/* Message header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          {open
            ? <ChevronDown size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
            : <ChevronRight size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />}
          {isInbound
            ? <ArrowDownLeft size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} />
            : <ArrowUpRight  size={12} style={{ color: '#3b82f6', flexShrink: 0 }} />}
          <span style={{
            fontSize: 12, fontWeight: 500,
            color: isInbound ? '#8b5cf6' : '#3b82f6',
            flexShrink: 0,
          }}>
            {isInbound ? 'From:' : 'To:'}
          </span>
          <span style={{ fontSize: 12, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isInbound ? msg.fromEmail : msg.toEmail}
          </span>
          <EmailStatusBadge status={msg.emailStatus} />
          {!isInbound && msg.openCount > 0 && (
            <span title={`Opened ${msg.openCount}×`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#16a34a', flexShrink: 0 }}>
              <Eye size={11} /> {msg.openCount}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
          {formatDate(msg.createdAt)} {formatTime(msg.createdAt)}
        </span>
      </div>

      {/* Message body */}
      {open && msg.body && (
        <div style={{
          marginTop: 8, fontSize: 13, color: '#374151',
          whiteSpace: 'pre-wrap', lineHeight: 1.6,
          paddingLeft: 20,
          maxHeight: 200, overflowY: 'auto',
        }}>
          {msg.body}
        </div>
      )}
      {open && !msg.body && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#94a3b8', paddingLeft: 20 }}>
          (no message body)
        </div>
      )}
      {open && !isInbound && (
        <div style={{ paddingLeft: 20 }}>
          <OpenTracking act={msg} showHistory={true} />
        </div>
      )}
    </div>
  )
}

// Thread card — groups all messages in a conversation
function EmailThreadCard({ thread }) {
  const [expanded, setExpanded] = useState(false)
  const { messages, subject, latestDate } = thread
  const count    = messages.length
  const inbound  = messages.filter(m => m.direction === 'inbound').length
  const outbound = messages.filter(m => m.direction === 'outbound').length
  const latest   = messages[messages.length - 1]

  return (
    <div className="af-item" style={{ flexDirection: 'column', alignItems: 'stretch', padding: 0 }}>
      {/* Thread header — click to expand/collapse */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '10px 14px', cursor: 'pointer',
        }}
      >
        <div className="af-icon email" style={{ marginTop: 2, flexShrink: 0 }}>
          <Mail size={15} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="af-header">
            <div className="af-title" style={{ alignItems: 'flex-start' }}>
              {expanded
                ? <ChevronDown  size={13} style={{ color: '#94a3b8', flexShrink: 0, marginTop: 2 }} />
                : <ChevronRight size={13} style={{ color: '#94a3b8', flexShrink: 0, marginTop: 2 }} />}
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{subject}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
              <span className="af-time">{formatDate(latestDate)} at {formatTime(latestDate)}</span>
              {latest.user?.name && (
                <span style={{ fontSize: 11, color: '#94a3b8' }}>{latest.user.name}</span>
              )}
            </div>
          </div>

          {/* Thread summary line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#64748b',
              background: '#f1f5f9', padding: '2px 7px', borderRadius: 10,
            }}>
              {count} message{count !== 1 ? 's' : ''}
            </span>
            {outbound > 0 && (
              <span style={{ fontSize: 11, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 3 }}>
                <ArrowUpRight size={11} /> {outbound} sent
              </span>
            )}
            {inbound > 0 && (
              <span style={{ fontSize: 11, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 3 }}>
                <ArrowDownLeft size={11} /> {inbound} received
              </span>
            )}
            {/* Show latest status if not expanded */}
            {!expanded && latest.emailStatus && (
              <EmailStatusBadge status={latest.emailStatus} />
            )}
          </div>

          {/* Preview of latest message when collapsed */}
          {!expanded && latest.body && (
            <div style={{
              marginTop: 5, fontSize: 12, color: '#64748b',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}>
              {latest.body.replace(/\n/g, ' ').slice(0, 120)}
            </div>
          )}
        </div>
      </div>

      {/* Expanded: show all messages chronologically */}
      {expanded && (
        <div style={{ borderTop: '1px solid #e2e8f0' }}>
          {messages.map((msg, i) => (
            <ThreadMessage key={msg.id} msg={msg} isLast={i === messages.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// Regular card for non-email activities (unchanged behaviour)
function ActivityCard({ act }) {
  const [expanded, setExpanded] = useState(false)
  const { Icon, cls } = ICON_MAP[act.type] || ICON_MAP.note

  const isOverdue = act.type === 'task' && act.dueDate && new Date(act.dueDate) < new Date() && act.taskStatus !== 'completed'
  const isDone    = act.type === 'task' && act.taskStatus === 'completed'

  function renderMeta() {
    if (act.type === 'email') {
      const isInbound = act.direction === 'inbound'
      return (
        <div className="af-meta" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isInbound
            ? <><ArrowDownLeft size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} /><span style={{ color: '#8b5cf6' }}>Received from:</span><span style={{ color: '#0f172a' }}>{act.fromEmail || act.toEmail}</span></>
            : <><ArrowUpRight  size={12} style={{ color: '#3b82f6', flexShrink: 0 }} /><span style={{ color: '#3b82f6' }}>Sent to:</span><span style={{ color: '#0f172a' }}>{act.toEmail}</span></>
          }
          {act.emailStatus && <EmailStatusBadge status={act.emailStatus} />}
        </div>
      )
    }
    if (act.type === 'call') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="af-meta">
            {act.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'} · {fmtDuration(act.duration)}
            {act.outcome && <span style={{ marginLeft: 8 }}>· {act.outcome.replace(/_/g, ' ')}</span>}
          </div>
          {act.recordingUrl && (
            <a href={act.recordingUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, color: '#16a34a', fontWeight: 500,
                textDecoration: 'none', padding: '3px 8px',
                background: '#f0fdf4', borderRadius: 4, width: 'fit-content',
              }}>
              <Play size={11} /> Play recording
            </a>
          )}
        </div>
      )
    }
    if (act.type === 'meeting') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="af-meta">
            {act.startTime ? `${formatDate(act.startTime)} at ${formatTime(act.startTime)}` : ''}
            {act.meetingStatus && <span style={{ marginLeft: 8 }}>· {act.meetingStatus}</span>}
            {act.location && !act.meetLink && <span style={{ marginLeft: 8 }}>· 📍 {act.location}</span>}
          </div>
          {act.meetLink && (
            <a href={act.meetLink} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, color: '#1a73e8', fontWeight: 500,
                textDecoration: 'none', padding: '3px 8px',
                background: '#eff6ff', borderRadius: 4, width: 'fit-content',
              }}>
              <Video size={12} /> Join Google Meet <ExternalLink size={11} />
            </a>
          )}
        </div>
      )
    }
    if (act.type === 'task') {
      return (
        <div className="af-meta">
          {act.dueDate && <>Due: {formatDate(act.dueDate)}</>}
          {act.priority && act.priority !== 'none' && <span style={{ marginLeft: 8 }}>· {act.priority} priority</span>}
          {act.taskStatus && <span style={{ marginLeft: 8 }}>· {act.taskStatus.replace(/_/g, ' ')}</span>}
        </div>
      )
    }
    return null
  }

  const subtitle = act.type === 'email' && act.subject && act.subject !== act.title ? act.subject : null

  return (
    <div className="af-item" onClick={() => setExpanded(e => !e)}>
      <div className={`af-icon ${cls}`}><Icon size={15} /></div>
      <div className="af-content">
        <div className="af-header">
          <div className="af-title">
            {expanded
              ? <ChevronDown  size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
              : <ChevronRight size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />}
            {act.title || act.type}
            {isOverdue && <span className="af-badge overdue" style={{ marginLeft: 6 }}><AlertTriangle size={10} /> Overdue</span>}
            {isDone    && <span className="af-badge done"    style={{ marginLeft: 6 }}>✓ Done</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span className="af-time">{formatDate(act.createdAt)} at {formatTime(act.createdAt)}</span>
            {act.user?.name && <span style={{ fontSize: 11, color: '#94a3b8' }}>{act.user.name}</span>}
          </div>
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 3 }}>{subtitle}</div>
        )}
        {renderMeta()}
        {act.type === 'email' && <OpenTracking act={act} showHistory={expanded} />}
        {expanded && act.body && (
          <div className="af-body">{act.body}</div>
        )}
        {expanded && act.type === 'meeting' && act.participants && (
          <div className="af-body" style={{ color: '#64748b' }}>Participants: {act.participants}</div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ subTab }) {
  const msgs = {
    'All activities': 'No activities logged yet. Use the buttons above to log a note, call, email, task, or meeting.',
    Notes:    'No notes yet. Click "Create a note" to add one.',
    Emails:   'No emails logged. Connect Gmail or click "Log an email" to record one.',
    Calls:    'No calls logged. Click "Log a call" to record a call.',
    Tasks:    'No tasks. Click "Create a task" to add one.',
    Meetings: 'No meetings. Click "Schedule" to add one.',
  }
  const icons = { Emails: '✉', Calls: '📞', Tasks: '✅', Meetings: '📅' }
  return (
    <div className="af-empty">
      <div className="af-empty-icon" style={{ fontSize: 40 }}>{icons[subTab] || '📝'}</div>
      <p>{msgs[subTab] || 'No activities found.'}</p>
    </div>
  )
}

export default function ActivityFeed({ companyId, contactEmail, onAction, refreshKey = 0 }) {
  const [subTab,      setSubTab]      = useState('All activities')
  const [query,       setQuery]       = useState('')
  const [acts,        setActs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [syncing,     setSyncing]     = useState(false)
  const [syncMsg,     setSyncMsg]     = useState('')

  // Track the last entity+email combo that was auto-synced so we sync once per visit
  const autoSyncKeyRef = useRef(null)

  const fetchActs = useCallback(() => {
    if (!companyId) return
    setLoading(true)
    const actType = subTab === 'All activities' ? 'all' : TYPE_MAP[subTab]
    api.get('/activities', { params: { companyId, type: actType } })
      .then(r => setActs(r.data))
      .catch(() => setActs([]))
      .finally(() => setLoading(false))
  }, [companyId, subTab, refreshKey])

  useEffect(() => { fetchActs() }, [fetchActs])

  // Auto-sync emails silently when the Emails tab is opened, and again whenever
  // refreshKey bumps (e.g. right after sending) so a continued thread appears at
  // once. The key includes refreshKey so each send triggers a fresh Gmail sync.
  useEffect(() => {
    if (subTab !== 'Emails' || !contactEmail || !companyId) return
    const key = `${companyId}::${contactEmail}::${refreshKey}`
    if (autoSyncKeyRef.current === key) return
    autoSyncKeyRef.current = key

    api.post('/email/sync', { contactEmail, companyId }).then(() => {
      api.get('/activities', { params: { companyId, type: 'email' } })
        .then(r => setActs(r.data))
        .catch(() => {})
    }).catch(() => {})
  }, [subTab, contactEmail, companyId, refreshKey])

  const syncEmails = async () => {
    if (!contactEmail) { setSyncMsg('No email address found for this record.'); return }
    setSyncing(true); setSyncMsg('')
    try {
      const { data } = await api.post('/email/sync', { contactEmail, companyId })
      const added   = data.synced   || 0
      const removed = data.removed  || 0
      const total   = data.total

      if (data.message === 'Gmail not connected') {
        setSyncMsg('Gmail not connected. Please connect Gmail first.')
      } else if (total === 0) {
        setSyncMsg('No matching emails found in Gmail for this email address.')
      } else if (added > 0 || removed > 0) {
        setSyncMsg(`${added} added${removed > 0 ? `, ${removed} removed` : ''}`)
      } else {
        setSyncMsg(`Already up to date (${total} Gmail email${total !== 1 ? 's' : ''} matched)`)
      }
      fetchActs()
    } catch (err) {
      const msg = err?.response?.data?.message || 'Sync failed.'
      setSyncMsg(msg)
    } finally {
      setSyncing(false)
    }
  }

  const displayList = buildDisplayList(acts, query)
  const groups      = groupByDate(displayList)
  const actions     = SUBTAB_ACTIONS[subTab] || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {/* Subtabs */}
      <div className="activities-subtabs">
        {SUBTABS.map(t => (
          <button key={t} className={`activity-subtab ${subTab === t ? 'active' : ''}`} onClick={() => setSubTab(t)}>{t}</button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="af-toolbar">
        <div className="af-toolbar-left">
          <div className="af-search">
            <Search size={12} color="#94a3b8" />
            <input
              type="text"
              placeholder={`Search ${subTab.toLowerCase()}`}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <button className="btn-af-action"><SlidersHorizontal size={12} /> Filters</button>
        </div>
        <div className="af-toolbar-right">
          <span style={{ fontSize: 12, color: '#64748b', cursor: 'pointer' }}>Collapse all ▾</span>
          {actions.map(a => (
            <button
              key={a.label}
              className="btn-af-action"
              onClick={() => {
                if (a.key === 'call') {
                  window.open('https://web.callhippo.com/dashboard?key=2', '_blank', 'noreferrer')
                } else {
                  onAction && onAction(a.key)
                }
              }}
            >
              {a.label}
            </button>
          ))}
          {subTab === 'Emails' && (
            <button
              className="btn-af-action"
              onClick={syncEmails}
              disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <RefreshCw size={12} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              {syncing ? 'Syncing…' : 'Sync emails'}
            </button>
          )}
          {subTab === 'Emails' && syncMsg && (
            <span style={{ fontSize: 11, color: syncMsg.includes('failed') || syncMsg.includes('No email') ? '#ef4444' : '#10b981' }}>
              {syncMsg}
            </span>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div className="af-empty"><p>Loading…</p></div>
        ) : displayList.length === 0 ? (
          <EmptyState subTab={subTab} />
        ) : (
          <div className="activity-feed">
            {groups.map(([date, items]) => (
              <div key={date} className="activity-date-group">
                <div className="activity-date-header">{date.toUpperCase()}</div>
                {items.map(item =>
                  item._type === 'thread'
                    ? <EmailThreadCard key={item.threadId} thread={item} />
                    : <ActivityCard    key={item.id}       act={item}    />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
