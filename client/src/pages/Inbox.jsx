import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Mail, ArrowUpRight, ArrowDownLeft, Paperclip, Download, Upload, ChevronDown, Inbox as InboxIcon, RefreshCw } from 'lucide-react'
import api from '../api/client'
import ThreadDrawer from '../components/activities/ThreadDrawer'
import DataImportModal from '../components/modals/DataImportModal'
import DateFilterDropdown from '../components/filters/DateFilterDropdown'
import { exportCSV, exportXLSX, exportJSON, exportPDF } from '../utils/exportUtils'
import '../styles/contacts.css'
import '../styles/email-conversations.css'
import '../styles/inbox.css'

const PAGE_SIZE = 50

const DATE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
]

function dateParamsFor(token) {
  if (!token) return {}
  const now = new Date()
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const endOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
  const today = startOfDay(now)
  let from
  let to

  if (token === 'today') { from = today; to = endOfDay(today) }
  else if (token === 'yesterday') { from = new Date(today.getTime() - 86400000); to = endOfDay(from) }
  else if (token === 'this_week') {
    from = new Date(today); from.setDate(today.getDate() - today.getDay()); to = endOfDay(now)
  } else if (/^last_(7|30|90)$/.test(token)) {
    from = new Date(now.getTime() - Number(token.slice(5)) * 86400000); to = now
  } else {
    const range = token.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/)
    const day = token.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    const month = token.match(/^(\d{4})-(\d{2})$/)
    if (range) { from = startOfDay(new Date(`${range[1]}T00:00:00`)); to = endOfDay(new Date(`${range[2]}T00:00:00`)) }
    else if (day) { from = startOfDay(new Date(`${token}T00:00:00`)); to = endOfDay(from) }
    else if (month) { from = new Date(Number(month[1]), Number(month[2]) - 1, 1); to = new Date(Number(month[1]), Number(month[2]), 0, 23, 59, 59, 999) }
    else if (/^\d{4}$/.test(token)) { from = new Date(Number(token), 0, 1); to = new Date(Number(token), 11, 31, 23, 59, 59, 999) }
  }
  return from && to ? { dateFrom: from.toISOString(), dateTo: to.toISOString() } : {}
}

const EXPORT_COLUMNS = [
  { key: 'direction',   header: 'Direction' },
  { key: 'fromEmail',   header: 'From' },
  { key: 'toEmail',     header: 'To' },
  { key: 'subject',     header: 'Subject' },
  { key: 'companyName', header: 'Company' },
  { key: 'createdAt',   header: 'Date' },
]

