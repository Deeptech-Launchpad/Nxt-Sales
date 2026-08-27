import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, RefreshCw, Paperclip,
  ArrowUpRight, ArrowDownLeft, Mail,
} from 'lucide-react'
import api from '../../api/client'
import { convCache, threadCache, lastSyncAt, SYNC_TTL_MS } from '../../utils/emailCache'
import ThreadDrawer from './ThreadDrawer'
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

// Caches live in utils/emailCache so the composer and Company Detail can
// invalidate them when they change a company's email data.

// ThreadMessage and ThreadDrawer live in ./ThreadDrawer.jsx (extracted so the
// Inbox module can reuse the exact same conversation view instead of
// duplicating it) — imported above.
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

  // `draft` is built by ThreadDrawer's Reply/Reply All/Forward buttons
  // (to/cc/subject/quotedHtml/threadId/emailMode/template) — passed straight
  // through as compose state, with this company's context attached, so the
  // sent reply/forward still files under the right company.
  const handleReply = (draft) => {
    if (!draft) return
    navigate('/email', { state: { ...draft, companyId, companyName } })
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
          <span className="ec-toolbar-msg" style={{ marginLeft: 'auto', color: '#475467' }}>
            {data.totalMessages} email{data.totalMessages === 1 ? '' : 's'} across {groups.length} address{groups.length === 1 ? '' : 'es'}
          </span>
        )}
      </div>

      <div className="ec-scroll">
        {loading && !data && <div className="ec-loading">Loading conversations…</div>}

        {/* An address that is also the connected mailbox can't identify a
            counterpart, so it is excluded rather than matching everything. */}
        {ignoredOwn.length > 0 && (
          <div style={{ margin: '8px 14px', padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 14.5, color: '#92400e' }}>
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
