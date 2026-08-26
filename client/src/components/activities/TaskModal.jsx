import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import CompanyPicker from '../CompanyPicker'
import SearchableSelect from '../SearchableSelect'
import CustomFieldsSection, { extractCustomFieldValues } from '../CustomFieldsSection'
import '../../styles/modal.css'

const MaterialIcon = ({ children }) => (
  <span className="material-symbols-rounded" aria-hidden="true">{children}</span>
)

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

  const assigneeOptions = [
    { value: '', label: 'Unassigned' },
    ...users.map(u => ({ value: u.id, label: u.name, email: u.email })),
  ]

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
    <div className="modal-overlay company-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-drawer company-create-modal task-create-modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <div className="modal-header company-modal-header">
          <div className="company-modal-title">
            <span className="company-modal-title-icon"><MaterialIcon>task_alt</MaterialIcon></span>
            <div>
              <h2 id="task-modal-title">{isEdit ? 'Edit Task' : 'Create Task'}{contactName ? ` — ${contactName}` : ''}</h2>
              <p>{isEdit ? 'Update this task\'s details' : 'Add a task to your workflow'}</p>
            </div>
          </div>
          <button className="modal-close" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body company-modal-body">
          <section className="company-form-section">
            <div className="company-form-section-head">
              <MaterialIcon>edit_note</MaterialIcon>
              <div><h3>Task Details</h3><p>What needs to get done</p></div>
            </div>
            <div className="company-form-grid">
              {needsCompanyPicker && (
                <div className="form-group required field-span-2">
                  <label><MaterialIcon>business</MaterialIcon>Company</label>
                  <CompanyPicker
                    value={pickedCompanyId}
                    label={pickedCompanyName}
                    onChange={(id, name) => { setPickedCompanyId(id); setPickedCompanyName(name) }}
                  />
                </div>
              )}
              <div className="form-group required field-span-2">
                <label><MaterialIcon>title</MaterialIcon>Task name</label>
                <input type="text" value={taskName} onChange={e => setTaskName(e.target.value)} placeholder="e.g. Follow up with contact" autoFocus />
              </div>
              <div className="form-group">
                <label><MaterialIcon>event</MaterialIcon>Due date & time</label>
                <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label><MaterialIcon>person_pin</MaterialIcon>Assign to</label>
                <SearchableSelect materialIcons value={assignedTo} onChange={setAssignedTo} options={assigneeOptions} placeholder="Unassigned" showEmail={true} />
              </div>
            </div>
          </section>

          <section className="company-form-section">
            <div className="company-form-section-head">
              <MaterialIcon>fact_check</MaterialIcon>
              <div><h3>Status</h3><p>Completion and auto-tracking</p></div>
            </div>
            <div className="company-form-grid">
              <div className="form-group field-span-2 task-checkbox-row">
                <label>
                  <input type="checkbox" checked={completed} onChange={e => setCompleted(e.target.checked)} />
                  Mark as completed
                </label>
                <label>
                  <input type="checkbox" checked={autoCompleteOverdue} onChange={e => setAutoCompleteOverdue(e.target.checked)} />
                  Auto-complete once overdue
                </label>
              </div>
              {autoCompleteOverdue && (
                <p className="field-span-2" style={{ margin: '-4px 0 0', fontSize: 9.5, color: '#94a3b8', lineHeight: 1.5 }}>
                  This task will be marked completed automatically after its due date/time passes. Off by default — only applies because you turned it on for this task.
                </p>
              )}
              <div className="form-group field-span-2">
                <label><MaterialIcon>notes</MaterialIcon>Description / Notes</label>
                <textarea rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder="Add task details…" />
              </div>
              <div className="company-modal-custom field-span-2">
                <CustomFieldsSection
                  entity="Task"
                  values={customFields}
                  onChange={(key, value) => setCustomFields(p => ({ ...p, [key]: value }))}
                />
              </div>
            </div>
          </section>

          {error && <p className="company-modal-error"><MaterialIcon>error</MaterialIcon>{error}</p>}
        </div>

        <div className="modal-footer company-modal-footer">
          <button className="btn-modal-primary" onClick={save} disabled={saving}>
            <MaterialIcon>{isEdit ? 'save' : 'add_task'}</MaterialIcon>{saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create task')}
          </button>
          <button className="btn-modal-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
