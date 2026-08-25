import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, X } from 'lucide-react'
import '../../styles/filter-dropdown.css'

// Create Date filter.
//
// Extends the original preset-only dropdown rather than sitting beside it as a
// second control: presets ("Last 7 Days") and explicit calendar selections
// (a day, a month, a year, a custom range) are the same filter, so they share
// one button, one URL param and one active state — picking one clears the
// other, which is what users expect from a single "Create date" chip.
//
// The value is always a single string token, matching what the server's
// dateRangeFor()/explicitDateRange() already parse:
//   last_7 | today | ...      relative presets (unchanged)
//   YYYY                      whole year
//   YYYY-MM                   whole month
//   YYYY-MM-DD                single day
//   YYYY-MM-DD..YYYY-MM-DD    inclusive custom range
//
// It is carried in the existing `created` array param (only [0] is ever used),
// so the list, the record count and the export endpoint all pick it up with no
// extra plumbing.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const CURRENT_YEAR = new Date().getFullYear()
// Companies were imported with historical create dates, so the list reaches
// further back than it looks forward.
const YEAR_OPTIONS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR - 10 + i)

const TABS = [
  { key: 'preset', label: 'Presets' },
  { key: 'day',    label: 'Date'    },
  { key: 'month',  label: 'Month'   },
  { key: 'year',   label: 'Year'    },
  { key: 'range',  label: 'Range'   },
]

// Which tab a stored token belongs to — so reopening the dropdown lands on the
// tab the user last used instead of resetting to Presets.
function tabForValue(v) {
  if (!v) return 'preset'
  if (/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(v)) return 'range'
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'day'
  if (/^\d{4}-\d{2}$/.test(v)) return 'month'
  if (/^\d{4}$/.test(v)) return 'year'
  return 'preset'
}

// Human-readable chip label. Falls back to the raw token rather than throwing
// away information if an unrecognised value ever reaches here.
export function describeDateToken(v, presets = []) {
  if (!v) return ''
  const preset = presets.find(p => p.value === v)
  if (preset) return preset.label

  const range = v.match(/^(\d{4})-(\d{2})-(\d{2})\.\.(\d{4})-(\d{2})-(\d{2})$/)
  if (range) {
    const [y1, m1, d1, y2, m2, d2] = range.slice(1).map(Number)
    return `${d1} ${MONTH_NAMES[m1 - 1]?.slice(0, 3)} ${y1} – ${d2} ${MONTH_NAMES[m2 - 1]?.slice(0, 3)} ${y2}`
  }
  const day = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (day) {
    const [y, m, d] = day.slice(1).map(Number)
    return `${d} ${MONTH_NAMES[m - 1]?.slice(0, 3)} ${y}`
  }
  const month = v.match(/^(\d{4})-(\d{2})$/)
  if (month) {
    const [y, m] = month.slice(1).map(Number)
    return `${MONTH_NAMES[m - 1]} ${y}`
  }
  if (/^\d{4}$/.test(v)) return v
  return v
}

