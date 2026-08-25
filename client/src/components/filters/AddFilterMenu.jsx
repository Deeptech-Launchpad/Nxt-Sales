import { useState, useEffect, useRef } from 'react'
import { Plus } from 'lucide-react'

// "+" button that lets the user pick which OPTIONAL filters are shown in the
// toolbar (e.g. Industry, Country) — same draft/Save/close-on-outside-click
// pattern as EditColumnsMenu, so choosing filters feels identical to
// choosing table columns. `fields` is [{key,label}]; `activeKeys` is the
// currently-shown optional filter keys; onSave receives the new key list.
export default function AddFilterMenu({ fields, activeKeys, onSave }) {
  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState(activeKeys)
  const ref = useRef(null)

  useEffect(() => { if (open) setDraft(activeKeys) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const toggle = (key) => setDraft(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const save   = () => { onSave(draft); setOpen(false) }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="filter-chip chip-icon" title="Add filter" onClick={() => setOpen(o => !o)}>
        <Plus size={13} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 3000, minWidth: 200, padding: 8 }}>
          {fields.map(f => (
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
