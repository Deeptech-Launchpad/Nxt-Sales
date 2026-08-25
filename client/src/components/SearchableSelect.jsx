import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search } from 'lucide-react'

// Reusable searchable single-select dropdown — extracted from
// CreateCompanyModal.jsx (was defined locally there) so Dynamic Custom
// Fields' dropdown-type inputs can reuse the exact same control instead of
// duplicating it.
export default function SearchableSelect({ value, onChange, options, placeholder = 'Select…', showEmail = false, materialIcons = false }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase()) ||
    (o.email && o.email.toLowerCase().includes(query.toLowerCase()))
  )

  const selected = options.find(o => o.value === value)

  const pick = (val) => { onChange(val); setOpen(false); setQuery('') }

  return (
    <div ref={ref} className="searchable-select" style={{ position: 'relative' }}>
      <button
        className="searchable-select-trigger"
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: 6, background: '#fff',
          fontSize: 14, color: selected ? '#0f172a' : '#94a3b8', cursor: 'pointer',
          fontFamily: 'DM Sans, system-ui, sans-serif', textAlign: 'left',
        }}
      >
        <span>{selected ? selected.label : placeholder}</span>
        {materialIcons ? <span className="material-symbols-rounded" aria-hidden="true">keyboard_arrow_down</span> : <ChevronDown size={14} color="#64748b" />}
      </button>

      {open && (
        <div className="searchable-select-menu" style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 4000,
          background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', overflow: 'hidden',
        }}>
          {/* Search */}
          <div className="searchable-select-search" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
            {materialIcons ? <span className="material-symbols-rounded" aria-hidden="true">search</span> : <Search size={14} color="#94a3b8" />}
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search"
              style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, fontFamily: 'DM Sans, system-ui, sans-serif', color: '#0f172a' }}
            />
          </div>

          {/* Options */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div className="searchable-select-empty" style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No matches</div>
            ) : filtered.map(opt => (
              <div
                className="searchable-select-option"
                key={opt.value}
                onClick={() => pick(opt.value)}
                style={{
                  padding: showEmail ? '8px 14px' : '9px 14px',
                  cursor: 'pointer',
                  background: opt.value === value ? '#f0fdf4' : 'transparent',
                  borderLeft: opt.value === value ? '3px solid #0d9488' : '3px solid transparent',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (opt.value !== value) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (opt.value !== value) e.currentTarget.style.background = 'transparent' }}
              >
                <div className="searchable-select-option-label" style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{opt.label}</div>
                {showEmail && opt.email && (
                  <div className="searchable-select-option-meta" style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{opt.email}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
