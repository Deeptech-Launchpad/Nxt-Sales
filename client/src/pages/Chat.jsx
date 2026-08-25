import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, MessageSquare, Search, Users, Plus, X, Reply, Pencil, Trash2, Pin, Check,
  Paperclip, CheckCheck, Building2, Briefcase, FileText, File as FileIcon, Image as ImageIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { getSocket } from '../socket'
import '../styles/chat.css'

const MaterialIcon = ({ children }) => <span className="material-symbols-rounded" aria-hidden="true">{children}</span>

function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function conversationTime(iso) {
  if (!iso) return ''
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// Derives what a conversation is called / shown as from the caller's point of
// view — members[] from the API already excludes the caller, so for a 1:1
// it's exactly the other person; for a group it's the saved name.
function conversationLabel(conv) {
  if (conv.isGroup) return conv.name || 'Group'
  return conv.members[0]?.name || 'Unknown'
}

// Bolds "@Name" occurrences that correspond to a real recorded mention —
// never guesses at plain "@word" text that wasn't an actual selected mention.
function renderBody(body, mentions) {
  if (!mentions?.length) return body
  const names = mentions.map(m => m.user.name).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(`@(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  const parts = []
  let lastIndex = 0, match, key = 0
  while ((match = pattern.exec(body))) {
    if (match.index > lastIndex) parts.push(body.slice(lastIndex, match.index))
    parts.push(<strong key={key++} style={{ color: '#1d4ed8' }}>{match[0]}</strong>)
    lastIndex = match.index + match[0].length
  }
  parts.push(body.slice(lastIndex))
  return parts
}

function fileIconFor(mimeType) {
  if (mimeType === 'application/pdf') return { Icon: FileText, color: '#ef4444' }
  if (mimeType?.includes('word')) return { Icon: FileText, color: '#2563eb' }
  if (mimeType?.includes('sheet') || mimeType?.includes('excel')) return { Icon: FileText, color: '#16a34a' }
  return { Icon: FileIcon, color: '#64748b' }
}

// ── Create Group modal ──────────────────────────────────────
function CreateGroupModal({ users, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const create = async () => {
    if (!name.trim()) { setError('Group name is required.'); return }
    if (selected.size < 2) { setError('Pick at least 2 teammates.'); return }
    setSaving(true); setError('')
    try {
      const { data } = await api.post('/chat/conversations', { name: name.trim(), memberIds: [...selected] })
      onCreated(data.id)
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to create group.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="chat-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 440, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #e2e8f0' }}>
          <span className="chat-modal-title" style={{ fontSize: 16.5, fontWeight: 700, color: '#0f172a' }}>Create Group</span>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={19} /></button>
        </div>
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 7 }}>Group Name</label>
          <input
            autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Sales Team"
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 14.5, boxSizing: 'border-box', marginBottom: 18 }}
          />
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 7 }}>
            Members ({selected.size} selected)
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
            {users.map(u => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 9px', borderRadius: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                <div className="chat-user-avatar" style={{ width: 30, height: 30, fontSize: 12.5 }}>{initials(u.name)}</div>
                <span style={{ fontSize: 14.5, color: '#0f172a' }}>{u.name}</span>
              </label>
            ))}
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 12 }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 22px', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', fontSize: 14, cursor: 'pointer', color: '#64748b' }}>Cancel</button>
          <button onClick={create} disabled={saving} style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Creating…' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── New (1:1) chat picker ───────────────────────────────────
function NewChatModal({ users, onClose, onPicked }) {
  const [search, setSearch] = useState('')
  const filtered = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="chat-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 380, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #e2e8f0' }}>
          <span className="chat-modal-title" style={{ fontSize: 16.5, fontWeight: 700, color: '#0f172a' }}>New Chat</span>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={19} /></button>
        </div>
        <div style={{ padding: '14px 22px 0' }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teammates…"
            style={{ width: '100%', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 14.5, boxSizing: 'border-box' }} />
        </div>
        <div style={{ padding: '12px 14px 18px', overflowY: 'auto', flex: 1 }}>
          {filtered.map(u => (
            <button key={u.id} onClick={() => onPicked(u.id)} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '9px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8, textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div className="chat-user-avatar" style={{ width: 34, height: 34, fontSize: 13 }}>{initials(u.name)}</div>
              <span style={{ fontSize: 14.5, color: '#0f172a' }}>{u.name}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="chat-list-empty">No teammates found</div>}
        </div>
      </div>
    </div>
  )
}

// ── Attach-a-CRM-record picker (E6) — Company or Deal ────────
function AttachRecordModal({ onClose, onPicked }) {
  const [type, setType] = useState('company')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [allDeals, setAllDeals] = useState(null)

  useEffect(() => {
    if (type === 'deal' && allDeals === null) {
      api.get('/deals').then(r => setAllDeals(Array.isArray(r.data) ? r.data : [])).catch(() => setAllDeals([]))
    }
  }, [type, allDeals])

  useEffect(() => {
    if (type === 'company') {
      const t = setTimeout(() => {
        api.get('/companies', { params: { search: query, limit: 8 } })
          .then(r => setResults((r.data?.companies || []).map(c => ({ id: c.id, label: c.name }))))
          .catch(() => setResults([]))
      }, 300)
      return () => clearTimeout(t)
    } else if (allDeals) {
      setResults(allDeals.filter(d => d.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8).map(d => ({ id: d.id, label: d.title })))
    }
  }, [type, query, allDeals])

  return (
    <div className="chat-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, width: 380, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #e2e8f0' }}>
          <span className="chat-modal-title" style={{ fontSize: 16.5, fontWeight: 700, color: '#0f172a' }}>Attach a Record</span>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={19} /></button>
        </div>
        <div style={{ display: 'flex', gap: 9, padding: '14px 22px 0' }}>
          <button onClick={() => setType('company')} style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: '1px solid #e2e8f0', background: type === 'company' ? '#eff6ff' : '#fff', color: type === 'company' ? '#1d4ed8' : '#64748b', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Company</button>
          <button onClick={() => setType('deal')} style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: '1px solid #e2e8f0', background: type === 'deal' ? '#eff6ff' : '#fff', color: type === 'deal' ? '#1d4ed8' : '#64748b', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Deal</button>
        </div>
        <div style={{ padding: '14px 22px 0' }}>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${type === 'company' ? 'companies' : 'deals'}…`}
            style={{ width: '100%', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: 14.5, boxSizing: 'border-box' }} />
        </div>
        <div style={{ padding: '12px 14px 18px', overflowY: 'auto', flex: 1 }}>
          {results.map(r => (
            <button key={r.id} onClick={() => onPicked({ type, id: r.id, label: r.label })} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '9px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 8, textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {type === 'company' ? <Building2 size={17} color="#64748b" /> : <Briefcase size={17} color="#64748b" />}
              <span style={{ fontSize: 14.5, color: '#0f172a' }}>{r.label}</span>
            </button>
          ))}
          {results.length === 0 && <div className="chat-list-empty">No matches</div>}
        </div>
      </div>
    </div>
  )
}

