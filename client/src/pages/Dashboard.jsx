import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { TrendingUp, Briefcase, CheckCircle, Mail, Plus, Building2, PhoneCall, CalendarClock, AlertTriangle, CheckSquare } from 'lucide-react'
import api from '../api/client'
import '../styles/dashboard.css'

const quickActions = [
  { label: 'New Deal',    Icon: TrendingUp, color: '#fef9ee', iconColor: '#f59e0b', to: '/deals' },
  { label: 'Send Email',  Icon: Mail,       color: '#f0fdf4', iconColor: '#22c55e', to: '/email' },
  { label: 'Create Task', Icon: Plus,       color: '#fff1f2', iconColor: '#e63329', to: '/tasks' },
]

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const firstName = user?.name?.split(' ')[0] || 'there'

  const [loading, setLoading] = useState(true)
  const [deals, setDeals]     = useState([])
  const [kpis, setKpis]       = useState(null)
  const [kpisLoading, setKpisLoading] = useState(true)

  // All figures below come from the backend DB — nothing hardcoded.
  useEffect(() => {
    let alive = true
    api.get('/deals').then(r => Array.isArray(r.data) ? r.data : []).catch(() => []).then(dealList => {
      if (!alive) return
      setDeals(dealList)
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  // 6 KPI widgets (Update 6) — one DB-aggregated call, not derived client-side.
  useEffect(() => {
    let alive = true
    api.get('/dashboard/stats').then(r => { if (alive) setKpis(r.data) }).catch(() => {}).finally(() => { if (alive) setKpisLoading(false) })
    return () => { alive = false }
  }, [])

  const kpiCards = [
    { label: 'Total Companies',       value: kpis?.totalCompanies,       Icon: Building2,     color: '#eff6ff', iconColor: '#3b82f6' },
    { label: 'Deals in Progress',     value: kpis?.dealsInProgress,      Icon: Briefcase,     color: '#f0fdf4', iconColor: '#22c55e' },
    { label: 'Won Clients This Month',value: kpis?.wonClientsThisMonth,  Icon: CheckCircle,   color: '#fff1f2', iconColor: '#e63329' },
    { label: 'Calls Today',           value: kpis?.callsToday,           Icon: PhoneCall,     color: '#fef9ee', iconColor: '#f59e0b' },
    { label: 'Follow-ups Due Today',  value: kpis?.followUpsDueToday,    Icon: CalendarClock, color: '#f5f3ff', iconColor: '#8b5cf6' },
    { label: 'Tasks Overdue',         value: kpis?.tasksOverdue,         Icon: AlertTriangle, color: '#fef2f2', iconColor: '#ef4444' },
  ]

  const todayTasks = kpis?.todayTasks || []

  const activeDeals = deals.filter(d => !/won|lost/i.test(d.stage || ''))
  const wonDeals    = deals.filter(d => /won/i.test(d.stage || ''))
  const recentDeals = deals.slice(0, 5)

  const stats = [
    { label: 'Total Deals',    value: deals.length,       Icon: TrendingUp,  color: '#fef9ee', iconColor: '#f59e0b' },
    { label: 'Active Deals',   value: activeDeals.length, Icon: Briefcase,   color: '#f0fdf4', iconColor: '#22c55e' },
    { label: 'Won Deals',      value: wonDeals.length,    Icon: CheckCircle, color: '#fff1f2', iconColor: '#e63329' },
  ]

  return (
    <div className="dashboard">
      <div>
        <h1 className="dash-greeting">Good morning, <span>{firstName}</span> 👋</h1>
        <p className="dash-sub">Here's what's happening with your marketing today.</p>
      </div>

      <div className="stats-grid">
        {stats.map(({ label, value, Icon, color, iconColor }) => (
          <div key={label} className="stat-card">
            <div className="stat-icon-wrap" style={{ background: color }}>
              <Icon size={20} color={iconColor} />
            </div>
            <div className="stat-value">{loading ? '—' : value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="stats-grid">
        {kpiCards.map(({ label, value, Icon, color, iconColor }) => (
          <div key={label} className="stat-card">
            <div className="stat-icon-wrap" style={{ background: color }}>
              <Icon size={20} color={iconColor} />
            </div>
            <div className="stat-value">{kpisLoading ? '—' : (value ?? 0)}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">Today's Tasks {!kpisLoading && `(${todayTasks.length})`}</span>
          <button className="panel-link" onClick={() => navigate('/tasks')}>View all</button>
        </div>
        <div className="activity-list">
          {kpisLoading ? (
            <p className="activity-time" style={{ padding: '8px 0' }}>Loading…</p>
          ) : todayTasks.length === 0 ? (
            <p className="activity-time" style={{ padding: '8px 0' }}>No tasks due today.</p>
          ) : todayTasks.map(t => (
            <div
              key={t.id}
              className="activity-item"
              style={{ cursor: t.company?.id ? 'pointer' : 'default' }}
              onClick={() => t.company?.id && navigate(`/companies/${t.company.id}`)}
            >
              <div className="activity-dot" style={{ background: '#fffbeb' }}>
                <CheckSquare size={15} color="#d97706" />
              </div>
              <div className="activity-body">
                <p className="activity-text"><strong>{t.title || '(untitled)'}</strong>{t.company?.name ? ` — ${t.company.name}` : ''}</p>
                <p className="activity-time">
                  Due {new Date(t.dueDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  {t.assignedTo?.name ? ` · ${t.assignedTo.name}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="dash-row">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Recent Deals</span>
            <button className="panel-link" onClick={() => navigate('/deals')}>View all</button>
          </div>
          <div className="activity-list">
            {loading ? (
              <p className="activity-time" style={{ padding: '8px 0' }}>Loading…</p>
            ) : recentDeals.length === 0 ? (
              <p className="activity-time" style={{ padding: '8px 0' }}>No deals yet.</p>
            ) : recentDeals.map(d => (
              <div key={d.id} className="activity-item">
                <div className="activity-dot" style={{ background: '#fef9ee' }}>
                  <TrendingUp size={15} color="#f59e0b" />
                </div>
                <div className="activity-body">
                  <p className="activity-text"><strong>{d.title}</strong> — {d.stage}</p>
                  <p className="activity-time">
                    {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : ''}
                    {d.company?.name ? ` · ${d.company.name}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Quick Actions</span>
          </div>
          <div className="quick-actions">
            {quickActions.map(({ label, Icon, color, iconColor, to }) => (
              <button key={label} className="quick-btn" onClick={() => navigate(to)}>
                <div className="quick-btn-icon" style={{ background: color }}>
                  <Icon size={16} color={iconColor} />
                </div>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
