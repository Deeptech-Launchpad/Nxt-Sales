import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { useDropdownOptions } from '../hooks/useDropdownOptions'
import { formatCurrency } from '../utils/formatCurrency'

// Kanban board for the Deals module. Columns are read live from the
// 'deal.stage' managed dropdown (Settings → Dropdown Lists → Deal Stage) via
// the same useDropdownOptions hook every other dropdown-backed field uses —
// so adding/renaming/reordering/enabling/disabling a stage there updates
// this board automatically, with zero board-specific code needed for that.
export default function DealBoard({ deals, onCardClick, onEdit, onStageChange, ownerInitials }) {
  const { options: stages } = useDropdownOptions('deal.stage')
  const [dragDealId, setDragDealId] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)

  // A deal's stored stage can point at a value that's since been disabled or
  // deleted from the dropdown (same "stale reference" possibility every other
  // dropdown-backed field already has to tolerate) — those deals still need
  // somewhere to show up rather than silently vanishing from the board.
  const knownValues = new Set(stages.map(s => s.value))
  const orphanDeals = deals.filter(d => !knownValues.has(d.stage))
  const columns = [
    ...stages.map(s => ({ key: s.value, label: s.label })),
    ...(orphanDeals.length ? [{ key: '__other__', label: 'Other' }] : []),
  ]

  const dealsForColumn = (colKey) => colKey === '__other__'
    ? orphanDeals
    : deals.filter(d => d.stage === colKey)

  const handleDrop = (e, colKey) => {
    e.preventDefault()
    setDragOverStage(null)
    if (colKey === '__other__' || !dragDealId) { setDragDealId(null); return }
    const deal = deals.find(d => d.id === dragDealId)
    setDragDealId(null)
    if (!deal || deal.stage === colKey) return
    onStageChange(deal, colKey)
  }

  return (
    <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 10, alignItems: 'flex-start' }}>
      {columns.map(col => {
        const colDeals = dealsForColumn(col.key)
        const isOver = dragOverStage === col.key
        return (
          <div
            key={col.key}
            onDragOver={e => { e.preventDefault(); if (col.key !== '__other__') setDragOverStage(col.key) }}
            onDragLeave={() => setDragOverStage(prev => (prev === col.key ? null : prev))}
            onDrop={e => handleDrop(e, col.key)}
            style={{
              flex: '0 0 288px', background: isOver ? '#fef2f1' : '#f8fafc', border: `1px solid ${isOver ? '#f3b3ae' : '#eef1f5'}`,
              borderRadius: 12, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 260px)', transition: 'background .12s, border-color .12s',
            }}
          >
            <div style={{ padding: '13px 14px', borderBottom: '1px solid #eef1f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '.5px' }}>{col.label}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', background: '#fff', border: '1px solid #eef1f5', borderRadius: 20, padding: '2px 9px' }}>{colDeals.length}</span>
            </div>

            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
              {colDeals.length === 0 && (
                <p style={{ fontSize: 12.5, color: '#cbd5e1', textAlign: 'center', padding: '16px 4px' }}>No deals</p>
              )}
              {colDeals.map(d => (
                <div
                  key={d.id}
                  draggable
                  onDragStart={() => setDragDealId(d.id)}
                  onDragEnd={() => { setDragDealId(null); setDragOverStage(null) }}
                  onClick={() => onCardClick(d)}
                  onMouseEnter={e => { if (dragDealId !== d.id) { e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.10)'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.05)'; e.currentTarget.style.transform = 'translateY(0)' }}
                  style={{
                    background: '#fff', border: '1px solid #eef1f5', borderRadius: 10, padding: 12,
                    cursor: dragDealId === d.id ? 'grabbing' : 'pointer', opacity: dragDealId === d.id ? 0.5 : 1,
                    boxShadow: '0 1px 2px rgba(15,23,42,0.05)', transition: 'box-shadow .12s, transform .12s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#0f172a', wordBreak: 'break-word' }}>{d.title}</span>
                    <button
                      onClick={e => { e.stopPropagation(); onEdit(d) }}
                      title="Edit deal"
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', flexShrink: 0, padding: 3, borderRadius: 5, transition: 'background .12s' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                  {(d.companyName || d.company?.name) && (
                    <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 5, fontWeight: 500 }}>{d.companyName || d.company?.name}</div>
                  )}
                  {d.contactPerson && (
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{d.contactPerson}</div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 9, borderTop: '1px solid #f4f6f8' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{formatCurrency(d.value, d.currency)}</span>
                    <span title="Deal owner" style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: '#e63329', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {ownerInitials}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
