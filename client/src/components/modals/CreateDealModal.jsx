import { useState } from 'react'
import { X } from 'lucide-react'
import api from '../../api/client'
import {
  COUNTRIES, DEAL_STAGES, CLIENT_TYPES, SERVICE_REQUIREMENTS,
  OPPORTUNITY_TYPES, STRATEGIC_IMPORTANCE, EXPECTED_OUTCOMES,
} from '../../constants/formOptions'
import '../../styles/modal.css'

const emptyForm = {
  title: '', country: '', companyName: '', domainName: '', clientType: '',
  contactPerson: '', contactPhone: '', contactEmail: '', serviceRequirement: '',
  clientWebsiteUrl: '', opportunityType: '', value: '', strategicImportance: '',
  expectedOutcome: '', stage: 'Discussion', closeDate: '', notes: '',
}

// Create or edit a deal. Pass `deal` (an existing deal record) to edit it —
// otherwise a new deal is created, optionally pre-linked to a company.
// Persisted via POST/PUT /api/deals so it appears in the global Deals
// dashboard as well as on the linked record.
export default function CreateDealModal({ companyId, deal, onClose, onSaved }) {
  const isEdit = !!deal
  const [form, setForm] = useState(() => deal ? {
    title:               deal.title || '',
    country:             deal.country || '',
    companyName:         deal.companyName || '',
    domainName:          deal.domainName || '',
    clientType:          deal.clientType || '',
    contactPerson:       deal.contactPerson || '',
    contactPhone:        deal.contactPhone || '',
    contactEmail:        deal.contactEmail || '',
    serviceRequirement:  deal.serviceRequirement || '',
    clientWebsiteUrl:    deal.clientWebsiteUrl || '',
    opportunityType:     deal.opportunityType || '',
    value:               deal.value || '',
    strategicImportance: deal.strategicImportance || '',
    expectedOutcome:     deal.expectedOutcome || '',
    stage:               deal.stage || 'Discussion',
    closeDate:           deal.closeDate ? deal.closeDate.slice(0, 10) : '',
    notes:               deal.notes || '',
  } : emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.title.trim()) { setError('Deal name is required.'); return }
    setSaving(true); setError('')
    const payload = {
      title:               form.title.trim(),
      country:             form.country || null,
      companyName:         form.companyName || null,
      domainName:          form.domainName || null,
      clientType:          form.clientType || null,
      contactPerson:       form.contactPerson || null,
      contactPhone:        form.contactPhone || null,
      contactEmail:        form.contactEmail || null,
      serviceRequirement:  form.serviceRequirement || null,
      clientWebsiteUrl:    form.clientWebsiteUrl || null,
      opportunityType:     form.opportunityType || null,
      value:               form.value ? Number(form.value) : 0,
      strategicImportance: form.strategicImportance || null,
      expectedOutcome:     form.expectedOutcome || null,
      stage:               form.stage,
      closeDate:           form.closeDate || null,
      notes:               form.notes || null,
    }
    try {
      const { data } = isEdit
        ? await api.put(`/deals/${deal.id}`, payload)
        : await api.post('/deals', { ...payload, ...(companyId && { companyId }) })
      onSaved && onSaved(data)
      onClose()
    } catch (e) {
      setError(e?.response?.data?.message || `Failed to ${isEdit ? 'update' : 'create'} deal.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-drawer">
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Deal' : 'Create Deal'}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <div className="form-group required">
            <label>Deal name</label>
            <input type="text" value={form.title} onChange={e => { set('title', e.target.value); setError('') }} autoFocus />
          </div>

          <div className="form-group">
            <label>Country</label>
            <select value={form.country} onChange={e => set('country', e.target.value)}>
              <option value="">Select a country</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Company Name</label>
            <input type="text" value={form.companyName} onChange={e => set('companyName', e.target.value)} />
          </div>

          <div className="form-group">
            <label>Domain Name</label>
            <input type="text" value={form.domainName} onChange={e => set('domainName', e.target.value)} placeholder="example.com" />
          </div>

          <div className="form-group">
            <label>Client Type</label>
            <select value={form.clientType} onChange={e => set('clientType', e.target.value)}>
              <option value="">Select client type</option>
              {CLIENT_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Contact Person</label>
            <input type="text" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} />
          </div>

          <div className="form-group">
            <label>Contact Phone Number</label>
            <input type="text" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} />
          </div>

          <div className="form-group">
            <label>Contact Email</label>
            <input type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} />
          </div>

          <div className="form-group">
            <label>Service Requirements</label>
            <select value={form.serviceRequirement} onChange={e => set('serviceRequirement', e.target.value)}>
              <option value="">Select service requirement</option>
              {SERVICE_REQUIREMENTS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Client Website URL</label>
            <input type="text" value={form.clientWebsiteUrl} onChange={e => set('clientWebsiteUrl', e.target.value)} />
          </div>

          <div className="form-group">
            <label>Opportunity Type</label>
            <select value={form.opportunityType} onChange={e => set('opportunityType', e.target.value)}>
              <option value="">Select opportunity type</option>
              {OPPORTUNITY_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Estimated Deal Value (USD)</label>
            <input type="number" value={form.value} onChange={e => set('value', e.target.value)} placeholder="0" step="0.01" />
          </div>

          <div className="form-group">
            <label>Strategic Importance</label>
            <select value={form.strategicImportance} onChange={e => set('strategicImportance', e.target.value)}>
              <option value="">Select strategic importance</option>
              {STRATEGIC_IMPORTANCE.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Expected Outcome</label>
            <select value={form.expectedOutcome} onChange={e => set('expectedOutcome', e.target.value)}>
              <option value="">Select expected outcome</option>
              {EXPECTED_OUTCOMES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Deal Stage</label>
            <select value={form.stage} onChange={e => set('stage', e.target.value)}>
              {DEAL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Close date</label>
            <input type="date" value={form.closeDate} onChange={e => set('closeDate', e.target.value)} />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0', fontWeight: 500 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-modal-primary" onClick={save} disabled={saving}>
            {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save changes' : 'Create deal')}
          </button>
          <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
