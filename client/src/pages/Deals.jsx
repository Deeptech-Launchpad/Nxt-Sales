import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

export default function Deals() {
  const { user } = useAuth()
  const [deals, setDeals]     = useState([])
  const [loading, setLoading] = useState(true)

  // Fetch real deals from the backend DB (GET /api/deals)
  useEffect(() => {
    let alive = true
    api.get('/deals')
      .then(r => { if (alive) setDeals(Array.isArray(r.data) ? r.data : []) })
      .catch(() => { if (alive) setDeals([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // Deals are scoped to the logged-in owner, so show the current user's initials.
  const ownerInitials = (user?.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—'
  const fmtDate = d => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'
  const fmtAmt  = v => (v && Number(v) > 0) ? Number(v).toLocaleString() : '--'

  const cellTh = { padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: '#fff', borderRadius: 8, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Deals</h1>
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{loading ? 'Loading…' : `${deals.length} records`}</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#e63329', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
          <Plus size={14} /> Create deal
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, paddingBottom: 12, borderBottom: '2px solid #e2e8f0', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', borderBottom: '2px solid #e63329', paddingBottom: 8 }}>All deals</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer', paddingBottom: 8 }}>My deals</div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={cellTh}><input type="checkbox" /></th>
              <th style={cellTh}>DEAL NAME</th>
              <th style={cellTh}>DEAL STAGE</th>
              <th style={cellTh}>CLOSE DATE</th>
              <th style={cellTh}>DEAL OWNER</th>
              <th style={cellTh}>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Loading deals…</td></tr>
            ) : deals.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>No deals yet.</td></tr>
            ) : deals.map((d, i) => (
              <tr key={d.id} style={{ borderBottom: i < deals.length - 1 ? '1px solid #f1f5f9' : 'none' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '12px 14px' }}><input type="checkbox" /></td>
                <td style={{ padding: '12px 14px', color: '#3b82f6', fontWeight: 600, cursor: 'pointer' }}>{d.title}</td>
                <td style={{ padding: '12px 14px', color: '#334155' }}>{d.stage}</td>
                <td style={{ padding: '12px 14px', color: '#334155' }}>{fmtDate(d.closeDate)}</td>
                <td style={{ padding: '12px 14px', color: '#334155' }}>{ownerInitials}</td>
                <td style={{ padding: '12px 14px', color: '#334155' }}>{fmtAmt(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
