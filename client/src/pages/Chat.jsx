import { useState, useEffect, useRef } from 'react'
import { Send, MessageSquare, Search, Users, Plus, X, Reply, Pencil, Trash2, Pin, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { getSocket } from '../socket'
import '../styles/chat.css'

function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
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
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 420, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Create Group</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>Group Name</label>
          <input
            autoFocus value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Sales Team"
            style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', marginBottom: 16 }}
          />
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
            Members ({selected.size} selected)
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 260, overflowY: 'auto' }}>
            {users.map(u => (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
                <div className="chat-user-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{initials(u.name)}</div>
                <span style={{ fontSize: 13, color: '#0f172a' }}>{u.name}</span>
              </label>
            ))}
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 12 }}>{error}</p>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid #e2e8f0' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#64748b' }}>Cancel</button>
          <button onClick={create} disabled={saving} style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
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
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 360, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>New Chat</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '12px 20px 0' }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teammates…"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ padding: '10px 12px 16px', overflowY: 'auto', flex: 1 }}>
          {filtered.map(u => (
            <button key={u.id} onClick={() => onPicked(u.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px', border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, textAlign: 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div className="chat-user-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{initials(u.name)}</div>
              <span style={{ fontSize: 13, color: '#0f172a' }}>{u.name}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="chat-list-empty">No teammates found</div>}
        </div>
      </div>
    </div>
  )
}

// ── Small icon-only action button for the per-message toolbar ───────────
function MsgAction({ title, onClick, color = '#94a3b8', children }) {
  return (
    <button title={title} onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color, padding: 3, display: 'flex' }}>
      {children}
    </button>
  )
}

