import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { UserPlus, UserCheck, UserX, Clock, Copy, ChevronDown, RefreshCw } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'member',      label: 'Member' },
  { value: 'admin',       label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
]

const ROLE_STYLE = {
  super_admin: { background: '#fef3c7', color: '#92400e' },
  admin:       { background: '#ede9fe', color: '#5b21b6' },
  member:      { background: '#f0fdf4', color: '#166534' },
}

const ROLE_LABEL = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  member:      'Member',
}

// ── Row actions dropdown ─────────────────────────────────────────────────
function ActionsMenu({ user, activeTab, onStatusChange, onDelete, onResend }) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState(null)
  const [copied, setCopied] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const handleResend = async () => {
    setOpen(false)
    try {
      const { data } = await api.post(`/users/${user.id}/resend-invite`)
      setLink(data.inviteLink)
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to resend invite.')
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const btnStyle = {
    display: 'block', width: '100%', padding: '9px 14px',
    border: 'none', background: 'transparent', textAlign: 'left',
    fontSize: 13, color: '#334155', cursor: 'pointer',
    fontFamily: 'DM Sans, system-ui, sans-serif',
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      {link && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#475569', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {link}
          </span>
          <button onClick={copyLink} style={{ background: '#e11d48', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Copy size={10} /> {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: '#374151' }}
      >
        Actions <ChevronDown size={12} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 200, minWidth: 160, overflow: 'hidden' }}>
          {activeTab === 'active' && (
            <button style={btnStyle}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={() => { onStatusChange(user.id, 'deactivated'); setOpen(false) }}>
              Deactivate
            </button>
          )}
          {activeTab === 'deactivated' && (
            <button style={btnStyle}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={() => { onStatusChange(user.id, 'active'); setOpen(false) }}>
              Reactivate
            </button>
          )}
          {activeTab === 'pending' && (
            <button style={btnStyle}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              onClick={handleResend}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={13} /> Resend Invite</span>
            </button>
          )}
          <div style={{ height: 1, background: '#f1f5f9', margin: '2px 0' }} />
          <button
            style={{ ...btnStyle, color: '#ef4444' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            onClick={() => { onDelete(user.id); setOpen(false) }}>
            Delete User
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────
export default function UserManagement() {
  const { user: me } = useAuth()
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [activeTab, setActiveTab] = useState('active')

  // Create user modal
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating]     = useState(false)
  const [newName, setNewName]       = useState('')
  const [newEmail, setNewEmail]     = useState('')
  const [newRole, setNewRole]       = useState('member')
  const [inviteLink, setInviteLink] = useState(null)
  const [modalCopied, setModalCopied] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/users/manage')
      setUsers(data)
    } catch {
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const tabs = [
    { key: 'active',      label: 'Active Users',      Icon: UserCheck, count: users.filter(u => u.status === 'active').length },
    { key: 'pending',     label: 'Pending Invites',   Icon: Clock,     count: users.filter(u => u.status === 'pending').length },
    { key: 'deactivated', label: 'Deactivated Users', Icon: UserX,     count: users.filter(u => u.status === 'deactivated').length },
  ]

  const filtered = users
    .filter(u => u.status === activeTab)
    .filter(u => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    })

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newName.trim() || !newEmail.trim()) return
    setCreating(true)
    try {
      const { data } = await api.post('/users/invite', {
        name: newName.trim(), email: newEmail.trim(), role: newRole,
      })
      setInviteLink(data.inviteLink)
      fetchUsers()
      setNewName(''); setNewEmail(''); setNewRole('member')
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create user.')
    } finally {
      setCreating(false)
    }
  }

  const handleStatusChange = async (userId, status) => {
    try {
      await api.patch(`/users/${userId}/status`, { status })
      fetchUsers()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status.')
    }
  }

  const handleDelete = async (userId) => {
    if (!window.confirm('Delete this user? This action cannot be undone.')) return
    try {
      await api.delete(`/users/${userId}`)
      fetchUsers()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete user.')
    }
  }

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink).catch(() => {})
    setModalCopied(true)
    setTimeout(() => setModalCopied(false), 2000)
  }

  const closeModal = () => {
    setShowCreate(false)
    setInviteLink(null)
    setNewName(''); setNewEmail(''); setNewRole('member')
  }

  const inputStyle = {
    width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 8,
    padding: '9px 12px', fontSize: 13, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'DM Sans, system-ui, sans-serif',
    color: '#0f172a',
  }

  return (
    <div style={{ fontFamily: 'DM Sans, system-ui, sans-serif', minHeight: '100%', background: '#f8fafc' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>User Management</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Create new users, customize user permissions, and manage your account.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#e11d48', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
        >
          <UserPlus size={15} /> Create user
        </button>
      </div>

      {/* Tabs */}
      <div style={{ background: '#fff', display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', paddingLeft: 24 }}>
        {tabs.map(({ key, label, Icon, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px',
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
              fontWeight: activeTab === key ? 600 : 400,
              color: activeTab === key ? '#0f172a' : '#64748b',
              borderBottom: activeTab === key ? '2px solid #e11d48' : '2px solid transparent',
              marginBottom: -1, transition: 'all .15s',
            }}
          >
            <span style={{
              background: activeTab === key ? '#fef2f2' : '#f1f5f9',
              color: activeTab === key ? '#e11d48' : '#64748b',
              fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
            }}>
              {count}
            </span>
            {label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ background: '#fff', padding: '10px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', width: 280 }}>
          <svg width="14" height="14" fill="none" stroke="#94a3b8" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            placeholder="Search name or email address"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: '#0f172a', width: '100%', fontFamily: 'DM Sans, system-ui, sans-serif' }}
          />
        </div>
      </div>

      {/* Table */}
      <div style={{ padding: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Name', 'Email', 'Role', 'Created', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8', fontSize: 13 }}>Loading users…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8', fontSize: 13 }}>No {activeTab} users found.</td></tr>
              ) : filtered.map(u => {
                const isMe = u.id === me?.id
                const initials = u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                const roleStyle = ROLE_STYLE[u.role] || ROLE_STYLE.member
                const roleLabel = ROLE_LABEL[u.role] || u.role

                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#e63329,#c0271e)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {initials}
                        </div>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>
                          {u.name}
                          {isMe && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 5 }}>(You)</span>}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{u.email}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ ...roleStyle, fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 10 }}>
                        {roleLabel}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {isMe
                        ? <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                        : <ActionsMenu
                            user={u}
                            activeTab={activeTab}
                            onStatusChange={handleStatusChange}
                            onDelete={handleDelete}
                          />
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,.2)', fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                {inviteLink ? 'Invite Link Generated' : 'Create New User'}
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#94a3b8', lineHeight: 1 }}>×</button>
            </div>

            {inviteLink ? (
              <>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                  <p style={{ margin: '0 0 4px', color: '#166534', fontSize: 13, fontWeight: 600 }}>✓ User created successfully!</p>
                  <p style={{ margin: 0, color: '#15803d', fontSize: 12 }}>Share this invite link. It expires in 7 days.</p>
                </div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 12, color: '#475569', flex: 1, wordBreak: 'break-all' }}>{inviteLink}</span>
                  <button onClick={copyInviteLink} style={{ background: '#e11d48', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Copy size={12} /> {modalCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <button onClick={closeModal} style={{ width: '100%', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, padding: 11, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Done
                </button>
              </>
            ) : (
              <form onSubmit={handleCreate}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Full Name *</label>
                  <input required type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. John Smith" style={inputStyle} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Email Address *</label>
                  <input required type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@company.com" style={inputStyle} />
                </div>
                <div style={{ marginBottom: 22 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Role</label>
                  <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ ...inputStyle, background: '#fff', cursor: 'pointer' }}>
                    {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={closeModal} style={{ flex: 1, background: '#f1f5f9', color: '#374151', border: 'none', borderRadius: 8, padding: 11, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={creating} style={{ flex: 1, background: '#e11d48', color: '#fff', border: 'none', borderRadius: 8, padding: 11, fontSize: 13, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}>
                    {creating ? 'Creating…' : 'Create & Get Invite Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
