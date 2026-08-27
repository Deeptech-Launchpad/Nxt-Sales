import { useState, useEffect, useRef } from 'react'
import '../styles/edit-columns.css'

const MaterialIcon = ({ children }) => <span className="material-symbols-rounded" aria-hidden="true">{children}</span>

// Shows every dynamic field as a checkbox; Save updates the visible table
// columns and remembers the choice. Extracted from Companies.jsx (was
// defined locally there) so Deals.jsx's dynamic-columns table can reuse the
// exact same control. `alwaysShownKey` is the one column that's never
// toggleable (Company's own name column, Deal's own title column, etc.) —
// defaults to 'name' to match Companies.jsx's original hardcoded behavior
// exactly, so extracting this introduces zero behavior change there.
export default function EditColumnsMenu({ fields, visibleColumns, onSave, alwaysShownKey = 'name', defaultColumns }) {
  // Accepts one key or several. Deals pins two columns (Company name, then
  // Deal name), and a pinned column must not also appear as a toggle that
  // does nothing when unticked.
  const alwaysShown = new Set([].concat(alwaysShownKey))
  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState(visibleColumns)
  const ref = useRef(null)

  useEffect(() => { if (open) setDraft(visibleColumns) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const toggle = (key) => setDraft(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const move = (key, direction) => setDraft(prev => {
    const index = prev.indexOf(key); const target = index + direction
    if (index < 0 || target < 0 || target >= prev.length) return prev
    const next = [...prev]; [next[index], next[target]] = [next[target], next[index]]; return next
  })
  const save   = () => { onSave(draft); setOpen(false) }

  const toggleable = fields.filter(f => !alwaysShown.has(f.key))
  const orderedToggleable = [
    ...draft.map(key => toggleable.find(f => f.key === key)).filter(Boolean),
    ...toggleable.filter(f => !draft.includes(f.key)),
  ]

  return (
    <div className="columns-control" ref={ref}>
      <button className="columns-trigger" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <MaterialIcon>view_column</MaterialIcon> Columns
      </button>
      {open && (
        <div className="columns-panel">
          <div className="columns-panel-head"><div><strong>Table columns</strong><span>Show, hide, or reorder fields</span></div><button onClick={() => setOpen(false)} aria-label="Close"><MaterialIcon>close</MaterialIcon></button></div>
          <div className="columns-list">
          {orderedToggleable.map(f => {
            const selectedIndex = draft.indexOf(f.key)
            return <div className={`columns-row${selectedIndex >= 0 ? ' selected' : ''}`} key={f.key}>
              <MaterialIcon>drag_indicator</MaterialIcon>
              <label>
              <input type="checkbox" checked={draft.includes(f.key)} onChange={() => toggle(f.key)} />
              <span>{f.label}</span>
              </label>
              {selectedIndex >= 0 && <span className="columns-order-actions"><button disabled={selectedIndex === 0} onClick={() => move(f.key, -1)} aria-label={`Move ${f.label} up`}><MaterialIcon>arrow_upward</MaterialIcon></button><button disabled={selectedIndex === draft.length - 1} onClick={() => move(f.key, 1)} aria-label={`Move ${f.label} down`}><MaterialIcon>arrow_downward</MaterialIcon></button></span>}
            </div>
          })}
          </div>
          <div className="columns-footer">
            {defaultColumns && <button className="columns-reset" onClick={() => setDraft(defaultColumns)}><MaterialIcon>restart_alt</MaterialIcon> Restore default</button>}
            <button className="columns-save" onClick={save}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}
