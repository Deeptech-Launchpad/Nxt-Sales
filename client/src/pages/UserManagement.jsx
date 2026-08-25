import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import {
  UserPlus, UserCheck, UserX, Clock, Copy, ChevronDown, RefreshCw, Search,
  Users, ShieldCheck, MoreHorizontal, Trash2,
  X, Mail, Check, Loader2,
} from 'lucide-react'
import '../styles/user-management.css'

const ROLE_OPTIONS = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
]

const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Admin', member: 'Member' }

function ActionsMenu({ user, activeTab, onStatusChange, onDelete, onResend }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = event => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const run = action => { setOpen(false); action() }
  return (
    <div className="um-actions" ref={ref}>
      <button className="um-more" aria-label={`Actions for ${user.name}`} onClick={() => setOpen(value => !value)}><MoreHorizontal size={17} /></button>
      {open && (
        <div className="um-menu">
          {activeTab === 'active' && <button onClick={() => run(() => onStatusChange(user.id, 'deactivated'))}><UserX size={14} />Deactivate access</button>}
          {activeTab === 'deactivated' && <button onClick={() => run(() => onStatusChange(user.id, 'active'))}><UserCheck size={14} />Reactivate user</button>}
          {activeTab === 'pending' && <button onClick={() => run(() => onResend(user))}><RefreshCw size={14} />Generate new invite</button>}
          <div />
          <button className="danger" onClick={() => run(() => onDelete(user.id))}><Trash2 size={14} />Delete user</button>
        </div>
      )}
    </div>
  )
}

