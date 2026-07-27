import { useState, useRef, useEffect } from 'react'
import { X, Upload, Download, CheckCircle, AlertCircle, FileText, ChevronRight } from 'lucide-react'
import { buildTemplateFromFields, parseRawFile, mapRowsToFields } from '../../utils/exportUtils'
import api from '../../api/client'
import '../../styles/modal.css'

const STEPS = ['Upload File', 'Preview & Map', 'Import']

// Exact-header aliases for the standard Company bulk-import template. The
// spreadsheet's literal headers ("Co. Phone no.", "Company - Url", etc.) are
// deliberately different from the friendlier UI labels used for table columns
// and the Create/Edit forms ("Phone Number", "Company URL") — this maps the
// template's exact text to our internal field labels so mapRowsToFields'
// label matching resolves them, without changing those UI-facing labels.
// "S No" has no matching field and is intentionally left out (ignored on import).
// "Lead Owner" also has no matching dynamic field — it's not a free-text array,
// it resolves to the single ownerId dropdown (matched by name server-side), so
// it's extracted as a raw column below, same as "Task".
// Keys are in NORMALIZED form (see normalizeTemplateHeader) — punctuation and
// spacing are stripped, so "Co. Phone no.", "Co Phone No" and "co-phone-no"
// all resolve to the same entry. Real-world spreadsheets rarely reproduce the
// template's punctuation exactly, and an unrecognised header silently imports
// as blank, so matching is deliberately forgiving here.
const COMPANY_TEMPLATE_HEADER_ALIASES = {
  companyname:      'Company Name',
  industry:         'Industry',
  country:          'Country of Origin',
  countryoforigin:  'Country of Origin',
  companyurl:       'Company URL',
  website:          'Company URL',
  endpdpurl:        'End PDP URL',
  pdpurl:           'End PDP URL',
  email:            'Email',
  cophoneno:        'Phone Number',
  phonenumber:      'Phone Number',
  phone:            'Phone Number',
  contactperson:    'Contact Person',
  linkedprofile:    'Linked Profile',
  linkedinprofile:  'Linked Profile',
  cms:              'CMS',
  remarks:          'Remarks',
  remark:           'Remarks',
  notes:            'Notes',
  leadstatus:       'Lead Status',
}

