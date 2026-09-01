import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import api from '../../api/client'
import '../../styles/sidebar.css'
import {
  LayoutDashboard, Users, Building2, TrendingUp, Mail, Settings, Inbox,
  Phone, Calendar, CheckSquare, MessageSquare, BarChart3, History,
  FileCode2, Briefcase, Megaphone, SlidersHorizontal, ChevronRight, FileText,
  User, Send,
} from 'lucide-react'

const groups = [
  { label: 'CRM', Icon: Briefcase, items: [
    { to: '/companies', label: 'Companies', Icon: Building2 },
    { to: '/recents', label: 'Recents', Icon: History },
    { to: '/deals', label: 'Deals', Icon: TrendingUp },
    { to: '/deals-dashboard', label: 'Deals Dashboard', Icon: BarChart3 },
    { to: '/inbox', label: 'Inbox', Icon: Inbox },
    { to: '/calls', label: 'Calls', Icon: Phone },
    { to: '/meetings', label: 'Meetings', Icon: Calendar },
    { to: '/tasks', label: 'Tasks', Icon: CheckSquare },
  ]},
  { label: 'Marketing', Icon: Megaphone, items: [
    { to: '/prospects', label: 'Prospect & Channel Board', Icon: User },
    { to: '/outreach/single-mail', label: 'Single Mail Outreach', Icon: Send },
    { to: '/email', label: 'Email', Icon: Mail },
    { to: '/prompt-templates', label: 'Prompt Templates', Icon: FileCode2 },
    { to: '/ai-usage', label: 'AI Usage', Icon: BarChart3 },
    { to: '/enrichment-reports', label: 'Product Enrichment Report', Icon: FileText },
  ]},
  { label: 'Manage', Icon: SlidersHorizontal, items: [
    { to: '/users', label: 'Users', Icon: Users },
    { to: '/settings', label: 'Settings', Icon: Settings },
  ]},
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const sidebarRef = useRef(null)
  const [openGroup, setOpenGroup] = useState(null)
  const [unreadChat, setUnreadChat] = useState(0)

  useEffect(() => setOpenGroup(null), [location.pathname])
  useEffect(() => {
    const close = event => { if (sidebarRef.current && !sidebarRef.current.contains(event.target)) setOpenGroup(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  useEffect(() => {
    const fetchUnread = () => api.get('/chat/unread').then(r => setUnreadChat(r.data.count || 0)).catch(() => {})
    fetchUnread()
    const interval = setInterval(fetchUnread, 10000)
    return () => clearInterval(interval)
  }, [])

  const groupIsActive = group => group.items.some(item => location.pathname.startsWith(item.to))
  return (
    <aside className="crm-sidebar" ref={sidebarRef}>
      <button className="crm-sidebar-logo" type="button" onClick={() => navigate('/dashboard')} aria-label="Go to dashboard">
        <img src="/nxt-sales-logo-clean.png" alt="NXT Sales" />
      </button>
      <nav className="crm-sidebar-nav" aria-label="Primary navigation">
        <NavLink to="/dashboard" data-tooltip="Dashboard" className={({ isActive }) => `crm-nav-tile${isActive ? ' active' : ''}`}>
          <LayoutDashboard aria-hidden="true" /><span>Dashboard</span>
        </NavLink>
        <SidebarGroup group={groups[0]} active={groupIsActive(groups[0])} open={openGroup === 'CRM'} onToggle={() => setOpenGroup(v => v === 'CRM' ? null : 'CRM')} />
        <NavLink to="/chat" data-tooltip="Team Chat" className={({ isActive }) => `crm-nav-tile${isActive ? ' active' : ''}`}>
          <span className="crm-nav-icon-wrap"><MessageSquare aria-hidden="true" />{unreadChat > 0 && <i className="crm-nav-badge">{unreadChat > 9 ? '9+' : unreadChat}</i>}</span>
          <span>Team Chat</span>
        </NavLink>
        {groups.slice(1).map(group => <SidebarGroup key={group.label} group={group} active={groupIsActive(group)} open={openGroup === group.label} onToggle={() => setOpenGroup(v => v === group.label ? null : group.label)} />)}
      </nav>
    </aside>
  )
}

function SidebarGroup({ group, active, open, onToggle }) {
  const { label, Icon, items } = group
  return (
    <div className={`crm-nav-group${open ? ' open' : ''}`}>
      <button type="button" data-tooltip={label} className={`crm-nav-tile${active ? ' active' : ''}`} onClick={onToggle} aria-expanded={open}>
        <Icon aria-hidden="true" /><span>{label}</span>
      </button>
      {open && <div className="crm-nav-flyout">
        <div className="crm-nav-flyout-title">{label}</div>
        {items.map(({ to, label: itemLabel, Icon: ItemIcon }) => <NavLink key={to} to={to} data-tooltip={itemLabel} className={({ isActive }) => `crm-nav-subitem${isActive ? ' active' : ''}`}>
          <ItemIcon aria-hidden="true" /><span>{itemLabel}</span><ChevronRight aria-hidden="true" className="crm-nav-subarrow" />
        </NavLink>)}
      </div>}
    </div>
  )
}
