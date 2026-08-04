import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import CreateDealModal from '../components/modals/CreateDealModal'
import EditColumnsMenu from '../components/EditColumnsMenu'
import { renderCustomCell } from '../utils/customFieldRender'

const COLUMNS_STORAGE_KEY = 'mwz_deals_visible_columns'
// Matches exactly what the table showed before this became dynamic — every
// column already visible stays visible by default; nothing is hidden by
// this change. 'title' is always shown (like Company's 'name'), so it's
// deliberately not in this list.
const DEFAULT_COLUMNS = [
  'companyName', 'clientType', 'contactPerson', 'serviceRequirement',
  'opportunityType', 'stage', 'strategicImportance', 'expectedOutcome',
  'closeDate', 'value',
]

// Deal Owner (ownerId) is intentionally excluded from the server's dynamic
// Deal field list (same reasoning as Company's ownerId exclusion) — this is
// a client-side-only column entry so Edit Columns can offer it.
const DEAL_OWNER_COLUMN = { key: 'ownerId', label: 'Deal Owner' }

export default function Deals() {
  const { user } = useAuth()
  const [deals, setDeals]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editDeal, setEditDeal]   = useState(null)
  const [dealFields, setDealFields] = useState([])

  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY))
      return Array.isArray(saved) && saved.length ? saved : DEFAULT_COLUMNS
    } catch {
      return DEFAULT_COLUMNS
    }
  })
  const saveVisibleColumns = (cols) => {
    setVisibleColumns(cols)
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(cols))
  }

  useEffect(() => {
    api.get('/deals/import-fields').then(r => setDealFields(r.data.fields || [])).catch(() => {})
  }, [])

  const fetchDeals = useCallback(() => {
    setLoading(true)
    api.get('/deals')
      .then(r => setDeals(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDeals([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  const handleDelete = async (dealId) => {
    if (!window.confirm('Delete this deal? This action cannot be undone.')) return
    try {
      await api.delete(`/deals/${dealId}`)
      setDeals(prev => prev.filter(d => d.id !== dealId))
    } catch {
      // no-op — matches existing lightweight error handling style on this page
    }
  }

  // Deals are scoped to the logged-in owner, so show the current user's initials.
  const ownerInitials = (user?.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—'
  const fmtDate = d => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'
  const fmtAmt  = v => (v && Number(v) > 0) ? Number(v).toLocaleString() : '--'

  const editColumnsFields = [...dealFields, DEAL_OWNER_COLUMN]
  const orderedVisibleFields = editColumnsFields.filter(f => visibleColumns.includes(f.key))

  function renderDealCell(f, d) {
    if (f.key === 'companyName') {
      const name = d.companyName || d.company?.name || '--'
      return d.domainName ? `${name} / ${d.domainName}` : name
    }
    if (f.key === 'ownerId') return ownerInitials
    if (f.key === 'closeDate') return fmtDate(d.closeDate)
    if (f.key === 'value') return fmtAmt(d.value)
    if (f.key.startsWith('custom.')) return renderCustomCell(f.type, d[f.key])
    const v = d[f.key]
    if (Array.isArray(v)) return v.length ? v.join(', ') : '--'
    return (v === null || v === undefined || v === '') ? '--' : String(v)
  }

  const cellTh = { padding: '11px 14px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }
  const cellTd = { padding: '12px 14px', color: '#334155', whiteSpace: 'nowrap' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: '#fff', borderRadius: 8, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>Deals</h1>
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{loading ? 'Loading…' : `${deals.length} records`}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <EditColumnsMenu fields={editColumnsFields} visibleColumns={visibleColumns} onSave={saveVisibleColumns} alwaysShownKey="title" />
          <button
            onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#e63329', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          >
            <Plus size={14} /> Create deal
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, paddingBottom: 12, borderBottom: '2px solid #e2e8f0', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', borderBottom: '2px solid #e63329', paddingBottom: 8 }}>All deals</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#64748b', cursor: 'pointer', paddingBottom: 8 }}>My deals</div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <tr>
              <th style={cellTh}>DEAL NAME</th>
              {orderedVisibleFields.map(f => <th key={f.key} style={cellTh}>{f.label.toUpperCase()}</th>)}
              <th style={cellTh}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={2 + orderedVisibleFields.length} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Loading deals…</td></tr>
            ) : deals.length === 0 ? (
              <tr><td colSpan={2 + orderedVisibleFields.length} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>No deals yet.</td></tr>
            ) : deals.map((d, i) => (
              <tr key={d.id} style={{ borderBottom: i < deals.length - 1 ? '1px solid #f1f5f9' : 'none' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ ...cellTd, color: '#3b82f6', fontWeight: 600, cursor: 'pointer' }} onClick={() => setEditDeal(d)}>{d.title}</td>
                {orderedVisibleFields.map(f => <td key={f.key} style={cellTd}>{renderDealCell(f, d)}</td>)}
                <td style={{ ...cellTd, display: 'flex', gap: 10 }}>
                  <button onClick={() => setEditDeal(d)} title="Edit deal" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}><Pencil size={14} /></button>
                  <button onClick={() => handleDelete(d.id)} title="Delete deal" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateDealModal
          onClose={() => setShowCreate(false)}
          onSaved={() => fetchDeals()}
        />
      )}

      {editDeal && (
        <CreateDealModal
          deal={editDeal}
          onClose={() => setEditDeal(null)}
          onSaved={() => fetchDeals()}
        />
      )}
    </div>
  )
}
