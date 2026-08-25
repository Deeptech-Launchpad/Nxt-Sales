import { useState, useEffect, useRef } from 'react'
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from 'lucide-react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import api from '../../api/client'

// Generic bulk import modal.
//
// One implementation shared by Deals, Calls, Inbox and Tasks — papaparse for CSV,
// SheetJS for Excel, and the caller's own /import-fields endpoint for the
// column map, so each module maps to its real fields with no per-module UI.
// It is deliberately a separate component rather than a generalised one:
// ImportModal carries Company-only behaviour (a fixed hand-designed template,
// header aliasing, and a duplicate pre-check) that does not apply to Deals,
// and folding both into one component would put that Company logic at risk.
//
// Deals have no natural duplicate key, so every row is created — see the note
// on POST /api/deals/bulk.

const OVERLAY = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: 20,
}
const SHEET = {
  background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640,
  maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  boxShadow: '0 20px 50px rgba(15,23,42,.25)',
}

export default function DataImportModal({
  isOpen, onClose, onSuccess,
  entityLabel = 'Records', fieldsUrl, importUrl, payloadKey, templateName,
}) {
  const [fields, setFields]   = useState([])
  const [rows, setRows]       = useState([])
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult]   = useState(null)
  const [error, setError]     = useState('')
  const [ignored, setIgnored] = useState([])
  const inputRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    setRows([]); setFileName(''); setResult(null); setError(''); setIgnored([])
    api.get(fieldsUrl)
      .then(r => setFields(r.data.fields || []))
      .catch(() => setError(`Could not load the ${entityLabel} field list.`))
  }, [isOpen])

  if (!isOpen) return null

  // Header -> field key, matched case/space-insensitively against both the
  // field's label and its key, so "Client Type", "clientType" and "client type"
  // all resolve to the same field.
  const norm = (s) => String(s || '').toLowerCase().replace(/[\s_-]+/g, '')
  const fieldByHeader = (header) => {
    const h = norm(header)
    return fields.find(f => norm(f.label) === h || norm(f.key) === h) || null
  }

  const mapRows = (raw) => {
    const unmatched = new Set()
    const mapped = raw.map(r => {
      const out = {}
      for (const [header, value] of Object.entries(r)) {
        const f = fieldByHeader(header)
        if (!f) { if (String(header).trim()) unmatched.add(header); continue }
        out[f.key] = typeof value === 'string' ? value.trim() : value
      }
      return out
    }).filter(r => Object.values(r).some(v => v !== '' && v !== null && v !== undefined))
    setIgnored([...unmatched])
    return mapped
  }

  const handleFile = (file) => {
    if (!file) return
    setParsing(true); setError(''); setResult(null); setFileName(file.name)
    const finish = (raw) => {
      try {
        setRows(mapRows(raw))
      } catch (e) {
        setError('Could not read that file: ' + e.message)
      } finally {
        setParsing(false)
      }
    }

    if (/\.csv$/i.test(file.name)) {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: (res) => finish(res.data),
        error: (e) => { setError('CSV parse failed: ' + e.message); setParsing(false) },
      })
    } else {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' })
          finish(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }))
        } catch (err) {
          setError('Excel parse failed: ' + err.message); setParsing(false)
        }
      }
      reader.readAsArrayBuffer(file)
    }
  }

  // Blank template with one header per importable Deal field — the reliable
  // way to get column names exactly right.
  const downloadTemplate = () => {
    const headers = fields.map(f => f.label)
    const ws = XLSX.utils.aoa_to_sheet([headers])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, entityLabel)
    XLSX.writeFile(wb, `${templateName || entityLabel.toLowerCase().replace(/\s+/g, '-')}-import-template.xlsx`)
  }

  const runImport = async () => {
    if (!rows.length) return
    setImporting(true); setError('')
    try {
      const { data } = await api.post(importUrl, { [payloadKey]: rows })
      setResult(data)
      if (data.created > 0) onSuccess?.()
    } catch (e) {
      setError(e?.response?.data?.message || 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={OVERLAY} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={SHEET}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', borderBottom: '1px solid #eef1f5' }}>
          <FileSpreadsheet size={18} color="#3b82f6" />
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Import {entityLabel}</h2>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
          <button
            onClick={downloadTemplate}
            disabled={!fields.length}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: '8px 13px', fontSize: 13, fontWeight: 600, color: '#334155', cursor: fields.length ? 'pointer' : 'not-allowed', fontFamily: 'inherit', marginBottom: 16 }}
          >
            <Download size={13} /> Download template
          </button>

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]) }}
            style={{ border: '2px dashed #cbd5e1', borderRadius: 10, padding: '26px 18px', textAlign: 'center', cursor: 'pointer', background: '#fafbfc' }}
          >
            <Upload size={22} color="#94a3b8" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13.5, color: '#334155', fontWeight: 600 }}>
              {fileName || 'Click to choose a CSV or Excel file'}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>.csv, .xlsx or .xls</div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </div>

          {parsing && <p style={{ fontSize: 13, color: '#64748b', marginTop: 12 }}>Reading file…</p>}

          {rows.length > 0 && !result && (
            <div style={{ marginTop: 14, fontSize: 13, color: '#334155' }}>
              <strong>{rows.length}</strong> row{rows.length === 1 ? '' : 's'} ready to import.
              {ignored.length > 0 && (
                <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '8px 11px', marginTop: 10 }}>
                  These columns matched no {entityLabel} field and will be ignored: {ignored.join(', ')}
                </div>
              )}
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '9px 12px', marginTop: 12 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{error}</span>
            </div>
          )}

          {result && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '10px 12px' }}>
                <CheckCircle2 size={15} />
                <span><strong>{result.created}</strong> record{result.created === 1 ? '' : 's'} imported{result.failed ? `, ${result.failed} failed` : ''}.</span>
              </div>
              {result.errors?.length > 0 && (
                <div style={{ marginTop: 10, maxHeight: 160, overflowY: 'auto', fontSize: 12, color: '#7c2d12', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '9px 11px' }}>
                  {result.errors.map((e, i) => <div key={i} style={{ padding: '2px 0' }}>{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid #eef1f5' }}>
          <button onClick={onClose} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, color: '#334155', cursor: 'pointer', fontFamily: 'inherit' }}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={runImport}
              disabled={!rows.length || importing}
              style={{ border: 'none', background: rows.length && !importing ? '#e63329' : '#e2e8f0', color: rows.length && !importing ? '#fff' : '#94a3b8', borderRadius: 8, padding: '9px 18px', fontSize: 13.5, fontWeight: 600, cursor: rows.length && !importing ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
            >
              {importing ? 'Importing…' : `Import ${rows.length || ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
