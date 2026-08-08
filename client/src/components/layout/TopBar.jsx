import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import api from '../../api/client'
import {
  Search, Bell, User, Settings, LogOut,
  Calendar, Mail, Building2, TrendingUp, X, CheckSquare,
} from 'lucide-react'
import '../../styles/topbar.css'

const PAGE_TITLES = {
  '/dashboard':  'Dashboard',
  '/companies':  'Companies',
  '/deals':      'Deals',
  '/activities': 'Activities',
  '/email':      'Email Tool',
  '/settings':   'Settings',
  '/profile':    'My Profile',
  '/chat':       'Team Chat',
  '/users':      'User Management',
}

function relTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function TopBar() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const notif = useNotifications()
  const { notifications = [], unreadCount = 0, markAllRead, clearOne, openNotification } = notif || {}

  const [search, setSearch]           = useState('')
  const [results, setResults]         = useState(null)
  const [searching, setSearching]     = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifOpen, setNotifOpen]     = useState(false)

  const profileRef = useRef()
  const searchRef  = useRef()
  const notifRef   = useRef()
  const debounceRef = useRef()

  const title = PAGE_TITLES[location.pathname] || 'NXT Sales'
  const initials = user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'

  // Close dropdowns on outside click
  useEffect(() => {
    const close = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false)
      if (notifRef.current   && !notifRef.current.contains(e.target))   setNotifOpen(false)
      if (searchRef.current  && !searchRef.current.contains(e.target))  setShowResults(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // ── Global search (Companies / Deals) — debounced ──
  const runSearch = async (q) => {
    if (!q || q.trim().length < 2) { setResults(null); setSearching(false); return }
    setSearching(true)
    try {
      const [companies, dealsAll] = await Promise.all([
        api.get('/companies', { params: { search: q, limit: 5 } }).then(r => r.data?.companies || []).catch(() => []),
        api.get('/deals').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []),
      ])
      const ql = q.toLowerCase()
      const deals = dealsAll.filter(d => (d.title || '').toLowerCase().includes(ql)).slice(0, 5)
      setResults({ companies: companies.slice(0, 5), deals })
    } finally { setSearching(false) }
  }

  const onSearchChange = (e) => {
    const v = e.target.value
    setSearch(v)
    setShowResults(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(v), 300)
  }

  const goResult = (path) => {
    setShowResults(false); setSearch('')
    navigate(path)
  }

  const totalResults = results ? results.companies.length + results.deals.length : 0

  const handleLogout = () => { logout(); navigate('/login'); setProfileOpen(false) }
  const goTo = (path) => { navigate(path); setProfileOpen(false) }

  const NOTIF_ICON = { meeting: Calendar, email: Mail, task: CheckSquare }

  return (
    <header className="topbar">
      <span className="topbar-title">{title}</span>

      {/* Global search */}
      <div className="topbar-search" ref={searchRef} style={{ position: 'relative' }}>
        <Search className="search-icon" size={15} />
        <input
          type="text"
          placeholder="Search companies, deals..."
          value={search}
          onChange={onSearchChange}
          onFocus={() => search.length >= 2 && setShowResults(true)}
        />
        {showResults && search.trim().length >= 2 && (
          <div className="topbar-search-results">
            {searching && totalResults === 0 && <div className="tsr-empty">Searching…</div>}
            {!searching && totalResults === 0 && <div className="tsr-empty">No matches found.</div>}

            {results?.companies?.length > 0 && (
              <div className="tsr-group">
                <div className="tsr-group-title">Companies</div>
                {results.companies.map(c => (
                  <button key={c.id} className="tsr-item" onClick={() => goResult(`/companies/${c.id}`)}>
                    <Building2 size={14} /> <span>{c.name}</span>
                  </button>
                ))}
              </div>
            )}
            {results?.deals?.length > 0 && (
              <div className="tsr-group">
                <div className="tsr-group-title">Deals</div>
                {results.deals.map(d => (
                  <button key={d.id} className="tsr-item" onClick={() => goResult('/deals')}>
                    <TrendingUp size={14} /> <span>{d.title}</span>
                    {d.stage && <span className="tsr-sub">{d.stage}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        {/* Notification center */}
        <div className="topbar-notif-wrap" ref={notifRef} style={{ position: 'relative' }}>
          <button className="icon-btn" title="Notifications" onClick={() => setNotifOpen(o => !o)}>
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="notif-count-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>

          {notifOpen && (
            <div className="notif-panel">
              <div className="notif-panel-header">
                <span>Notifications</span>
                {notifications.length > 0 && (
                  <button className="notif-mark-all" onClick={markAllRead} disabled={unreadCount === 0}>Mark all read</button>
                )}
              </div>
              <div className="notif-panel-list">
                {notifications.length === 0 ? (
                  <div className="notif-empty">
                    <Bell size={22} color="#cbd5e1" />
                    <p>You're all caught up</p>
                  </div>
                ) : notifications.map(n => {
                  const Icon = NOTIF_ICON[n.type] || Bell
                  return (
                    <div key={n.id} className={`notif-row ${n.read ? '' : 'unread'}`}>
                      <button className="notif-row-main" onClick={() => { openNotification(n); setNotifOpen(false) }}>
                        <div className={`notif-row-icon ${n.type}`}><Icon size={15} /></div>
                        <div className="notif-row-body">
                          <div className="notif-row-title">{n.title}{!n.read && <span className="notif-unread-dot" />}</div>
                          <div className="notif-row-desc">{n.description}</div>
                          <div className="notif-row-time">{relTime(n.datetime)}</div>
                        </div>
                      </button>
                      <button className="notif-row-clear" title="Clear" onClick={() => clearOne(n.id)}><X size={13} /></button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Profile avatar + dropdown */}
        <div className="topbar-profile-wrap" ref={profileRef}>
          <div className="topbar-avatar" title={user?.name || 'User'} onClick={() => setProfileOpen(p => !p)}>
            {initials}
          </div>

          {profileOpen && (
            <div className="topbar-profile-dropdown">
              <div className="tpd-user-info">
                <div className="tpd-avatar">{initials}</div>
                <div>
                  <div className="tpd-name">{user?.name || 'User'}</div>
                  <div className="tpd-email">{user?.email || ''}</div>
                </div>
              </div>

              <div className="tpd-divider" />

              <button className="tpd-item" onClick={() => goTo('/profile')}>
                <User size={14} /> My Profile
              </button>
              <button className="tpd-item" onClick={() => goTo('/settings')}>
                <Settings size={14} /> Settings
              </button>

              <div className="tpd-divider" />

              <button className="tpd-item tpd-danger" onClick={handleLogout}>
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
