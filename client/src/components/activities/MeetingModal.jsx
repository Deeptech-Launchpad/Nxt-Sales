import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Calendar, Video, CheckCircle, ExternalLink,
  Building2, Type, Clock, Users, MapPin, AlignLeft,
  User, ChevronDown
} from 'lucide-react'
import api from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useDraggable } from '../../hooks/useDraggable'
import CompanyPicker from '../CompanyPicker'
import CustomFieldsSection, { extractCustomFieldValues } from '../CustomFieldsSection'
import '../../styles/activity-modals.css'

function todayStr() {
  return new Date().toISOString().slice(0, 16)
}

function addMinutes(isoStr, minutes) {
  const d = new Date(isoStr)
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString().slice(0, 16)
}

const DURATION_OPTIONS = [
  { value: '15',  label: '15 min' },
  { value: '30',  label: '30 min' },
  { value: '45',  label: '45 min' },
  { value: '60',  label: '1 hour' },
  { value: '90',  label: '1.5 hours' },
  { value: '120', label: '2 hours' },
]

export default function MeetingModal({
  isOpen = true,
  activity,
  companyId,
  contactName,
  contactEmail,
  onClose,
  onSaved,
  onActivitySaved,
}) {
  const { user } = useAuth()
  const isEdit = !!activity
  const { dragRef, pos } = useDraggable()

  const [gmailConnected, setGmailConnected] = useState(false)
  const [useGoogleMeet,  setUseGoogleMeet]  = useState(false)
  const [users, setUsers] = useState([])

  const [pickedCompanyId,   setPickedCompanyId]   = useState(isEdit ? activity.companyId : (companyId || ''))
  const [pickedCompanyName, setPickedCompanyName] = useState(isEdit ? (activity.company?.name || '') : '')

  const editDurationM = isEdit && activity.startTime && activity.endTime
    ? String(Math.max(5, Math.round((new Date(activity.endTime) - new Date(activity.startTime)) / 60000)))
    : '30'

  const [title,        setTitle]        = useState(isEdit ? (activity.title || '') : '')
  const [start,        setStart]        = useState(isEdit && activity.startTime ? activity.startTime.slice(0, 16) : todayStr())
  const [durationM,    setDurationM]    = useState(editDurationM)
  const [location,     setLocation]     = useState(isEdit ? (activity.location || '') : '')
  const [attendees,    setAttendees]    = useState(isEdit ? (activity.participants || '') : (contactEmail || ''))
  const [status,       setStatus]       = useState(isEdit ? (activity.meetingStatus || 'scheduled') : 'scheduled')
  const [body,         setBody]         = useState(isEdit ? (activity.body || '') : '')
  const [assignedTo,   setAssignedTo]   = useState(isEdit ? (activity.assignedToId || '') : (user?.id || ''))
  const [customFields, setCustomFields] = useState(isEdit ? extractCustomFieldValues(activity) : {})
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  // Company is now optional — show picker only when not already linked
  const needsCompanyPicker = !companyId && !(isEdit && activity.companyId)

  const [savedMeetLink, setSavedMeetLink] = useState(null)

  useEffect(() => {
    if (!isOpen || isEdit) return
    api.get('/email/status')
      .then(r => {
        setGmailConnected(r.data.connected)
        if (r.data.connected) setUseGoogleMeet(true)
      })
      .catch(() => setGmailConnected(false))
  }, [isOpen, isEdit])

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})
  }, [])

  const endTime = addMinutes(start, Number(durationM))

  const save = async () => {
    if (!title.trim()) { setError('Please enter a meeting title.'); return }
    // Company is now OPTIONAL — no validation required
    setSaving(true); setError('')

    try {
      let data

      if (isEdit) {
        const startTime = new Date(start)
        const endTimeDate = new Date(startTime.getTime() + Number(durationM) * 60000)
        const res = await api.put(`/activities/${activity.id}`, {
          title: title.trim(),
          body: body || null,
          startTime: startTime.toISOString(),
          endTime: endTimeDate.toISOString(),
          meetingStatus: status,
          location: location || null,
          participants: attendees || null,
          assignedToId: assignedTo || null,
          customFields,
        })
        data = res.data
      } else if (useGoogleMeet && gmailConnected) {
        const startDate = new Date(start)
        const endDate   = new Date(startDate.getTime() + Number(durationM) * 60000)
        const res = await api.post('/calendar/schedule', {
          title:     title.trim(),
          startTime: startDate.toISOString(),
          endTime:   endDate.toISOString(),
          description: body || null,
          location:    location || null,
          attendees:   attendees,
          companyId: pickedCompanyId || null,
          assignedToId: assignedTo || null,
          customFields,
        })
        data = res.data

        if (data.meetLink) {
          setSavedMeetLink(data.meetLink)
          if (onSaved) onSaved(data)
          if (onActivitySaved) onActivitySaved(data)
          setSaving(false)
          return
        }

        setError('Meeting saved but no Google Meet link was generated. Check your Google account settings.')
        setSaving(false)
        return
      } else {
        const startTime = new Date(start)
        const endTimeDate = new Date(startTime.getTime() + Number(durationM) * 60000)
        const res = await api.post('/activities', {
          type: 'meeting',
          companyId: pickedCompanyId || null,
          title: title.trim(),
          body: body || null,
          startTime: startTime.toISOString(),
          endTime: endTimeDate.toISOString(),
          meetingStatus: status,
          location: location || null,
          participants: attendees || null,
          assignedToId: assignedTo || null,
          customFields,
        })
        data = res.data
      }

      if (onSaved) onSaved(data)
      if (onActivitySaved) onActivitySaved(data)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.message || `Failed to ${isEdit ? 'update' : 'save'} meeting.`)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  // Success screen after Google Meet scheduling
  if (savedMeetLink) {
    return createPortal(
      <div className="act-popup-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="act-popup" ref={dragRef} style={{ width: 480, transform: `translate(${pos.x}px, ${pos.y}px)` }}>
          <div className="act-popup-header">
            <div className="act-popup-title"><Calendar size={15} /> Meeting Scheduled</div>
            <button className="act-popup-icon-btn" onClick={onClose}><X size={15} /></button>
          </div>
          <div className="act-popup-body" style={{ textAlign: 'center', padding: '40px 28px' }}>
            <div style={{ width: 64, height: 64, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle size={32} color="#16a34a" />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, color: '#0f172a', fontWeight: 700 }}>Meeting scheduled!</h3>
            <p style={{ color: '#344054', fontSize: 16, marginBottom: 24, lineHeight: 1.6 }}>
              Google Calendar event created. Invitations sent to all attendees.
            </p>
            <a
              href={savedMeetLink}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#1a73e8', color: '#fff', padding: '11px 22px',
                borderRadius: 8, textDecoration: 'none', fontSize: 17, fontWeight: 600,
              }}
            >
              <Video size={16} /> Join Google Meet <ExternalLink size={13} />
            </a>
            <div style={{ marginTop: 12, fontSize: 14, color: '#475467', wordBreak: 'break-all' }}>{savedMeetLink}</div>
          </div>
          <div className="act-popup-footer">
            <div className="act-popup-footer-right" style={{ marginLeft: 'auto' }}>
              <button className="btn-act-save" onClick={onClose}>Done</button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  const durationLabel = DURATION_OPTIONS.find(d => d.value === durationM)?.label || `${durationM} min`

  return createPortal(
    <div className="act-popup-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="act-popup mm-popup" ref={dragRef} style={{ width: 640, transform: `translate(${pos.x}px, ${pos.y}px)` }}>

        {/* Header */}
        <div className="act-popup-header">
          <div className="act-popup-title">
            <Calendar size={15} />
            {isEdit ? 'Edit Meeting' : (useGoogleMeet ? 'Schedule Meeting' : 'Log a Meeting')}
            {contactName ? <span style={{ opacity: 0.65, fontWeight: 400 }}> — {contactName}</span> : ''}
          </div>
          <div className="act-popup-header-actions">
            <button className="act-popup-icon-btn" onClick={onClose} title="Close"><X size={15} /></button>
          </div>
        </div>

        {/* Google Meet toggle banner */}
        {gmailConnected && (
          <div className="mm-meet-banner">
            <label className="mm-meet-label">
              <input
                type="checkbox"
                checked={useGoogleMeet}
                onChange={e => setUseGoogleMeet(e.target.checked)}
                style={{ accentColor: '#1a73e8', width: 14, height: 14, cursor: 'pointer' }}
              />
              <Video size={14} color="#1a73e8" />
              <span className="mm-meet-text">Create Google Meet link</span>
              <span className="mm-meet-sub">Sends calendar invite to all attendees</span>
            </label>
          </div>
        )}

        <div className="act-popup-body mm-body">

          {/* Section: Title */}
          <div className="mm-section">
            <div className="mm-field-icon"><Type size={14} /></div>
            <div className="mm-field-content">
              <input
                type="text"
                className="mm-title-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Meeting title  (e.g. Product Demo Call)"
                autoFocus
              />
            </div>
          </div>

          <div className="mm-divider" />

          {/* Section: Date, Duration, Status */}
          <div className="mm-section">
            <div className="mm-field-icon"><Clock size={14} /></div>
            <div className="mm-field-content mm-row">
              <div className="mm-field-group">
                <label className="mm-label">Start Date & Time</label>
                <input
                  type="datetime-local"
                  className="mm-input"
                  value={start}
                  onChange={e => setStart(e.target.value)}
                />
              </div>
              <div className="mm-field-group" style={{ maxWidth: 140 }}>
                <label className="mm-label">Duration</label>
                <select className="mm-input mm-select" value={durationM} onChange={e => setDurationM(e.target.value)}>
                  {(DURATION_OPTIONS.some(d => d.value === durationM) ? DURATION_OPTIONS : [{ value: durationM, label: `${durationM} min` }, ...DURATION_OPTIONS]).map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              {!useGoogleMeet && (
                <div className="mm-field-group" style={{ maxWidth: 150 }}>
                  <label className="mm-label">Status</label>
                  <select className="mm-input mm-select" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="scheduled">🕐 Scheduled</option>
                    <option value="completed">✅ Completed</option>
                    <option value="cancelled">❌ Cancelled</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="mm-divider" />

          {/* Section: Company (optional) */}
          {needsCompanyPicker && (
            <>
              <div className="mm-section">
                <div className="mm-field-icon"><Building2 size={14} /></div>
                <div className="mm-field-content">
                  <label className="mm-label">
                    Company
                    <span className="mm-optional-badge">optional</span>
                  </label>
                  <CompanyPicker
                    value={pickedCompanyId}
                    label={pickedCompanyName}
                    onChange={(id, name) => { setPickedCompanyId(id); setPickedCompanyName(name) }}
                  />
                </div>
              </div>
              <div className="mm-divider" />
            </>
          )}

          {/* Section: Assign To */}
          <div className="mm-section">
            <div className="mm-field-icon"><User size={14} /></div>
            <div className="mm-field-content">
              <label className="mm-label">Assigned To</label>
              <select className="mm-input mm-select" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
              </select>
            </div>
          </div>

          <div className="mm-divider" />

          {/* Section: Location & Participants */}
          {useGoogleMeet ? (
            <div className="mm-section">
              <div className="mm-field-icon"><Users size={14} /></div>
              <div className="mm-field-content">
                <label className="mm-label">Attendees <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 14 }}>(email addresses, comma-separated)</span></label>
                <input
                  type="text"
                  className="mm-input"
                  value={attendees}
                  onChange={e => setAttendees(e.target.value)}
                  placeholder="user@company.com, client@example.com"
                />
              </div>
            </div>
          ) : (
            <div className="mm-section">
              <div className="mm-field-icon"><MapPin size={14} /></div>
              <div className="mm-field-content mm-row">
                <div className="mm-field-group">
                  <label className="mm-label">Location</label>
                  <input
                    type="text"
                    className="mm-input"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="Office, Zoom link, etc."
                  />
                </div>
                <div className="mm-field-group">
                  <label className="mm-label">Participants <span style={{ fontWeight: 400, textTransform: 'none' }}>(emails, comma-separated)</span></label>
                  <input
                    type="text"
                    className="mm-input"
                    value={attendees}
                    onChange={e => setAttendees(e.target.value)}
                    placeholder="user@company.com, …"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="mm-divider" />

          {/* Section: Description */}
          <div className="mm-section">
            <div className="mm-field-icon"><AlignLeft size={14} /></div>
            <div className="mm-field-content">
              <label className="mm-label">
                Description / Agenda
                <span className="mm-optional-badge">optional</span>
              </label>
              <textarea
                className="mm-input mm-textarea"
                rows={3}
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="What will be discussed? Add agenda, notes, or goals…"
              />
            </div>
          </div>

          <CustomFieldsSection
            entity="Meeting"
            values={customFields}
            onChange={(key, value) => setCustomFields(p => ({ ...p, [key]: value }))}
          />

          {error && (
            <div className="mm-error">
              <span>⚠</span> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="act-popup-footer">
          <div className="act-popup-footer-left">
            {!isEdit && !gmailConnected && (
              <span style={{ fontSize: 14, color: '#475467', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Video size={12} /> Connect Gmail to use Google Meet
              </span>
            )}
          </div>
          <div className="act-popup-footer-right">
            <button className="btn-act-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-act-save mm-save-btn" onClick={save} disabled={saving}>
              {isEdit ? (
                <><Calendar size={13} /> {saving ? 'Saving…' : 'Save Changes'}</>
              ) : useGoogleMeet ? (
                <><Video size={13} /> {saving ? 'Scheduling…' : 'Schedule & Create Meet'}</>
              ) : (
                <><Calendar size={13} /> {saving ? 'Saving…' : 'Log Meeting'}</>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body,
  )
}