export default function Chat() {
  const { user } = useAuth()
  const [users,             setUsers]             = useState([])
  const [conversations,     setConversations]     = useState([])
  const [selectedId,        setSelectedId]        = useState(null)
  const [messages,          setMessages]          = useState([])
  const [newMessage,        setNewMessage]        = useState('')
  const [sending,           setSending]           = useState(false)
  const [search,            setSearch]            = useState('')
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

  const messagesEndRef     = useRef(null)
  const lastCreatedAtRef   = useRef(null)
  const pollIntervalRef    = useRef(null)
  const convPollIntervalRef = useRef(null)
  const selectedIdRef      = useRef(null)
  const typingStopTimerRef = useRef(null)
  const isTypingRef        = useRef(false)
  const textareaRef        = useRef(null)

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

  // ── Presence + typing (Socket.io) ─────────────────────────
  useEffect(() => {
    const socket = getSocket()
    if (!socket.connected) socket.connect()

    const onSnapshot = ({ onlineUserIds }) => setOnlineIds(new Set(onlineUserIds))
    const onOnline    = ({ userId }) => setOnlineIds(prev => new Set(prev).add(userId))
    const onOffline   = ({ userId }) => setOnlineIds(prev => { const n = new Set(prev); n.delete(userId); return n })
    const onTypingStart = ({ conversationId, fromUserId }) => setTypingByConv(prev => ({ ...prev, [conversationId]: fromUserId }))
    const onTypingStop  = ({ conversationId, fromUserId }) => setTypingByConv(prev => (prev[conversationId] === fromUserId ? { ...prev, [conversationId]: null } : prev))

    socket.on('presence:snapshot', onSnapshot)
    socket.on('presence:online', onOnline)
    socket.on('presence:offline', onOffline)
    socket.on('typing:start', onTypingStart)
    socket.on('typing:stop', onTypingStop)

    return () => {
      socket.off('presence:snapshot', onSnapshot)
      socket.off('presence:online', onOnline)
      socket.off('presence:offline', onOffline)
      socket.off('typing:start', onTypingStart)
      socket.off('typing:stop', onTypingStop)
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

  // ── Send / edit a message ─────────────────────────────────
  const sendMessage = async () => {
    const body = newMessage.trim()
    if (!body || !selectedId || sending) return
    stopTypingNow()
    setSending(true)
    setNewMessage('')
    const replyToId = replyingTo?.id
    const mentionedUserIds = [...mentionedIds]
    setReplyingTo(null); setMentionedIds(new Set())
    try {
      const { data } = await api.post(`/chat/conversations/${selectedId}/messages`, { body, replyToId, mentionedUserIds })
      setMessages(prev => [...prev, data])
      lastCreatedAtRef.current = data.createdAt
      setConversations(prev => prev.map(c => c.id === selectedId
        ? { ...c, lastMessageAt: data.createdAt, lastMessagePreview: data.body, lastMessageFromSelf: true }
        : c))
    } catch {
      setNewMessage(body)
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

  const filteredConversations = conversations.filter(c =>
    conversationLabel(c).toLowerCase().includes(search.toLowerCase())
  )

  const typingUserId = selectedId ? typingByConv[selectedId] : null
  const typingUserName = selectedConv?.members.find(m => m.id === typingUserId)?.name

  return (
    <div className="chat-page">

      {/* ── Left: conversation list ── */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2>Team Chat</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setShowNewChat(true)} title="New chat" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: 4 }}>
              <Plus size={16} />
            </button>
            <button onClick={() => setShowCreateGroup(true)} title="Create group" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: 4 }}>
              <Users size={16} />
            </button>
          </div>
        </div>

        <div className="chat-search">
          <Search size={14} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search conversations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="chat-user-list">
          {filteredConversations.map(c => {
            const other = !c.isGroup ? c.members[0] : null
            return (
              <button
                key={c.id}
                className={`chat-user-item ${selectedId === c.id ? 'active' : ''}`}
                onClick={() => selectConversation(c.id)}
              >
                <div style={{ position: 'relative' }}>
                  <div className="chat-user-avatar" style={c.isGroup ? { background: 'linear-gradient(135deg,#7c3aed,#5b21b6)' } : undefined}>
                    {c.isGroup ? <Users size={16} /> : initials(other?.name)}
                  </div>
                  {other && onlineIds.has(other.id) && (
                    <span title="Online" style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: '#22c55e', border: '2px solid #f8fafc' }} />
                  )}
                </div>
                <div className="chat-user-info">
                  <span className="chat-user-name">{conversationLabel(c)}</span>
                  <span className="chat-user-email">
                    {typingByConv[c.id]
                      ? <em style={{ color: '#0d9488', fontStyle: 'italic' }}>typing…</em>
                      : (c.lastMessagePreview
                          ? `${c.lastMessageFromSelf ? 'You: ' : ''}${c.lastMessagePreview}`
                          : 'No messages yet')}
                  </span>
                </div>
                {c.unreadCount > 0 && (
                  <span className="chat-unread-badge">
                    {c.unreadCount > 99 ? '99+' : c.unreadCount}
                  </span>
                )}
              </button>
            )
          })}
          {filteredConversations.length === 0 && (
            <div className="chat-list-empty">No conversations yet — start one with + or create a group.</div>
          )}
        </div>
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
                <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>
                  {conversationLabel(selectedConv)}
                </div>
                <div style={{ fontSize: 12, color: typingUserId ? '#0d9488' : '#94a3b8', fontStyle: typingUserId ? 'italic' : 'normal' }}>
                  {typingUserId
                    ? `${typingUserName || 'Someone'} typing…`
                    : selectedConv.isGroup
                      ? `${selectedConv.members.length + 1} members`
                      : (onlineIds.has(selectedConv.members[0]?.id) ? 'Online' : selectedConv.members[0]?.email)}
                </div>
              </div>
              <button onClick={togglePinnedPanel} title="Pinned messages" style={{ background: showPinned ? '#eff6ff' : 'none', border: 'none', cursor: 'pointer', color: showPinned ? '#1d4ed8' : '#94a3b8', padding: 6, borderRadius: 6, display: 'flex' }}>
                <Pin size={16} />
              </button>
            </div>

            {showPinned && (
              <div style={{ borderBottom: '1px solid #e2e8f0', background: '#fffbeb', padding: '10px 20px', maxHeight: 140, overflowY: 'auto' }}>
                {pinnedMessages.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12.5, color: '#92400e' }}>No pinned messages in this conversation.</p>
                ) : pinnedMessages.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, padding: '5px 0', fontSize: 12.5 }}>
                    <span style={{ color: '#78350f' }}><strong>{m.fromUser?.name}:</strong> {m.body}</span>
                    <button onClick={() => togglePin(m.id)} title="Unpin" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', flexShrink: 0 }}><X size={13} /></button>
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
                        <div style={{ fontSize: 11.5, color: '#64748b', background: '#f1f5f9', borderLeft: '3px solid #cbd5e1', borderRadius: 6, padding: '4px 8px', marginBottom: 2, maxWidth: 260 }}>
                          <strong>{msg.replyTo.fromUser?.name}</strong>: {msg.replyTo.body}
                        </div>
                      )}

                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(msg.id); if (e.key === 'Escape') setEditingId(null) }}
                            style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 8, minWidth: 180 }}
                          />
                          <button onClick={() => saveEdit(msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}><Check size={15} /></button>
                          <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={15} /></button>
                        </div>
                      ) : (
                        <div className="chat-message-bubble" style={isDeleted ? { fontStyle: 'italic', opacity: 0.7 } : undefined}>
                          {isDeleted ? msg.body : renderBody(msg.body, msg.mentions)}
                        </div>
                      )}

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="chat-message-time">
                          {new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          {msg.editedAt && !isDeleted && ' (edited)'}
                          {msg.pinnedAt && ' · 📌'}
                        </div>
                        {!isDeleted && !isEditing && (
                          <div style={{ display: 'flex', gap: 2 }}>
                            <MsgAction title="Reply" onClick={() => { setReplyingTo(msg); textareaRef.current?.focus() }}><Reply size={12} /></MsgAction>
                            <MsgAction title={msg.pinnedAt ? 'Unpin' : 'Pin'} onClick={() => togglePin(msg.id)} color={msg.pinnedAt ? '#d97706' : '#94a3b8'}><Pin size={12} /></MsgAction>
                            {isOwn && (
                              <>
                                <MsgAction title="Edit" onClick={() => { setEditingId(msg.id); setEditText(msg.body) }}><Pencil size={12} /></MsgAction>
                                <MsgAction title="Delete" onClick={() => deleteMessage(msg.id)} color="#ef4444"><Trash2 size={12} /></MsgAction>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: '#eff6ff', borderTop: '1px solid #e2e8f0', fontSize: 12.5 }}>
                <span style={{ color: '#1d4ed8' }}><strong>Replying to {replyingTo.fromUser?.name}:</strong> {replyingTo.body?.slice(0, 80)}</span>
                <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={14} /></button>
              </div>
            )}

            <div className="chat-input-area" style={{ position: 'relative' }}>
              {mentionQuery && mentionCandidates.length > 0 && (
                <div style={{ position: 'absolute', bottom: '100%', left: 16, marginBottom: 6, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.14)', overflow: 'hidden', minWidth: 180, zIndex: 10 }}>
                  {mentionCandidates.map(m => (
                    <button key={m.id} onClick={() => pickMention(m)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div className="chat-user-avatar" style={{ width: 22, height: 22, fontSize: 10 }}>{initials(m.name)}</div>
                      <span style={{ fontSize: 13 }}>{m.name}</span>
                    </button>
                  ))}
                </div>
              )}
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
                disabled={!newMessage.trim() || sending}
                title="Send (Enter)"
              >
                <Send size={15} />
              </button>
            </div>
          </>
        ) : (
          <div className="chat-no-conversation">
            <MessageSquare size={48} color="#cbd5e1" />
            <h3>Select a conversation to start chatting</h3>
            <p>Or start a new one with the + button, or create a group</p>
          </div>
        )}
      </div>

      {showCreateGroup && (
        <CreateGroupModal users={users} onClose={() => setShowCreateGroup(false)} onCreated={onGroupCreated} />
      )}
      {showNewChat && (
        <NewChatModal users={users} onClose={() => setShowNewChat(false)} onPicked={startOneOnOne} />
      )}
    </div>
  )
}
