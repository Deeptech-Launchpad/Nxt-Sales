import { useState } from 'react'
import { X, Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react'
import api from '../../api/client'
import { useDraggable } from '../../hooks/useDraggable'
import '../../styles/activity-modals.css'

const OUTCOMES = [
  { value: 'connected',  label: 'Connected'    },
  { value: 'voicemail',  label: 'Left voicemail' },
  { value: 'no_answer',  label: 'No answer'    },
  { value: 'busy',       label: 'Busy'          },
  { value: 'wrong_number', label: 'Wrong number' },
]

export default function CallModal({ isOpen = true, contactId, companyId, contactName, onClose, onSaved, onActivitySaved }) {
  const { dragRef, pos } = useDraggable()
  const [direction,  setDirection]  = useState('outbound')
  const [outcome,    setOutcome]    = useState('connected')
  const [durMin,     setDurMin]     = useState('0')
  const [durSec,     setDurSec]     = useState('0')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const save = async () => {
    setSaving(true); setError('')
    const duration = (parseInt(durMin, 10) || 0) * 60 + (parseInt(durSec, 10) || 0)
    const outcomeLabel = OUTCOMES.find(o => o.value === outcome)?.label || outcome
    try {
      const { data } = await api.post('/activities', {
        type: 'call',
        ...(contactId && { contactId }),
        ...(companyId && { companyId }),
        title: `${direction === 'outbound' ? 'Outbound' : 'Inbound'} call – ${outcomeLabel}`,
        body: notes || null,
        direction,
        duration,
        outcome,
      })
      if (onSaved) onSaved(data)
      if (onActivitySaved) onActivitySaved(data)
      onClose()
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to log call.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="act-popup-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="act-popup" ref={dragRef} style={{ width: 560, transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        <div className="act-popup-header">
          <div className="act-popup-title"><Phone size={15} /> Log a call{contactName ? ` — ${contactName}` : ''}</div>
          <div className="act-popup-header-actions">
            <button className="act-popup-icon-btn" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        <div className="act-popup-body">
          {/* Direction */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Direction</label>
            <div className="act-radio-group">
              <button className={`act-radio-btn ${direction === 'outbound' ? 'active' : ''}`} onClick={() => setDirection('outbound')}>
                <PhoneOutgoing size={14} /> Outbound
              </button>
              <button className={`act-radio-btn ${direction === 'inbound' ? 'active' : ''}`} onClick={() => setDirection('inbound')}>
                <PhoneIncoming size={14} /> Inbound
              </button>
            </div>
          </div>

          {/* Outcome */}
          <div className="act-form-group" style={{ marginBottom: 14 }}>
            <label>Outcome</label>
            <select value={outcome} onChange={e => setOutcome(e.target.value)}>
              {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Duration */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Duration</label>
            <div className="duration-picker">
              <input type="number" min="0" max="999" value={durMin} onChange={e => setDurMin(e.target.value)} />
              <span className="duration-label">min</span>
              <span className="duration-sep">:</span>
              <input type="number" min="0" max="59" value={durSec} onChange={e => setDurSec(e.target.value)} />
              <span className="duration-label">sec</span>
            </div>
          </div>

          {/* Notes */}
          <div className="act-form-group">
            <label>Call notes</label>
            <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes about this call…" />
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6, fontWeight: 500 }}>{error}</p>}
        </div>

        <div className="act-popup-footer">
          <div className="act-popup-footer-left" />
          <div className="act-popup-footer-right">
            <button className="btn-act-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-act-save" onClick={save} disabled={saving}>
              <Phone size={13} /> {saving ? 'Saving…' : 'Log call'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
