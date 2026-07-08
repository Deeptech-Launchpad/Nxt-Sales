import { useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import api from '../api/client'

const LIFECYCLE_STAGES = ['Lead', 'Marketing Qualified Lead', 'Sales Qualified Lead', 'Opportunity', 'Customer', 'Evangelist', 'Other']
const LEAD_STATUSES    = ['New', 'Open', 'In Progress', 'Open Deal', 'Unqualified', 'Attempted to Contact', 'Connected', 'Bad Timing']
const INDUSTRIES       = ['Technology', 'Healthcare', 'Finance', 'Education', 'Retail', 'Manufacturing', 'Real Estate', 'Media', 'Chemicals', 'Agriculture', 'Construction', 'Transportation', 'Other']

// ── Company edit fields ───────────────────────────────────────
function CompanyForm({ data, onChange }) {
  const f = (key) => ({ value: data[key] || '', onChange: e => onChange(key, e.target.value) })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FormRow label="Company Name *">
        <input className="er-input" {...f('name')} placeholder="Company name" />
      </FormRow>
      <FormRow label="Email">
        <input className="er-input" type="email" {...f('email')} placeholder="company@example.com" />
      </FormRow>
      <FormRow label="Phone Number">
        <input className="er-input" {...f('phone')} placeholder="+91 98765 43210" />
      </FormRow>
      <FormRow label="Website">
        <input className="er-input" {...f('website')} placeholder="https://example.com" />
      </FormRow>
      <FormRow label="Industry">
        <select className="er-input" {...f('industry')}>
          <option value="">Select industry</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </FormRow>
      <FormRow label="Lifecycle Stage">
        <select className="er-input" {...f('lifecycleStage')}>
          <option value="">Select stage</option>
          {LIFECYCLE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </FormRow>
      <FormRow label="Lead Status">
        <select className="er-input" {...f('leadStatus')}>
          <option value="">Select status</option>
          {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </FormRow>
    </div>
  )
}

// ── Contact edit fields ───────────────────────────────────────
function ContactForm({ data, onChange }) {
  const f = (key) => ({ value: data[key] || '', onChange: e => onChange(key, e.target.value) })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormRow label="First Name">
          <input className="er-input" {...f('firstName')} placeholder="First name" />
        </FormRow>
        <FormRow label="Last Name">
          <input className="er-input" {...f('lastName')} placeholder="Last name" />
        </FormRow>
      </div>
      <FormRow label="Email">
        <input className="er-input" type="email" {...f('email')} placeholder="contact@example.com" />
      </FormRow>
      <FormRow label="Phone Number">
        <input className="er-input" {...f('phone')} placeholder="+91 98765 43210" />
      </FormRow>
      <FormRow label="Job Title">
        <input className="er-input" {...f('jobTitle')} placeholder="e.g. Sales Manager" />
      </FormRow>
      <FormRow label="Primary Company">
        <input className="er-input" {...f('company')} placeholder="Company name" />
      </FormRow>
      <FormRow label="Lifecycle Stage">
        <select className="er-input" {...f('lifecycleStage')}>
          <option value="">Select stage</option>
          {LIFECYCLE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </FormRow>
      <FormRow label="Lead Status">
        <select className="er-input" {...f('leadStatus')}>
          <option value="">Select status</option>
          {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
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
export default function EditRecordModal({ type, id, record, onClose, onSaved }) {
  const isCompany = type === 'company'
  const [data,    setData]    = useState({ ...record })
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const handleChange = (key, value) => setData(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    if (!data.name?.trim()) { setError('Name is required.'); return }
    setSaving(true); setError('')
    try {
      const endpoint = isCompany ? `/companies/${id}` : `/contacts/${id}`
      const { data: updated } = await api.put(endpoint, data)
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
            Edit {isCompany ? 'Company' : 'Contact'}
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
          {isCompany
            ? <CompanyForm data={data} onChange={handleChange} />
            : <ContactForm data={data} onChange={handleChange} />
          }
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
