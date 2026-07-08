import { useState, useEffect } from 'react'
import { X, CheckSquare } from 'lucide-react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useDraggable } from '../../hooks/useDraggable'
import '../../styles/activity-modals.css'

function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function TaskModal({ isOpen = true, contactId, companyId, contactName, onClose, onSaved, onActivitySaved }) {
  const { user }  = useAuth()
  const [users, setUsers] = useState([])
  const { dragRef, pos } = useDraggable()

  const [taskName,  setTaskName]  = useState('')
  const [body,      setBody]      = useState('')
  const [dueDate,   setDueDate]   = useState(tomorrowStr())
  const [priority,  setPriority]  = useState('none')
  const [taskStatus, setTaskStatus] = useState('not_started')
  const [assignedTo, setAssignedTo] = useState(user?.id || '')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
  }, [])

  const save = async () => {
    if (!taskName.trim()) { setError('Task name is required.'); return }
    setSaving(true); setError('')
    try {
      const { data } = await api.post('/activities', {
        type: 'task',
        ...(contactId && { contactId }),
        ...(companyId && { companyId }),
        title:      taskName.trim(),
        body:       body || null,
        dueDate:    dueDate ? new Date(dueDate).toISOString() : null,
        priority,
        taskStatus,
        assignedToId: assignedTo || null,
      })
      if (onSaved) onSaved(data)
      if (onActivitySaved) onActivitySaved(data)
      onClose()
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to create task.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="act-popup-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="act-popup" ref={dragRef} style={{ width: 580, transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        <div className="act-popup-header">
          <div className="act-popup-title"><CheckSquare size={15} /> Create task{contactName ? ` — ${contactName}` : ''}</div>
          <div className="act-popup-header-actions">
            <button className="act-popup-icon-btn" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        <div className="act-popup-body">
          <div className="act-form-group" style={{ marginBottom: 12 }}>
            <label>Task name *</label>
            <input type="text" value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="e.g. Follow up with contact" autoFocus />
          </div>

          <div className="act-form-row" style={{ marginBottom: 12 }}>
            <div className="act-form-group">
              <label>Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="act-form-group">
              <label>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="act-form-group">
              <label>Status</label>
              <select value={taskStatus} onChange={e => setTaskStatus(e.target.value)}>
                <option value="not_started">Not started</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="act-form-group" style={{ marginBottom: 12 }}>
            <label>Assign to</label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          </div>

          <div className="act-form-group">
            <label>Description / Notes</label>
            <textarea rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Add task details…" />
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6, fontWeight: 500 }}>{error}</p>}
        </div>

        <div className="act-popup-footer">
          <div className="act-popup-footer-left" />
          <div className="act-popup-footer-right">
            <button className="btn-act-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-act-save" onClick={save} disabled={saving}>
              <CheckSquare size={13} /> {saving ? 'Saving…' : 'Create task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
