import { useState, useEffect, useRef } from 'react'
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

const MaterialIcon = ({ children }) => (
  <span className="material-symbols-rounded" aria-hidden="true">{children}</span>
)

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

  // Live duplicate pre-check — Company Name and Company URL are checked
  // independently, as soon as either has a value, instead of only when the
  // user clicks Create (which used to require Name to be filled in first).
  // Debounced so it doesn't fire on every keystroke; the token guard drops
  // a stale response if the fields change again before it comes back. Same
  // warning banner/state as before — this only changes when it's triggered.
  // Tracks whether the CURRENT click's mousedown also started directly on
  // the overlay (not on a descendant) — the overlay must only close when
  // BOTH mousedown and the resulting click land on it. Without this, a
  // mouse-drag text selection that starts inside the drawer (e.g. copying a
  // long field value) and releases past the drawer's edge produces a
  // synthetic click whose target is the overlay, which used to close the
  // modal mid-copy and appear to wipe the form.
  const mouseDownOnOverlay = useRef(false)
  const dupCheckToken = useRef(0)
  useEffect(() => {
    if (!isOpen) return
    const name = form.name.trim()
    const domain = form.domain.trim()
    if (!name && !domain) { setDuplicate(null); return }

    const token = ++dupCheckToken.current
    const timer = setTimeout(() => {
      const params = {}
      if (name) params.name = name
      if (domain) params.domain = domain
      api.get('/companies/check-duplicate', { params })
        .then(r => {
          if (token !== dupCheckToken.current) return
          setDuplicate(r.data.isDuplicate ? r.data.existing : null)
        })
        .catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [form.name, form.domain, isOpen])

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
    <div
      className="modal-overlay company-modal-overlay"
      onMouseDown={e => { mouseDownOnOverlay.current = e.target === e.currentTarget }}
      onClick={e => {
        if (mouseDownOnOverlay.current && e.target === e.currentTarget) { reset(); onClose() }
        mouseDownOnOverlay.current = false
      }}
    >
      <div className="modal-drawer company-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-company-title">
        <div className="modal-header company-modal-header">
          <div className="company-modal-title">
            <span className="company-modal-title-icon"><MaterialIcon>domain_add</MaterialIcon></span>
            <div>
              <h2 id="create-company-title">Create Company</h2>
              <p>Add a company to your CRM workspace</p>
            </div>
          </div>
          <button className="modal-close" aria-label="Close" onClick={() => { reset(); onClose() }}>
            <MaterialIcon>close</MaterialIcon>
          </button>
        </div>

        <div className="modal-body company-modal-body">
          <section className="company-form-section">
            <div className="company-form-section-head">
              <MaterialIcon>apartment</MaterialIcon>
              <div><h3>Company Details</h3><p>Core company and website information</p></div>
            </div>
            <div className="company-form-grid">
              <div className="form-group required">
                <label><MaterialIcon>business</MaterialIcon>Company name</label>
                <input type="text" value={form.name} onChange={e => set('name', e.target.value)} autoFocus placeholder="" />
              </div>
              {/* The duplicate warning used to render here, as a full-width cell
                  between Company name and Industry — so the moment it appeared it
                  shoved every field below it down the page. It now docks to the
                  bottom of the form instead (see below); the detection itself is
                  untouched. */}
              <div className="form-group">
                <label><MaterialIcon>category</MaterialIcon>Industry</label>
                <SearchableSelect materialIcons value={form.industry} onChange={v => set('industry', v)} options={industryOptions} placeholder="Select an industry" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>public</MaterialIcon>Country of Origin</label>
                <SearchableSelect materialIcons value={form.country} onChange={v => set('country', v)} options={countryOptions} placeholder="Select a country" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>language</MaterialIcon>Company URL</label>
                <input type="text" value={form.domain} onChange={e => set('domain', e.target.value)} placeholder="example.com" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>link</MaterialIcon>End PDP URL</label>
                <input type="url" value={form.endPdpUrl} onChange={e => set('endPdpUrl', e.target.value)} placeholder="https://..." />
              </div>
              <div className="form-group">
                <label><MaterialIcon>web</MaterialIcon>CMS</label>
                <input type="text" value={form.cms} onChange={e => set('cms', e.target.value)} placeholder="" />
              </div>
            </div>
          </section>

          <section className="company-form-section">
            <div className="company-form-section-head">
              <MaterialIcon>contact_mail</MaterialIcon>
              <div><h3>Contact Information</h3><p>Primary and additional contact channels</p></div>
            </div>
            <div className="company-form-grid">
              <div className="form-group">
                <label><MaterialIcon>mail</MaterialIcon>Email</label>
                <MultiValueInput materialIcons values={form.emails} onChange={v => set('emails', v)} type="email" placeholder="name@example.com" addLabel="Add email" />
                <EmailConflictWarning emails={form.emails} />
              </div>
              <div className="form-group">
                <label><MaterialIcon>phone</MaterialIcon>Phone number</label>
                <MultiValueInput materialIcons values={form.phones} onChange={v => set('phones', v)} type="tel" placeholder="+1 555 000 1234" addLabel="Add phone" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>person</MaterialIcon>Contact Person</label>
                <MultiValueInput materialIcons values={form.contactPersons} onChange={v => set('contactPersons', v)} type="text" placeholder="Name - Role" addLabel="Add contact person" />
              </div>
              <div className="form-group">
                <label><MaterialIcon>account_circle</MaterialIcon>Linked Profile</label>
                <MultiValueInput materialIcons values={form.linkedProfiles} onChange={v => set('linkedProfiles', v)} type="text" placeholder="Profile URL or label" addLabel="Add linked profile" />
              </div>
            </div>
          </section>

          <section className="company-form-section">
            <div className="company-form-section-head">
              <MaterialIcon>trending_up</MaterialIcon>
              <div><h3>Sales Details</h3><p>Ownership, status and sales context</p></div>
            </div>
            <div className="company-form-grid">
              <div className="form-group">
                <label><MaterialIcon>person_pin</MaterialIcon>Lead Owner</label>
                <SearchableSelect materialIcons value={form.ownerId} onChange={v => set('ownerId', v)} options={ownerOptions} placeholder="No owner" showEmail={true} />
              </div>
              <div className="form-group">
                <label><MaterialIcon>flag</MaterialIcon>Lead status</label>
                <SearchableSelect materialIcons value={form.leadStatus} onChange={v => set('leadStatus', v)} options={leadStatusOptions} placeholder="Select a status" />
              </div>
              <div className="form-group field-span-2">
                <label><MaterialIcon>notes</MaterialIcon>Remarks</label>
                <input type="text" value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="e.g. Static / Less data / Partnership" />
              </div>
              <div className="company-modal-custom field-span-2">
                <CustomFieldsSection entity="Company" values={form.customFields} onChange={(key, value) => setForm(p => ({ ...p, customFields: { ...p.customFields, [key]: value } }))} />
              </div>
            </div>
          </section>

          {error && <p className="company-modal-error"><MaterialIcon>error</MaterialIcon>{error}</p>}

          {/* Docked to the bottom of the form rather than inserted between the
              fields. As the LAST element in the scroll area it can only ever
              extend the end of the form — no field above it can move, so nothing
              jumps when it appears or clears. position:sticky then keeps it on
              screen while the user is still up at Company name / Company URL,
              so it is visible immediately without having to scroll for it.
              Same markup, same link, same detection. */}
          {duplicate && (
            <div className="company-duplicate-dock" role="status" aria-live="polite">
              <div className="company-modal-alert">
                <MaterialIcon>warning</MaterialIcon>
                <div>
                  <p>Duplicate company detected</p>
                  <span><strong>{duplicate.name}</strong> already exists with the same name, email, phone, or company URL.</span>
                  <a href={`/companies/${duplicate.id}`} onClick={() => { reset(); onClose() }}>View existing company →</a>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer company-modal-footer">
          <button className="btn-modal-primary" onClick={() => handleCreate(false)} disabled={saving}>
            <MaterialIcon>add_business</MaterialIcon>{saving ? 'Creating…' : 'Create Company'}
          </button>
          <button className="btn-modal-secondary" onClick={() => handleCreate(true)} disabled={saving}>
            <MaterialIcon>add</MaterialIcon>Create &amp; Add Another
          </button>
          <button className="btn-modal-cancel" onClick={() => { reset(); onClose() }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
