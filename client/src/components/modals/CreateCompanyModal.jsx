import { useState, useEffect, useRef } from 'react'
import { X, ChevronDown, Search } from 'lucide-react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { INDUSTRIES, COUNTRIES } from '../../constants/formOptions'
import MultiValueInput from '../MultiValueInput'
import { cleanList } from '../../utils/multiValue'
import '../../styles/modal.css'

const LIFECYCLE_STAGES = [
  'Subscriber',
  'Lead',
  'Marketing Qualified Lead',
  'Sales Qualified Lead',
  'Opportunity',
  'Customer',
  'Evangelist',
  'Other',
]

const LEAD_STATUSES = [
  'New',
  'Open',
  'In Progress',
  'Open Deal',
  'Unqualified',
  'Attempted to Contact',
  'Connected',
  'Bad Timing',
]

// Option lists for the new reference dropdown fields (adjustable later)
const COMPANY_TYPES  = ['Prospect', 'Partner', 'Reseller', 'Vendor', 'Customer', 'Competitor', 'Other']
const INDUSTRY_TYPES = ['B2B', 'B2C', 'B2B2C', 'Enterprise', 'SMB', 'Government', 'Non-Profit', 'Other']
const LEAD_TYPES     = ['New Business', 'Existing Business', 'Referral', 'Inbound', 'Outbound', 'Partner', 'Other']
const TRAFFIC_SOURCES = ['Organic Search', 'Paid Search', 'Direct Traffic', 'Referrals', 'Social Media', 'Email Marketing', 'Paid Social', 'Offline Sources', 'Other Campaigns', 'Other']