export default function UserManagement() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('active')
  const [toast, setToast] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('member')
  const [inviteLink, setInviteLink] = useState(null)
  const [copied, setCopied] = useState(false)

  const notify = (text, type = 'success') => {
    setToast({ text, type })
    window.setTimeout(() => setToast(null), 3200)
  }

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try { setUsers((await api.get('/users/manage')).data) }
    catch { setUsers([]); notify('Could not load team members.', 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const counts = useMemo(() => ({
    active: users.filter(user => user.status === 'active').length,
    pending: users.filter(user => user.status === 'pending').length,
    deactivated: users.filter(user => user.status === 'deactivated').length,
    admins: users.filter(user => user.status === 'active' && ['admin', 'super_admin'].includes(user.role)).length,
  }), [users])

  const tabs = [
    { key: 'active', label: 'Active users', Icon: UserCheck, count: counts.active },
    { key: 'pending', label: 'Pending invites', Icon: Clock, count: counts.pending },
    { key: 'deactivated', label: 'Deactivated', Icon: UserX, count: counts.deactivated },
  ]

  const filtered = users.filter(user => user.status === activeTab).filter(user => {
    const query = search.trim().toLowerCase()
    return !query || user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
  })

  const handleCreate = async event => {
    event.preventDefault()
    setCreating(true)
    try {
      const { data } = await api.post('/users/invite', { name: newName.trim(), email: newEmail.trim(), role: newRole })
      setInviteLink(data.inviteLink)
      await fetchUsers()
    } catch (error) { notify(error.response?.data?.message || 'Could not create user.', 'error') }
    finally { setCreating(false) }
  }

  const handleStatusChange = async (id, status) => {
    try { await api.patch(`/users/${id}/status`, { status }); await fetchUsers(); notify(status === 'active' ? 'User access restored.' : 'User access deactivated.') }
    catch (error) { notify(error.response?.data?.message || 'Could not update user access.', 'error') }
  }

  const handleRoleChange = async (id, role) => {
    try {
      const updated = (await api.patch(`/users/${id}/role`, { role })).data
      setUsers(current => current.map(user => user.id === id ? { ...user, ...updated } : user))
      notify('User role updated.')
    } catch (error) { notify(error.response?.data?.message || 'Could not update role.', 'error') }
  }

  const handleDelete = async id => {
    if (!window.confirm('Delete this user permanently? Historical records may prevent deletion; deactivation is safer.')) return
    try { await api.delete(`/users/${id}`); await fetchUsers(); notify('User deleted.') }
    catch (error) { notify(error.response?.data?.message || 'Could not delete user.', 'error') }
  }

  const handleResend = async user => {
    try { setInviteLink((await api.post(`/users/${user.id}/resend-invite`)).data.inviteLink); setShowCreate(true); notify('A new invite link is ready.') }
    catch (error) { notify(error.response?.data?.message || 'Could not regenerate invite.', 'error') }
  }

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteLink).catch(() => {})
    setCopied(true); window.setTimeout(() => setCopied(false), 1800)
  }

  const closeModal = () => {
    setShowCreate(false); setInviteLink(null); setNewName(''); setNewEmail(''); setNewRole('member'); setCopied(false)
  }

  return (
    <main className="um-page">
      {toast && <div className={`um-toast ${toast.type}`}><Check size={15} />{toast.text}</div>}
      <section className="um-hero">
        <div className="um-hero-copy"><span><Users size={13} /> Team administration</span><h1>User management</h1><p>Invite teammates, assign the right level of access, and keep your workspace secure.</p></div>
        <button className="um-invite" onClick={() => setShowCreate(true)}><UserPlus size={16} />Invite teammate</button>
        <div className="um-stats">
          <div><UserCheck size={16} /><span>Active users<strong>{counts.active}</strong></span></div>
          <div><Clock size={16} /><span>Pending invites<strong>{counts.pending}</strong></span></div>
          <div><ShieldCheck size={16} /><span>Administrators<strong>{counts.admins}</strong></span></div>
        </div>
      </section>

      <section className="um-workspace">
        <header className="um-toolbar">
          <div className="um-tabs" role="tablist">
            {tabs.map(({ key, label, Icon, count }) => <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => { setActiveTab(key); setSearch('') }}><Icon size={15} /><span>{label}</span><b>{count}</b></button>)}
          </div>
          <div className="um-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name or email" />{search && <button onClick={() => setSearch('')}><X size={13} /></button>}</div>
        </header>
        <div className="um-list-head"><div><strong>{tabs.find(tab => tab.key === activeTab)?.label}</strong><span>{filtered.length} {filtered.length === 1 ? 'person' : 'people'} shown</span></div><span>Roles can be changed directly from the list</span></div>

        <div className="um-table-wrap">
          <table className="um-table">
            <thead><tr><th>Team member</th><th>Status</th><th>Role & permissions</th><th>Joined</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="5" className="um-state"><Loader2 className="um-spin" size={18} />Loading team members…</td></tr> : filtered.length === 0 ? (
                <tr><td colSpan="5" className="um-state"><Users size={26} /><strong>No {activeTab} users found</strong><span>{search ? 'Try a different search.' : activeTab === 'pending' ? 'New invitations will appear here.' : 'There is nothing to show in this view.'}</span></td></tr>
              ) : filtered.map(user => {
                const isMe = user.id === me?.id
                const initials = user.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <tr key={user.id}>
                    <td data-label="Team member"><div className="um-person"><div className="um-avatar">{initials}</div><div><strong>{user.name}{isMe && <em>You</em>}</strong><span><Mail size={12} />{user.email}</span></div></div></td>
                    <td data-label="Status"><span className={`um-status ${user.status}`}><i />{user.status === 'pending' ? 'Invite pending' : user.status}</span></td>
                    <td data-label="Role">
                      {isMe ? <span className={`um-role ${user.role}`}>{ROLE_LABEL[user.role] || user.role}</span> : <div className="um-role-select"><ShieldCheck size={14} /><select value={user.role} onChange={event => handleRoleChange(user.id, event.target.value)}>{ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={12} /></div>}
                    </td>
                    <td data-label="Joined"><span className="um-date">{new Date(user.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></td>
                    <td data-label="Actions">{isMe ? <span className="um-self">Current account</span> : <ActionsMenu user={user} activeTab={activeTab} onStatusChange={handleStatusChange} onDelete={handleDelete} onResend={handleResend} />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate && (
        <div className="um-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeModal() }}>
          <div className="um-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
            <button className="um-modal-close" onClick={closeModal}><X size={17} /></button>
            {inviteLink ? (
              <div className="um-invite-success"><div className="um-success-icon"><Check size={22} /></div><span>Invitation ready</span><h2 id="invite-title">Share this secure invite link</h2><p>The link expires in 7 days and can only be used to activate this account.</p><div className="um-link-box"><span>{inviteLink}</span><button onClick={copyInvite}><Copy size={14} />{copied ? 'Copied' : 'Copy link'}</button></div><button className="um-modal-primary" onClick={closeModal}>Done</button></div>
            ) : (
              <form onSubmit={handleCreate}>
                <div className="um-modal-icon"><UserPlus size={19} /></div><span className="um-modal-kicker">Add to workspace</span><h2 id="invite-title">Invite a teammate</h2><p className="um-modal-sub">They will receive access after opening the generated invitation link.</p>
                <label><span>Full name</span><input required value={newName} onChange={event => setNewName(event.target.value)} placeholder="e.g. John Smith" /></label>
                <label><span>Email address</span><input required type="email" value={newEmail} onChange={event => setNewEmail(event.target.value)} placeholder="name@company.com" /></label>
                <label><span>Workspace role</span><select value={newRole} onChange={event => setNewRole(event.target.value)}>{ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{newRole === 'member' ? 'Can work with assigned CRM records.' : 'Can manage users and workspace settings.'}</small></label>
                <div className="um-modal-actions"><button type="button" onClick={closeModal}>Cancel</button><button className="um-modal-primary" disabled={creating}>{creating ? <><Loader2 className="um-spin" size={15} />Creating invite…</> : <><UserPlus size={15} />Create invitation</>}</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
