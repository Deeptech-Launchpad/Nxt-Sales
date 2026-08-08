import { useState, useEffect } from 'react'
import { X, CheckSquare } from 'lucide-react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useDraggable } from '../../hooks/useDraggable'
import CompanyPicker from '../CompanyPicker'
import CustomFieldsSection, { extractCustomFieldValues } from '../CustomFieldsSection'
import '../../styles/activity-modals.css'

// Default due date/time for a new task: tomorrow at 9am local time.
function tomorrowDateTimeStr() {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0)
  return toDateTimeLocal(d.toISOString())
}

// Converts a stored UTC ISO string to the local "YYYY-MM-DDTHH:mm" value
// <input type="datetime-local"> expects. A naive .slice(0,16) on the raw
// ISO string would show the UTC wall-clock time mislabeled as local — this
// corrects for the browser's timezone offset first.
function toDateTimeLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const offsetMs = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16)
}

// Pass `activity` (an existing task Activity record) to edit it — otherwise
// a new task is created. `companyId` pre-links to a company (the Company
// Detail page always supplies this); when neither `activity` nor `companyId`
// carries a company (i.e. opened from the global Tasks dashboard's "Create
// task" button with nothing pre-selected), a CompanyPicker is shown and a
// company must be chosen before saving.
export default function TaskModal({ isOpen = true, activity, companyId, contactName, onClose, onSaved, onActivitySaved }) {
  const { user }  = useAuth()
  const isEdit = !!activity
  const [users, setUsers] = useState([])
  const { dragRef, pos } = useDraggable()

  const [pickedCompanyId, setPickedCompanyId]     = useState(isEdit ? activity.companyId : (companyId || ''))
  const [pickedCompanyName, setPickedCompanyName] = useState(isEdit ? (activity.company?.name || '') : '')
  const [taskName,  setTaskName]  = useState(isEdit ? (activity.title || '') : '')
  const [body,      setBody]      = useState(isEdit ? (activity.body || '') : '')
  const [dueDate,   setDueDate]   = useState(isEdit ? toDateTimeLocal(activity.dueDate) : tomorrowDateTimeStr())
  const [completed, setCompleted] = useState(isEdit ? activity.taskStatus === 'completed' : false)
  const [autoCompleteOverdue, setAutoCompleteOverdue] = useState(isEdit ? !!activity.autoCompleteOverdue : false)
  const [assignedTo, setAssignedTo] = useState(isEdit ? (activity.assignedToId || '') : (user?.id || ''))
  const [customFields, setCustomFields] = useState(isEdit ? extractCustomFieldValues(activity) : {})
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState('')

  const needsCompanyPicker = !companyId && !(isEdit && activity.companyId)

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
  }, [])

  const save = async () => {
    if (!taskName.trim()) { setError('Task name is required.'); return }
    if (needsCompanyPicker && !pickedCompanyId) { setError('Please select a company.'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        title:      taskName.trim(),
        body:       body || null,
        dueDate:    dueDate ? new Date(dueDate).toISOString() : null,
        taskStatus: completed ? 'completed' : 'not_started',
        autoCompleteOverdue,
        assignedToId: assignedTo || null,
        customFields,
      }
      const { data } = isEdit
        ? await api.put(`/activities/${activity.id}`, payload)
        : await api.post('/activities', { ...payload, type: 'task', companyId: pickedCompanyId })
      if (onSaved) onSaved(data)
      if (onActivitySaved) onActivitySaved(data)
      onClose()
    } catch (e) {
      setError(e?.response?.data?.message || `Failed to ${isEdit ? 'update' : 'create'} task.`)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="act-popup-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="act-popup" ref={dragRef} style={{ width: 580, transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        <div className="act-popup-header">
          <div className="act-popup-title"><CheckSquare size={15} /> {isEdit ? 'Edit task' : 'Create task'}{contactName ? ` — ${contactName}` : ''}</div>
          <div className="act-popup-header-actions">
            <button className="act-popup-icon-btn" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        <div className="act-popup-body">
          {needsCompanyPicker && (
            <div className="act-form-group" style={{ marginBottom: 12 }}>
              <label>Company *</label>
              <CompanyPicker
                value={pickedCompanyId}
                label={pickedCompanyName}
                onChange={(id, name) => { setPickedCompanyId(id); setPickedCompanyName(name) }}
              />
            </div>
          )}

          <div className="act-form-group" style={{ marginBottom: 12 }}>
            <label>Task name *</label>
            <input type="text" value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="e.g. Follow up with contact" autoFocus />
          </div>

          <div className="act-form-row" style={{ marginBottom: 12 }}>
            <div className="act-form-group">
              <label>Due date & time</label>
              <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="act-form-group">
              <label>Assign to</label>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={completed} onChange={e => setCompleted(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#0d9488' }} />
              Mark as completed
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoCompleteOverdue} onChange={e => setAutoCompleteOverdue(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#0d9488' }} />
              Auto-complete once overdue
            </label>
            {autoCompleteOverdue && (
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '-4px 0 0 22px' }}>
                This task will be marked completed automatically after its due date/time passes. Off by default — only applies because you turned it on for this task.
              </p>
            )}
          </div>

          <div className="act-form-group">
            <label>Description / Notes</label>
            <textarea rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Add task details…" />
          </div>

          <CustomFieldsSection
            entity="Task"
            values={customFields}
            onChange={(key, value) => setCustomFields(p => ({ ...p, [key]: value }))}
          />

          {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6, fontWeight: 500 }}>{error}</p>}
        </div>

        <div className="act-popup-footer">
          <div className="act-popup-footer-left" />
          <div className="act-popup-footer-right">
            <button className="btn-act-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-act-save" onClick={save} disabled={saving}>
              <CheckSquare size={13} /> {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create task')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
