import { useState, useEffect } from 'react'
import { X, Paperclip, Eye, ArrowUpRight, ArrowDownLeft, Reply, ReplyAll, Forward } from 'lucide-react'
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

// ── Reply / Reply All / Forward ─────────────────────────────────────────────
// Builds the composer's initial state for a genuine in-app reply/reply-all/
// forward — see EmailTool.jsx's `companyContext` handling, which consumes
// exactly this shape via navigate('/email', { state: {...} }). Kept here
// (not duplicated in Inbox.jsx/EmailConversations.jsx) so both callers of
// this drawer get identical reply behavior from one implementation, same as
// ThreadMessage/ThreadDrawer itself already are.

const EMAIL_ADDR_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
function extractAddrs(v) { return (v || '').match(EMAIL_ADDR_RE) || [] }

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Gmail's own web client wraps a reply's quoted history in exactly this
// structure — a "gmail_quote" div holding an attribution line followed by a
// blockquote with Gmail's own quote-indent styling and class. Reproducing it
// verbatim (not a custom-styled div) is the actual fix for the reported bug:
// Gmail's thread view folds content behind "Show trimmed content" by
// recognizing THIS specific markup, so using it here means Gmail folds
// exactly this section and nothing else — in particular never the signature,
// which sits before this block in the HTML, outside it entirely.
function buildQuoteHtml(msg, mode) {
  const when = msg.createdAt ? fmtDateTime(msg.createdAt) : ''
  const bodyHtml = escapeHtml(msg.body || '').replace(/\n/g, '<br>')
  if (mode === 'forward') {
    // A native Gmail Forward is its own plain block, never wrapped in
    // blockquote/gmail_quote — Gmail doesn't fold forwarded content the way
    // it folds reply history, so this intentionally stays unwrapped too.
    return `<div style="margin-top:16px">`
      + `<div dir="ltr">---------- Forwarded message ---------</div>`
      + `<div dir="ltr">From: ${escapeHtml(msg.fromEmail || '')}</div>`
      + `<div dir="ltr">Date: ${escapeHtml(when)}</div>`
      + `<div dir="ltr">Subject: ${escapeHtml(msg.subject || '')}</div>`
      + `<div dir="ltr">To: ${escapeHtml(msg.toEmail || '')}</div>`
      + `<br>`
      + bodyHtml
      + `</div>`
  }
  return `<div class="gmail_quote">`
    + `<div dir="ltr" class="gmail_attr">On ${escapeHtml(when)}, ${escapeHtml(msg.fromEmail || '')} wrote:<br></div>`
    + `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">`
    + bodyHtml
    + `</blockquote>`
    + `</div>`
}

// mode: 'reply' | 'replyAll' | 'forward'. Acts on the LAST message in the
// loaded thread (the same message a real mail client's Reply/Forward on an
// open conversation acts on). Returns null if the thread has no messages yet.
function buildReplyDraft(data, mode) {
  const messages = data?.messages || []
  if (messages.length === 0) return null
  const last = messages[messages.length - 1]

  // Every outbound message in this thread was sent from the one connected
  // mailbox — reuse its address as "me" so Reply All can exclude it from Cc.
  // If the thread is 100% inbound (never replied to yet), there is no way to
  // know "me" from the thread alone; Reply All simply has nothing to exclude.
  const ownEmail = (extractAddrs(messages.find(m => m.direction === 'outbound')?.fromEmail || '')[0] || '').toLowerCase()
  const counterpart = data?.matchedCompanyEmail || extractAddrs(last.fromEmail || '')[0] || ''

  let to = '', cc = ''
  if (mode === 'forward') {
    // Forward has no default recipient — the user picks one, same as any
    // mail client's Forward action.
  } else {
    to = (last.direction === 'outbound'
      ? extractAddrs(last.toEmail || '')[0]
      : extractAddrs(last.fromEmail || '')[0]) || counterpart

    if (mode === 'replyAll') {
      const toLower = (to || '').toLowerCase()
      const all = new Set()
      ;[last.fromEmail, last.toEmail, last.ccEmail].forEach(field =>
        extractAddrs(field || '').forEach(a => all.add(a.toLowerCase())))
      cc = [...all].filter(a => a !== toLower && a !== ownEmail).join(', ')
    }
  }

  const subjectPrefix = mode === 'forward' ? 'Fwd: ' : 'Re: '
  const baseSubject = (data?.subject || last.subject || '').replace(/^(re|fwd?)\s*:\s*/i, '')

  return {
    to,
    cc,
    subject: `${subjectPrefix}${baseSubject}`,
    quotedHtml: buildQuoteHtml(last, mode),
    threadId: data?.threadId || null,
    emailMode: 'continue',
    template: 'manual',
  }
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
            {/* Reply/Reply All/Forward act on the last message of the loaded
                thread, so they need real message data (not just the summary
                row) — disabled until that finishes loading. */}
            {onReply && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  className="ec-btn"
                  style={{ padding: '3px 9px' }}
                  disabled={messages.length === 0}
                  onClick={() => onReply(buildReplyDraft(data, 'reply'))}
                >
                  <Reply size={12} /> Reply
                </button>
                <button
                  className="ec-btn"
                  style={{ padding: '3px 9px' }}
                  disabled={messages.length === 0}
                  onClick={() => onReply(buildReplyDraft(data, 'replyAll'))}
                >
                  <ReplyAll size={12} /> Reply All
                </button>
                <button
                  className="ec-btn"
                  style={{ padding: '3px 9px' }}
                  disabled={messages.length === 0}
                  onClick={() => onReply(buildReplyDraft(data, 'forward'))}
                >
                  <Forward size={12} /> Forward
                </button>
              </div>
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
