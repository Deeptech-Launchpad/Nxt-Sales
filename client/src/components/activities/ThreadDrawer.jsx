import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Paperclip, Eye, EyeOff, ArrowUpRight, ArrowDownLeft, Reply, ReplyAll, Forward, Mail } from 'lucide-react'
import { sanitizeEmailBody, hasRenderableHtml } from '../../utils/emailHtml'
import api from '../../api/client'
import { threadCache } from '../../utils/emailCache'
import '../../styles/modal.css'
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

  // Show the email the way it was actually sent whenever we have the real
  // markup for it. Sanitised first — this is untrusted content from whoever
  // sent the mail (see utils/emailHtml.js for the allowlist). Emails stored
  // before the HTML was kept, and genuinely plain-text ones, fall through to
  // the original text rendering below, which handles line breaks properly.
  const safeHtml = hasRenderableHtml(msg.bodyHtml) ? sanitizeEmailBody(msg.bodyHtml) : ''
  const isLong = safeHtml ? safeHtml.length > 2200 : body.length > 900

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
        {safeHtml ? (
          <div className="ec-msg-html" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        ) : (
          body || <span style={{ color: '#475467', fontStyle: 'italic' }}>(no message body)</span>
        )}
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

      {/* Three distinct states, never conflated: an email that cannot report
          opens at all (no pixel — written in Gmail, not composed here) says so;
          one that can but has not been opened says "not opened yet"; one that
          has been opened shows the count. The API omits this block entirely for
          received mail, so inbound simply never renders it. */}
      {msg.tracking && (
        <div className="ec-track">
          {!msg.tracking.tracked ? (
            <>
              <span className="ec-track-badge untracked"><EyeOff size={11} /> Not tracked</span>
              <span className="ec-track-meta">sent outside the CRM composer</span>
            </>
          ) : msg.tracking.openCount > 0 ? (
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

  // Portalled to <body> for the same reason CallModal/MeetingModal/NoteModal
  // are: the overlay is position:fixed, but Company → Activities → Emails
  // renders it inside main.company-workspace-body, which carries a transform
  // and therefore becomes the containing block for fixed descendants. Left
  // inline, the overlay sizes to that element instead of the viewport and the
  // drawer hangs off the bottom of the screen.
  return createPortal(
    <div className="modal-overlay company-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-drawer company-create-modal thread-view-modal" role="dialog" aria-modal="true" aria-label="Conversation">
        <div className="modal-header company-modal-header">
          <div className="company-modal-title">
            <span className="company-modal-title-icon"><Mail size={16} /></span>
            <div>
              <h2>{data?.subject || summary?.subject || 'Conversation'}</h2>
              <p>
                {messages.length || summary?.messageCount || 0} message{(messages.length || summary?.messageCount) === 1 ? '' : 's'}
                {(data?.matchedCompanyEmail || summary?.address) && ` · via ${data?.matchedCompanyEmail || summary?.address}`}
              </p>
            </div>
          </div>
          <button className="modal-close" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body company-modal-body ec-thread-body">
          {loading && <div className="ec-loading">Loading conversation…</div>}
          {!loading && error && <div className="ec-empty" style={{ color: '#ef4444' }}>{error}</div>}
          {!loading && !error && messages.map((m, i) => (
            <ThreadMessage key={m.id} msg={m} index={i} total={messages.length} />
          ))}
        </div>

        {/* Reply/Reply All/Forward act on the last message of the loaded
            thread, so they need real message data (not just the summary
            row) — disabled until that finishes loading. */}
        {onReply && (
          <div className="modal-footer company-modal-footer">
            <button className="btn-modal-secondary" disabled={messages.length === 0} onClick={() => onReply(buildReplyDraft(data, 'reply'))}>
              <Reply size={13} /> Reply
            </button>
            <button className="btn-modal-secondary" disabled={messages.length === 0} onClick={() => onReply(buildReplyDraft(data, 'replyAll'))}>
              <ReplyAll size={13} /> Reply All
            </button>
            <button className="btn-modal-secondary" disabled={messages.length === 0} onClick={() => onReply(buildReplyDraft(data, 'forward'))}>
              <Forward size={13} /> Forward
            </button>
            <button className="btn-modal-cancel" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
