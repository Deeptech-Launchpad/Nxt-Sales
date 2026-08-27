import { useState, useRef, useEffect } from 'react'
import { AlertCircle, CheckCircle, FileText } from 'lucide-react'
import { buildTemplateFromFields, parseRawFile, mapRowsToFields } from '../../utils/exportUtils'
import api from '../../api/client'
import { useDropdownOptions } from '../../hooks/useDropdownOptions'
import '../../styles/modal.css'

const STEPS = ['Upload File', 'Preview & Map', 'Import']

const MaterialIcon = ({ children }) => (
  <span className="material-symbols-rounded" aria-hidden="true">{children}</span>
)

const FALLBACK_DEAL_IMPORT_FIELDS = [
  { key: 'title', label: 'Deal Name' },
  { key: 'companyName', label: 'Company Name' },
  { key: 'domainName', label: 'Domain Name' },
  { key: 'country', label: 'Country' },
  { key: 'clientType', label: 'Client Type' },
  { key: 'contactPerson', label: 'Contact Person' },
  { key: 'contactPhone', label: 'Contact Phone Number' },
  { key: 'contactEmail', label: 'Contact Email' },
  { key: 'serviceRequirement', label: 'Service Requirements' },
  { key: 'clientWebsiteUrl', label: 'Client Website URL' },
  { key: 'opportunityType', label: 'Opportunity Type' },
  { key: 'value', label: 'Estimated Deal Value' },
  { key: 'currency', label: 'Currency' },
  { key: 'strategicImportance', label: 'Strategic Importance' },
  { key: 'expectedOutcome', label: 'Expected Outcome' },
  { key: 'stage', label: 'Deal Stage' },
  { key: 'poc', label: 'POC' },
  { key: 'proposalShared', label: 'Proposal Shared' },
  { key: 'notes', label: 'Notes' },
]

const DEAL_TEMPLATE_HEADER_ALIASES = {
  dealname:              'Deal Name',
  dealtitle:             'Deal Name',
  title:                 'Deal Name',
  name:                  'Deal Name',
  deal:                  'Deal Name',
  companyname:           'Company Name',
  company:               'Company Name',
  organization:          'Company Name',
  domainname:            'Domain Name',
  domain:                'Domain Name',
  companyurl:            'Domain Name',
  website:               'Domain Name',
  country:               'Country',
  countryoforigin:       'Country',
  clienttype:            'Client Type',
  type:                  'Client Type',
  contactperson:         'Contact Person',
  contactname:           'Contact Person',
  contact:               'Contact Person',
  contactphonenumber:    'Contact Phone Number',
  contactphone:          'Contact Phone Number',
  phone:                 'Contact Phone Number',
  phonenumber:           'Contact Phone Number',
  cophoneno:             'Contact Phone Number',
  contactemail:          'Contact Email',
  email:                 'Contact Email',
  servicerequirements:   'Service Requirements',
  servicerequirement:    'Service Requirements',
  services:              'Service Requirements',
  clientwebsiteurl:      'Client Website URL',
  clientwebsite:         'Client Website URL',
  websiteurl:            'Client Website URL',
  opportunitytype:       'Opportunity Type',
  opportunity:           'Opportunity Type',
  estimateddealvalue:    'Estimated Deal Value',
  dealvalue:             'Estimated Deal Value',
  value:                 'Estimated Deal Value',
  amount:                'Estimated Deal Value',
  currency:              'Currency',
  strategicimportance:   'Strategic Importance',
  expectedoutcome:       'Expected Outcome',
  dealstage:             'Deal Stage',
  stage:                 'Deal Stage',
  status:                'Deal Stage',
  poc:                   'POC',
  ispoc:                 'POC',
  proposalshared:        'Proposal Shared',
  isproposalshared:      'Proposal Shared',
  pocreceiveddate:       'POC Received Date',
  pocdelivereddate:      'POC Delivered Date',
  notes:                 'Notes',
  description:           'Notes',
  remarks:               'Notes',
  remark:                'Notes',
}

