import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, List, LayoutGrid } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import CreateDealModal from '../components/modals/CreateDealModal'
import EditColumnsMenu from '../components/EditColumnsMenu'
import DealBoard from '../components/DealBoard'
import { renderCustomCell } from '../utils/customFieldRender'
import { formatCurrency } from '../utils/formatCurrency'

const COLUMNS_STORAGE_KEY = 'mwz_deals_visible_columns'
const VIEW_STORAGE_KEY = 'mwz_deals_view_mode'
// Matches exactly what the table showed before this became dynamic — every
// column already visible stays visible by default; nothing is hidden by
// this change. 'title' is always shown (like Company's 'name'), so it's
// deliberately not in this list.
const DEFAULT_COLUMNS = [
  'companyName', 'clientType', 'contactPerson', 'serviceRequirement',
  'opportunityType', 'stage', 'strategicImportance', 'expectedOutcome',
  'value',
]

// Deal Owner (ownerId) is intentionally excluded from the server's dynamic
// Deal field list (same reasoning as Company's ownerId exclusion) — this is
// a client-side-only column entry so Edit Columns can offer it.
const DEAL_OWNER_COLUMN = { key: 'ownerId', label: 'Deal Owner' }

export default function Deals() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [deals, setDeals]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editDeal, setEditDeal]   = useState(null)
  const [dealFields, setDealFields] = useState([])
  const [search, setSearch]       = useState('')
  const [dealsTab, setDealsTab]   = useState('all') // 'all' | 'mine'
  const [viewMode, setViewMode]   = useState(() => localStorage.getItem(VIEW_STORAGE_KEY) || 'list')

  const setView = (v) => { setViewMode(v); localStorage.setItem(VIEW_STORAGE_KEY, v) }

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

  // Clicking a deal opens its linked company (same behavior in both views);
  // a deal with no linked company has nowhere to navigate to, so it falls
  // back to the edit modal instead of a dead click.
  const handleOpenDeal = (d) => {
    if (d.companyId) navigate(`/companies/${d.companyId}`)
    else setEditDeal(d)
  }

  // Drag-and-drop stage change (Board View) — optimistic update so the board
  // refreshes instantly with no page reload; rolled back if the save fails.
  const handleStageChange = async (deal, newStage) => {
    const prevStage = deal.stage
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage: newStage } : d))
    try {
      await api.put(`/deals/${deal.id}`, { stage: newStage })
    } catch {
      setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage: prevStage } : d))
    }
  }

  // "My Deals" — deals whose LINKED COMPANY's Lead Owner is the current user.
  // Distinct from this page's base fetch (already scoped to deals the
  // current user personally owns/created, server-side) — a deal you created
  // can still be linked to a company someone else is the Lead Owner of, and
  // "My Deals" narrows to just the ones where you're also the company's
  // Lead Owner. A deal with no linked company can never match.
  const scopedDeals = dealsTab === 'mine' ? deals.filter(d => d.company?.ownerId === user?.id) : deals

  // Search covers both views — Deal Name, Company Name, Contact Person,
  // Email, Domain.
  const filteredDeals = (() => {
    const q = search.trim().toLowerCase()
    if (!q) return scopedDeals
    return scopedDeals.filter(d => [
      d.title, d.companyName, d.company?.name, d.contactPerson, d.contactEmail, d.domainName,
    ].some(v => v && String(v).toLowerCase().includes(q)))
  })()

  // Deals are scoped to the logged-in owner, so show the current user's initials.
  const ownerInitials = (user?.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '—'

  const editColumnsFields = [...dealFields, DEAL_OWNER_COLUMN]
  const orderedVisibleFields = editColumnsFields.filter(f => visibleColumns.includes(f.key))

  function renderDealCell(f, d) {
    if (f.key === 'companyName') {
      const name = d.companyName || d.company?.name || '--'
      return d.domainName ? `${name} / ${d.domainName}` : name
    }
    if (f.key === 'ownerId') return ownerInitials
    if (f.key === 'value') return formatCurrency(d.value, d.currency)
    if (f.key.startsWith('custom.')) return renderCustomCell(f.type, d[f.key])
    const v = d[f.key]
    if (Array.isArray(v)) return v.length ? v.join(', ') : '--'
    return (v === null || v === undefined || v === '') ? '--' : String(v)
  }

  const cellTh = { padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#64748b', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap' }
  const cellTd = { padding: '13px 16px', color: '#334155', whiteSpace: 'nowrap', fontSize: 13.5 }
  const iconBtn = { border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', transition: 'background .12s' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, background: '#fff', borderRadius: 12, padding: 26, boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 18, borderBottom: '1px solid #eef1f5' }}>
        <div>
          <h1 style={{ fontSize: 23, fontWeight: 700, color: '#0f172a', letterSpacing: '-.2px' }}>Deals</h1>
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{loading ? 'Loading…' : `${filteredDeals.length} record${filteredDeals.length === 1 ? '' : 's'}`}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {viewMode === 'list' && (
            <EditColumnsMenu fields={editColumnsFields} visibleColumns={visibleColumns} onSave={saveVisibleColumns} alwaysShownKey="title" />
          )}
          <button
            onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: '#e63329', color: '#fff', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', boxShadow: '0 1px 2px rgba(230,51,41,0.25)', transition: 'background .12s, box-shadow .12s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#c0271e'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(230,51,41,0.35)' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#e63329'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(230,51,41,0.25)' }}
          >
            <Plus size={14} /> Create deal
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, paddingBottom: 14, borderBottom: '1px solid #eef1f5', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <button
            onClick={() => setDealsTab('all')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
              color: dealsTab === 'all' ? '#0f172a' : '#94a3b8', borderBottom: `2px solid ${dealsTab === 'all' ? '#e63329' : 'transparent'}`, paddingBottom: 10, transition: 'color .12s, border-color .12s' }}
          >
            All deals
          </button>
          <button
            onClick={() => setDealsTab('mine')}
            title="Deals on companies where you're the Lead Owner"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
              color: dealsTab === 'mine' ? '#0f172a' : '#94a3b8', borderBottom: `2px solid ${dealsTab === 'mine' ? '#e63329' : 'transparent'}`, paddingBottom: 10, transition: 'color .12s, border-color .12s' }}
          >
            My deals
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingBottom: 8 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search deals…"
              style={{ padding: '8px 12px 8px 32px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, width: 230, fontFamily: 'inherit', transition: 'border-color .12s, box-shadow .12s' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#e63329'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(230,51,41,0.10)' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <button
              onClick={() => setView('list')}
              title="List view"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, transition: 'background .12s, color .12s',
                background: viewMode === 'list' ? '#e63329' : '#fff', color: viewMode === 'list' ? '#fff' : '#64748b' }}
            >
              <List size={13} /> List
            </button>
            <button
              onClick={() => setView('board')}
              title="Board view"
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, transition: 'background .12s, color .12s',
                background: viewMode === 'board' ? '#e63329' : '#fff', color: viewMode === 'board' ? '#fff' : '#64748b' }}
            >
              <LayoutGrid size={13} /> Board
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'board' ? (
        loading ? (
          <p style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13.5 }}>Loading deals…</p>
        ) : (
          <DealBoard
            deals={filteredDeals}
            onCardClick={handleOpenDeal}
            onEdit={setEditDeal}
            onStageChange={handleStageChange}
            ownerInitials={ownerInitials}
          />
        )
      ) : (
      <div style={{ overflowX: 'auto', border: '1px solid #eef1f5', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #eef1f5' }}>
            <tr>
              <th style={cellTh}>DEAL NAME</th>
              {orderedVisibleFields.map(f => <th key={f.key} style={cellTh}>{f.label.toUpperCase()}</th>)}
              <th style={cellTh}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={2 + orderedVisibleFields.length} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13.5 }}>Loading deals…</td></tr>
            ) : filteredDeals.length === 0 ? (
              <tr><td colSpan={2 + orderedVisibleFields.length} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13.5 }}>{scopedDeals.length === 0 ? (dealsTab === 'mine' ? 'No deals on companies you own yet.' : 'No deals yet.') : 'No deals match your search.'}</td></tr>
            ) : filteredDeals.map((d, i) => (
              <tr key={d.id} style={{ borderBottom: i < filteredDeals.length - 1 ? '1px solid #f4f6f8' : 'none', transition: 'background .1s' }} onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ ...cellTd, color: '#e63329', fontWeight: 600, cursor: 'pointer' }} onClick={() => handleOpenDeal(d)}>{d.title}</td>
                {orderedVisibleFields.map(f => <td key={f.key} style={cellTd}>{renderDealCell(f, d)}</td>)}
                <td style={{ ...cellTd, display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setEditDeal(d)} title="Edit deal" style={{ ...iconBtn, color: '#64748b' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  ><Pencil size={14} /></button>
                  <button
                    onClick={() => handleDelete(d.id)} title="Delete deal" style={{ ...iconBtn, color: '#ef4444' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  ><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

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
