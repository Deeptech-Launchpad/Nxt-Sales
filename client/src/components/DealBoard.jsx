import { useState } from 'react'
import { Pencil, Building2 } from 'lucide-react'
import { useDropdownOptions } from '../hooks/useDropdownOptions'
import { formatCurrency } from '../utils/formatCurrency'
import { dealFlagsLabel } from '../utils/dealFlags'

// Kanban board for the Deals module. Columns are read live from the
// 'deal.stage' managed dropdown (Settings → Dropdown Lists → Deal Stage) via
// the same useDropdownOptions hook every other dropdown-backed field uses —
// so adding/renaming/reordering/enabling/disabling a stage there updates
// this board automatically, with zero board-specific code needed for that.
// Company/contact/flags/value/owner keep their existing dedicated spots on
// the card (matching the layout before Board Edit Columns existed) — any
// OTHER field a user adds via Edit Columns (Update 9) renders as a plain
// label/value line instead, so the default card looks byte-for-byte the
// same as before and only grows when someone actually opts into more.
const CARD_CHROME_KEYS = new Set(['companyName', 'contactPerson', '_flags', 'value', 'ownerId'])

export default function DealBoard({ deals, onViewDeal, onEdit, onGoToCompany, onStageChange, getOwnerInitials, visibleFields = [], renderField }) {
  const visibleKeys = new Set(visibleFields.map(f => f.key))
  const isVisible = (key) => visibleKeys.has(key)
  const extraFields = visibleFields.filter(f => !CARD_CHROME_KEYS.has(f.key))
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
                  onClick={() => onViewDeal(d)}
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
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); if (d.companyId) onGoToCompany(d) }}
                        title={d.companyId ? 'Go to company' : 'No linked company'}
                        disabled={!d.companyId}
                        style={{ border: 'none', background: 'transparent', cursor: d.companyId ? 'pointer' : 'not-allowed', color: d.companyId ? '#94a3b8' : '#e2e8f0', padding: 3, borderRadius: 5, transition: 'background .12s' }}
                        onMouseEnter={e => { if (d.companyId) e.currentTarget.style.background = '#f1f5f9' }}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Building2 size={12} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); onEdit(d) }}
                        title="Edit deal"
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: 3, borderRadius: 5, transition: 'background .12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <Pencil size={12} />
                      </button>
                    </div>
                  </div>
                  {isVisible('companyName') && (d.companyName || d.company?.name) && (
                    <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 5, fontWeight: 500 }}>{d.companyName || d.company?.name}</div>
                  )}
                  {isVisible('contactPerson') && d.contactPerson && (
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{d.contactPerson}</div>
                  )}
                  {isVisible('_flags') && dealFlagsLabel(d) && (
                    <span style={{
                      display: 'inline-block', marginTop: 6, fontSize: 10.5, fontWeight: 700,
                      color: '#0d9488', background: '#f0fdfa', border: '1px solid #99f6e4',
                      borderRadius: 20, padding: '2px 8px',
                    }}>
                      {dealFlagsLabel(d)}
                    </span>
                  )}
                  {extraFields.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                      {extraFields.map(f => (
                        <div key={f.key} style={{ fontSize: 11.5, color: '#64748b', wordBreak: 'break-word' }}>
                          <span style={{ fontWeight: 600, color: '#94a3b8' }}>{f.label}: </span>
                          {renderField ? renderField(f, d) : (d[f.key] ?? '--')}
                        </div>
                      ))}
                    </div>
                  )}
                  {(isVisible('value') || isVisible('ownerId')) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 9, borderTop: '1px solid #f4f6f8' }}>
                      {isVisible('value') ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{formatCurrency(d.value, d.currency)}</span>
                      ) : <span />}
                      {isVisible('ownerId') && (
                        <span title="Deal owner" style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: '#e63329', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {getOwnerInitials(d)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
