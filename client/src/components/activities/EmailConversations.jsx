import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, RefreshCw, X, Paperclip, Eye,
  ArrowUpRight, ArrowDownLeft, Mail, Reply,
} from 'lucide-react'
import api from '../../api/client'
import { convCache, threadCache, lastSyncAt, SYNC_TTL_MS } from '../../utils/emailCache'
import '../../styles/email-conversations.css'

// Company → Company Email Address → Conversation Thread → Individual Emails.
// Conversations are grouped by the company address they belong to, never
// merged into one timeline; opening one shows every message in the thread.

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

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

// Caches live in utils/emailCache so the composer and Company Detail can
// invalidate them when they change a company's email data.

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
function ThreadDrawer({ threadId, companyId, summary, onClose, onReply }) {
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
            <button
              className="ec-btn"
              style={{ marginLeft: 'auto', padding: '3px 9px' }}
              onClick={() => onReply(data || summary)}
            >
              <Reply size={12} /> Reply
            </button>
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

// ── Address group ──────────────────────────────────────────────────────────
function AddressGroup({ group, openThreadId, onOpenThread, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="ec-group">
      <button className="ec-group-header" onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
        <Mail size={14} color="#64748b" />
        <span className="ec-group-addr">{group.address}</span>
        {group.isPrimary && <span className="ec-tag">Primary</span>}
        <span className="ec-count">
          {group.threadCount} conversation{group.threadCount === 1 ? '' : 's'}
        </span>
        {group.lastActivityAt && <span className="ec-group-meta">{fmtDate(group.lastActivityAt)}</span>}
      </button>

      {open && (
        group.threads.length === 0
          ? <div className="ec-empty-addr">No conversations with this address yet.</div>
          : group.threads.map(t => (
              <div
                key={t.threadId}
                className={`ec-thread ${openThreadId === t.threadId ? 'active' : ''}`}
                onClick={() => onOpenThread(t, group)}
              >
                <div className="ec-thread-main">
                  <div className="ec-thread-top">
                    {t.lastDirection === 'outbound'
                      ? <ArrowUpRight size={12} color="#3b82f6" />
                      : <ArrowDownLeft size={12} color="#8b5cf6" />}
                    <span className="ec-thread-subject">{t.subject}</span>
                    {t.hasAttachments && <Paperclip size={11} color="#94a3b8" />}
                  </div>
                  {t.lastSnippet && <div className="ec-thread-snippet">{t.lastSnippet}</div>}
                </div>
                <div className="ec-thread-right">
                  <span className="ec-thread-date">{fmtDate(t.lastMessageAt)}</span>
                  <span className="ec-msgcount">{t.messageCount} mail{t.messageCount === 1 ? '' : 's'}</span>
                </div>
              </div>
            ))
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function EmailConversations({ companyId, companyName, refreshKey = 0 }) {
  const navigate = useNavigate()
  // Render straight from cache when we already have this company's data —
  // this is what makes returning to the Emails tab instant.
  const [data, setData]       = useState(() => convCache.get(companyId) || null)
  const [loading, setLoading] = useState(() => !convCache.has(companyId))
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [openThread, setOpenThread] = useState(null)

  // Guards against out-of-order responses: a slow earlier request can never
  // overwrite the result of a newer one.
  const reqSeq = useRef(0)

  const load = useCallback(async () => {
    if (!companyId) return
    const seq = ++reqSeq.current
    if (!convCache.has(companyId)) setLoading(true)
    try {
      const { data } = await api.get('/email/conversations', { params: { companyId } })
      convCache.set(companyId, data)
      if (seq === reqSeq.current) setData(data)
    } catch {
      if (seq === reqSeq.current && !convCache.has(companyId)) setData(null)
    } finally {
      if (seq === reqSeq.current) setLoading(false)
    }
  }, [companyId])

  const sync = useCallback(async (silent = false) => {
    if (!companyId) return
    if (!silent) { setSyncing(true); setSyncMsg('') }
    try {
      const { data } = await api.post('/email/sync', { companyId })
      lastSyncAt.set(companyId, Date.now())
      if (!silent) {
        if (data.message) setSyncMsg(data.message)
        else {
          const changed = (data.synced || 0) + (data.adopted || 0) + (data.unlinked || 0)
          setSyncMsg(changed > 0 ? `${changed} email${changed === 1 ? '' : 's'} updated` : 'Up to date')
        }
      }
      // Sync can change what belongs to this company, so its cached thread
      // payloads are no longer trustworthy.
      for (const k of [...threadCache.keys()]) if (k.startsWith(`${companyId}:`)) threadCache.delete(k)
      await load()
    } catch (err) {
      if (!silent) setSyncMsg(err?.response?.data?.message || 'Sync failed.')
    } finally {
      if (!silent) setSyncing(false)
    }
  }, [companyId, load])

  // Company changed, or the tab was reopened. Show whatever is cached for THIS
  // company immediately, then refresh only when the cache is actually stale.
  useEffect(() => {
    if (!companyId) return

    const cached = convCache.get(companyId)

    // Never let one company's conversations linger on screen while another
    // company's data loads.
    setOpenThread(null)
    setSyncMsg('')
    setData(cached || null)
    setLoading(!cached)

    const fresh = Date.now() - (lastSyncAt.get(companyId) || 0) < SYNC_TTL_MS
    if (cached && fresh) return   // reuse — no request at all

    // Stale or never loaded: sync so newly received mail is picked up too.
    // Cached content stays on screen meanwhile, so there is no flash of empty.
    sync(true)
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Something upstream changed this company's email data (e.g. an email was
  // sent, or its addresses were edited). The cache was invalidated at the
  // source, so this re-syncs rather than trusting what we hold.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (companyId) sync(true)
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const goCompose = (to) => {
    navigate('/email', { state: { to: to || '', companyId, companyName } })
  }

  const handleReply = (thread) => {
    const addr = thread?.matchedCompanyEmail || thread?.address || ''
    goCompose(addr)
  }

  const groups = data?.addresses || []
  const ignoredOwn = data?.ignoredOwnAddresses || []

  return (
    <div className="ec-root">
      <div className="ec-toolbar">
        <button className="ec-btn" onClick={() => sync(false)} disabled={syncing}>
          <RefreshCw size={12} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
          {syncing ? 'Syncing…' : 'Sync emails'}
        </button>
        <button className="ec-btn ec-btn-primary" onClick={() => goCompose('')}>
          <Mail size={12} /> Compose
        </button>
        {syncMsg && (
          <span
            className="ec-toolbar-msg"
            style={{ color: /fail|not connected/i.test(syncMsg) ? '#ef4444' : '#10b981' }}
          >
            {syncMsg}
          </span>
        )}
        {data && (
          <span className="ec-toolbar-msg" style={{ marginLeft: 'auto', color: '#94a3b8' }}>
            {data.totalMessages} email{data.totalMessages === 1 ? '' : 's'} across {groups.length} address{groups.length === 1 ? '' : 'es'}
          </span>
        )}
      </div>

      <div className="ec-scroll">
        {loading && !data && <div className="ec-loading">Loading conversations…</div>}

        {/* An address that is also the connected mailbox can't identify a
            counterpart, so it is excluded rather than matching everything. */}
        {ignoredOwn.length > 0 && (
          <div style={{ margin: '8px 14px', padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 11.5, color: '#92400e' }}>
            <strong>{ignoredOwn.join(', ')}</strong> {ignoredOwn.length === 1 ? 'is' : 'are'} your own connected Gmail address, so {ignoredOwn.length === 1 ? 'it is' : 'they are'} not used to match conversations. Save the client's address on this company instead.
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="ec-empty">
            No client email address saved for this company.<br />
            Add one under <strong>Edit company → Email</strong> to start syncing conversations.
          </div>
        )}

        {groups.map((g, i) => (
          <AddressGroup
            key={g.address}
            group={g}
            openThreadId={openThread?.thread?.threadId}
            onOpenThread={(thread, group) => setOpenThread({ thread, group })}
            defaultOpen={i === 0 || g.threadCount > 0}
          />
        ))}
      </div>

      {openThread && (
        <ThreadDrawer
          threadId={openThread.thread.threadId}
          companyId={companyId}
          summary={{ ...openThread.thread, address: openThread.group.address }}
          onClose={() => setOpenThread(null)}
          onReply={handleReply}
        />
      )}
    </div>
  )
}
