import { useState, useEffect, useRef } from 'react'
import { Columns } from 'lucide-react'

// Shows every dynamic field as a checkbox; Save updates the visible table
// columns and remembers the choice. Extracted from Companies.jsx (was
// defined locally there) so Deals.jsx's dynamic-columns table can reuse the
// exact same control. `alwaysShownKey` is the one column that's never
// toggleable (Company's own name column, Deal's own title column, etc.) —
// defaults to 'name' to match Companies.jsx's original hardcoded behavior
// exactly, so extracting this introduces zero behavior change there.
export default function EditColumnsMenu({ fields, visibleColumns, onSave, alwaysShownKey = 'name' }) {
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
  const save   = () => { onSave(draft); setOpen(false) }

  const toggleable = fields.filter(f => f.key !== alwaysShownKey)

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn-action btn-sm" onClick={() => setOpen(o => !o)}>
        <Columns size={13} /> Edit columns
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 3000, minWidth: 240, maxHeight: 340, overflowY: 'auto', padding: 8 }}>
          {toggleable.map(f => (
            <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontSize: 13, color: '#334155', cursor: 'pointer', borderRadius: 4 }}>
              <input type="checkbox" checked={draft.includes(f.key)} onChange={() => toggle(f.key)} />
              {f.label}
            </label>
          ))}
          <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 6, paddingTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={save}>Save</button>
          </div>
        </div>
      )}
    </div>
  )
}
