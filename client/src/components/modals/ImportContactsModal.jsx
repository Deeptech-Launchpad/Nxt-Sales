import { useState, useRef } from 'react'
import { X, Upload, Download, CheckCircle, AlertCircle, FileText, ChevronRight } from 'lucide-react'
import { parseImportFile, downloadTemplate } from '../../utils/exportUtils'
import api from '../../api/client'
import '../../styles/modal.css'

const STEPS = ['Upload File', 'Preview & Map', 'Import']

export default function ImportContactsModal({ isOpen, onClose, onSuccess }) {
  const [step, setStep]         = useState(0)
  const [file, setFile]         = useState(null)
  const [rows, setRows]         = useState([])
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const reset = () => { setStep(0); setFile(null); setRows([]); setError(''); setResult(null) }

  const handleFile = async (f) => {
    setError('')
    setFile(f)
    setLoading(true)
    try {
      const parsed = await parseImportFile(f)
      if (parsed.length === 0) throw new Error('No data rows found in file.')
      setRows(parsed)
      setStep(1)
    } catch (e) {
      setError(e.message || 'Failed to parse file.')
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleImport = async () => {
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/contacts/bulk', { contacts: rows })
      setResult(data)
      setStep(2)
      if (onSuccess) onSuccess()
    } catch (e) {
      setError(e.response?.data?.message || 'Import failed.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const PREVIEW_COLS = ['firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle', 'lifecycleStage', 'leadStatus']
  const COL_LABELS   = { firstName: 'First Name', lastName: 'Last Name', email: 'Email', phone: 'Phone', company: 'Company', jobTitle: 'Job Title', lifecycleStage: 'Lifecycle Stage', leadStatus: 'Lead Status' }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { reset(); onClose() } }}>
      <div className="modal-drawer" style={{ width: step === 1 ? 700 : 520 }}>

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>Import Contacts</h2>
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
              {STEPS.map((s, i) => (
                <span key={s} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                  color: i === step ? '#fff' : 'rgba(255,255,255,0.55)', fontWeight: i === step ? 700 : 400 }}>
                  {i < step && <CheckCircle size={12} />}
                  {i + 1}. {s}
                  {i < STEPS.length - 1 && <ChevronRight size={11} />}
                </span>
              ))}
            </div>
          </div>
          <button className="modal-close" onClick={() => { reset(); onClose() }}><X size={20} /></button>
        </div>

        <div className="modal-body">

          {/* ── STEP 0: Upload ── */}
          {step === 0 && (
            <div>
              {/* Template downloads */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Download a sample template first:</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => downloadTemplate('csv')}  className="btn-modal-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>
                    <Download size={13} /> CSV Template
                  </button>
                  <button onClick={() => downloadTemplate('xlsx')} className="btn-modal-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>
                    <Download size={13} /> Excel Template
                  </button>
                </div>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? '#3b82f6' : '#cbd5e1'}`,
                  borderRadius: 8,
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragging ? '#eff6ff' : '#f8fafc',
                  transition: 'all .15s'
                }}
              >
                <Upload size={32} color={dragging ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: 12 }} />
                <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#334155' }}>
                  Drag & drop your file here, or <span style={{ color: '#3b82f6' }}>browse</span>
                </p>
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Supported: .CSV, .XLSX (max 5MB)</p>
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
              </div>

              {loading && <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13, marginTop: 16 }}>Parsing file...</p>}
              {error  && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, marginTop: 16 }}>
                  <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 13, color: '#991b1b' }}>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 1: Preview ── */}
          {step === 1 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <FileText size={16} color="#64748b" />
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  <strong style={{ color: '#0f172a' }}>{file?.name}</strong> — {rows.length} records found
                </span>
              </div>

              {/* Validation warnings */}
              {rows.some(r => !r.email) && (
                <div style={{ display: 'flex', gap: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 10, marginBottom: 14, fontSize: 12, color: '#92400e' }}>
                  <AlertCircle size={14} color="#d97706" style={{ flexShrink: 0 }} />
                  {rows.filter(r => !r.email).length} row(s) are missing an email and will be skipped.
                </div>
              )}

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, maxHeight: 360 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>#</th>
                      {PREVIEW_COLS.map(c => (
                        <th key={c} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                          {COL_LABELS[c]}
                          {c === 'email' && <span style={{ color: '#ef4444' }}>*</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: !r.email ? '#fef2f2' : 'transparent' }}>
                        <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{i + 1}</td>
                        {PREVIEW_COLS.map(c => (
                          <td key={c} style={{ padding: '7px 10px', color: c === 'email' && !r[c] ? '#ef4444' : '#334155', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r[c] || (c === 'email' ? '⚠ missing' : <span style={{ color: '#cbd5e1' }}>--</span>)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error && (
                <div style={{ display: 'flex', gap: 8, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 10, marginTop: 12, fontSize: 12, color: '#991b1b' }}>
                  <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0 }} /> {error}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Result ── */}
          {step === 2 && result && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <CheckCircle size={48} color="#16a34a" style={{ marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Import Complete</h3>
              <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: 24 }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{result.created}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Contacts created</div>
                </div>
                {result.failed > 0 && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>{result.failed}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Failed</div>
                  </div>
                )}
              </div>
              {result.errors?.length > 0 && (
                <div style={{ textAlign: 'left', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, fontSize: 12, color: '#991b1b', maxHeight: 120, overflowY: 'auto' }}>
                  {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {step === 0 && (
            <button className="btn-modal-cancel" onClick={() => { reset(); onClose() }}>Cancel</button>
          )}
          {step === 1 && (
            <>
              <button className="btn-modal-secondary" onClick={() => { setStep(0); setRows([]); setError('') }}>← Back</button>
              <button className="btn-modal-primary" onClick={handleImport} disabled={loading || rows.filter(r => r.email).length === 0}>
                {loading ? 'Importing...' : `Import ${rows.filter(r => r.email).length} contacts`}
              </button>
              <button className="btn-modal-cancel" onClick={() => { reset(); onClose() }}>Cancel</button>
            </>
          )}
          {step === 2 && (
            <button className="btn-modal-primary" onClick={() => { reset(); onClose() }}>Done</button>
          )}
        </div>
      </div>
    </div>
  )
}
