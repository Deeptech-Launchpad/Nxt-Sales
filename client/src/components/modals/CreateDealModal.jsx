import { useState } from 'react'
import { X } from 'lucide-react'
import api from '../../api/client'
import '../../styles/modal.css'

// Deal stages — must match the backend deals route STAGES (unchanged).
const STAGES = ['New', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost']

// Create a deal, optionally pre-linked to a company or contact. On success the
// deal is persisted via POST /api/deals (ownerId = current user) so it appears
// in the global Deals dashboard as well as on the linked record.
export default function CreateDealModal({ companyId, contactId, onClose, onSaved }) {
  const [form, setForm]     = useState({ title: '', value: '', stage: 'New', closeDate: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.title.trim()) { setError('Deal name is required.'); return }
    setSaving(true); setError('')
    try {
      const { data } = await api.post('/deals', {
        title:     form.title.trim(),
        value:     form.value ? Number(form.value) : 0,
        stage:     form.stage,
        closeDate: form.closeDate || null,
        notes:     form.notes || null,
        ...(companyId && { companyId }),
        ...(contactId && { contactId }),
      })
      onSaved && onSaved(data)
      onClose()
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to create deal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-drawer">
        <div className="modal-header">
          <h2>Create Deal</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <div className="form-group required">
            <label>Deal name</label>
            <input type="text" value={form.title} onChange={e => { set('title', e.target.value); setError('') }} autoFocus />
          </div>

          <div className="form-group">
            <label>Amount</label>
            <input type="number" value={form.value} onChange={e => set('value', e.target.value)} placeholder="0" step="0.01" />
          </div>

          <div className="form-group">
            <label>Deal stage</label>
            <select value={form.stage} onChange={e => set('stage', e.target.value)}>
              {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
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
            {saving ? 'Creating…' : 'Create deal'}
          </button>
          <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
