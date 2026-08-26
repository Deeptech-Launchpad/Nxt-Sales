import { useState, useEffect } from 'react'
import { useDropdownOptions } from '../hooks/useDropdownOptions'
import { formatCurrency } from '../utils/formatCurrency'
import { dealFlagsLabel } from '../utils/dealFlags'

// Deal Stage view for the Deals module. Stages are read live from the
// 'deal.stage' managed dropdown (Settings → Dropdown Lists → Deal Stage) via
// the same useDropdownOptions hook every other dropdown-backed field uses —
// so adding/renaming/reordering/enabling/disabling a stage there updates
// the tab list automatically, with zero stage-specific code needed for that.
//
// Previously this rendered a side-scrolling Kanban board (one column per
// stage, drag-and-drop to move a deal). Replaced with stage tabs + a single
// grid of cards for whichever stage is selected — empty stages no longer
// eat horizontal space, and the filter bar above (Country/Client Type/
// Stage/More filters) narrows this list exactly like it narrows the List
// view, since both read from the same already-filtered `deals` prop.
// Moving a deal between stages is now the per-card "Stage" select instead
// of drag-and-drop.
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
  // somewhere to show up rather than silently vanishing from the view.
  const knownValues = new Set(stages.map(s => s.value))
  const orphanDeals = deals.filter(d => !knownValues.has(d.stage))
  const tabs = [
    ...stages.map(s => ({ key: s.value, label: s.label })),
    ...(orphanDeals.length ? [{ key: '__other__', label: 'Other' }] : []),
  ]

  const dealsForTab = (key) => key === '__other__' ? orphanDeals : deals.filter(d => d.stage === key)

  const [activeStage, setActiveStage] = useState(tabs[0]?.key)
  useEffect(() => {
    if (tabs.length && !tabs.some(t => t.key === activeStage)) setActiveStage(tabs[0].key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.map(t => t.key).join('|')])

  const activeDeals = dealsForTab(activeStage)

  return (
    <div className="deal-stage-view">
      <div className="deal-stage-tabs" role="tablist" aria-label="Deal stage">
        {tabs.map(t => {
          const count = dealsForTab(t.key).length
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={activeStage === t.key}
              className={activeStage === t.key ? 'active' : ''}
              onClick={() => setActiveStage(t.key)}
            >
              {t.label} <span>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="deal-stage-grid">
        {activeDeals.length === 0 ? (
          <div className="deal-stage-empty">No deals in this stage</div>
        ) : activeDeals.map(d => (
          <div key={d.id} className="deal-tab-card" onClick={() => onViewDeal(d)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 650, color: '#0f172a', wordBreak: 'break-word' }}>{d.title}</span>
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

            {isVisible('companyName') && (d.companyName || d.company?.name) && (
              <div style={{ fontSize: 10.5, color: '#667085', marginTop: 5, fontWeight: 500, wordBreak: 'break-word' }}>{d.companyName || d.company?.name}</div>
            )}
            {isVisible('contactPerson') && d.contactPerson && (
              <div style={{ fontSize: 9.5, color: '#98a2b3', marginTop: 2, wordBreak: 'break-word' }}>{d.contactPerson}</div>
            )}
            {isVisible('_flags') && dealFlagsLabel(d) && (
              <span style={{
                display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 700,
                color: '#0d9488', background: '#f0fdfa', border: '1px solid #99f6e4',
                borderRadius: 20, padding: '2px 8px',
              }}>
                {dealFlagsLabel(d)}
              </span>
            )}
            {extraFields.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                {extraFields.map(f => (
                  <div key={f.key} style={{ fontSize: 9.5, color: '#667085', wordBreak: 'break-word' }}>
                    <span style={{ fontWeight: 600, color: '#94a3b8' }}>{f.label}: </span>
                    {renderField ? renderField(f, d) : (d[f.key] ?? '--')}
                  </div>
                ))}
              </div>
            )}
            {(isVisible('value') || isVisible('ownerId')) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 9, paddingTop: 8, borderTop: '1px solid #f4f6f8' }}>
                {isVisible('value') ? (
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: '#344054' }}>{formatCurrency(d.value, d.currency)}</span>
                ) : <span />}
                {isVisible('ownerId') && (
                  <span title="Deal owner" style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#e63329', borderRadius: '50%', width: 21, height: 21, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
}