// Strip a trailing "(...)" annotation (e.g. "Remarks (Static / Less data /
// Partnership)" → "Remarks"), then reduce to lowercase alphanumerics so
// differences in spacing, dots and dashes never break a match.
function normalizeTemplateHeader(h) {
  return String(h || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()
}

// Rewrite a parsed row's keys from the template's exact headers to our
// internal field labels, so the generic mapRowsToFields matching (which
// compares against field.label) resolves every column correctly.
function remapCompanyTemplateHeaders(raw) {
  return raw.map(row => {
    const out = {}
    for (const [k, v] of Object.entries(row)) {
      const alias = COMPANY_TEMPLATE_HEADER_ALIASES[normalizeTemplateHeader(k)]
      out[alias || k] = v
    }
    return out
  })
}

// "Task" and "Lead Owner" have no matching entry in the dynamic `fields` list
// (Task becomes an Activity record like Notes; Lead Owner resolves to the
// single ownerId dropdown by name-matching server-side) — extract their raw
// text directly from the parsed file by normalized header name.
function extractRawColumn(raw, normalizedHeaderName) {
  return raw.map(row => {
    const key = Object.keys(row).find(k => normalizeTemplateHeader(k) === normalizedHeaderName)
    return key ? String(row[key] || '').trim() : ''
  })
}

// The Company import template is a FIXED, hand-designed business document —
// exactly these 15 columns, in this exact order and text — completely
// decoupled from the full Company schema (which the Create/Edit form and
// Edit Columns selector still expose in full). This is what "Download
// Template" generates and what the Preview & Map step displays; it is NOT
// derived from the dynamic /companies/import-fields list. `key: null` means
// the column isn't persisted (S No is a spreadsheet artifact only).
const COMPANY_IMPORT_TEMPLATE_COLUMNS = [
  { header: 'S No',                                              key: null },
  { header: 'Industry',                                          key: 'industry' },
  { header: 'Country',                                           key: 'country' },
  { header: 'Company Name',                                      key: 'name' },
  { header: 'Remarks (Static / Less data / Partnership)',        key: 'remarks' },
  { header: 'Company - Url',                                     key: 'domain' },
  { header: 'END- PDP - URL',                                    key: 'endPdpUrl' },
  { header: 'Email',                                             key: 'email' },
  { header: 'Co. Phone no.',                                     key: 'phone' },
  { header: 'Contact Person',                                    key: 'contactPersons' },
  { header: 'Lead Owner',                                        key: 'leadOwnerName' },
  { header: 'Linked Profile',                                    key: 'linkedProfiles' },
  { header: 'CMS',                                                key: 'cms' },
  { header: 'Notes',                                             key: 'notes' },
  { header: 'Task',                                              key: 'task' },
]

// Company bulk-import modal — talks to GET /api/companies/import-fields and
// POST /api/companies/bulk.
export default function ImportModal({ isOpen, onClose, onSuccess }) {
  const [step, setStep]         = useState(0)
  const [file, setFile]         = useState(null)
  const [rows, setRows]         = useState([])
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [dragging, setDragging] = useState(false)
  const [fields, setFields]           = useState([])
  const [requiredKey, setRequiredKey] = useState('email')
  const inputRef = useRef(null)

  // Duplicate preview (Part B). dupInfo is parallel to rows:
  // dupInfo[i] = { isDuplicate, existing } or undefined before checked.
  const [dupInfo, setDupInfo]                   = useState([])
  const [selectedForRemoval, setSelectedForRemoval] = useState(new Set())

  // Fetch the (dynamic) import fields when opened
  useEffect(() => {
    if (!isOpen) return
    api.get('/companies/import-fields')
      .then(r => { setFields(r.data.fields || []); setRequiredKey(r.data.requiredKey || 'email') })
      .catch(() => {})
  }, [isOpen])

  const reset = () => {
    setStep(0); setFile(null); setRows([]); setError(''); setResult(null)
    setDupInfo([]); setSelectedForRemoval(new Set())
  }

  const handleFile = async (f) => {
    setError(''); setFile(f); setLoading(true)
    try {
      const raw = await parseRawFile(f)
      if (raw.length === 0) throw new Error('No data rows found in file.')
      const normalizedRaw = remapCompanyTemplateHeaders(raw)
      const mapped = mapRowsToFields(normalizedRaw, fields)

      // An unrecognised column imports as blank with no visible sign, which is
      // hard to spot when only one or two fields are affected. Report the
      // headers that resolved to no field so a mismatch is diagnosable.
      const knownLabels = new Set(fields.map(f => f.label.toLowerCase()))
      const knownKeys   = new Set(fields.map(f => f.key.toLowerCase()))
      const ignoredHeaders = Object.keys(normalizedRaw[0] || {}).filter(h => {
        const n = normalizeTemplateHeader(h)
        return !knownLabels.has(h.toLowerCase().trim()) && !knownKeys.has(h.toLowerCase().trim())
          && !['sno', 'task', 'leadowner'].includes(n)
      })
      if (ignoredHeaders.length) {
        console.warn('[Import] These columns matched no Company field and were imported as blank:', ignoredHeaders)
        console.warn('[Import] Recognised field labels:', fields.map(f => f.label))
      }
      // Needles are in normalized form ("lead owner" → "leadowner").
      const taskValues = extractRawColumn(raw, 'task')
      const leadOwnerValues = extractRawColumn(raw, 'leadowner')
      mapped.forEach((r, i) => { r.task = taskValues[i]; r.leadOwnerName = leadOwnerValues[i] })
      setRows(mapped)

      // Preview duplicates before anything is imported. Failure here is
      // non-fatal — it just means no duplicate preview, the import itself
      // still works exactly as before.
      try {
        const { data } = await api.post('/companies/check-duplicates', { companies: mapped })
        const info = data.results || []
        setDupInfo(info)
        setSelectedForRemoval(new Set(info.map((r, i) => (r.isDuplicate ? i : null)).filter(i => i !== null)))
      } catch {
        setDupInfo([]); setSelectedForRemoval(new Set())
      }

      setStep(1)
    } catch (e) {
      setError(e.message || 'Failed to parse file.')
    } finally {
      setLoading(false)
    }
  }

  // Duplicate-row actions ─────────────────────────────────────────────────
  const toggleRemoval = (i) => {
    setSelectedForRemoval(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const skipAllDuplicates = () => {
    setSelectedForRemoval(new Set(dupInfo.map((r, i) => (r.isDuplicate ? i : null)).filter(i => i !== null)))
  }

  const removeSelectedDuplicates = () => {
    setRows(prev => prev.filter((_, i) => !selectedForRemoval.has(i)))
    setDupInfo(prev => prev.filter((_, i) => !selectedForRemoval.has(i)))
    setSelectedForRemoval(new Set())
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleImport = async () => {
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/companies/bulk', { companies: rows })
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

  const validRows      = rows.filter(r => r[requiredKey])
  const missingRows    = rows.length - validRows.length
  // The downloadable template is the fixed 15-column business document, not
  // the full dynamic Company field list.
  const templateFields = COMPANY_IMPORT_TEMPLATE_COLUMNS.map(c => ({ label: c.header }))
  // Preview the fixed 15-column business template (not an arbitrary slice of
  // the full Company schema).
  const previewCols    = COMPANY_IMPORT_TEMPLATE_COLUMNS.filter(c => c.key).map(c => ({ key: c.key, label: c.header }))
  const duplicateCount = dupInfo.filter(d => d?.isDuplicate).length

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { reset(); onClose() } }}>
      <div className="modal-drawer" style={{ width: step === 1 ? 760 : 520 }}>

        <div className="modal-header">
          <div>
            <h2 style={{ margin: 0 }}>Import Companies</h2>
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
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Download a sample template first:</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => buildTemplateFromFields(templateFields, 'csv',  'companies_import_template')} className="btn-modal-secondary" style={{ fontSize: 12, padding: '6px 12px' }} disabled={!templateFields.length}>
                    <Download size={13} /> CSV Template
                  </button>
                  <button onClick={() => buildTemplateFromFields(templateFields, 'xlsx', 'companies_import_template')} className="btn-modal-secondary" style={{ fontSize: 12, padding: '6px 12px' }} disabled={!templateFields.length}>
                    <Download size={13} /> Excel Template
                  </button>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 11, color: '#94a3b8' }}>Template columns are generated from the current company fields.</p>
              </div>

              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                style={{ border: `2px dashed ${dragging ? '#3b82f6' : '#cbd5e1'}`, borderRadius: 8, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', background: dragging ? '#eff6ff' : '#f8fafc', transition: 'all .15s' }}
              >
                <Upload size={32} color={dragging ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: 12 }} />
                <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: '#334155' }}>
                  Drag &amp; drop your file here, or <span style={{ color: '#3b82f6' }}>browse</span>
                </p>
                <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Supported: .CSV, .XLSX (max 5MB)</p>
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
              </div>

              {loading && <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13, marginTop: 16 }}>Parsing file...</p>}
              {error && (
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

              {missingRows > 0 && (
                <div style={{ display: 'flex', gap: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 10, marginBottom: 14, fontSize: 12, color: '#92400e' }}>
                  <AlertCircle size={14} color="#d97706" style={{ flexShrink: 0 }} />
                  {missingRows} row(s) are missing a required {requiredKey} and will be skipped.
                </div>
              )}

              {duplicateCount > 0 && (
                <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 6, padding: 10, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#854d0e', marginBottom: 8 }}>
                    <AlertCircle size={14} color="#ca8a04" style={{ flexShrink: 0 }} />
                    {duplicateCount} row(s) match an existing company (by name, email, phone, or company URL) — highlighted below.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-modal-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={skipAllDuplicates}>
                      Skip all duplicates
                    </button>
                    <button
                      type="button"
                      className="btn-modal-secondary"
                      style={{ fontSize: 12, padding: '5px 10px' }}
                      onClick={removeSelectedDuplicates}
                      disabled={selectedForRemoval.size === 0}
                    >
                      Remove selected ({selectedForRemoval.size})
                    </button>
                  </div>
                </div>
              )}

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, maxHeight: 360 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                    <tr>
                      {duplicateCount > 0 && (
                        <th style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', width: 30 }} />
                      )}
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>#</th>
                      {previewCols.map(f => (
                        <th key={f.key} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                          {f.label}{f.key === requiredKey && <span style={{ color: '#ef4444' }}>*</span>}
                        </th>
                      ))}
                      {duplicateCount > 0 && (
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Status</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const dup = dupInfo[i]
                      const rowBg = !r[requiredKey] ? '#fef2f2' : (dup?.isDuplicate ? '#fefce8' : 'transparent')
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: rowBg }}>
                          {duplicateCount > 0 && (
                            <td style={{ padding: '7px 6px', textAlign: 'center' }}>
                              {dup?.isDuplicate && (
                                <input
                                  type="checkbox"
                                  checked={selectedForRemoval.has(i)}
                                  onChange={() => toggleRemoval(i)}
                                  title="Select to remove this duplicate row"
                                />
                              )}
                            </td>
                          )}
                          <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{i + 1}</td>
                          {previewCols.map(f => (
                            <td key={f.key} style={{ padding: '7px 10px', color: f.key === requiredKey && !r[f.key] ? '#ef4444' : '#334155', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r[f.key] || (f.key === requiredKey ? '⚠ missing' : <span style={{ color: '#cbd5e1' }}>--</span>)}
                            </td>
                          ))}
                          {duplicateCount > 0 && (
                            <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                              {dup?.isDuplicate && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#a16207' }}>
                                  Duplicate of {dup.existing?.name}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
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
                  <div style={{ fontSize: 12, color: '#64748b' }}>Companies created</div>
                </div>
                {result.updated > 0 && (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb' }}>{result.updated}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Fields updated</div>
                  </div>
                )}
                {result.unchanged > 0 && (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#64748b' }}>{result.unchanged}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Matched existing (no changes)</div>
                  </div>
                )}
                {result.failed > 0 && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>{result.failed}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Failed</div>
                  </div>
                )}
              </div>
              {result.messages?.length > 0 && (
                <div style={{ textAlign: 'left', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: 12, fontSize: 12, color: '#1e40af', maxHeight: 120, overflowY: 'auto', marginBottom: result.errors?.length > 0 ? 10 : 0 }}>
                  {result.messages.map((m, i) => <div key={i}>{m}</div>)}
                </div>
              )}
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
              <button className="btn-modal-primary" onClick={handleImport} disabled={loading || validRows.length === 0}>
                {loading ? 'Importing...' : `Import ${validRows.length} compan${validRows.length === 1 ? 'y' : 'ies'}`}
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
