import { useState, useEffect, useRef } from 'react'
import { Upload, ChevronDown } from 'lucide-react'
import { exportCSV, exportXLSX, exportJSON, exportPDF } from '../utils/exportUtils'

// Generic Export dropdown.
//
// The Companies and Deals pages each had their own copy of this menu; this is
// the same UI and the same shared exportUtils helpers, parameterised so Calls,
// Inbox and Tasks don't add three more copies.
//
// `fetchRows` returns the records to export (already flattened for the given
// columns). It is a function rather than a prop array so the caller can fetch
// the FULL filtered dataset from the server at click time instead of exporting
// only the page currently on screen.
export default function DataExportMenu({ fetchRows, columns, filename, title, sheetName }) {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const run = async (fn, extraArgs = []) => {
    setOpen(false); setExporting(true)
    try {
      const rows = await fetchRows()
      fn(rows, filename, columns, ...extraArgs)
    } catch {
      // Export is advisory — a failed fetch simply produces no file, matching
      // the lightweight error handling used elsewhere on these pages.
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={exporting}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 16, fontWeight: 600, color: '#334155', cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
      >
        <Upload size={13} /> {exporting ? 'Exporting…' : 'Export'} <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 3000, minWidth: 170, overflow: 'hidden' }}>
          {[
            { label: 'Export as CSV',   fn: () => run(exportCSV) },
            { label: 'Export as Excel', fn: () => run(exportXLSX, [sheetName || filename]) },
            { label: 'Export as JSON',  fn: () => run(exportJSON) },
            { label: 'Export as PDF',   fn: () => run(exportPDF, [title || `${filename} Export — NXT MarketingWiz`]) },
          ].map(item => (
            <button key={item.label} onClick={item.fn}
              style={{ display: 'block', width: '100%', padding: '9px 14px', border: 'none', background: 'transparent', textAlign: 'left', fontSize: 16, color: '#334155', cursor: 'pointer', fontFamily: 'DM Sans,system-ui,sans-serif' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
