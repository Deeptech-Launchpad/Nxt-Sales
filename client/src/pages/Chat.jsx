import { useState, useEffect, useRef } from 'react'
import { Send, MessageSquare, Search } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import '../styles/chat.css'

function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function Chat() {
  const { user } = useAuth()
  const [users,        setUsers]        = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [messages,     setMessages]     = useState([])
  const [newMessage,   setNewMessage]   = useState('')
  const [sending,      setSending]      = useState(false)
  const [search,       setSearch]       = useState('')
  const [unreadMap,    setUnreadMap]    = useState({}) // { userId: count }

  const messagesEndRef     = useRef(null)
  const lastCreatedAtRef   = useRef(null)
  const pollIntervalRef    = useRef(null)
  const selectedUserRef    = useRef(null)

  // keep ref in sync so poll callback always has the latest selected user
  useEffect(() => { selectedUserRef.current = selectedUser }, [selectedUser])

  // ── Load users list ───────────────────────────────────────
  useEffect(() => {
    api.get('/chat/users').then(r => setUsers(r.data)).catch(() => {})
  }, [])

  // ── Scroll to bottom on new messages ─────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Polling: start when a conversation is opened ─────────
  useEffect(() => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    lastCreatedAtRef.current = null

    if (!selectedUser) return

    loadFullConversation(selectedUser.id)

    pollIntervalRef.current = setInterval(() => {
      if (selectedUserRef.current) pollNewMessages(selectedUserRef.current.id)
    }, 2000)

    return () => clearInterval(pollIntervalRef.current)
  }, [selectedUser])

  // ── Fetch entire conversation ─────────────────────────────
  const loadFullConversation = async (userId) => {
    try {
      const { data } = await api.get(`/chat/messages/${userId}`)
      setMessages(data)
      if (data.length > 0) lastCreatedAtRef.current = data[data.length - 1].createdAt
      api.put(`/chat/read/${userId}`).catch(() => {})
      setUnreadMap(prev => ({ ...prev, [userId]: 0 }))
    } catch {}
  }

  // ── Poll for new messages only ────────────────────────────
  const pollNewMessages = async (userId) => {
    try {
      const params = lastCreatedAtRef.current ? { after: lastCreatedAtRef.current } : {}
      const { data } = await api.get(`/chat/messages/${userId}`, { params })
      if (data.length > 0) {
        setMessages(prev => [...prev, ...data])
        lastCreatedAtRef.current = data[data.length - 1].createdAt
        api.put(`/chat/read/${userId}`).catch(() => {})
      }
    } catch {}
  }

  // ── Send a message ────────────────────────────────────────
  const sendMessage = async () => {
    const body = newMessage.trim()
    if (!body || !selectedUser || sending) return
    setSending(true)
    setNewMessage('')
    try {
      const { data } = await api.post('/chat/messages', { toUserId: selectedUser.id, body })
      setMessages(prev => [...prev, data])
      lastCreatedAtRef.current = data.createdAt
    } catch {
      setNewMessage(body)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const selectUser = (u) => {
    setSelectedUser(u)
    setMessages([])
  }

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="chat-page">

      {/* ── Left: user list ── */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <h2>Team Chat</h2>
        </div>

        <div className="chat-search">
          <Search size={14} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search teammates…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="chat-user-list">
          {filteredUsers.map(u => (
            <button
              key={u.id}
              className={`chat-user-item ${selectedUser?.id === u.id ? 'active' : ''}`}
              onClick={() => selectUser(u)}
            >
              <div className="chat-user-avatar">{initials(u.name)}</div>
              <div className="chat-user-info">
                <span className="chat-user-name">{u.name}</span>
                <span className="chat-user-email">{u.email}</span>
              </div>
              {(unreadMap[u.id] || 0) > 0 && (
                <span className="chat-unread-badge">
                  {unreadMap[u.id] > 99 ? '99+' : unreadMap[u.id]}
                </span>
              )}
            </button>
          ))}
          {filteredUsers.length === 0 && (
            <div className="chat-list-empty">No teammates found</div>
          )}
        </div>
      </div>

      {/* ── Right: conversation ── */}
      <div className="chat-main">
        {selectedUser ? (
          <>
            <div className="chat-main-header">
              <div className="chat-main-header-avatar">{initials(selectedUser.name)}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>
                  {selectedUser.name}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>{selectedUser.email}</div>
              </div>
            </div>

            <div className="chat-messages">
              {messages.length === 0 && (
                <div className="chat-messages-empty">
                  <MessageSquare size={36} color="#cbd5e1" />
                  <p>No messages yet. Say hello!</p>
                </div>
              )}

              {messages.map(msg => {
                const isOwn = msg.fromUserId === user?.id
                return (
                  <div key={msg.id} className={`chat-message ${isOwn ? 'own' : 'other'}`}>
                    {!isOwn && (
                      <div className="chat-message-avatar">
                        {initials(msg.fromUser?.name || '')}
                      </div>
                    )}
                    <div className="chat-message-content">
                      {!isOwn && (
                        <div className="chat-message-sender">{msg.fromUser?.name}</div>
                      )}
                      <div className="chat-message-bubble">{msg.body}</div>
                      <div className="chat-message-time">
                        {new Date(msg.createdAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}

              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-area">
              <textarea
                className="chat-input"
                placeholder={`Message ${selectedUser.name}…`}
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
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
            <h3>Select a teammate to start chatting</h3>
            <p>Send direct messages to your team members</p>
          </div>
        )}
      </div>

    </div>
  )
}
