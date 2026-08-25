import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'

// Checkbox-list popover for picking N options from a fixed admin-defined set
// — visually consistent with SearchableSelect, but semantically distinct
// from MultiValueInput (free-typed tags): this picks from a closed list,
// it doesn't let the user type arbitrary values.
export default function MultiSelectDropdown({ value = [], onChange, options, placeholder = 'Select…' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const toggle = (val) => {
    onChange(value.includes(val) ? value.filter(v => v !== val) : [...value, val])
  }

  const selectedLabels = options.filter(o => value.includes(o.value)).map(o => o.label)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: 6, background: '#fff',
          fontSize: 14, color: selectedLabels.length ? '#0f172a' : '#94a3b8', cursor: 'pointer',
          fontFamily: 'DM Sans, system-ui, sans-serif', textAlign: 'left',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabels.length ? selectedLabels.join(', ') : placeholder}
        </span>
        <ChevronDown size={14} color="#64748b" />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 4000,
          background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto',
        }}>
          {options.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No options yet</div>
          ) : options.map(opt => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
              <input type="checkbox" checked={value.includes(opt.value)} onChange={() => toggle(opt.value)} />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