function normalizeTemplateHeader(h) {
  return String(h || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()
}

function remapDealTemplateHeaders(raw) {
  return raw.map(row => {
    const out = {}
    for (const [k, v] of Object.entries(row)) {
      const normalized = normalizeTemplateHeader(k)
      const alias = DEAL_TEMPLATE_HEADER_ALIASES[normalized]
      const target = alias || k
      if (out[target] === undefined || out[target] === '' || (v !== undefined && v !== null && String(v).trim() !== '')) {
        out[target] = v
      }
    }
    return out
  })
}

const DEAL_IMPORT_TEMPLATE_COLUMNS = [
  { label: 'Deal Name', key: 'title' },
  { label: 'Company Name', key: 'companyName' },
  { label: 'Country', key: 'country' },
  { label: 'Domain Name', key: 'domainName' },
  { label: 'Client Type', key: 'clientType' },
  { label: 'Contact Person', key: 'contactPerson' },
  { label: 'Contact Phone Number', key: 'contactPhone' },
  { label: 'Contact Email', key: 'contactEmail' },
  { label: 'Service Requirements', key: 'serviceRequirement' },
  { label: 'Opportunity Type', key: 'opportunityType' },
  { label: 'Estimated Deal Value', key: 'value' },
  { label: 'Currency', key: 'currency' },
  { label: 'Strategic Importance', key: 'strategicImportance' },
  { label: 'Expected Outcome', key: 'expectedOutcome' },
  { label: 'Deal Stage', key: 'stage' },
  { label: 'POC', key: 'poc' },
  { label: 'Proposal Shared', key: 'proposalShared' },
  { label: 'Notes', key: 'notes' },
]

export default function DealImportModal({ isOpen, onClose, onSuccess }) {
  const { options: countryOptions } = useDropdownOptions('company.country')
  const { options: clientTypeOptions } = useDropdownOptions('deal.clientType')
  const { options: stageOptions } = useDropdownOptions('deal.stage')
  const { options: opportunityOptions } = useDropdownOptions('deal.opportunityType')

  const [step, setStep] = useState(0)
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [fields, setFields] = useState(FALLBACK_DEAL_IMPORT_FIELDS)
  const [requiredKey, setRequiredKey] = useState('title')

  const [dupInfo, setDupInfo] = useState([])
  const [selectedForRemoval, setSelectedForRemoval] = useState(new Set())
  const inputRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    api.get('/deals/import-fields')
      .then(r => {
        if (r.data.fields?.length) setFields(r.data.fields)
        setRequiredKey(r.data.requiredKey || 'title')
      })
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
      const remappedRaw = remapDealTemplateHeaders(raw)
      const mapped = mapRowsToFields(remappedRaw, fields)
      setRows(mapped)

      try {
        const { data } = await api.post('/deals/check-duplicates', { deals: mapped })
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

  const toggleRemoval = (i) => {
    setSelectedForRemoval(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const skipAllDuplicates = () => {
    const dupIndices = dupInfo.map((r, i) => (r?.isDuplicate ? i : null)).filter(i => i !== null)
    setSelectedForRemoval(new Set(dupIndices))
  }

  const removeSelectedDuplicates = () => {
    setRows(prev => prev.filter((_, i) => !selectedForRemoval.has(i)))
    setDupInfo(prev => prev.filter((_, i) => !selectedForRemoval.has(i)))
    setSelectedForRemoval(new Set())
  }

  const validRows = rows.filter((r, i) => r[requiredKey] && !selectedForRemoval.has(i))
  const missingRows = rows.filter(r => !r[requiredKey]).length
  const duplicateCount = dupInfo.filter(r => r?.isDuplicate).length

  const handleImport = async () => {
    if (validRows.length === 0) {
      setError(`No valid rows to import. Row requires '${requiredKey}'.`)
      return
    }
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/deals/bulk', { deals: validRows })
      setResult(data)
      setStep(2)
      if (onSuccess) onSuccess(data)
    } catch (e) {
      setError(e.response?.data?.message || 'Import failed. Please check server logs.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay import-modal-overlay" onClick={e => { if (e.target === e.currentTarget) { reset(); onClose() } }}>
      <div className={`modal-drawer import-deals-modal${step === 1 ? ' preview-mode' : ''}`} role="dialog" aria-modal="true" aria-labelledby="import-deals-title">

        <div className="modal-header import-modal-header">
          <div className="import-modal-heading">
            <span className="import-modal-heading-icon"><MaterialIcon>upload_file</MaterialIcon></span>
            <h2 id="import-deals-title" style={{ margin: 0 }}>Import Deals</h2>
          </div>
          <div className="import-stepper" style={{ display: 'flex', gap: 16, marginTop: 6 }}>
            {STEPS.map((s, i) => (
              <span key={s} className={`${i === step ? 'active' : ''}${i < step ? ' complete' : ''}`} style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 4,
                color: i === step ? '#071b52' : 'rgba(7,27,82,0.55)', fontWeight: i === step ? 700 : 400 }}>
                <b>{i < step ? <MaterialIcon>check</MaterialIcon> : i + 1}</b>{s}
                {i < STEPS.length - 1 && <MaterialIcon>chevron_right</MaterialIcon>}
              </span>
            ))}
          </div>
          <button className="modal-close" aria-label="Close" onClick={() => { reset(); onClose() }}><MaterialIcon>close</MaterialIcon></button>
        </div>

        <div className="modal-body import-modal-body">

          {/* ── STEP 0: Upload ── */}
          {step === 0 && (
            <div className="import-upload-step">
              <div className="import-template-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <div className="import-template-copy">
                  <span className="import-template-icon"><MaterialIcon>description</MaterialIcon></span>
                  <div>
                    <p style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 600, color: '#0f172a' }}>Download a sample template first:</p>
                    <p style={{ margin: '10px 0 0', fontSize: 14, color: '#475467' }}>Template columns are generated from current deal fields.</p>
                  </div>
                </div>
                <div className="import-template-actions" style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => buildTemplateFromFields(DEAL_IMPORT_TEMPLATE_COLUMNS, 'csv', 'nxt_deals_import_template')} className="btn-modal-secondary" style={{ fontSize: 15, padding: '6px 12px' }}>
                    <MaterialIcon>download</MaterialIcon> CSV Template
                  </button>
                  <button onClick={() => buildTemplateFromFields(DEAL_IMPORT_TEMPLATE_COLUMNS, 'xlsx', 'nxt_deals_import_template')} className="btn-modal-secondary" style={{ fontSize: 15, padding: '6px 12px' }}>
                    <MaterialIcon>download</MaterialIcon> Excel Template
                  </button>
                </div>
              </div>

              <div
                className={`import-dropzone${dragging ? ' dragging' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                  e.preventDefault(); setDragging(false)
                  const f = e.dataTransfer.files[0]
                  if (f) handleFile(f)
                }}
                onClick={() => inputRef.current?.click()}
                style={{ border: `2px dashed ${dragging ? '#ef1b16' : '#cbd5e1'}`, borderRadius: 8, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', background: dragging ? '#fff1f0' : '#f8fafc', transition: 'all .15s' }}
              >
                <span className="import-upload-icon"><MaterialIcon>upload_file</MaterialIcon></span>
                <p style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 600, color: '#334155' }}>
                  Drag &amp; drop your file here, or <span style={{ color: '#ef1b16' }}>browse</span>
                </p>
                <p style={{ margin: 0, fontSize: 15, color: '#475467' }}>Supported: .CSV, .XLSX (max 5MB)</p>
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
              </div>

              {loading && <p className="import-loading" style={{ textAlign: 'center', color: '#344054', fontSize: 16, marginTop: 16 }}>Parsing file...</p>}
              {error && (
                <div className="import-error" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, marginTop: 16 }}>
                  <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 16, color: '#991b1b' }}>{error}</span>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 1: Preview ── */}
          {step === 1 && (
            <div className="import-preview-step">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <FileText size={16} color="#64748b" />
                <span style={{ fontSize: 16, color: '#344054' }}>
                  <strong style={{ color: '#0f172a' }}>{file?.name}</strong> — {rows.length} records found
                </span>
              </div>

              {missingRows > 0 && (
                <div style={{ display: 'flex', gap: 8, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 10, marginBottom: 14, fontSize: 15, color: '#92400e' }}>
                  <AlertCircle size={14} color="#d97706" style={{ flexShrink: 0 }} />
                  {missingRows} row(s) are missing a required deal title and will be skipped.
                </div>
              )}

              {duplicateCount > 0 && (
                <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 6, padding: 10, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: '#854d0e', marginBottom: 8 }}>
                    <AlertCircle size={14} color="#ca8a04" style={{ flexShrink: 0 }} />
                    {duplicateCount} row(s) match an existing deal title — highlighted below.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-modal-secondary" style={{ fontSize: 15, padding: '5px 10px' }} onClick={skipAllDuplicates}>
                      Skip all duplicates
                    </button>
                    <button
                      type="button"
                      className="btn-modal-secondary"
                      style={{ fontSize: 15, padding: '5px 10px' }}
                      onClick={removeSelectedDuplicates}
                      disabled={selectedForRemoval.size === 0}
                    >
                      Remove selected ({selectedForRemoval.size})
                    </button>
                  </div>
                </div>
              )}

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, maxHeight: 360 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15 }}>
                  <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                    <tr>
                      {duplicateCount > 0 && (
                        <th style={{ padding: '8px 6px', borderBottom: '1px solid #e2e8f0', width: 30 }} />
                      )}
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#344054', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>#</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#344054', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                        Deal Name<span style={{ color: '#ef4444' }}>*</span>
                      </th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#344054', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Company</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#344054', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Country</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#344054', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Contact Person</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#344054', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Stage</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', color: '#344054', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Value</th>
                      {duplicateCount > 0 && (
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: '#344054', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Status</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => {
                      const isDup = dupInfo[idx]?.isDuplicate
                      const isMissingTitle = !r.title
                      const isRemoved = selectedForRemoval.has(idx)

                      return (
                        <tr key={idx} style={{
                          background: isRemoved ? '#f1f5f9' : isMissingTitle ? '#fef2f2' : isDup ? '#fefce8' : 'transparent',
                          opacity: isRemoved ? 0.45 : 1,
                          borderBottom: '1px solid #f1f5f9'
                        }}>
                          {duplicateCount > 0 && (
                            <td style={{ padding: '6px', textAlign: 'center' }}>
                              {isDup && (
                                <input
                                  type="checkbox"
                                  checked={selectedForRemoval.has(idx)}
                                  onChange={() => toggleRemoval(idx)}
                                />
                              )}
                            </td>
                          )}
                          <td style={{ padding: '6px 10px', color: '#475467' }}>{idx + 1}</td>
                          <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f172a' }}>{r.title || <span style={{ color: '#ef4444' }}>Missing</span>}</td>
                          <td style={{ padding: '6px 10px' }}>{r.companyName || '--'}</td>
                          <td style={{ padding: '6px 10px' }}>{r.country || '--'}</td>
                          <td style={{ padding: '6px 10px' }}>{r.contactPerson || '--'}</td>
                          <td style={{ padding: '6px 10px' }}>{r.stage || 'Discussion'}</td>
                          <td style={{ padding: '6px 10px' }}>{r.value ? `${r.currency || '$'}${r.value}` : '--'}</td>
                          {duplicateCount > 0 && (
                            <td style={{ padding: '6px 10px', fontSize: 14, color: isDup ? '#ca8a04' : '#16a34a' }}>
                              {isDup ? (selectedForRemoval.has(idx) ? 'Skipped' : 'Duplicate') : 'Ready'}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── STEP 2: Result ── */}
          {step === 2 && result && (
            <div className="import-result-step" style={{ textAlign: 'center', padding: '20px 0' }}>
              <CheckCircle size={48} color="#16a34a" style={{ marginBottom: 16 }} />
              <h3 style={{ fontSize: 21, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Import Complete</h3>
              <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: 24 }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{result.created}</div>
                  <div style={{ fontSize: 15, color: '#344054' }}>Deals created</div>
                </div>
                {result.failed > 0 && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#ef4444' }}>{result.failed}</div>
                    <div style={{ fontSize: 15, color: '#344054' }}>Failed</div>
                  </div>
                )}
              </div>
              {result.messages?.length > 0 && (
                <div style={{ textAlign: 'left', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: 12, fontSize: 15, color: '#1e40af', maxHeight: 120, overflowY: 'auto', marginBottom: result.errors?.length > 0 ? 10 : 0 }}>
                  {result.messages.map((m, i) => <div key={i}>{m}</div>)}
                </div>
              )}
              {result.errors?.length > 0 && (
                <div style={{ textAlign: 'left', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, fontSize: 15, color: '#991b1b', maxHeight: 120, overflowY: 'auto' }}>
                  {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer import-modal-footer">
          {step === 0 && (
            <button className="btn-modal-cancel" onClick={() => { reset(); onClose() }}>Cancel</button>
          )}
          {step === 1 && (
            <>
              <button className="btn-modal-secondary" onClick={() => { setStep(0); setRows([]); setError('') }}>← Back</button>
              <button className="btn-modal-primary" onClick={handleImport} disabled={loading || validRows.length === 0}>
                {loading ? 'Importing...' : `Import ${validRows.length} deal${validRows.length === 1 ? '' : 's'}`}
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
