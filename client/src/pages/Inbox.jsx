import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Mail, ArrowUpRight, ArrowDownLeft, Paperclip, Upload as UploadIcon } from 'lucide-react'
import DataExportMenu from '../components/DataExportMenu'
import DataImportModal from '../components/modals/DataImportModal'
import api from '../api/client'
import ThreadDrawer from '../components/activities/ThreadDrawer'
import '../styles/contacts.css'
import '../styles/email-conversations.css'

const PAGE_SIZE = 50

// Compact page-number window, same approach Companies.jsx/Tasks.jsx/Meetings.jsx use.
function pageWindow(current, total) {
  const pages = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2])
  return [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
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
// Export columns for the Inbox — the same fields the list displays.
const INBOX_EXPORT_COLUMNS = [
  { key: 'subject',    header: 'Subject' },
  { key: 'fromEmail',  header: 'From' },
  { key: 'toEmail',    header: 'To' },
  { key: 'ccEmail',    header: 'Cc' },
  { key: 'direction',  header: 'Direction' },
  { key: '_company',   header: 'Company Name' },
  { key: '_date',      header: 'Date' },
  { key: 'body',       header: 'Body' },
]

export default function Inbox() {
  const navigate = useNavigate()
  const [items, setItems]     = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)

  const [search, setSearch]       = useState('')
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
      },
    })
      .then(r => { setItems(r.data.items || []); setTotal(r.data.total || 0) })
      .catch(() => { setItems([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [page, search, directionTab])

  useEffect(() => { fetchInbox() }, [fetchInbox])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 18, borderBottom: '1px solid #eef1f5' }}>
        <div>
          <h1 style={{ fontSize: 23, fontWeight: 700, color: '#0f172a', letterSpacing: '-.2px' }}>Inbox</h1>
          <span style={{ fontSize: 13.5, color: '#94a3b8', fontWeight: 500 }}>{loading ? 'Loading…' : `${total} conversation${total === 1 ? '' : 's'}`}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={() => setShowImport(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <UploadIcon size={13} /> Import
        </button>
        <DataExportMenu
          filename="inbox"
          sheetName="Inbox"
          title="Inbox Export — NXT MarketingWiz"
          columns={INBOX_EXPORT_COLUMNS}
          fetchRows={async () => {
            const { data } = await api.get('/data/inbox/export', {
              params: { ...(directionTab !== 'all' && { direction: directionTab }) },
            })
            return (data.rows || []).map(r => ({
              ...r,
              _company: r.company?.name || '',
              _date: r.createdAt ? String(r.createdAt).slice(0, 10) : '',
            }))
          }}
        />
        <button
          onClick={() => goCompose('')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: '#e63329', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', boxShadow: '0 1px 2px rgba(230,51,41,0.25)', transition: 'background .12s, box-shadow .12s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#c0271e'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(230,51,41,0.35)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#e63329'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(230,51,41,0.25)' }}
        >
          <Mail size={14} /> Compose
        </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'center', paddingBottom: 2, borderBottom: '1px solid #eef1f5' }}>
        {[['all', 'All'], ['outbound', 'Sent'], ['inbound', 'Received']].map(([v, label]) => (
          <button
            key={v}
            onClick={() => switchTab(v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
              color: directionTab === v ? '#0f172a' : '#94a3b8', borderBottom: `2px solid ${directionTab === v ? '#e63329' : 'transparent'}`, paddingBottom: 10, transition: 'color .12s, border-color .12s' }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search subject or address…"
            style={{ padding: '9px 13px 9px 33px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, width: 280, fontFamily: 'inherit', transition: 'border-color .12s, box-shadow .12s' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#e63329'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(230,51,41,0.10)' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
          />
        </div>
      </div>

      <div style={{ border: '1px solid #eef1f5', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Loading inbox…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
            {total === 0 ? 'No emails yet.' : 'No emails match your search.'}
          </div>
        ) : items.map((it, i) => (
          <div
            key={it.id}
            onClick={() => setOpenItem(it)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', cursor: 'pointer',
              borderBottom: i < items.length - 1 ? '1px solid #f4f6f8' : 'none', transition: 'background .1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span title={it.direction === 'outbound' ? 'Sent' : 'Received'} style={{ flexShrink: 0, display: 'flex', color: it.direction === 'outbound' ? '#3b82f6' : '#8b5cf6' }}>
              {it.direction === 'outbound' ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
            </span>

            <div style={{ minWidth: 0, flex: '0 0 220px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {it.direction === 'outbound' ? (it.toEmail || '(no recipient)') : (it.fromEmail || '(unknown sender)')}
              </div>
              {it.companyName && (
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 1 }}>{it.companyName}</div>
              )}
            </div>

            <div style={{ minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13.5, color: '#334155', fontWeight: 500, flexShrink: 0 }}>{it.subject}</span>
              {it.snippet && (
                <span style={{ fontSize: 13, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  — {it.snippet}
                </span>
              )}
              {it.hasAttachments && <Paperclip size={12} color="#94a3b8" style={{ flexShrink: 0 }} />}
            </div>

            <span style={{ fontSize: 12.5, color: '#94a3b8', flexShrink: 0 }}>{fmtDate(it.createdAt)}</span>
          </div>
        ))}
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

      <DataImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => fetchInbox()}
        entityLabel="Inbox"
        fieldsUrl="/data/inbox/import-fields"
        importUrl="/data/inbox/bulk"
        payloadKey="rows"
      />

      {openItem && (
        <ThreadDrawer
          threadId={openItem.threadId}
          companyId={openItem.companyId || undefined}
          summary={{ subject: openItem.subject }}
          onClose={() => setOpenItem(null)}
          onReply={handleReply}
        />
      )}
    </div>
  )
}
