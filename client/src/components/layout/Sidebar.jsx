import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/client'
import '../../styles/sidebar.css'
import {
  LayoutDashboard, Users, Building2, TrendingUp, Ticket,
  Package, ShoppingCart, List, Mail, Zap, FileText,
  BarChart2, Settings, ChevronDown, Search,
  FileCode, DollarSign, Headphones, Database, Workflow,
  CreditCard, Inbox, Phone, Calendar, CheckSquare, MessageSquare, Code
} from 'lucide-react'

// NOTE: Items/sections below are commented out only to HIDE them from the sidebar
// (those modules aren't implemented yet). Nothing is deleted — their routes, pages,
// components, APIs and DB logic remain intact. To re-enable a module later, just
// uncomment its line. The imported icons are also kept so re-enabling "just works".
const menuStructure = [
  {
    section: 'CRM',
    icon: LayoutDashboard,
    items: [
      { to: '/companies', label: 'Companies', icon: Building2 },
      { to: '/deals', label: 'Deals', icon: TrendingUp },
      // { to: '/tickets', label: 'Tickets', icon: Ticket },              // hidden — not implemented yet
      // { to: '/products', label: 'Products', icon: Package },           // hidden — not implemented yet
      // { to: '/orders', label: 'Orders', icon: ShoppingCart },          // hidden — not implemented yet
      // { to: '/segments', label: 'Segments', icon: List },              // hidden — not implemented yet
      { to: '/inbox', label: 'Inbox', icon: Inbox },
      { to: '/calls', label: 'Calls', icon: Phone },
      { to: '/meetings', label: 'Meetings', icon: Calendar },
      { to: '/tasks', label: 'Tasks', icon: CheckSquare },
      // { to: '/playbooks', label: 'Playbooks', icon: Workflow },        // hidden — not implemented yet
      // { to: '/templates', label: 'Message Templates', icon: MessageSquare }, // hidden — not implemented yet
      // { to: '/snippets', label: 'Snippets', icon: Code },              // hidden — not implemented yet
    ],
  },
  {
    section: 'Marketing',
    icon: Mail,
    items: [
      // { to: '/campaigns', label: 'Campaigns', icon: Mail },            // hidden — not implemented yet
      { to: '/email', label: 'Email', icon: FileCode },
      // { to: '/automation', label: 'Automation', icon: Zap },           // hidden — not implemented yet
      // { to: '/forms', label: 'Forms', icon: FileText },                // hidden — not implemented yet
    ],
  },
  // ── Sections below hidden for now (placeholders, not implemented). Uncomment to re-enable. ──
  // {
  //   section: 'Sales',
  //   icon: TrendingUp,
  //   items: [
  //     { to: '/sales-workspace', label: 'Workspace', icon: LayoutDashboard },
  //     { to: '/sequences', label: 'Sequences', icon: Workflow },
  //     { to: '/forecast', label: 'Forecast', icon: BarChart2 },
  //   ],
  // },
  // {
  //   section: 'Revenue',
  //   icon: DollarSign,
  //   items: [
  //     { to: '/quotes', label: 'Quotes', icon: FileText },
  //     { to: '/invoices', label: 'Invoices', icon: DollarSign },
  //     { to: '/payments', label: 'Payments', icon: CreditCard },
  //   ],
  // },
  // {
  //   section: 'Service',
  //   icon: Headphones,
  //   items: [
  //     { to: '/help-desk', label: 'Help Desk', icon: Headphones },
  //     { to: '/kb', label: 'Knowledge Base', icon: Database },
  //   ],
  // },
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
      {/* Header */}
      <div className="sidebar-header-modern">
        <div className="logo-section-modern">
          <img src="/AltiusNXT_Logo-01.png" alt="AltiusNxt" className="logo-img-modern" />
          <span className="app-name-modern">NXT Sales</span>
        </div>
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
