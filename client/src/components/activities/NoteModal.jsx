import { useState } from 'react'
import { X, FileText, Bold, Italic, List, Link2 } from 'lucide-react'
import api from '../../api/client'
import { useDraggable } from '../../hooks/useDraggable'
import '../../styles/activity-modals.css'

export default function NoteModal({ isOpen = true, contactId, companyId, contactName, onClose, onSaved, onActivitySaved }) {
  const { dragRef, pos } = useDraggable()
  const [body,    setBody]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const save = async () => {
    if (!body.trim()) { setError('Note body is required.'); return }
    setSaving(true); setError('')
    try {
      const { data } = await api.post('/activities', {
        type: 'note',
        ...(contactId && { contactId }),
        ...(companyId && { companyId }),
        title: 'Note',
        body: body.trim(),
      })
      if (onSaved) onSaved(data)
      if (onActivitySaved) onActivitySaved(data)
      onClose()
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save note.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="act-popup-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="act-popup" ref={dragRef} style={{ width: 640, transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        <div className="act-popup-header">
          <div className="act-popup-title"><FileText size={15} /> Note</div>
          <div className="act-popup-header-actions">
            <button className="act-popup-icon-btn" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        <div className="act-popup-body" style={{ padding: '16px 20px' }}>
          {/* Mini toolbar */}
          <div className="act-toolbar">
            <button className="act-toolbar-btn" title="Bold"><Bold size={13} /></button>
            <button className="act-toolbar-btn" title="Italic"><Italic size={13} /></button>
            <button className="act-toolbar-btn" title="List"><List size={13} /></button>
            <button className="act-toolbar-btn" title="Link"><Link2 size={13} /></button>
          </div>
          <textarea
            className="act-textarea"
            placeholder="Add a note…"
            value={body}
            onChange={e => { setBody(e.target.value); setError('') }}
            rows={5}
            autoFocus
          />
          {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6, fontWeight: 500 }}>{error}</p>}

          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="followup" style={{ width: 14, height: 14, accentColor: '#0d9488' }} />
            <label htmlFor="followup" style={{ fontSize: 13, color: '#334155', cursor: 'pointer' }}>
              Create a follow-up task
            </label>
          </div>
        </div>

        <div className="act-popup-footer">
          <div className="act-popup-footer-left">
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Associated with this contact</span>
          </div>
          <div className="act-popup-footer-right">
            <button className="btn-act-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-act-save" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
