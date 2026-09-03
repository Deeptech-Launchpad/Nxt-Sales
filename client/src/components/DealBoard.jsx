import { useDropdownOptions } from '../hooks/useDropdownOptions'
import { formatCurrency } from '../utils/formatCurrency'
import { dealFlagsLabel } from '../utils/dealFlags'

// Kanban board for the Deals module — one column per stage, side by side.
// Stages are read live from the 'deal.stage' managed dropdown (Settings →
// Dropdown Lists → Deal Stage) via the same useDropdownOptions hook every
// other dropdown-backed field uses, so adding/renaming/reordering/enabling/
// disabling a stage there updates the columns automatically, with zero
// board-specific code needed for that. The filter bar above (Country/Client
// Type/Stage/More filters) narrows every column exactly like it narrows the
// List view, since all of them read from the same already-filtered `deals`
// prop. Moving a deal between stages stays the per-card "Stage" select —
// no drag-and-drop here, matching how the rest of the board already works.
const CARD_CHROME_KEYS = new Set(['companyName', 'contactPerson', '_flags', 'value', 'ownerId'])
const MaterialIcon = ({ children }) => <span className="material-symbols-rounded" aria-hidden="true">{children}</span>

export default function DealBoard({ deals, onViewDeal, onEdit, onGoToCompany, onStageChange, getOwnerInitials, visibleFields = [], renderField }) {
  const visibleKeys = new Set(visibleFields.map(f => f.key))
  const isVisible = (key) => visibleKeys.has(key)
  const extraFields = visibleFields.filter(f => !CARD_CHROME_KEYS.has(f.key))
  const { options: stages } = useDropdownOptions('deal.stage')

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

  const dealsForColumn = (key) => key === '__other__' ? orphanDeals : deals.filter(d => d.stage === key)

  return (
    <div className="deal-board-columns">
      {columns.map(col => {
        const colDeals = dealsForColumn(col.key)
        return (
          <div key={col.key} className="deal-board-column">
            <div className="deal-board-column-header">
              <span>{col.label}</span>
              <span className="deal-board-column-count">{colDeals.length}</span>
            </div>
            <div className="deal-board-column-body">
              {colDeals.length === 0 ? (
                <div className="deal-board-column-empty">No deals</div>
              ) : colDeals.map(d => (
          <div key={d.id} className="deal-tab-card" onClick={() => onViewDeal(d)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
              {/* Company name leads the card and carries the weight; the deal name
                  sits under it in regular text. Both are always rendered — the
                  company line only steps aside when the deal genuinely has no
                  company, which is the same fallback as before (nothing shown). */}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                {(d.companyName || d.company?.name) && (
                  <span style={{ fontSize: 14.5, fontWeight: 650, color: '#0f172a', wordBreak: 'break-word' }}>
                    {d.companyName || d.company?.name}
                  </span>
                )}
                <span style={{ fontSize: 14, fontWeight: 450, color: '#28313f', wordBreak: 'break-word' }}>{d.title}</span>
              </span>
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                <button
                  onClick={e => { e.stopPropagation(); if (d.companyId) onGoToCompany(d) }}
                  title={d.companyId ? 'Go to company' : 'No linked company'}
                  disabled={!d.companyId}
                  className="deal-tab-card-icon-btn"
                  style={{ color: d.companyId ? '#94a3b8' : '#e2e8f0', cursor: d.companyId ? 'pointer' : 'not-allowed' }}
                >
                  <MaterialIcon>business</MaterialIcon>
                </button>
                <button onClick={e => { e.stopPropagation(); onEdit(d) }} title="Edit deal" className="deal-tab-card-icon-btn">
                  <MaterialIcon>edit</MaterialIcon>
                </button>
              </div>
            </div>

            {onStageChange && stages.length > 0 && (
              <select
                className="deal-stage-select"
                value={d.stage}
                onClick={e => e.stopPropagation()}
                onChange={e => { e.stopPropagation(); onStageChange(d, e.target.value) }}
                title="Move to a different stage"
              >
                {stages.map(s => <option key={s.id} value={s.value}>{s.label}</option>)}
              </select>
            )}

            {/* The company name moved into the card header above, so it is no
                longer repeated here. */}
            {isVisible('contactPerson') && d.contactPerson && (
              <div style={{ fontSize: 12.5, color: '#475467', marginTop: 2, wordBreak: 'break-word' }}>{d.contactPerson}</div>
            )}
            {isVisible('_flags') && dealFlagsLabel(d) && (
              <span style={{
                display: 'inline-block', marginTop: 6, fontSize: 13, fontWeight: 700,
                color: '#0d9488', background: '#f0fdfa', border: '1px solid #99f6e4',
                borderRadius: 20, padding: '2px 8px',
              }}>
                {dealFlagsLabel(d)}
              </span>
            )}
            {extraFields.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                {extraFields.map(f => (
                  <div key={f.key} style={{ fontSize: 12.5, color: '#344054', wordBreak: 'break-word' }}>
                    <span style={{ fontWeight: 600, color: '#475467' }}>{f.label}: </span>
                    {renderField ? renderField(f, d) : (d[f.key] ?? '--')}
                  </div>
                ))}
              </div>
            )}
            {(isVisible('value') || isVisible('ownerId')) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 9, paddingTop: 8, borderTop: '1px solid #f4f6f8' }}>
                {isVisible('value') ? (
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1d2939' }}>{formatCurrency(d.value, d.currency)}</span>
                ) : <span />}
                {isVisible('ownerId') && (
                  <span title="Deal owner" style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#e63329', borderRadius: '50%', width: 21, height: 21, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
