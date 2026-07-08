import { useState, useEffect } from 'react'
import { X, Calendar, Video, CheckCircle, ExternalLink } from 'lucide-react'
import api from '../../api/client'
import { useDraggable } from '../../hooks/useDraggable'
import '../../styles/activity-modals.css'

function todayStr() {
  return new Date().toISOString().slice(0, 16)
}

function addMinutes(isoStr, minutes) {
  const d = new Date(isoStr)
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString().slice(0, 16)
}

export default function MeetingModal({
  isOpen = true,
  contactId,
  companyId,
  contactName,
  contactEmail,
  onClose,
  onSaved,
  onActivitySaved,
}) {
  const { dragRef, pos } = useDraggable()

  const [gmailConnected, setGmailConnected] = useState(false)
  const [useGoogleMeet,  setUseGoogleMeet]  = useState(false)

  const [title,        setTitle]        = useState('')
  const [start,        setStart]        = useState(todayStr())
  const [durationM,    setDurationM]    = useState('30')
  const [location,     setLocation]     = useState('')
  const [attendees,    setAttendees]    = useState(contactEmail || '')
  const [status,       setStatus]       = useState('scheduled')
  const [body,         setBody]         = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  // Result after Google Meet scheduling
  const [savedMeetLink, setSavedMeetLink] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    api.get('/email/status')
      .then(r => {
        setGmailConnected(r.data.connected)
        if (r.data.connected) setUseGoogleMeet(true)
      })
      .catch(() => setGmailConnected(false))
  }, [isOpen])

  const endTime = addMinutes(start, Number(durationM))

  const save = async () => {
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true); setError('')

    try {
      let data

      if (useGoogleMeet && gmailConnected) {
        // Schedule via Google Calendar + generate Meet link
        const startDate = new Date(start)
        const endDate   = new Date(startDate.getTime() + Number(durationM) * 60000)
        const res = await api.post('/calendar/schedule', {
          title:     title.trim(),
          startTime: startDate.toISOString(),
          endTime:   endDate.toISOString(),
          description: body || null,
          location:    location || null,
          attendees:   attendees,
          ...(contactId && { contactId }),
          ...(companyId && { companyId }),
        })
        data = res.data

        if (data.meetLink) {
          setSavedMeetLink(data.meetLink)
          if (onSaved) onSaved(data)
          if (onActivitySaved) onActivitySaved(data)
          setSaving(false)
          return
        }

        // Calendar API returned no Meet link — show error, do not close
        setError('Meeting saved but no Google Meet link was generated. Check your Google account settings.')
        setSaving(false)
        return
      } else {
        // Manual log via activities route
        const startTime = new Date(start)
        const endTimeDate = new Date(startTime.getTime() + Number(durationM) * 60000)
        const res = await api.post('/activities', {
          type: 'meeting',
          ...(contactId && { contactId }),
          ...(companyId && { companyId }),
          title: title.trim(),
          body: body || null,
          startTime: startTime.toISOString(),
          endTime: endTimeDate.toISOString(),
          meetingStatus: status,
          location: location || null,
          participants: attendees || null,
        })
        data = res.data
      }

      if (onSaved) onSaved(data)
      if (onActivitySaved) onActivitySaved(data)
      onClose()
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save meeting.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  // Show Meet link result card
  if (savedMeetLink) {
    return (
      <div className="act-popup-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="act-popup" ref={dragRef} style={{ width: 500, transform: `translate(${pos.x}px, ${pos.y}px)` }}>
          <div className="act-popup-header">
            <div className="act-popup-title"><Calendar size={15} /> Meeting Scheduled</div>
            <button className="act-popup-icon-btn" onClick={onClose}><X size={15} /></button>
          </div>
          <div className="act-popup-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <CheckCircle size={48} style={{ color: '#10b981', marginBottom: 16 }} />
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#0f172a' }}>Meeting scheduled successfully!</h3>
            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
              Google Calendar event created. Invitations sent to attendees.
            </p>
            <a
              href={savedMeetLink}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#1a73e8', color: '#fff', padding: '10px 20px',
                borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600,
              }}
            >
              <Video size={16} /> Join Google Meet <ExternalLink size={13} />
            </a>
            <div style={{ marginTop: 12, fontSize: 12, color: '#94a3b8', wordBreak: 'break-all' }}>{savedMeetLink}</div>
          </div>
          <div className="act-popup-footer">
            <div className="act-popup-footer-right" style={{ marginLeft: 'auto' }}>
              <button className="btn-act-save" onClick={onClose}>Done</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="act-popup-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="act-popup" ref={dragRef} style={{ width: 640, transform: `translate(${pos.x}px, ${pos.y}px)` }}>

        <div className="act-popup-header">
          <div className="act-popup-title">
            <Calendar size={15} /> {useGoogleMeet ? 'Schedule meeting' : 'Log a meeting'}
            {contactName ? ` — ${contactName}` : ''}
          </div>
          <div className="act-popup-header-actions">
            <button className="act-popup-icon-btn" onClick={onClose}><X size={15} /></button>
          </div>
        </div>

        {/* Google Meet toggle */}
        {gmailConnected && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={useGoogleMeet}
                onChange={e => setUseGoogleMeet(e.target.checked)}
                style={{ accentColor: '#1a73e8', width: 15, height: 15 }}
              />
              <Video size={14} style={{ color: '#1a73e8' }} />
              <span style={{ fontWeight: 500, color: '#0f172a' }}>Create Google Meet link</span>
              <span style={{ color: '#64748b', fontWeight: 400 }}>— sends calendar invite to attendees</span>
            </label>
          </div>
        )}

        <div className="act-popup-body">
          <div className="act-form-group" style={{ marginBottom: 12 }}>
            <label>Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Product demo call"
              autoFocus
            />
          </div>

          <div className="act-form-row" style={{ marginBottom: 12 }}>
            <div className="act-form-group">
              <label>Start date & time</label>
              <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="act-form-group" style={{ maxWidth: 140 }}>
              <label>Duration (min)</label>
              <select value={durationM} onChange={e => setDurationM(e.target.value)}>
                {['15', '30', '45', '60', '90', '120'].map(v => (
                  <option key={v} value={v}>{v} min</option>
                ))}
              </select>
            </div>
            {!useGoogleMeet && (
              <div className="act-form-group" style={{ maxWidth: 160 }}>
                <label>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            )}
          </div>

          {useGoogleMeet ? (
            <div className="act-form-group" style={{ marginBottom: 12 }}>
              <label>Attendees (email addresses, comma-separated)</label>
              <input
                type="text"
                value={attendees}
                onChange={e => setAttendees(e.target.value)}
                placeholder="user@company.com, client@example.com"
              />
            </div>
          ) : (
            <div className="act-form-row" style={{ marginBottom: 12 }}>
              <div className="act-form-group">
                <label>Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="Office, Zoom link, etc."
                />
              </div>
              <div className="act-form-group">
                <label>Participants (emails, comma-separated)</label>
                <input
                  type="text"
                  value={attendees}
                  onChange={e => setAttendees(e.target.value)}
                  placeholder="user@company.com, …"
                />
              </div>
            </div>
          )}

          <div className="act-form-group">
            <label>Description / Agenda</label>
            <textarea
              rows={3}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="What will be discussed?"
            />
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 12, marginTop: 6, fontWeight: 500 }}>{error}</p>}
        </div>

        <div className="act-popup-footer">
          <div className="act-popup-footer-left">
            {!gmailConnected && (
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                Connect Gmail to schedule with Google Meet
              </span>
            )}
          </div>
          <div className="act-popup-footer-right">
            <button className="btn-act-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-act-save" onClick={save} disabled={saving}>
              {useGoogleMeet
                ? <><Video size={13} /> {saving ? 'Scheduling…' : 'Schedule & Create Meet'}</>
                : <><Calendar size={13} /> {saving ? 'Saving…' : 'Log meeting'}</>
              }
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
