import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { TrendingUp, Briefcase, CheckCircle, Mail, Plus } from 'lucide-react'
import api from '../api/client'
import '../styles/dashboard.css'

const quickActions = [
  { label: 'New Deal',    Icon: TrendingUp, color: '#fef9ee', iconColor: '#f59e0b', to: '/deals' },
  { label: 'Send Email',  Icon: Mail,       color: '#f0fdf4', iconColor: '#22c55e', to: '/email' },
  { label: 'Create Task', Icon: Plus,       color: '#fff1f2', iconColor: '#e63329', to: '/activities' },
]

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const firstName = user?.name?.split(' ')[0] || 'there'

  const [loading, setLoading] = useState(true)
  const [deals, setDeals]     = useState([])

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
