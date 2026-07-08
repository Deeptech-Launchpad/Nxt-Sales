import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Mail, Shield, Calendar, CheckCircle, User as UserIcon } from 'lucide-react'
import api from '../api/client'

export default function Profile() {
  const { user: authUser } = useAuth()
  // Seed from the auth context, then enrich with the full record from /api/auth/me.
  const [user, setUser]     = useState(authUser || null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    api.get('/auth/me')
      .then(r => { if (alive && r.data) setUser(u => ({ ...u, ...r.data })) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'

  const rows = [
    { label: 'Full Name',    value: user?.name  || '—', Icon: UserIcon },
    { label: 'Email Address', value: user?.email || '—', Icon: Mail },
    { label: 'Role',         value: cap(user?.role),    Icon: Shield },
    { label: 'Status',       value: cap(user?.status),  Icon: CheckCircle },
    { label: 'Created Date', value: fmtDate(user?.createdAt), Icon: Calendar },
  ]

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', fontFamily: 'DM Sans, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>My Profile</h1>
      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Your account information (read-only).</p>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {/* Header band */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '22px 24px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          {user?.avatar
            ? <img src={user.avatar} alt={user.name} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
            : <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e63329', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700 }}>{initials}</div>
          }
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{user?.name || 'User'}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{user?.email || ''}</div>
            {user?.role && (
              <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 600, color: '#0369a1', background: '#e0f2fe', borderRadius: 12, padding: '2px 10px' }}>{cap(user.role)}</span>
            )}
          </div>
        </div>

        {/* Detail rows */}
        <div style={{ padding: '8px 24px 16px' }}>
          {rows.map(({ label, value, Icon }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={16} color="#64748b" />
              </div>
              <div style={{ width: 130, fontSize: 12.5, color: '#94a3b8', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{loading && value === '—' ? 'Loading…' : value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
