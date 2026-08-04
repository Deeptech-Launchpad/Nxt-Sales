import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useDropdownOptions } from '../../hooks/useDropdownOptions'
import MultiValueInput from '../MultiValueInput'
import EmailConflictWarning from '../EmailConflictWarning'
import SearchableSelect from '../SearchableSelect'
import CustomFieldsSection from '../CustomFieldsSection'
import { cleanList } from '../../utils/multiValue'
import '../../styles/modal.css'

// ── Main Modal ────────────────────────────────────────────
const EMPTY = {
  name: '', emails: [''], phones: [''],
  industry: '', ownerId: '', leadStatus: '',
  domain: '', country: '',
  endPdpUrl: '', cms: '', remarks: '',
  contactPersons: [''], linkedProfiles: [''],
  customFields: {},
}

export default function CreateCompanyModal({ isOpen, onClose, onSave }) {
  const { user }    = useAuth()
  const { options: industries }  = useDropdownOptions('company.industry')
  const { options: countries }   = useDropdownOptions('company.country')
  const { options: leadStatuses } = useDropdownOptions('company.leadStatus')
  const { options: ownerDropdownOptions } = useDropdownOptions('company.ownerId')
  const [form, setForm]       = useState(EMPTY)
  const [users, setUsers]     = useState([]) // kept only for email lookup (SearchableSelect's secondary line/search)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [duplicate, setDuplicate] = useState(null) // { id, name }

  // Fetch users from DB on open — email enrichment only; the owner list
  // itself (value/label/order) now comes from Settings → Dropdown Lists.
  useEffect(() => {
    if (!isOpen) return
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
  }, [isOpen])

  // Default ownerId to current logged-in user once Lead Owner options load
  useEffect(() => {
    if (ownerDropdownOptions.length > 0 && !form.ownerId && user?.id) {
      setForm(p => ({ ...p, ownerId: user.id }))
    }
  }, [ownerDropdownOptions, user])

  const emailByUserId = new Map(users.map(u => [u.id, u.email]))
  const ownerOptions = [
    // ownerDropdownOptions already starts with the permanent "Unassigned"
    // entry (value: '') injected by GET /api/dropdowns/company.ownerId.
    ...ownerDropdownOptions.map(o => ({ value: o.value, label: o.label, email: emailByUserId.get(o.value) || '' })),
  ]

  const industryOptions = [
    { value: '', label: 'Select an industry' },
    ...industries.map(i => ({ value: i.value, label: i.label })),
  ]

  const countryOptions = [
    { value: '', label: 'Select a country' },
    ...countries.map(c => ({ value: c.value, label: c.label })),
  ]

  const leadStatusOptions = [
    { value: '', label: 'Select a status' },
    ...leadStatuses.map(s => ({ value: s.value, label: s.label })),
  ]

  const set = (field, val) => setForm(p => ({ ...p, [field]: val }))

  const reset = () => { setForm(EMPTY); setError(''); setDuplicate(null) }

  const handleCreate = async (addAnother = false) => {
    if (!form.name) { setError('Company name is required.'); return }
    setSaving(true); setError(''); setDuplicate(null)
    try {
      const emails = cleanList(form.emails)
      const phones = cleanList(form.phones)
      const contactPersons = cleanList(form.contactPersons)
      const linkedProfiles = cleanList(form.linkedProfiles)
      await onSave({
        name:            form.name.trim(),
        email:           emails[0] || null,
        emails,
        phone:           phones[0] || null,
        phones,
        industry:        form.industry || null,
        ownerId:         form.ownerId || null,
        leadStatus:      form.leadStatus || null,
        domain:                form.domain || null,
        country:               form.country || null,
        endPdpUrl:             form.endPdpUrl || null,
        cms:                   form.cms || null,
        remarks:               form.remarks || null,
        contactPersons,
        linkedProfiles,
        customFields: form.customFields,
      })
      if (addAnother) {
        reset()
      } else {
        reset(); onClose()
      }
    } catch (e) {
      if (e?.response?.status === 409 && e?.response?.data?.duplicate) {
        setDuplicate(e.response.data.existing)
      } else {
        setError(e?.response?.data?.message || 'Failed to create company.')
      }
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { reset(); onClose() } }}>
      <div className="modal-drawer">

        <div className="modal-header">
          <h2>Create Company</h2>
          <button className="modal-close" onClick={() => { reset(); onClose() }}><X size={20} /></button>
        </div>

        <div className="modal-body">

          {/* Company name */}
          <div className="form-group required">
            <label>Company name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              autoFocus
              placeholder=""
            />
          </div>

          {/* Emails — one or more, first is primary */}
          <div className="form-group">
            <label>Email</label>
            <MultiValueInput
              values={form.emails}
              onChange={v => set('emails', v)}
              type="email"
              placeholder="name@example.com"
              addLabel="Add email"
            />
            {/* No excludeCompanyId — this company does not exist yet, so every
                match is genuinely another company's address. */}
            <EmailConflictWarning emails={form.emails} />
          </div>

          {/* Duplicate warning — placed right after the top identifying fields
              (Name/Email) so it's visible without scrolling. Detection logic
              is unchanged; this only moved the existing banner up in the form. */}
          {duplicate && (
            <div style={{
              background: '#fef9c3', border: '1.5px solid #eab308', borderRadius: 8,
              padding: '12px 14px', marginTop: -4, marginBottom: 4,
            }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#713f12' }}>
                Duplicate company detected
              </p>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#78350f' }}>
                <strong>{duplicate.name}</strong> already exists with the same name, email, phone, or company URL.
              </p>
              <a
                href={`/companies/${duplicate.id}`}
                style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 600, textDecoration: 'underline' }}
                onClick={() => { reset(); onClose() }}
              >
                View existing company →
              </a>
            </div>
          )}

          {/* Phones — one or more, first is primary */}
          <div className="form-group">
            <label>Phone number</label>
            <MultiValueInput
              values={form.phones}
              onChange={v => set('phones', v)}
              type="tel"
              placeholder="+1 555 000 1234"
              addLabel="Add phone"
            />
          </div>

          {/* Lead owner — dynamic from DB, searchable (formerly "Company owner";
              merged into a single owner field per Update: only one owner concept) */}
          <div className="form-group">
            <label>Lead Owner</label>
            <SearchableSelect
              value={form.ownerId}
              onChange={v => set('ownerId', v)}
              options={ownerOptions}
              placeholder="No owner"
              showEmail={true}
            />
          </div>

          {/* Industry */}
          <div className="form-group">
            <label>Industry</label>
            <SearchableSelect
              value={form.industry}
              onChange={v => set('industry', v)}
              options={industryOptions}
              placeholder="Select an industry"
            />
          </div>

          {/* Lead status */}
          <div className="form-group">
            <label>Lead status</label>
            <SearchableSelect
              value={form.leadStatus}
              onChange={v => set('leadStatus', v)}
              options={leadStatusOptions}
              placeholder="Select a status"
            />
          </div>

          {/* ── Additional fields ── */}
          <div className="form-group">
            <label>Company URL</label>
            <input type="text" value={form.domain} onChange={e => set('domain', e.target.value)} placeholder="example.com" />
          </div>

          <div className="form-group">
            <label>Country of Origin</label>
            <SearchableSelect value={form.country} onChange={v => set('country', v)} options={countryOptions} placeholder="Select a country" />
          </div>

          <div className="form-group">
            <label>End PDP URL</label>
            <input type="url" value={form.endPdpUrl} onChange={e => set('endPdpUrl', e.target.value)} placeholder="https://..." />
          </div>

          <div className="form-group">
            <label>CMS</label>
            <input type="text" value={form.cms} onChange={e => set('cms', e.target.value)} placeholder="" />
          </div>

          <div className="form-group">
            <label>Remarks</label>
            <input type="text" value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="e.g. Static / Less data / Partnership" />
          </div>

          <div className="form-group">
            <label>Contact Person</label>
            <MultiValueInput
              values={form.contactPersons}
              onChange={v => set('contactPersons', v)}
              type="text"
              placeholder="Name - Role"
              addLabel="Add contact person"
            />
          </div>

          <div className="form-group">
            <label>Linked Profile</label>
            <MultiValueInput
              values={form.linkedProfiles}
              onChange={v => set('linkedProfiles', v)}
              type="text"
              placeholder="Profile URL or label"
              addLabel="Add linked profile"
            />
          </div>

          <CustomFieldsSection
            entity="Company"
            values={form.customFields}
            onChange={(key, value) => setForm(p => ({ ...p, customFields: { ...p.customFields, [key]: value } }))}
          />

          {error && (
            <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0', fontWeight: 500 }}>{error}</p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-modal-primary" onClick={() => handleCreate(false)} disabled={saving}>
            {saving ? 'Creating…' : 'Create'}
          </button>
          <button className="btn-modal-secondary" onClick={() => handleCreate(true)} disabled={saving}>
            Create and add another
          </button>
          <button className="btn-modal-cancel" onClick={() => { reset(); onClose() }}>Cancel</button>
        </div>

      </div>
    </div>
  )
}