// ── Small icon-only action button for the per-message toolbar ───────────
function MsgAction({ title, onClick, color = '#94a3b8', children }) {
  return (
    <button title={title} onClick={onClick} className="chat-msg-action" style={{ color }}>
      {children}
    </button>
  )
}

// ── Sent/Delivered/Read tick (E6) — only meaningful on the sender's own messages
function ReceiptTicks({ status }) {
  if (!status) return null
  if (status === 'read') return <CheckCheck size={14} color="#1d4ed8" />
  if (status === 'delivered') return <CheckCheck size={14} color="#94a3b8" />
  return <Check size={14} color="#94a3b8" />
}

export default function Chat() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [users,             setUsers]             = useState([])
  const [conversations,     setConversations]     = useState([])
  const [selectedId,        setSelectedId]        = useState(null)
  const [messages,          setMessages]          = useState([])
  const [newMessage,        setNewMessage]        = useState('')
  const [sending,           setSending]           = useState(false)
  const [search,            setSearch]            = useState('')
  const [conversationFilter,setConversationFilter]= useState('all')
  const [onlineIds,         setOnlineIds]         = useState(() => new Set())
  const [typingByConv,      setTypingByConv]      = useState({}) // { conversationId: fromUserId }
  const [showCreateGroup,   setShowCreateGroup]   = useState(false)
  const [showNewChat,       setShowNewChat]       = useState(false)

  // E4 — rich messaging
  const [replyingTo,   setReplyingTo]   = useState(null) // message object
  const [editingId,    setEditingId]    = useState(null)
  const [editText,     setEditText]     = useState('')
  const [mentionedIds, setMentionedIds] = useState(() => new Set())
  const [mentionQuery, setMentionQuery] = useState(null) // { query, start }
  const [showPinned,    setShowPinned]  = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState([])

  // E5 — file sharing
  const [pendingAttachments, setPendingAttachments] = useState([])
  const [uploading, setUploading]   = useState(false)
  const [uploadError, setUploadError] = useState('')

  // E6 — CRM record attach + message search
  const [pendingRecord, setPendingRecord]   = useState(null) // {type, id, label}
  const [showAttachRecord, setShowAttachRecord] = useState(false)
  const [showSearch, setShowSearch]   = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])

  const messagesEndRef     = useRef(null)
  const lastCreatedAtRef   = useRef(null)
  const pollIntervalRef    = useRef(null)
  const convPollIntervalRef = useRef(null)
  const selectedIdRef      = useRef(null)
  const typingStopTimerRef = useRef(null)
  const isTypingRef        = useRef(false)
  const textareaRef        = useRef(null)
  const fileInputRef       = useRef(null)

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  const selectedConv = conversations.find(c => c.id === selectedId) || null

  // ── Load teammates (member pickers) ───────────────────────
  useEffect(() => {
    api.get('/chat/users').then(r => setUsers(r.data)).catch(() => {})
  }, [])

  // ── Load conversations, then refresh previews/unread on an interval ─────
  const loadConversations = () => {
    api.get('/chat/conversations').then(r => setConversations(r.data)).catch(() => {})
  }
  useEffect(() => {
    loadConversations()
    convPollIntervalRef.current = setInterval(loadConversations, 10000)
    return () => clearInterval(convPollIntervalRef.current)
  }, [])

  // ── Presence + typing + new-message push (Socket.io) ──────
  useEffect(() => {
    const socket = getSocket()
    if (!socket.connected) socket.connect()

    const onSnapshot = ({ onlineUserIds }) => setOnlineIds(new Set(onlineUserIds))
    const onOnline    = ({ userId }) => setOnlineIds(prev => new Set(prev).add(userId))
    const onOffline   = ({ userId }) => setOnlineIds(prev => { const n = new Set(prev); n.delete(userId); return n })
    const onTypingStart = ({ conversationId, fromUserId }) => setTypingByConv(prev => ({ ...prev, [conversationId]: fromUserId }))
    const onTypingStop  = ({ conversationId, fromUserId }) => setTypingByConv(prev => (prev[conversationId] === fromUserId ? { ...prev, [conversationId]: null } : prev))
    // Desktop/in-app notifications for chat live in NotificationContext.jsx
    // (mounted app-wide) — here we only need to refresh the sidebar preview
    // and, if the conversation is currently open, append the message live
    // instead of waiting for the 2s poll.
    const onNewMessage = ({ conversationId, message }) => {
      loadConversations()
      if (selectedIdRef.current === conversationId) {
        setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]))
        lastCreatedAtRef.current = message.createdAt
        markConversationRead(conversationId)
      }
    }

    socket.on('presence:snapshot', onSnapshot)
    socket.on('presence:online', onOnline)
    socket.on('presence:offline', onOffline)
    socket.on('typing:start', onTypingStart)
    socket.on('typing:stop', onTypingStop)
    socket.on('chat:new-message', onNewMessage)

    return () => {
      socket.off('presence:snapshot', onSnapshot)
      socket.off('presence:online', onOnline)
      socket.off('presence:offline', onOffline)
      socket.off('typing:start', onTypingStart)
      socket.off('typing:stop', onTypingStop)
      socket.off('chat:new-message', onNewMessage)
      stopTypingNow()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Scroll to bottom on new messages ─────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Polling: full history + new-message polling for the open conversation ──
  useEffect(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    lastCreatedAtRef.current = null
    setReplyingTo(null); setEditingId(null); setMentionedIds(new Set()); setShowPinned(false)
    setPendingAttachments([]); setPendingRecord(null); setUploadError('')

    if (!selectedId) { setMessages([]); return }

    loadFullConversation(selectedId)

    pollIntervalRef.current = setInterval(() => {
      if (selectedIdRef.current) pollNewMessages(selectedIdRef.current)
    }, 2000)

    return () => clearInterval(pollIntervalRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const markConversationRead = (conversationId) => {
    api.put(`/chat/conversations/${conversationId}/read`).catch(() => {})
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, unreadCount: 0 } : c))
  }

  const loadFullConversation = async (conversationId) => {
    try {
      const { data } = await api.get(`/chat/conversations/${conversationId}/messages`)
      setMessages(data)
      if (data.length > 0) lastCreatedAtRef.current = data[data.length - 1].createdAt
      markConversationRead(conversationId)
    } catch {}
  }

  const pollNewMessages = async (conversationId) => {
    try {
      const params = lastCreatedAtRef.current ? { after: lastCreatedAtRef.current } : {}
      const { data } = await api.get(`/chat/conversations/${conversationId}/messages`, { params })
      if (data.length > 0) {
        setMessages(prev => [...prev, ...data])
        lastCreatedAtRef.current = data[data.length - 1].createdAt
        markConversationRead(conversationId)
      }
    } catch {}
  }

  const loadPinned = (conversationId) => {
    api.get(`/chat/conversations/${conversationId}/pinned`).then(r => setPinnedMessages(r.data)).catch(() => {})
  }

  // ── Typing indicator (emit side) ──────────────────────────
  const handleTyping = () => {
    const convId = selectedIdRef.current
    if (!convId) return
    const socket = getSocket()
    if (!isTypingRef.current) {
      isTypingRef.current = true
      socket.emit('typing:start', { conversationId: convId })
    }
    clearTimeout(typingStopTimerRef.current)
    typingStopTimerRef.current = setTimeout(() => {
      isTypingRef.current = false
      socket.emit('typing:stop', { conversationId: convId })
    }, 2500)
  }

  const stopTypingNow = () => {
    const convId = selectedIdRef.current
    if (!convId || !isTypingRef.current) return
    clearTimeout(typingStopTimerRef.current)
    isTypingRef.current = false
    getSocket().emit('typing:stop', { conversationId: convId })
  }

  // ── @mention autocomplete ─────────────────────────────────
  const handleComposerChange = (e) => {
    const val = e.target.value
    setNewMessage(val)
    handleTyping()

    const cursor = e.target.selectionStart
    const before = val.slice(0, cursor)
    const match = before.match(/(?:^|\s)@([a-zA-Z]*)$/)
    if (match && selectedConv) {
      setMentionQuery({ query: match[1].toLowerCase(), start: cursor - match[1].length - 1 })
    } else {
      setMentionQuery(null)
    }
  }

  const mentionCandidates = mentionQuery && selectedConv
    ? selectedConv.members.filter(m => m.name.toLowerCase().includes(mentionQuery.query))
    : []

  const pickMention = (member) => {
    const { start } = mentionQuery
    const cursor = textareaRef.current?.selectionStart ?? newMessage.length
    const next = `${newMessage.slice(0, start)}@${member.name} ${newMessage.slice(cursor)}`
    setNewMessage(next)
    setMentionedIds(prev => new Set(prev).add(member.id))
    setMentionQuery(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  // ── File attach (E5) ──────────────────────────────────────
  const handleFileSelect = async (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = '' // allow re-selecting the same file later
    if (!files.length) return
    setUploading(true); setUploadError('')
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      try {
        const { data } = await api.post('/chat/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
        setPendingAttachments(prev => [...prev, data])
      } catch (err) {
        setUploadError(err?.response?.data?.message || `Failed to upload ${file.name}.`)
      }
    }
    setUploading(false)
  }

  const removePendingAttachment = (url) => setPendingAttachments(prev => prev.filter(a => a.url !== url))

  // ── Send / edit a message ─────────────────────────────────
  const sendMessage = async () => {
    const body = newMessage.trim()
    if ((!body && pendingAttachments.length === 0) || !selectedId || sending) return
    stopTypingNow()
    setSending(true)
    setNewMessage('')
    const replyToId = replyingTo?.id
    const mentionedUserIds = [...mentionedIds]
    const attachments = pendingAttachments
    const attachedRecord = pendingRecord
    setReplyingTo(null); setMentionedIds(new Set()); setPendingAttachments([]); setPendingRecord(null)
    try {
      const { data } = await api.post(`/chat/conversations/${selectedId}/messages`, { body, replyToId, mentionedUserIds, attachments, attachedRecord })
      setMessages(prev => [...prev, data])
      lastCreatedAtRef.current = data.createdAt
      setConversations(prev => prev.map(c => c.id === selectedId
        ? { ...c, lastMessageAt: data.createdAt, lastMessagePreview: data.body || (attachments.length ? `📎 ${attachments[0].filename}` : ''), lastMessageFromSelf: true }
        : c))
    } catch {
      setNewMessage(body)
      setPendingAttachments(attachments)
      setPendingRecord(attachedRecord)
    } finally {
      setSending(false)
    }
  }

  const saveEdit = async (messageId) => {
    const body = editText.trim()
    if (!body) return
    try {
      const { data } = await api.patch(`/chat/conversations/${selectedId}/messages/${messageId}`, { body })
      setMessages(prev => prev.map(m => m.id === messageId ? data : m))
      setEditingId(null)
    } catch {}
  }

  const deleteMessage = async (messageId) => {
    if (!window.confirm('Delete this message?')) return
    try {
      await api.delete(`/chat/conversations/${selectedId}/messages/${messageId}`)
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, deletedAt: new Date().toISOString(), body: 'This message was deleted' } : m))
    } catch {}
  }

  const togglePin = async (messageId) => {
    try {
      const { data } = await api.patch(`/chat/conversations/${selectedId}/messages/${messageId}/pin`)
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, pinnedAt: data.pinnedAt } : m))
      if (showPinned) loadPinned(selectedId)
    } catch {}
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !mentionQuery) { e.preventDefault(); sendMessage() }
    if (e.key === 'Escape' && mentionQuery) setMentionQuery(null)
  }

  const selectConversation = (id) => {
    stopTypingNow()
    setShowSearch(false)
    setSelectedId(id)
  }

  const startOneOnOne = async (userId) => {
    setShowNewChat(false)
    try {
      const { data } = await api.post('/chat/conversations', { userId })
      loadConversations()
      selectConversation(data.id)
    } catch {}
  }

  const onGroupCreated = (conversationId) => {
    setShowCreateGroup(false)
    loadConversations()
    selectConversation(conversationId)
  }

  const togglePinnedPanel = () => {
    if (!showPinned) loadPinned(selectedId)
    setShowPinned(v => !v)
  }

  // ── Message search (E6) ───────────────────────────────────
  useEffect(() => {
    if (!showSearch) return
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); return }
    const t = setTimeout(() => {
      api.get('/chat/search', { params: { q } }).then(r => setSearchResults(r.data)).catch(() => setSearchResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [searchQuery, showSearch])

  const openSearchResult = (result) => {
    setShowSearch(false); setSearchQuery('')
    selectConversation(result.conversationId)
  }

  const attachedRecordLink = (rec) => rec.type === 'company' ? `/companies/${rec.id}` : '/deals'

  const filteredConversations = conversations.filter(c => {
    const matchesSearch = conversationLabel(c).toLowerCase().includes(search.toLowerCase())
    const matchesFilter = conversationFilter === 'all'
      || (conversationFilter === 'unread' && c.unreadCount > 0)
      || (conversationFilter === 'direct' && !c.isGroup)
      || (conversationFilter === 'groups' && c.isGroup)
    return matchesSearch && matchesFilter
  })
  const directConversations = filteredConversations.filter(c => !c.isGroup)
  const groupConversations = filteredConversations.filter(c => c.isGroup)
  const unreadConversations = conversations.filter(c => c.unreadCount > 0).length

  const typingUserId = selectedId ? typingByConv[selectedId] : null
  const typingUserName = selectedConv?.members.find(m => m.id === typingUserId)?.name
  const renderConversationItem = (c) => {
    const other = !c.isGroup ? c.members[0] : null
    return (
      <button key={c.id} className={`chat-user-item ${selectedId === c.id ? 'active' : ''}${c.unreadCount > 0 ? ' unread' : ''}`} onClick={() => selectConversation(c.id)}>
        <div className="chat-avatar-wrap">
          <div className={`chat-user-avatar${c.isGroup ? ' group' : ''}`}>{c.isGroup ? <MaterialIcon>group</MaterialIcon> : initials(other?.name)}</div>
          {other && onlineIds.has(other.id) && <span className="chat-presence-dot" title="Online" />}
        </div>
        <div className="chat-user-info">
          <span className="chat-user-name">{conversationLabel(c)}</span>
          <span className="chat-user-email">{typingByConv[c.id] ? <em>typing…</em> : (c.lastMessagePreview ? `${c.lastMessageFromSelf ? 'You: ' : ''}${c.lastMessagePreview}` : 'No messages yet')}</span>
        </div>
        <div className="chat-conversation-meta">
          <time>{conversationTime(c.lastMessageAt)}</time>
          {c.unreadCount > 0 && <span className="chat-unread-badge">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>}
        </div>
      </button>
    )
  }

  return (
    <div className="chat-page">

      {/* ── Left: conversation list ── */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <div className="chat-sidebar-title-row"><div><h2>Team Chat</h2><p>{conversations.length} conversations · {onlineIds.size} online</p></div>
            <button onClick={() => setShowSearch(v => !v)} title="Search messages" className={`chat-icon-btn ${showSearch ? 'active' : ''}`}><MaterialIcon>manage_search</MaterialIcon></button>
          </div>
          <div className="chat-sidebar-actions">
            <button className="primary" onClick={() => setShowNewChat(true)}><MaterialIcon>add_comment</MaterialIcon> New conversation</button>
            <button onClick={() => setShowCreateGroup(true)}><MaterialIcon>group_add</MaterialIcon> Group</button>
          </div>
        </div>

        {showSearch ? (
          <>
            <div className="chat-search">
              <MaterialIcon>search</MaterialIcon>
              <input
                autoFocus type="text"
                placeholder="Search message content…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="chat-user-list">
              {searchResults.map(r => (
                <button key={r.id} onClick={() => openSearchResult(r)} className="chat-user-item">
                  <div className="chat-user-avatar">{initials(r.fromUser?.name)}</div>
                  <div className="chat-user-info">
                    <span className="chat-user-name">{r.conversationLabel}</span>
                    <span className="chat-user-email">{r.fromUser?.name}: {r.body}</span>
                  </div>
                </button>
              ))}
              {searchQuery.trim() && searchResults.length === 0 && (
                <div className="chat-list-empty">No messages found</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="chat-search">
              <MaterialIcon>search</MaterialIcon>
              <input
                type="text"
                placeholder="Search people and groups..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="chat-filter-chips" role="tablist" aria-label="Conversation filters">
              {[
                ['all', 'All', conversations.length], ['unread', 'Unread', unreadConversations],
                ['direct', 'Direct', conversations.filter(c => !c.isGroup).length], ['groups', 'Groups', conversations.filter(c => c.isGroup).length],
              ].map(([value, label, count]) => <button key={value} role="tab" aria-selected={conversationFilter === value} onClick={() => setConversationFilter(value)}>{label}{count > 0 && <span>{count}</span>}</button>)}
            </div>

            <div className="chat-user-list">
              {directConversations.length > 0 && <div className="chat-list-section"><span>Direct messages</span>{directConversations.map(renderConversationItem)}</div>}
              {groupConversations.length > 0 && <div className="chat-list-section"><span>Groups</span>{groupConversations.map(renderConversationItem)}</div>}
              {filteredConversations.length === 0 && (
                <div className="chat-list-empty"><MaterialIcon>chat_bubble</MaterialIcon><strong>{conversations.length ? 'No matching conversations' : 'No conversations yet'}</strong><p>{conversations.length ? 'Try a different search or filter.' : 'Start a direct chat or create a team group.'}</p></div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Right: conversation ── */}
      <div className="chat-main">
        {selectedConv ? (
          <>
            <div className="chat-main-header">
              <div className="chat-main-header-avatar" style={selectedConv.isGroup ? { background: 'linear-gradient(135deg,#7c3aed,#5b21b6)' } : undefined}>
                {selectedConv.isGroup ? <Users size={15} /> : initials(selectedConv.members[0]?.name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16.5, color: '#0f172a', letterSpacing: '-0.2px' }}>
                  {conversationLabel(selectedConv)}
                </div>
                <div style={{ fontSize: 13, color: typingUserId ? '#0d9488' : '#94a3b8', fontStyle: typingUserId ? 'italic' : 'normal', marginTop: 1 }}>
                  {typingUserId
                    ? `${typingUserName || 'Someone'} typing…`
                    : selectedConv.isGroup
                      ? `${selectedConv.members.length + 1} members`
                      : (onlineIds.has(selectedConv.members[0]?.id) ? 'Online' : selectedConv.members[0]?.email)}
                </div>
              </div>
              <button onClick={togglePinnedPanel} title="Pinned messages" className={`chat-icon-btn ${showPinned ? 'active' : ''}`}>
                <Pin size={17} />
              </button>
            </div>

            {showPinned && (
              <div style={{ borderBottom: '1px solid #e2e8f0', background: '#fffbeb', padding: '12px 24px', maxHeight: 160, overflowY: 'auto' }}>
                {pinnedMessages.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13.5, color: '#92400e' }}>No pinned messages in this conversation.</p>
                ) : pinnedMessages.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, padding: '7px 0', fontSize: 13.5 }}>
                    <span style={{ color: '#78350f' }}><strong>{m.fromUser?.name}:</strong> {m.body}</span>
                    <button onClick={() => togglePin(m.id)} title="Unpin" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', flexShrink: 0 }}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="chat-messages">
              {messages.length === 0 && (
                <div className="chat-messages-empty">
                  <MessageSquare size={36} color="#cbd5e1" />
                  <p>No messages yet. Say hello!</p>
                </div>
              )}

              {messages.map(msg => {
                const isOwn = msg.fromUserId === user?.id
                const isDeleted = !!msg.deletedAt
                const isEditing = editingId === msg.id
                return (
                  <div key={msg.id} className={`chat-message ${isOwn ? 'own' : 'other'}`}>
                    {!isOwn && (
                      <div className="chat-message-avatar">
                        {initials(msg.fromUser?.name || '')}
                      </div>
                    )}
                    <div className="chat-message-content">
                      {!isOwn && selectedConv.isGroup && (
                        <div className="chat-message-sender">{msg.fromUser?.name}</div>
                      )}

                      {msg.replyTo && (
                        <div className="chat-message-quote">
                          <strong>{msg.replyTo.fromUser?.name}</strong>: {msg.replyTo.body}
                        </div>
                      )}

                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(msg.id); if (e.key === 'Escape') setEditingId(null) }}
                            style={{ fontSize: 14.5, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 10, minWidth: 200 }}
                          />
                          <button onClick={() => saveEdit(msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', display: 'flex' }}><Check size={17} /></button>
                          <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={17} /></button>
                        </div>
                      ) : (
                        <>
                          {!isDeleted && msg.body && (
                            <div className="chat-message-bubble">{renderBody(msg.body, msg.mentions)}</div>
                          )}
                          {isDeleted && (
                            <div className="chat-message-bubble" style={{ fontStyle: 'italic', opacity: 0.7 }}>{msg.body}</div>
                          )}

                          {!isDeleted && msg.attachments?.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: msg.body ? 8 : 0 }}>
                              {msg.attachments.map((a, i) => a.mimeType?.startsWith('image/') ? (
                                <a key={i} href={a.url} target="_blank" rel="noreferrer">
                                  <img src={a.url} alt={a.filename} style={{ maxWidth: 240, maxHeight: 240, borderRadius: 10, display: 'block', border: '1px solid #e2e8f0' }} />
                                </a>
                              ) : (
                                <a key={i} href={a.url} target="_blank" rel="noreferrer" download={a.filename}
                                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, textDecoration: 'none', maxWidth: 240 }}>
                                  {(() => { const { Icon, color } = fileIconFor(a.mimeType); return <Icon size={20} color={color} /> })()}
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.filename}</div>
                                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{formatBytes(a.size)}</div>
                                  </div>
                                </a>
                              ))}
                            </div>
                          )}

                          {!isDeleted && msg.attachedRecord && (
                            <button onClick={() => navigate(attachedRecordLink(msg.attachedRecord))}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, marginTop: msg.body || msg.attachments?.length ? 8 : 0, cursor: 'pointer', maxWidth: 240 }}>
                              {msg.attachedRecord.type === 'company' ? <Building2 size={17} color="#1d4ed8" /> : <Briefcase size={17} color="#1d4ed8" />}
                              <span style={{ fontSize: 13.5, color: '#1d4ed8', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.attachedRecord.label}</span>
                            </button>
                          )}
                        </>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="chat-message-time" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          {msg.editedAt && !isDeleted && ' (edited)'}
                          {msg.pinnedAt && ' · 📌'}
                          {isOwn && !isDeleted && <ReceiptTicks status={msg.receiptStatus} />}
                        </div>
                        {!isDeleted && !isEditing && (
                          <div style={{ display: 'flex', gap: 1 }}>
                            <MsgAction title="Reply" onClick={() => { setReplyingTo(msg); textareaRef.current?.focus() }}><Reply size={13.5} /></MsgAction>
                            <MsgAction title={msg.pinnedAt ? 'Unpin' : 'Pin'} onClick={() => togglePin(msg.id)} color={msg.pinnedAt ? '#d97706' : '#94a3b8'}><Pin size={13.5} /></MsgAction>
                            {isOwn && (
                              <>
                                <MsgAction title="Edit" onClick={() => { setEditingId(msg.id); setEditText(msg.body) }}><Pencil size={13.5} /></MsgAction>
                                <MsgAction title="Delete" onClick={() => deleteMessage(msg.id)} color="#ef4444"><Trash2 size={13.5} /></MsgAction>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              <div ref={messagesEndRef} />
            </div>

            {replyingTo && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', background: '#eff6ff', borderTop: '1px solid #e2e8f0', fontSize: 13.5 }}>
                <span style={{ color: '#1d4ed8' }}><strong>Replying to {replyingTo.fromUser?.name}:</strong> {replyingTo.body?.slice(0, 80)}</span>
                <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}><X size={15} /></button>
              </div>
            )}

            {(pendingAttachments.length > 0 || pendingRecord || uploadError) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                {pendingAttachments.map(a => (
                  <span key={a.url} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 10px' }}>
                    {a.mimeType?.startsWith('image/') ? <ImageIcon size={13} /> : <FileIcon size={13} />}
                    {a.filename}
                    <button onClick={() => removePendingAttachment(a.url)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={12} /></button>
                  </span>
                ))}
                {pendingRecord && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 7, padding: '5px 10px', color: '#1d4ed8' }}>
                    {pendingRecord.type === 'company' ? <Building2 size={13} /> : <Briefcase size={13} />}
                    {pendingRecord.label}
                    <button onClick={() => setPendingRecord(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', display: 'flex' }}><X size={12} /></button>
                  </span>
                )}
                {uploadError && <span style={{ fontSize: 12.5, color: '#ef4444' }}>{uploadError}</span>}
              </div>
            )}

            <div className="chat-input-area" style={{ position: 'relative' }}>
              {mentionQuery && mentionCandidates.length > 0 && (
                <div style={{ position: 'absolute', bottom: '100%', left: 20, marginBottom: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.14)', overflow: 'hidden', minWidth: 200, zIndex: 10 }}>
                  {mentionCandidates.map(m => (
                    <button key={m.id} onClick={() => pickMention(m)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div className="chat-user-avatar" style={{ width: 26, height: 26, fontSize: 11.5 }}>{initials(m.name)}</div>
                      <span style={{ fontSize: 14.5 }}>{m.name}</span>
                    </button>
                  ))}
                </div>
              )}
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
              <button title="Attach file" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="chat-icon-btn" style={{ marginBottom: 2 }}>
                <Paperclip size={19} />
              </button>
              <button title="Attach Company/Deal" onClick={() => setShowAttachRecord(true)} className="chat-icon-btn" style={{ marginBottom: 2 }}>
                <Building2 size={19} />
              </button>
              <textarea
                ref={textareaRef}
                className="chat-input"
                placeholder={`Message ${conversationLabel(selectedConv)}… (@ to mention)`}
                value={newMessage}
                onChange={handleComposerChange}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                className="chat-send-btn"
                onClick={sendMessage}
                disabled={(!newMessage.trim() && pendingAttachments.length === 0) || sending}
                title="Send (Enter)"
              >
                <Send size={15} />
              </button>
            </div>
          </>
        ) : (
          <div className="chat-no-conversation">
            <span className="chat-welcome-icon"><MaterialIcon>forum</MaterialIcon></span>
            <h3>Welcome to Team Chat</h3>
            <p>Start a conversation with teammates, create groups, and collaborate in real time.</p>
            <div className="chat-welcome-actions"><button className="primary" onClick={() => setShowNewChat(true)}><MaterialIcon>add_comment</MaterialIcon> New conversation</button><button onClick={() => setShowCreateGroup(true)}><MaterialIcon>group_add</MaterialIcon> Create group</button></div>
            {users.length > 0 && <div className="chat-teammate-suggestions"><span>Start with a teammate</span><div>{users.slice(0, 3).map(u => <button key={u.id} onClick={() => startOneOnOne(u.id)}><span className="chat-user-avatar">{initials(u.name)}</span><strong>{u.name}</strong><small>{onlineIds.has(u.id) ? 'Online' : 'Teammate'}</small></button>)}</div></div>}
          </div>
        )}
      </div>

      {showCreateGroup && (
        <CreateGroupModal users={users} onClose={() => setShowCreateGroup(false)} onCreated={onGroupCreated} />
      )}
      {showNewChat && (
        <NewChatModal users={users} onClose={() => setShowNewChat(false)} onPicked={startOneOnOne} />
      )}
      {showAttachRecord && (
        <AttachRecordModal onClose={() => setShowAttachRecord(false)} onPicked={(rec) => { setPendingRecord(rec); setShowAttachRecord(false) }} />
      )}
    </div>
  )
}
