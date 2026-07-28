import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/client'
import '../../styles/sidebar.css'
import {
  LayoutDashboard, Users, Building2, TrendingUp, Mail,
  Settings, ChevronDown, Search, FileCode,
  Inbox, Phone, Calendar, CheckSquare, MessageSquare
} from 'lucide-react'

const menuStructure = [
  {
    section: 'CRM',
    icon: LayoutDashboard,
    items: [
      { to: '/companies', label: 'Companies', icon: Building2 },
      { to: '/deals', label: 'Deals', icon: TrendingUp },
      { to: '/inbox', label: 'Inbox', icon: Inbox },
      { to: '/calls', label: 'Calls', icon: Phone },
      { to: '/meetings', label: 'Meetings', icon: Calendar },
      { to: '/tasks', label: 'Tasks', icon: CheckSquare },
    ],
  },
  {
    section: 'Marketing',
    icon: Mail,
    items: [
      { to: '/email', label: 'Email', icon: FileCode },
    ],
  },
]

export default function Sidebar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [expanded,   setExpanded]   = useState({})
  const [search,     setSearch]     = useState('')
  const [unreadChat, setUnreadChat] = useState(0)

  // Poll for unread chat messages every 10 seconds
  useEffect(() => {
    const fetchUnread = () => {
      api.get('/chat/unread').then(r => setUnreadChat(r.data.count || 0)).catch(() => {})
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 10000)
    return () => clearInterval(interval)
  }, [])

  const toggleSection = (section) => {
    setExpanded(p => ({ ...p, [section]: !p[section] }))
  }

  // Filter nav items by the search box — sections with no matching item are
  // hidden, and a section with a match auto-expands so the result is visible
  // without also needing to click it open.
  const query = search.trim().toLowerCase()
  const filteredMenuStructure = query
    ? menuStructure
        .map(s => ({ ...s, items: s.items.filter(i => i.label.toLowerCase().includes(query)) }))
        .filter(s => s.items.length > 0)
    : menuStructure

  return (
    <aside className="sidebar-modern">
      {/* Header — logo always returns to the Dashboard, from any page */}
      <div className="sidebar-header-modern">
        <button
          type="button"
          className="logo-section-modern"
          onClick={() => navigate('/dashboard')}
          style={{ background: 'none', border: 'none', padding: 0, width: '100%', cursor: 'pointer' }}
        >
          <img src="/AltiusNXT_Logo-01.png" alt="AltiusNxt" className="logo-img-modern" />
          <span className="app-name-modern">NXT Sales</span>
        </button>
      </div>

      {/* Search */}
      <div className="search-section-modern">
        <div className="search-input-modern">
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="nav-modern">
        {/* Dashboard — always-visible direct link */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `item-link-modern${isActive ? ' active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', margin: '4px 8px', borderRadius: 6 }}
        >
          <LayoutDashboard size={16} />
          <span style={{ flex: 1 }}>Dashboard</span>
        </NavLink>

        {/* Team Chat — always-visible direct link */}
        <NavLink
          to="/chat"
          className={({ isActive }) => `item-link-modern${isActive ? ' active' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', margin: '4px 8px', borderRadius: 6 }}
        >
          <MessageSquare size={16} />
          <span style={{ flex: 1 }}>Team Chat</span>
          {unreadChat > 0 && (
            <span style={{
              background: '#e11d48', color: '#fff', fontSize: 10, fontWeight: 700,
              minWidth: 18, height: 18, borderRadius: 9, padding: '0 4px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {unreadChat > 99 ? '99+' : unreadChat}
            </span>
          )}
        </NavLink>

        {filteredMenuStructure.map(({ section, icon: SectionIcon, items }) => {
          const isExpanded = query ? true : expanded[section]

          return (
            <div key={section} className="section-modern">
              <button
                className={`section-button-modern ${isExpanded ? 'active' : ''}`}
                onClick={() => toggleSection(section)}
              >
                <div className="section-icon-wrapper">
                  <SectionIcon size={18} />
                </div>
                <span className="section-label-modern">{section}</span>
                <ChevronDown
                  size={16}
                  style={{
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    marginLeft: 'auto'
                  }}
                />
              </button>

              {isExpanded && (
                <div className="items-list-modern">
                  {items.map(({ to, label, icon: ItemIcon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      className={({ isActive }) => `item-link-modern ${isActive ? 'active' : ''}`}
                    >
                      <ItemIcon size={16} />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {query && filteredMenuStructure.length === 0 && (
          <div style={{ padding: '10px 16px', fontSize: 12, color: '#94a3b8' }}>No matches</div>
        )}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer-modern">
        <NavLink
          to="/users"
          className={({ isActive }) => `settings-link-modern ${isActive ? 'active' : ''}`}
        >
          <Users size={18} />
          <span>Users</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => `settings-link-modern ${isActive ? 'active' : ''}`}
        >
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  )
}
