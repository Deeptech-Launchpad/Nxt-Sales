import { useState, useRef, useEffect } from 'react'
import { Search, ChevronDown, X } from 'lucide-react'
import '../../styles/filter-dropdown.css'

export default function FilterDropdown({ label, options = [], selected = [], onChange, searchable = true, singleSelect = false }) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const filtered = options.filter(o =>
    String(o.label).toLowerCase().includes(query.toLowerCase())
  )

  const toggle = (value) => {
    if (singleSelect) {
      onChange(selected.includes(value) ? [] : [value])
      return
    }
    onChange(selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value]
    )
  }

  const btnLabel = selected.length > 0 ? `${label} (${selected.length})` : label

  return (
    <div className="fdd-wrapper" ref={ref}>
      <button className={`fdd-btn ${selected.length > 0 ? 'active' : ''}`} onClick={() => setOpen(o => !o)}>
        {btnLabel}
        {selected.length > 0
          ? <span className="fdd-clear-x" onClick={e => { e.stopPropagation(); onChange([]) }}><X size={11} /></span>
          : <ChevronDown size={12} />
        }
      </button>

      {open && (
        <div className="fdd-panel">
          {searchable && (
            <div className="fdd-search">
              <Search size={13} color="#94a3b8" />
              <input
                type="text"
                placeholder="Search..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="fdd-options">
            {filtered.length === 0
              ? <div className="fdd-empty">No matches</div>
              : filtered.map(opt => (
                <label key={opt.value} className="fdd-option">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                  />
                  <span className="fdd-option-label">{opt.label}</span>
                  {opt.count !== undefined && (
                    <span className="fdd-option-count">{opt.count}</span>
                  )}
                </label>
              ))
            }
          </div>

          {selected.length > 0 && (
            <div className="fdd-footer">
              <button className="fdd-clear-all" onClick={() => onChange([])}>Clear all</button>
              <span className="fdd-count-badge">{selected.length} selected</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