export default function DateFilterDropdown({ label = 'Create date', presets = [], value = '', onChange, dayLabel = 'Created on', yearLabel = 'Created during' }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab]   = useState(() => tabForValue(value))
  const ref = useRef(null)

  // Draft state for the range tab — a range is only applied once BOTH ends are
  // chosen, so a half-picked range never fires a query that silently means
  // something different from what the user is mid-way through selecting.
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo]     = useState('')

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // Re-sync the draft range and active tab whenever the applied value changes
  // (including a Clear all from the toolbar, or a back/forward navigation that
  // rewrites the URL param).
  useEffect(() => {
    setTab(tabForValue(value))
    const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/)
    if (m) { setRangeFrom(m[1]); setRangeTo(m[2]) }
    else if (!value) { setRangeFrom(''); setRangeTo('') }
  }, [value])

  const apply = (token) => { onChange(token ? [token] : []); setOpen(false) }
  const clear = () => { onChange([]); setRangeFrom(''); setRangeTo('') }

  const active  = !!value
  const btnText = active ? describeDateToken(value, presets) : label

  // Current selections per tab, derived from the applied token so each tab
  // shows what is actually in effect.
  const dayValue   = tabForValue(value) === 'day' ? value : ''
  const monthValue = tabForValue(value) === 'month' ? value : ''
  const yearValue  = tabForValue(value) === 'year' ? value : ''

  const inputStyle = {
    width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 6,
    fontSize: 12.5, fontFamily: 'inherit', color: '#0f172a', background: '#fff',
  }
  const fieldLabel = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4, letterSpacing: '.02em' }

  return (
    <div className="fdd-wrapper date-filter" ref={ref}>
      <button className={`fdd-btn date-filter-trigger ${active ? 'active' : ''}`} onClick={() => setOpen(o => !o)}>
        <Calendar size={12} style={{ marginRight: 5, flexShrink: 0 }} />
        {btnText}
        {active
          ? <span className="fdd-clear-x" onClick={e => { e.stopPropagation(); clear() }}><X size={11} /></span>
          : <ChevronDown size={12} />
        }
      </button>

      {open && (
        <div className="fdd-panel date-filter-panel">
          {/* Mode tabs */}
          <div className="date-filter-tabs">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={tab === t.key ? 'active' : ''}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="date-filter-content">
            {tab === 'preset' && (
              <div className="fdd-options" style={{ maxHeight: 210 }}>
                {presets.map(p => (
                  <label key={p.value} className="fdd-option">
                    <input type="checkbox" checked={value === p.value} onChange={() => apply(value === p.value ? '' : p.value)} />
                    <span className="fdd-option-label">{p.label}</span>
                  </label>
                ))}
              </div>
            )}

            {tab === 'day' && (
              <div>
                <label style={fieldLabel}>{dayLabel}</label>
                <input
                  type="date"
                  value={dayValue}
                  onChange={e => apply(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {tab === 'month' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={fieldLabel}>Month</label>
                  <select
                    value={monthValue ? Number(monthValue.slice(5, 7)) : ''}
                    onChange={e => {
                      if (!e.target.value) return apply('')
                      const y = monthValue ? monthValue.slice(0, 4) : CURRENT_YEAR
                      apply(`${y}-${String(e.target.value).padStart(2, '0')}`)
                    }}
                    style={inputStyle}
                  >
                    <option value="">Month…</option>
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div style={{ width: 88 }}>
                  <label style={fieldLabel}>Year</label>
                  <select
                    value={monthValue ? monthValue.slice(0, 4) : CURRENT_YEAR}
                    onChange={e => {
                      const mm = monthValue ? monthValue.slice(5, 7) : ''
                      if (mm) apply(`${e.target.value}-${mm}`)
                    }}
                    style={inputStyle}
                  >
                    {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            )}

            {tab === 'year' && (
              <div>
                <label style={fieldLabel}>{yearLabel}</label>
                <select value={yearValue} onChange={e => apply(e.target.value)} style={inputStyle}>
                  <option value="">Year…</option>
                  {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}

            {tab === 'range' && (
              <div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={fieldLabel}>From</label>
                    <input type="date" value={rangeFrom} max={rangeTo || undefined}
                      onChange={e => setRangeFrom(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={fieldLabel}>To</label>
                    <input type="date" value={rangeTo} min={rangeFrom || undefined}
                      onChange={e => setRangeTo(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <button
                  disabled={!rangeFrom || !rangeTo}
                  onClick={() => apply(`${rangeFrom}..${rangeTo}`)}
                  style={{
                    marginTop: 10, width: '100%', padding: '8px 0', borderRadius: 6, border: 'none',
                    fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                    cursor: rangeFrom && rangeTo ? 'pointer' : 'not-allowed',
                    background: rangeFrom && rangeTo ? '#e63329' : '#f1f5f9',
                    color: rangeFrom && rangeTo ? '#fff' : '#94a3b8',
                  }}
                >
                  Apply range
                </button>
              </div>
            )}
          </div>

          {active && (
            <div className="fdd-footer">
              <button className="fdd-clear-all" onClick={clear}>Clear</button>
              <span className="fdd-count-badge">{describeDateToken(value, presets)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
