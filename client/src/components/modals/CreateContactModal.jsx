import { useState, useEffect, useRef } from 'react'
import { X, ChevronDown, Search } from 'lucide-react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
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
  email: '', firstName: '', lastName: '',
  ownerId: '', jobTitle: '', phone: '', linkedinUrl: '',
  lifecycleStage: 'Lead', leadStatus: '',
}

export default function CreateContactModal({ isOpen, onClose, onSave }) {
  const { user }    = useAuth()
  const [form, setForm]       = useState(EMPTY)
  const [users, setUsers]     = useState([])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [duplicate, setDuplicate] = useState(null) // { id, name, email }

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

  const lifecycleOptions = [
    { value: '', label: 'Select a stage' },
    ...LIFECYCLE_STAGES.map(s => ({ value: s, label: s })),
  ]

  const leadStatusOptions = [
    { value: '', label: 'Select a status' },
    ...LEAD_STATUSES.map(s => ({ value: s, label: s })),
  ]

  const set = (field, val) => setForm(p => ({ ...p, [field]: val }))

  const reset = () => { setForm(EMPTY); setError(''); setDuplicate(null) }

  const handleCreate = async (addAnother = false) => {
    if (!form.email) { setError('Email is required.'); return }
    setSaving(true); setError(''); setDuplicate(null)
    try {
      await onSave({
        email:          form.email.trim(),
        firstName:      form.firstName,
        lastName:       form.lastName,
        name:           `${form.firstName} ${form.lastName}`.trim() || form.email,
        ownerId:        form.ownerId || null,
        jobTitle:       form.jobTitle,
        phone:          form.phone,
        linkedinUrl:    form.linkedinUrl || null,
        lifecycleStage: form.lifecycleStage || 'Lead',
        leadStatus:     form.leadStatus || null,
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
        setError(e?.response?.data?.message || 'Failed to create contact.')
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
          <h2>Create Contact</h2>
          <button className="modal-close" onClick={() => { reset(); onClose() }}><X size={20} /></button>
        </div>

        <div className="modal-body">

          {/* Email */}
          <div className="form-group required">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              autoFocus
              placeholder=""
            />
          </div>

          {/* First / Last name */}
          <div className="form-row-2">
            <div className="form-group">
              <label>First name</label>
              <input type="text" value={form.firstName} onChange={e => set('firstName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Last name</label>
              <input type="text" value={form.lastName} onChange={e => set('lastName', e.target.value)} />
            </div>
          </div>

          {/* Contact owner — dynamic from DB, searchable */}
          <div className="form-group">
            <label>Contact owner</label>
            <SearchableSelect
              value={form.ownerId}
              onChange={v => set('ownerId', v)}
              options={ownerOptions}
              placeholder="No owner"
              showEmail={true}
            />
          </div>

          {/* Job title */}
          <div className="form-group">
            <label>Job title</label>
            <input type="text" value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} />
          </div>

          {/* Phone */}
          <div className="form-group">
            <label>Phone number</label>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>

          {/* LinkedIn URL */}
          <div className="form-group">
            <label>LinkedIn URL</label>
            <input type="url" value={form.linkedinUrl} onChange={e => set('linkedinUrl', e.target.value)} placeholder="https://www.linkedin.com/in/..." />
          </div>

          {/* Lifecycle stage — searchable */}
          <div className="form-group">
            <label>Lifecycle stage</label>
            <SearchableSelect
              value={form.lifecycleStage}
              onChange={v => set('lifecycleStage', v)}
              options={lifecycleOptions}
              placeholder="Select a stage"
            />
          </div>

          {/* Lead status — searchable */}
          <div className="form-group">
            <label>Lead status</label>
            <SearchableSelect
              value={form.leadStatus}
              onChange={v => set('leadStatus', v)}
              options={leadStatusOptions}
              placeholder="Select a status"
            />
          </div>

          {duplicate && (
            <div style={{
              background: '#fef9c3', border: '1.5px solid #eab308', borderRadius: 8,
              padding: '12px 14px', marginTop: 8,
            }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#713f12' }}>
                Duplicate contact detected
              </p>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#78350f' }}>
                <strong>{duplicate.name}</strong> ({duplicate.email}) already exists.
              </p>
              <a
                href={`/contacts/${duplicate.id}`}
                style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 600, textDecoration: 'underline' }}
                onClick={() => { reset(); onClose() }}
              >
                View existing contact →
              </a>
            </div>
          )}

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
