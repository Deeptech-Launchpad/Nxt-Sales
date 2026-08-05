import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import api from '../api/client'

// Server-searched company picker — SearchableSelect.jsx is client-side
// .filter()-only over a pre-supplied options array, which isn't safe here
// (the Companies table has run into the tens of thousands of rows in this
// project before). This debounces a real GET /companies?search= call
// instead, matching Companies.jsx's own established search contract, and
// only ever holds ~20 results in memory at once.
export default function CompanyPicker({ value, label, onChange, placeholder = 'Search for a company…' }) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const handle = setTimeout(() => {
      api.get('/companies', { params: { page: 1, limit: 20, ...(query.trim() && { search: query.trim() }) } })
        .then(r => setResults(r.data.companies || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(handle)
  }, [query, open])

  const pick = (c) => { onChange(c.id, c.name); setOpen(false); setQuery('') }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: 6, background: '#fff',
          fontSize: 14, color: value ? '#0f172a' : '#94a3b8', cursor: 'pointer',
          fontFamily: 'DM Sans, system-ui, sans-serif', textAlign: 'left',
        }}
      >
        <span>{value ? label : placeholder}</span>
        <ChevronDown size={14} color="#64748b" />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 4000,
          background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <Search size={14} color="#94a3b8" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search companies…"
              style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, fontFamily: 'DM Sans, system-ui, sans-serif', color: '#0f172a' }}
            />
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>Searching…</div>
            ) : results.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No companies found</div>
            ) : results.map(c => (
              <div
                key={c.id}
                onClick={() => pick(c)}
                style={{
                  padding: '9px 14px', cursor: 'pointer',
                  background: c.id === value ? '#f0fdf4' : 'transparent',
                  borderLeft: c.id === value ? '3px solid #0d9488' : '3px solid transparent',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (c.id !== value) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (c.id !== value) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{c.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
