import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import api from '../../api/client'
import { useDropdownOptions } from '../../hooks/useDropdownOptions'
import CustomFieldsSection, { extractCustomFieldValues } from '../CustomFieldsSection'
import { DEAL_CURRENCIES } from '../../utils/formatCurrency'
import '../../styles/modal.css'

const emptyForm = {
  title: '', country: '', companyName: '', domainName: '', clientType: '',
  contactPerson: '', contactPhone: '', contactEmail: '', serviceRequirement: '',
  clientWebsiteUrl: '', opportunityType: '', value: '', currency: 'USD', strategicImportance: '',
  expectedOutcome: '', stage: 'Discussion', notes: '', poc: false, proposalShared: false,
}

// Create or edit a deal. Pass `deal` (an existing deal record) to edit it —
// otherwise a new deal is created, optionally pre-linked to a company.
// Persisted via POST/PUT /api/deals so it appears in the global Deals
// dashboard as well as on the linked record.
export default function CreateDealModal({ companyId, deal, onClose, onSaved }) {
  const isEdit = !!deal
  // Country is the same managed list Company uses ('company.country') — it's
  // genuinely one shared set of values, not a separate Deal-only list.
  const { options: countries }            = useDropdownOptions('company.country')
  const { options: dealStages }           = useDropdownOptions('deal.stage')
  const { options: clientTypes }          = useDropdownOptions('deal.clientType')
  const { options: serviceRequirements }  = useDropdownOptions('deal.serviceRequirement')
  const { options: opportunityTypes }     = useDropdownOptions('deal.opportunityType')
  const { options: strategicImportances } = useDropdownOptions('deal.strategicImportance')
  const { options: expectedOutcomes }     = useDropdownOptions('deal.expectedOutcome')
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
    currency:            deal.currency || 'USD',
    strategicImportance: deal.strategicImportance || '',
    expectedOutcome:     deal.expectedOutcome || '',
    stage:               deal.stage || 'Discussion',
    notes:               deal.notes || '',
    poc:                 !!deal.poc,
    proposalShared:      !!deal.proposalShared,
    customFields:        extractCustomFieldValues(deal),
  } : { ...emptyForm, customFields: {} })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Deal Stage has no safe hardcoded default — the Deal Stage list under
  // Settings → Dropdown Lists is fully admin-configurable and might not even
  // include "Discussion" (a renamed/rebuilt stage set, e.g. production using
  // only 4 custom stages). Once the live list loads, swap the placeholder
  // default for the first real stage so a new deal is never silently created
  // with a stage value that doesn't match any actual option.
  useEffect(() => {
    if (!isEdit && dealStages.length > 0 && !dealStages.some(s => s.value === form.stage)) {
      set('stage', dealStages[0].value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealStages])

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
      currency:            form.currency || 'USD',
      strategicImportance: form.strategicImportance || null,
      expectedOutcome:     form.expectedOutcome || null,
      stage:               form.stage,
      notes:               form.notes || null,
      poc:                 form.poc,
      proposalShared:      form.proposalShared,
      customFields:        form.customFields,
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

          {/* Independent of Deal Stage — either, both, or neither can be
              checked; never affects which stage the deal is in. */}
          <div className="form-group" style={{ display: 'flex', gap: 20, flexDirection: 'row', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.poc} onChange={e => set('poc', e.target.checked)} style={{ width: 15, height: 15 }} />
              POC
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.proposalShared} onChange={e => set('proposalShared', e.target.checked)} style={{ width: 15, height: 15 }} />
              Proposal Shared
            </label>
          </div>

          <div className="form-group">
            <label>Country</label>
            <select value={form.country} onChange={e => set('country', e.target.value)}>
              <option value="">Select a country</option>
              {countries.map(c => <option key={c.id} value={c.value}>{c.label}</option>)}
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
              {clientTypes.map(v => <option key={v.id} value={v.value}>{v.label}</option>)}
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
              {serviceRequirements.map(v => <option key={v.id} value={v.value}>{v.label}</option>)}
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
              {opportunityTypes.map(v => <option key={v.id} value={v.value}>{v.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Estimated Deal Value</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" min="0" value={form.value} onChange={e => set('value', e.target.value)} placeholder="0" style={{ flex: 2 }} />
              <select value={form.currency} onChange={e => set('currency', e.target.value)} style={{ flex: 1 }}>
                {DEAL_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Strategic Importance</label>
            <select value={form.strategicImportance} onChange={e => set('strategicImportance', e.target.value)}>
              <option value="">Select strategic importance</option>
              {strategicImportances.map(v => <option key={v.id} value={v.value}>{v.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Expected Outcome</label>
            <select value={form.expectedOutcome} onChange={e => set('expectedOutcome', e.target.value)}>
              <option value="">Select expected outcome</option>
              {expectedOutcomes.map(v => <option key={v.id} value={v.value}>{v.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Deal Stage</label>
            <select value={form.stage} onChange={e => set('stage', e.target.value)}>
              {dealStages.map(s => <option key={s.id} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <CustomFieldsSection
            entity="Deal"
            values={form.customFields}
            onChange={(key, value) => setForm(p => ({ ...p, customFields: { ...p.customFields, [key]: value } }))}
          />

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
