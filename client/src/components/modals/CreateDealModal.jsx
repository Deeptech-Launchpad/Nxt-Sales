import { useState, useEffect, useRef } from 'react'
import api from '../../api/client'
import { useDropdownOptions } from '../../hooks/useDropdownOptions'
import SearchableSelect from '../SearchableSelect'
import CustomFieldsSection, { extractCustomFieldValues } from '../CustomFieldsSection'
import { DEAL_CURRENCIES } from '../../utils/formatCurrency'
import '../../styles/modal.css'

const MaterialIcon = ({ children }) => (
  <span className="material-symbols-rounded" aria-hidden="true">{children}</span>
)

const emptyForm = {
  title: '', country: '', companyName: '', domainName: '', clientType: '',
  contactPerson: '', contactPhone: '', contactEmail: '', serviceRequirement: '',
  clientWebsiteUrl: '', opportunityType: '', value: '', currency: 'USD', strategicImportance: '',
  expectedOutcome: '', stage: 'Discussion', notes: '', poc: false, proposalShared: false,
  pocReceivedDate: '', pocDeliveredDate: '', openDate: '',
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
    pocReceivedDate:     deal.pocReceivedDate ? String(deal.pocReceivedDate).slice(0, 10) : '',
    pocDeliveredDate:    deal.pocDeliveredDate ? String(deal.pocDeliveredDate).slice(0, 10) : '',
    openDate:            deal.openDate ? String(deal.openDate).slice(0, 10) : '',
    customFields:        extractCustomFieldValues(deal),
  } : { ...emptyForm, customFields: {} })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // See CreateCompanyModal.jsx for why this exists — the overlay must only
  // close when BOTH mousedown and the resulting click land directly on it,
  // otherwise a mouse-drag text selection that starts inside the drawer and
  // releases past its edge closes the modal mid-copy.
  const mouseDownOnOverlay = useRef(false)

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

  // A saved deal's clientType can end up pointing at a value that's since
  // been renamed/removed from the deal.clientType dropdown (Settings →
  // Dropdown Lists) — the native <select> then silently shows some OTHER
  // option as "selected" while form.clientType still (correctly) holds the
  // real saved value underneath. That's actively misleading (the modal
  // looks like it has a different Client Type than what's really stored)
  // and risky (saving without ever touching this field would still send
  // the true stored value, but re-picking the same visually-shown-but-wrong
  // option would silently overwrite it). Inject the stale value as its own
  // option so what's shown always matches what's actually saved; it drops
  // out on its own once a real option is chosen.
  const clientTypeOptions = (form.clientType && !clientTypes.some(o => o.value === form.clientType))
    ? [{ id: '_stale_clientType', value: form.clientType, label: `${form.clientType} (no longer in list)` }, ...clientTypes]
    : clientTypes

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
      pocReceivedDate:     form.pocReceivedDate || null,
      pocDeliveredDate:    form.pocDeliveredDate || null,
      openDate:            form.openDate || null,
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

  const withPlaceholder = (label, options) => [{ value: '', label }, ...options.map(o => ({ value: o.value, label: o.label }))]
  const countryOptions            = withPlaceholder('Select a country', countries)
  const clientTypeSelectOptions   = withPlaceholder('Select client type', clientTypeOptions)
  const serviceReqOptions         = withPlaceholder('Select service requirement', serviceRequirements)
  const opportunityTypeOptions    = withPlaceholder('Select opportunity type', opportunityTypes)
  const strategicImportanceOptions = withPlaceholder('Select strategic importance', strategicImportances)
  const expectedOutcomeOptions    = withPlaceholder('Select expected outcome', expectedOutcomes)
  const stageOptions              = dealStages.map(s => ({ value: s.value, label: s.label }))

  return (
    <div
      className="modal-overlay company-modal-overlay"
      onMouseDown={e => { mouseDownOnOverlay.current = e.target === e.currentTarget }}
      onClick={e => {
        if (mouseDownOnOverlay.current && e.target === e.currentTarget) onClose()
        mouseDownOnOverlay.current = false
      }}
    >
      <div className="modal-drawer company-create-modal deal-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-deal-title">
        <div className="modal-header company-modal-header">
          <div className="company-modal-title">
            <span className="company-modal-title-icon"><MaterialIcon>handshake</MaterialIcon></span>
            <div>
              <h2 id="create-deal-title">{isEdit ? 'Edit Deal' : 'Create Deal'}</h2>
              <p>{isEdit ? 'Update this deal\'s details' : 'Add a deal to your sales pipeline'}</p>
            </div>
          </div>
          <button className="modal-close" aria-label="Close" onClick={onClose}>
            <MaterialIcon>close</MaterialIcon>
          </button>
        </div>

        <div className="modal-body company-modal-body">
          <section className="company-form-section">
            <div className="company-form-section-head">
              <MaterialIcon>sell</MaterialIcon>
              <div><h3>Deal Details</h3><p>Core deal and company information</p></div>
            </div>
            <div className="company-form-grid">
              <div className="form-group required field-span-2">
                <label><MaterialIcon>work</MaterialIcon>Deal name</label>
                <input type="text" value={form.title} onChange={e => { set('title', e.target.value); setError('') }} autoFocus />
              </div>
              <div className="form-group">
                <label><MaterialIcon>business</MaterialIcon>Company Name</label>
                <input type="text" value={form.companyName} onChange={e => set('companyName', e.target.value)} />
              </div>
              <div className="form-group">
                <label><MaterialIcon>language</MaterialIcon>Domain Name</label>
                <input type="text" value={form.domainName} onChange={e => set('domainName', e.target.value)} placeholder="example.com" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>link</MaterialIcon>Client Website URL</label>
                <input type="text" value={form.clientWebsiteUrl} onChange={e => set('clientWebsiteUrl', e.target.value)} />
              </div>
              <div className="form-group">
                <label><MaterialIcon>public</MaterialIcon>Country</label>
                <SearchableSelect materialIcons value={form.country} onChange={v => set('country', v)} options={countryOptions} placeholder="Select a country" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>category</MaterialIcon>Client Type</label>
                <SearchableSelect materialIcons value={form.clientType} onChange={v => set('clientType', v)} options={clientTypeSelectOptions} placeholder="Select client type" />
              </div>
            </div>
          </section>

          <section className="company-form-section">
            <div className="company-form-section-head">
              <MaterialIcon>contact_mail</MaterialIcon>
              <div><h3>Contact Information</h3><p>Primary contact at the client</p></div>
            </div>
            <div className="company-form-grid">
              <div className="form-group">
                <label><MaterialIcon>person</MaterialIcon>Contact Person</label>
                <input type="text" value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} />
              </div>
              <div className="form-group">
                <label><MaterialIcon>phone</MaterialIcon>Contact Phone Number</label>
                <input type="text" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} />
              </div>
              <div className="form-group field-span-2">
                <label><MaterialIcon>mail</MaterialIcon>Contact Email</label>
                <input type="email" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} />
              </div>
            </div>
          </section>

          <section className="company-form-section">
            <div className="company-form-section-head">
              <MaterialIcon>timeline</MaterialIcon>
              <div><h3>Pipeline &amp; Status</h3><p>Stage, opportunity and deal value</p></div>
            </div>
            <div className="company-form-grid">
              <div className="form-group">
                <label><MaterialIcon>route</MaterialIcon>Deal Stage</label>
                <SearchableSelect materialIcons value={form.stage} onChange={v => set('stage', v)} options={stageOptions} placeholder="Select a stage" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>bolt</MaterialIcon>Opportunity Type</label>
                <SearchableSelect materialIcons value={form.opportunityType} onChange={v => set('opportunityType', v)} options={opportunityTypeOptions} placeholder="Select opportunity type" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>handyman</MaterialIcon>Service Requirements</label>
                <SearchableSelect materialIcons value={form.serviceRequirement} onChange={v => set('serviceRequirement', v)} options={serviceReqOptions} placeholder="Select service requirement" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>flag</MaterialIcon>Strategic Importance</label>
                <SearchableSelect materialIcons value={form.strategicImportance} onChange={v => set('strategicImportance', v)} options={strategicImportanceOptions} placeholder="Select strategic importance" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>insights</MaterialIcon>Expected Outcome</label>
                <SearchableSelect materialIcons value={form.expectedOutcome} onChange={v => set('expectedOutcome', v)} options={expectedOutcomeOptions} placeholder="Select expected outcome" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>payments</MaterialIcon>Estimated Deal Value</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" min="0" value={form.value} onChange={e => set('value', e.target.value)} placeholder="0" style={{ flex: 2 }} />
                  <select className="deal-currency-select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                    {DEAL_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <section className="company-form-section">
            <div className="company-form-section-head">
              <MaterialIcon>fact_check</MaterialIcon>
              <div><h3>Tracking &amp; Notes</h3><p>POC milestones and internal notes</p></div>
            </div>
            <div className="company-form-grid">
              {/* Independent of Deal Stage — either, both, or neither can be
                  checked; never affects which stage the deal is in. */}
              <div className="form-group field-span-2 deal-checkbox-row">
                <label>
                  <input type="checkbox" checked={form.poc} onChange={e => set('poc', e.target.checked)} />
                  POC
                </label>
                <label>
                  <input type="checkbox" checked={form.proposalShared} onChange={e => set('proposalShared', e.target.checked)} />
                  Proposal Shared
                </label>
              </div>
              <div className="form-group">
                <label><MaterialIcon>event</MaterialIcon>POC Received Date</label>
                <input type="date" value={form.pocReceivedDate} onChange={e => set('pocReceivedDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label><MaterialIcon>event_available</MaterialIcon>POC Delivered Date</label>
                <input type="date" value={form.pocDeliveredDate} onChange={e => set('pocDeliveredDate', e.target.value)} />
              </div>
              <div className="form-group">
                <label><MaterialIcon>calendar_today</MaterialIcon>Deal Open Date</label>
                <input type="date" value={form.openDate} onChange={e => set('openDate', e.target.value)} />
              </div>
              <div className="form-group field-span-2">
                <label><MaterialIcon>notes</MaterialIcon>Notes</label>
                <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
              <div className="company-modal-custom field-span-2">
                <CustomFieldsSection
                  entity="Deal"
                  values={form.customFields}
                  onChange={(key, value) => setForm(p => ({ ...p, customFields: { ...p.customFields, [key]: value } }))}
                />
              </div>
            </div>
          </section>

          {error && <p className="company-modal-error"><MaterialIcon>error</MaterialIcon>{error}</p>}
        </div>

        <div className="modal-footer company-modal-footer">
          <button className="btn-modal-primary" onClick={save} disabled={saving}>
            <MaterialIcon>{isEdit ? 'save' : 'add'}</MaterialIcon>{saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save changes' : 'Create deal')}
          </button>
          <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