// ── Reusable searchable single-select dropdown ────────────
function SearchableSelect({ value, onChange, options, placeholder = 'Select…', showEmail = false }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase()) ||
    (o.email && o.email.toLowerCase().includes(query.toLowerCase()))
  )

  const selected = options.find(o => o.value === value)

  const pick = (val) => { onChange(val); setOpen(false); setQuery('') }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 12px', border: '1.5px solid #cbd5e1', borderRadius: 6, background: '#fff',
          fontSize: 14, color: selected ? '#0f172a' : '#94a3b8', cursor: 'pointer',
          fontFamily: 'DM Sans, system-ui, sans-serif', textAlign: 'left',
        }}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} color="#64748b" />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 4000,
          background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)', overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
            <Search size={14} color="#94a3b8" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search"
              style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, fontFamily: 'DM Sans, system-ui, sans-serif', color: '#0f172a' }}
            />
          </div>

          {/* Options */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No matches</div>
            ) : filtered.map(opt => (
              <div
                key={opt.value}
                onClick={() => pick(opt.value)}
                style={{
                  padding: showEmail ? '8px 14px' : '9px 14px',
                  cursor: 'pointer',
                  background: opt.value === value ? '#f0fdf4' : 'transparent',
                  borderLeft: opt.value === value ? '3px solid #0d9488' : '3px solid transparent',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { if (opt.value !== value) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (opt.value !== value) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{opt.label}</div>
                {showEmail && opt.email && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{opt.email}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────
const EMPTY = {
  name: '', emails: [''], phones: [''], website: '',
  industry: '', employeeCount: '', revenue: '',
  ownerId: '', lifecycleStage: 'Lead', leadStatus: '',
  // New reference fields
  domain: '', mobile: '', country: '', city: '', stateRegion: '', postalCode: '',
  timeZone: '', description: '', linkedinUrl: '',
  companyType: '', industryType: '', leadType: '', originalTrafficSource: '',
}

export default function CreateCompanyModal({ isOpen, onClose, onSave }) {
  const { user }    = useAuth()
  const [form, setForm]       = useState(EMPTY)
  const [users, setUsers]     = useState([])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [duplicate, setDuplicate] = useState(null) // { id, name }

  // Fetch users from DB on open
  useEffect(() => {
    if (!isOpen) return
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
  }, [isOpen])

  // Default ownerId to current logged-in user when users load
  useEffect(() => {
    if (users.length > 0 && !form.ownerId && user?.id) {
      setForm(p => ({ ...p, ownerId: user.id }))
    }
  }, [users, user])

  const ownerOptions = [
    { value: '', label: 'No owner', email: '' },
    ...users.map(u => ({ value: u.id, label: u.name, email: u.email })),
  ]

  const industryOptions = [
    { value: '', label: 'Select an industry' },
    ...INDUSTRIES.map(i => ({ value: i, label: i })),
  ]

  const countryOptions = [
    { value: '', label: 'Select a country' },
    ...COUNTRIES.map(c => ({ value: c, label: c })),
  ]

  const lifecycleOptions = [
    { value: '', label: 'Select a stage' },
    ...LIFECYCLE_STAGES.map(s => ({ value: s, label: s })),
  ]

  const leadStatusOptions = [
    { value: '', label: 'Select a status' },
    ...LEAD_STATUSES.map(s => ({ value: s, label: s })),
  ]

  const companyTypeOptions   = [{ value: '', label: 'Select a type' },          ...COMPANY_TYPES.map(s => ({ value: s, label: s }))]
  const industryTypeOptions  = [{ value: '', label: 'Select industry type' },   ...INDUSTRY_TYPES.map(s => ({ value: s, label: s }))]
  const leadTypeOptions      = [{ value: '', label: 'Select a lead type' },      ...LEAD_TYPES.map(s => ({ value: s, label: s }))]
  const trafficSourceOptions = [{ value: '', label: 'Select a source' },         ...TRAFFIC_SOURCES.map(s => ({ value: s, label: s }))]

  const set = (field, val) => setForm(p => ({ ...p, [field]: val }))

  const reset = () => { setForm(EMPTY); setError(''); setDuplicate(null) }

  const handleCreate = async (addAnother = false) => {
    if (!form.name) { setError('Company name is required.'); return }
    setSaving(true); setError(''); setDuplicate(null)
    try {
      const emails = cleanList(form.emails)
      const phones = cleanList(form.phones)
      await onSave({
        name:            form.name.trim(),
        email:           emails[0] || null,
        emails,
        phone:           phones[0] || null,
        phones,
        website:         form.website || null,
        industry:        form.industry || null,
        employeeCount:   form.employeeCount ? parseInt(form.employeeCount) : null,
        revenue:         form.revenue ? parseFloat(form.revenue) : null,
        ownerId:         form.ownerId || null,
        lifecycleStage:  form.lifecycleStage || 'Lead',
        leadStatus:      form.leadStatus || null,
        domain:                form.domain || null,
        companyType:           form.companyType || null,
        city:                  form.city || null,
        stateRegion:           form.stateRegion || null,
        postalCode:            form.postalCode || null,
        timeZone:              form.timeZone || null,
        description:           form.description || null,
        linkedinUrl:           form.linkedinUrl || null,
        industryType:          form.industryType || null,
        leadType:              form.leadType || null,
        originalTrafficSource: form.originalTrafficSource || null,
        country:               form.country || null,
        mobile:                form.mobile || null,
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
                <strong>{duplicate.name}</strong> already exists with the same name, email, phone, or website.
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

          {/* Website */}
          <div className="form-group">
            <label>Website</label>
            <input
              type="url"
              value={form.website}
              onChange={e => set('website', e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          {/* Company owner — dynamic from DB, searchable */}
          <div className="form-group">
            <label>Company owner</label>
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

          {/* Employee count */}
          <div className="form-group">
            <label>Number of employees</label>
            <input
              type="number"
              value={form.employeeCount}
              onChange={e => set('employeeCount', e.target.value)}
              placeholder=""
            />
          </div>

          {/* Annual revenue */}
          <div className="form-group">
            <label>Annual revenue</label>
            <input
              type="number"
              value={form.revenue}
              onChange={e => set('revenue', e.target.value)}
              placeholder=""
              step="0.01"
            />
          </div>

          {/* Lifecycle stage */}
          <div className="form-group">
            <label>Lifecycle stage</label>
            <SearchableSelect
              value={form.lifecycleStage}
              onChange={v => set('lifecycleStage', v)}
              options={lifecycleOptions}
              placeholder="Select a stage"
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
            <label>Company domain name</label>
            <input type="text" value={form.domain} onChange={e => set('domain', e.target.value)} placeholder="example.com" />
          </div>

          <div className="form-group">
            <label>Type</label>
            <SearchableSelect value={form.companyType} onChange={v => set('companyType', v)} options={companyTypeOptions} placeholder="Select a type" />
          </div>

          <div className="form-group">
            <label>Industry Type</label>
            <SearchableSelect value={form.industryType} onChange={v => set('industryType', v)} options={industryTypeOptions} placeholder="Select industry type" />
          </div>

          <div className="form-group">
            <label>Lead Type</label>
            <SearchableSelect value={form.leadType} onChange={v => set('leadType', v)} options={leadTypeOptions} placeholder="Select a lead type" />
          </div>

          <div className="form-group">
            <label>Original Traffic Source</label>
            <SearchableSelect value={form.originalTrafficSource} onChange={v => set('originalTrafficSource', v)} options={trafficSourceOptions} placeholder="Select a source" />
          </div>

          <div className="form-group">
            <label>Country of Origin</label>
            <SearchableSelect value={form.country} onChange={v => set('country', v)} options={countryOptions} placeholder="Select a country" />
          </div>

          <div className="form-group">
            <label>Mobile</label>
            <input type="tel" value={form.mobile} onChange={e => set('mobile', e.target.value)} placeholder="" />
          </div>

          <div className="form-group">
            <label>City</label>
            <input type="text" value={form.city} onChange={e => set('city', e.target.value)} placeholder="" />
          </div>

          <div className="form-group">
            <label>State/Region</label>
            <input type="text" value={form.stateRegion} onChange={e => set('stateRegion', e.target.value)} placeholder="" />
          </div>

          <div className="form-group">
            <label>Postal code</label>
            <input type="text" value={form.postalCode} onChange={e => set('postalCode', e.target.value)} placeholder="" />
          </div>

          <div className="form-group">
            <label>Time zone</label>
            <input type="text" value={form.timeZone} onChange={e => set('timeZone', e.target.value)} placeholder="" />
          </div>

          <div className="form-group">
            <label>LinkedIn URL</label>
            <input type="url" value={form.linkedinUrl} onChange={e => set('linkedinUrl', e.target.value)} placeholder="https://www.linkedin.com/company/..." />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="" />
          </div>

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
