import { useState, useEffect } from 'react'
import { X, Paperclip, Eye, ArrowUpRight, ArrowDownLeft, Reply } from 'lucide-react'
import api from '../../api/client'
import { threadCache } from '../../utils/emailCache'
import '../../styles/email-conversations.css'

// Extracted out of EmailConversations.jsx unchanged (same markup, same cache,
// same /email/thread/:threadId call) so the Inbox module can reuse the exact
// same "open a conversation" experience instead of building a second one —
// EmailConversations.jsx now imports this file too, with zero behavior
// change on the per-company Email tab. `companyId` is optional here (the
// backend already treats a missing companyId as "no filter" on this route),
// which is what lets Inbox open any thread regardless of which company (or
// no company) it's matched to.

function fmtDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
}

function fmtSize(bytes) {
  if (!bytes) return ''
  const k = 1024, units = ['B', 'KB', 'MB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1)
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// ── One message inside the thread ──────────────────────────────────────────
// Every message renders in full; long bodies clamp with a "Show full message"
// toggle rather than being hidden behind a reply count.
function ThreadMessage({ msg, index, total }) {
  const [expanded, setExpanded] = useState(false)
  const isOutbound = msg.direction === 'outbound'
  const body = msg.body || ''
  const isLong = body.length > 900

  return (
    <div className={`ec-msg ${isOutbound ? 'outbound' : 'inbound'}`}>
      <div className="ec-msg-head">
        <div className="ec-msg-line">
          <span className="ec-msg-seq">{index + 1}/{total}</span>
          <span className={`ec-msg-dir ${isOutbound ? 'outbound' : 'inbound'}`}>
            {isOutbound ? <ArrowUpRight size={9} /> : <ArrowDownLeft size={9} />}
            {isOutbound ? 'Sent' : 'Received'}
          </span>
          <span className="ec-msg-time">{fmtDateTime(msg.createdAt)}</span>
        </div>
        <div className="ec-msg-line" style={{ marginTop: 4 }}>
          <span className="ec-msg-label">From</span>
          <span className="ec-msg-addr">{msg.fromEmail || '—'}</span>
        </div>
        <div className="ec-msg-line" style={{ marginTop: 2 }}>
          <span className="ec-msg-label">To</span>
          <span className="ec-msg-addr">{msg.toEmail || '—'}</span>
        </div>
        {msg.ccEmail && (
          <div className="ec-msg-line" style={{ marginTop: 2 }}>
            <span className="ec-msg-label">Cc</span>
            <span className="ec-msg-addr">{msg.ccEmail}</span>
          </div>
        )}
      </div>

      <div className={`ec-msg-body ${isLong && !expanded ? 'clamped' : ''}`}>
        {body || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>(no message body)</span>}
      </div>
      {isLong && (
        <button className="ec-msg-more" onClick={() => setExpanded(e => !e)}>
          {expanded ? 'Show less' : 'Show full message'}
        </button>
      )}

      {msg.attachments?.length > 0 && (
        <div className="ec-atts">
          {msg.attachments.map((a, i) => (
            <span key={i} className="ec-att">
              <Paperclip size={11} />
              {a.filename}{a.size ? ` · ${fmtSize(a.size)}` : ''}
            </span>
          ))}
        </div>
      )}

      {/* Tracking is sender-private — the API omits it entirely for received
          mail and for mail sent by another user, so this simply never renders. */}
      {msg.tracking && (
        <div className="ec-track">
          {msg.tracking.openCount > 0 ? (
            <>
              <span className="ec-track-badge opened"><Eye size={11} /> Opened {msg.tracking.openCount}×</span>
              {msg.tracking.firstOpenedAt && (
                <span className="ec-track-meta">first {fmtDateTime(msg.tracking.firstOpenedAt)}</span>
              )}
              {msg.tracking.lastOpenedAt && msg.tracking.openCount > 1 && (
                <span className="ec-track-meta">· last {fmtDateTime(msg.tracking.lastOpenedAt)}</span>
              )}
            </>
          ) : (
            <>
              <span className="ec-track-badge sent"><Eye size={11} /> Sent</span>
              <span className="ec-track-meta">not opened yet</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Right-side conversation drawer ─────────────────────────────────────────
export default function ThreadDrawer({ threadId, companyId, summary, onClose, onReply }) {
  const cacheKey = `${companyId}:${threadId}`
  const [data, setData]       = useState(() => threadCache.get(cacheKey) || null)
  const [loading, setLoading] = useState(() => !threadCache.has(cacheKey))
  const [error, setError]     = useState('')

  useEffect(() => {
    const key = `${companyId}:${threadId}`
    const cached = threadCache.get(key)
    if (cached) { setData(cached); setLoading(false); return }   // reopened — no refetch
    let cancelled = false
    setLoading(true); setError('')
    api.get(`/email/thread/${encodeURIComponent(threadId)}`, { params: { companyId } })
      .then(r => { threadCache.set(key, r.data); if (!cancelled) setData(r.data) })
      .catch(e => { if (!cancelled) setError(e?.response?.data?.message || 'Failed to load conversation.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [threadId, companyId])

  // Esc closes the drawer
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const messages = data?.messages || []

  return (
    <>
      <div className="ec-drawer-backdrop" onClick={onClose} />
      <aside className="ec-drawer" role="dialog" aria-label="Conversation">
        <div className="ec-drawer-header" style={{ position: 'relative' }}>
          <button className="ec-drawer-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
          <div className="ec-drawer-subject" style={{ paddingRight: 28 }}>
            {data?.subject || summary?.subject || 'Conversation'}
          </div>
          <div className="ec-drawer-sub">
            <span>{messages.length || summary?.messageCount || 0} message{(messages.length || summary?.messageCount) === 1 ? '' : 's'}</span>
            {(data?.matchedCompanyEmail || summary?.address) && (
              <><span>·</span><span>via {data?.matchedCompanyEmail || summary?.address}</span></>
            )}
            {onReply && (
              <button
                className="ec-btn"
                style={{ marginLeft: 'auto', padding: '3px 9px' }}
                onClick={() => onReply(data || summary)}
              >
                <Reply size={12} /> Reply
              </button>
            )}
          </div>
        </div>

        <div className="ec-drawer-body">
          {loading && <div className="ec-loading">Loading conversation…</div>}
          {!loading && error && <div className="ec-empty" style={{ color: '#ef4444' }}>{error}</div>}
          {!loading && !error && messages.map((m, i) => (
            <ThreadMessage key={m.id} msg={m} index={i} total={messages.length} />
          ))}
        </div>
      </aside>
    </>
  )
}