// Export dropdown for the Inbox list — mirrors CompanyExportMenu/DealExportMenu
// (same exportUtils, same CSV/Excel/JSON/PDF choices), styled inline to match
// this page's existing bespoke button look rather than the shared .btn-action
// class other list pages use.
function InboxExportMenu({ fetchAllForExport }) {
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
      const rows = records.map(it => ({ ...it, direction: it.direction === 'outbound' ? 'Sent' : 'Received' }))
      fn(rows, 'inbox', EXPORT_COLUMNS, ...extraArgs)
    } catch {
      // fetch failed — nothing to export; same lightweight error handling as other list pages
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="inbox-export-wrap" ref={ref}>
      <button
        className="inbox-secondary-btn"
        onClick={() => setOpen(o => !o)}
        disabled={exporting}
      >
        <Download size={14} /> {exporting ? 'Exporting…' : 'Export'} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="inbox-export-menu">
          {[
            { label: 'Export as CSV',   fn: () => run(exportCSV) },
            { label: 'Export as Excel', fn: () => run(exportXLSX, ['Inbox']) },
            { label: 'Export as JSON',  fn: () => run(exportJSON) },
            { label: 'Export as PDF',   fn: () => run(exportPDF, ['Inbox Export — NXT Sales']) },
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

// Compact page-number window, same approach Companies.jsx/Tasks.jsx/Meetings.jsx use.
function pageWindow(current, total) {
  const pages = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2])
  return [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
}

// fromEmail/toEmail are raw Gmail headers (e.g. `"Rebekah Dezius"
// <customerservice@...>`, sometimes several comma-separated recipients) —
// showing that raw string in a compact row just displays a truncated,
// broken-looking mid-tag cut. Pull out a clean display name (or the bare
// address if there's no name) for the first participant, plus a count of
// any others so nothing is silently hidden.
function parseAddress(raw) {
  if (!raw) return { label: '', extra: 0 }
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  const first = parts[0] || ''
  const m = first.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/)
  const label = m ? (m[1].trim() || m[2]) : first
  return { label, extra: Math.max(0, parts.length - 1) }
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

// Every sent email (Email module) and every received email (synced
// mailboxes) is already the same Activity row (type: 'email') — this is
// purely a new cross-company VIEW over that data via GET /email/inbox
// (paginated, thread-deduped server-side). Opening a row reuses the exact
// same ThreadDrawer the per-company Email tab uses (see EmailConversations.jsx),
// so "the existing conversation/thread" is genuinely the same UI, not a copy.
export default function Inbox() {
  const navigate = useNavigate()
  const [items, setItems]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)

  const [search, setSearch]       = useState('')
  const [dateFilter, setDateFilter] = useState([])
  const [directionTab, setDirectionTab] = useState('all') // 'all' | 'outbound' | 'inbound'
  const [openItem, setOpenItem]   = useState(null)
  const [showImport, setShowImport] = useState(false)

  const switchTab = (tab) => { setDirectionTab(tab); setPage(1) }

  const fetchInbox = useCallback(() => {
    setLoading(true)
    api.get('/email/inbox', {
      params: {
        page,
        limit: PAGE_SIZE,
        ...(search.trim() && { search: search.trim() }),
        ...(directionTab !== 'all' && { direction: directionTab }),
        ...dateParamsFor(dateFilter[0]),
      },
    })
      .then(r => { setItems(r.data.items || []); setTotal(r.data.total || 0) })
      .catch(() => { setItems([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [page, search, directionTab, dateFilter])

  useEffect(() => { fetchInbox() }, [fetchInbox])

  // Export: walk every page matching the current search/direction filter (the
  // inbox endpoint caps at 100/request server-side, unlike Companies/Deals
  // which have a dedicated no-limit export route) so "Export" always covers
  // every matching conversation, not just the current page on screen.
  const fetchAllForExport = useCallback(async () => {
    const collected = []
    let p = 1
    while (true) {
      const { data } = await api.get('/email/inbox', {
        params: {
          page: p,
          limit: 100,
          ...(search.trim() && { search: search.trim() }),
          ...(directionTab !== 'all' && { direction: directionTab }),
          ...dateParamsFor(dateFilter[0]),
        },
      })
      const batch = data.items || []
      collected.push(...batch)
      if (batch.length === 0 || collected.length >= (data.total || 0)) break
      p += 1
    }
    return collected
  }, [search, directionTab, dateFilter])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasActiveInboxFilters = Boolean(search.trim() || dateFilter.length || directionTab !== 'all')

  const goCompose = (to) => navigate('/email', { state: { to: to || '' } })

  // `draft` is built by ThreadDrawer's Reply/Reply All/Forward buttons
  // (to/cc/subject/quotedHtml/threadId/emailMode/template) — passed straight
  // through as compose state so the one composer pipeline picks it up.
  const handleReply = (draft) => {
    if (!draft) return
    navigate('/email', { state: { ...draft, companyId: openItem?.companyId || undefined, companyName: openItem?.companyName || undefined } })
    setOpenItem(null)
  }

  return (
    <div className="inbox-workspace">
      <header className="inbox-hero">
        <div className="inbox-hero-copy">
          <span className="inbox-eyebrow"><InboxIcon size={13} /> Conversation center</span>
          <h1>Stay close to every conversation</h1>
          <p>Review customer emails, find important context and continue the conversation without losing momentum.</p>
        </div>
        <div className="inbox-hero-side">
          <div className="inbox-total-card"><span>{hasActiveInboxFilters ? 'Matching conversations' : 'All conversations'}</span><strong>{loading ? '—' : total.toLocaleString()}</strong><small>{hasActiveInboxFilters ? 'Based on current filters' : 'Synced across your CRM'}</small></div>
          <div className="inbox-hero-actions">
          <button
            className="inbox-secondary-btn"
            onClick={() => setShowImport(true)}
            title="Log a historical email conversation (address must already match a Company or Deal in your CRM)"
          >
            <Upload size={13} /> Import
          </button>
          <InboxExportMenu fetchAllForExport={fetchAllForExport} />
          <button
            className="inbox-compose-btn"
            onClick={() => goCompose('')}
          >
            <Mail size={13} /> Compose
          </button>
          </div>
        </div>
      </header>

      <section className="inbox-data-shell">
      <div className="inbox-list-toolbar">
      <div className="inbox-tabs" role="tablist">
        {[['all', 'All'], ['outbound', 'Sent'], ['inbound', 'Received']].map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={directionTab === v}
            onClick={() => switchTab(v)}
          >
            {label}{v === 'all' && !loading && <span>{total}</span>}
          </button>
        ))}
      </div>

      <div className="inbox-toolbar-actions">
        <div className="inbox-date-control">
          <DateFilterDropdown
            label="Date"
            presets={DATE_OPTIONS}
            value={dateFilter[0] || ''}
            onChange={value => { setDateFilter(value); setPage(1) }}
          />
        </div>
        <div className="inbox-search">
          <Search size={13} />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search client, subject or email…"
          />
        </div>
        <button className="inbox-refresh-btn" onClick={fetchInbox} title="Refresh inbox" aria-label="Refresh inbox"><RefreshCw size={13} /></button>
      </div>
      </div>

      <div className="inbox-list-head" aria-hidden="true"><span>Contact</span><span>Conversation</span><span>Date</span></div>
      <div className="inbox-list">
        {loading ? (
          <div className="inbox-empty">Loading inbox…</div>
        ) : items.length === 0 ? (
          <div className="inbox-empty">
            {total === 0 ? 'No emails yet.' : 'No emails match your search.'}
          </div>
        ) : items.map((it, i) => {
          const participant = parseAddress(it.direction === 'outbound' ? it.toEmail : it.fromEmail)
          return (
          <div
            className="inbox-row"
            key={it.id}
            onClick={() => setOpenItem(it)}
          >
            <span className={`inbox-direction ${it.direction}`} title={it.direction === 'outbound' ? 'Sent' : 'Received'}>
              {it.direction === 'outbound' ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
            </span>

            <span className="inbox-contact-avatar">{(participant.label || '?').slice(0, 2).toUpperCase()}</span>
            <div className="inbox-participant" title={it.direction === 'outbound' ? it.toEmail : it.fromEmail}>
              <div>
                {participant.label || (it.direction === 'outbound' ? '(no recipient)' : '(unknown sender)')}
                {participant.extra > 0 && <span className="inbox-extra">+{participant.extra}</span>}
              </div>
              {it.companyName && (
                <small>{it.companyName}</small>
              )}
            </div>

            <div className="inbox-message-preview">
              <strong>{it.subject || '(No subject)'}</strong>
              {it.snippet && (
                <span>
                  — {it.snippet}
                </span>
              )}
              {it.hasAttachments && <Paperclip size={11} className="inbox-attachment" />}
            </div>

            <span className="inbox-row-date">{fmtDate(it.createdAt)}</span>
          </div>
          )
        })}
      </div>

      {totalPages > 1 && (
        <div className="inbox-pagination">
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

      {openItem && (
        <ThreadDrawer
          threadId={openItem.threadId}
          companyId={openItem.companyId || undefined}
          summary={{ subject: openItem.subject }}
          onClose={() => setOpenItem(null)}
          onReply={handleReply}
        />
      )}

      <DataImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={fetchInbox}
        entityLabel="Emails"
        fieldsUrl="/email/import-fields"
        importUrl="/email/import"
        payloadKey="emails"
        templateName="inbox_email_log"
      />
    </div>
  )
}
