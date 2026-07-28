import { useState, useEffect } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import api from '../api/client'
import { useDropdownOptions } from '../hooks/useDropdownOptions'
import MultiValueInput from './MultiValueInput'
import EmailConflictWarning from './EmailConflictWarning'
import { cleanList, editList } from '../utils/multiValue'

// Compact input styling so MultiValueInput matches this modal's .er-input look.
const ER_INPUT_STYLE = { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13 }

// ── Company edit fields ───────────────────────────────────────
function CompanyForm({ data, onChange, users, companyId }) {
  const { options: industries }   = useDropdownOptions('company.industry')
  const { options: countries }    = useDropdownOptions('company.country')
  const { options: leadStatuses } = useDropdownOptions('company.leadStatus')
  const f = (key) => ({ value: data[key] || '', onChange: e => onChange(key, e.target.value) })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FormRow label="Company Name *">
        <input className="er-input" {...f('name')} placeholder="Company name" />
      </FormRow>
      <FormRow label="Email">
        <MultiValueInput values={data.emails} onChange={v => onChange('emails', v)} type="email" placeholder="company@example.com" addLabel="Add email" inputStyle={ER_INPUT_STYLE} />
        {/* excludeCompanyId — this company legitimately owns its own addresses,
            so it must never be reported as a conflict with itself. */}
        <EmailConflictWarning emails={data.emails} excludeCompanyId={companyId} />
      </FormRow>
      <FormRow label="Phone Number">
        <MultiValueInput values={data.phones} onChange={v => onChange('phones', v)} type="tel" placeholder="+91 98765 43210" addLabel="Add phone" inputStyle={ER_INPUT_STYLE} />
      </FormRow>
      <FormRow label="Company URL">
        <input className="er-input" {...f('domain')} placeholder="example.com" />
      </FormRow>
      <FormRow label="Industry">
        <select className="er-input" {...f('industry')}>
          <option value="">Select industry</option>
          {industries.map(i => <option key={i.id} value={i.value}>{i.label}</option>)}
        </select>
      </FormRow>
      <FormRow label="Country of Origin">
        <select className="er-input" {...f('country')}>
          <option value="">Select country</option>
          {countries.map(c => <option key={c.id} value={c.value}>{c.label}</option>)}
        </select>
      </FormRow>
      <FormRow label="Lead Status">
        <select className="er-input" {...f('leadStatus')}>
          <option value="">Select status</option>
          {leadStatuses.map(s => <option key={s.id} value={s.value}>{s.label}</option>)}
        </select>
      </FormRow>
      <FormRow label="End PDP URL">
        <input className="er-input" {...f('endPdpUrl')} placeholder="https://..." />
      </FormRow>
      <FormRow label="CMS">
        <input className="er-input" {...f('cms')} placeholder="" />
      </FormRow>
      <FormRow label="Remarks">
        <input className="er-input" {...f('remarks')} placeholder="e.g. Static / Less data / Partnership" />
      </FormRow>
      <FormRow label="Contact Person">
        <MultiValueInput values={data.contactPersons} onChange={v => onChange('contactPersons', v)} type="text" placeholder="Name - Role" addLabel="Add contact person" inputStyle={ER_INPUT_STYLE} />
      </FormRow>
      <FormRow label="Lead Owner">
        <select className="er-input" {...f('ownerId')}>
          <option value="">No owner</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </FormRow>
      <FormRow label="Linked Profile">
        <MultiValueInput values={data.linkedProfiles} onChange={v => onChange('linkedProfiles', v)} type="text" placeholder="Profile URL or label" addLabel="Add linked profile" inputStyle={ER_INPUT_STYLE} />
      </FormRow>
    </div>
  )
}

function FormRow({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────
export default function EditRecordModal({ id, record, onClose, onSaved }) {
  const [data,    setData]    = useState(() => ({
    ...record,
    emails: editList(record.email, record.emails),
    phones: editList(record.phone, record.phones),
    contactPersons: editList(null, record.contactPersons),
    linkedProfiles: editList(null, record.linkedProfiles),
  }))
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [users,   setUsers]   = useState([])

  // Lead Owner dropdown — loads all system users for the owner select.
  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
  }, [])

  const handleChange = (key, value) => setData(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!data.name?.trim()) { setError('Name is required.'); return }
    const emails = cleanList(data.emails)
    const phones = cleanList(data.phones)
    setSaving(true); setError('')
    try {
      const payload  = {
        ...data, emails, phones, email: emails[0] || null, phone: phones[0] || null,
        contactPersons: cleanList(data.contactPersons),
        linkedProfiles: cleanList(data.linkedProfiles),
      }
      const { data: updated } = await api.put(`/companies/${id}`, payload)
      onSaved(updated)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: 520, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
            Edit Company
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, borderRadius: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <CompanyForm data={data} onChange={handleChange} users={users} companyId={id} />
          {error && (
            <p style={{ color: '#ef4444', fontSize: 12, marginTop: 12, fontWeight: 500 }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 20px', borderTop: '1px solid #e2e8f0',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 7, border: '1px solid #e2e8f0',
              background: '#fff', fontSize: 13, cursor: 'pointer', color: '#64748b', fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 20px', borderRadius: 7, border: 'none',
              background: saving ? '#93c5fd' : '#3b82f6', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            {saving
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
              : <><Save size={14} /> Save changes</>
            }
          </button>
        </div>
      </div>

      <style>{`
        .er-input {
          width: 100%; padding: 8px 10px; border: 1px solid #e2e8f0;
          border-radius: 7px; font-size: 13px; color: #0f172a;
          background: #fff; outline: none; box-sizing: border-box;
          font-family: inherit; transition: border-color 0.15s;
        }
        .er-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
