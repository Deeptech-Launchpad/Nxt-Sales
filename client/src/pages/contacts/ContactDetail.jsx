import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronLeft, FileText, Mail, Phone,
  CheckSquare, Calendar, MoreHorizontal, Search,
  Plus, ExternalLink, Loader2
} from 'lucide-react'
import api from '../../api/client'
import NoteModal    from '../../components/activities/NoteModal'
import EmailModal   from '../../components/activities/EmailModal'
import CallModal    from '../../components/activities/CallModal'
import MeetingModal from '../../components/activities/MeetingModal'
import TaskModal    from '../../components/activities/TaskModal'
import ActivityFeed    from '../../components/activities/ActivityFeed'
import EditRecordModal from '../../components/EditRecordModal'
import '../../styles/detail-page.css'
import '../../styles/activity-modals.css'

const LEFT_FIELDS = [
  { label: 'Email',           key: 'email',        isEmail: true },
  { label: 'Phone number',    key: 'phone',        isPhone: true  },
  { label: 'Contact owner',   key: '_ownerName'                  },
  { label: 'Job title',       key: 'jobTitle'                    },
  { label: 'Lifecycle stage', key: 'lifecycleStage'              },
  { label: 'Lead status',     key: 'leadStatus'                  },
  { label: 'Primary company', key: 'company'                     },
]

const CENTER_TABS = ['Overview', 'Activities', 'Intelligence']

// ── Overview tab ─────────────────────────────────────────
function OverviewTab({ contact, recentActs, onAction }) {
  const createdAt = contact.createdAt
    ? new Date(contact.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '--'

  return (
    <div>
      <div className="data-highlights">
        <div className="highlight-item">
          <span className="highlight-label">Create Date</span>
          <span className="highlight-value">{createdAt}</span>
        </div>
        <div className="highlight-item">
          <span className="highlight-label">Lifecycle Stage</span>
          <span className="highlight-value">{contact.lifecycleStage || '--'}</span>
        </div>
        <div className="highlight-item">
          <span className="highlight-label">Lead Status</span>
          <span className="highlight-value">{contact.leadStatus || '--'}</span>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">
          Recent activities
          <div className="section-actions">
            <div className="section-search"><Search size={12} color="#94a3b8" /><input type="text" placeholder="Search" /></div>
            <button className="section-btn" onClick={() => onAction('note')}>Add activities <ChevronDown size={12} /></button>
          </div>
        </div>
        {recentActs.length === 0 ? (
          <div className="empty-assoc"><p>No recent activities. Log a note, call, or email below.</p></div>
        ) : recentActs.slice(0, 5).map(a => (
          <div key={a.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f8fafc', fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{a.title || a.type}</span>
            <span style={{ marginLeft: 8, color: '#94a3b8', fontSize: 11 }}>
              {new Date(a.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        ))}
      </div>

      <div className="detail-section">
        <div className="detail-section-header">Companies <button className="section-btn"><Plus size={12} /> Add</button></div>
        {contact.company
          ? <div style={{ padding: '12px 16px', fontSize: 13, color: '#3b82f6', fontWeight: 500 }}>{contact.company}</div>
          : <div className="empty-assoc"><p>No associated company.</p></div>}
      </div>

      <div className="detail-section">
        <div className="detail-section-header">
          Deals ({contact.deals?.length || 0})
          <button className="section-btn"><Plus size={12} /> Add</button>
        </div>
        {(contact.deals || []).length === 0 ? (
          <div className="empty-assoc"><p>No deals associated with this contact.</p></div>
        ) : contact.deals.map(d => (
          <div key={d.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f8fafc' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>{d.title}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{d.stage} · ₹{d.value?.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="detail-section">
        <div className="detail-section-header">Tickets (0) <button className="section-btn"><Plus size={12} /> Add</button></div>
        <div className="empty-assoc"><p>No tickets associated.</p></div>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">Pinned activity</div>
        <div className="empty-assoc"><p>There is no pinned activity on this record.</p></div>
      </div>
    </div>
  )
}

// ── Intelligence tab ──────────────────────────────────────
function IntelligenceTab({ contact }) {
  return (
    <div>
      <div className="data-highlights" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 20 }}>
        <div className="highlight-item">
          <span className="highlight-label">Lifecycle Stage</span>
          <span className="highlight-value">{contact.lifecycleStage || '--'}</span>
        </div>
        <div className="highlight-item">
          <span className="highlight-label">Lead Status</span>
          <span className="highlight-value">{contact.leadStatus || '--'}</span>
        </div>
      </div>
      {contact.company && (
        <div className="intel-description-box">
          <div className="intel-description-label">Primary Company</div>
          <p className="intel-description-text">{contact.company}</p>
        </div>
      )}
      <div className="intel-fields">
        {[
          { key: 'Email',     val: contact.email    },
          { key: 'Phone',     val: contact.phone    },
          { key: 'Job Title', val: contact.jobTitle  },
          { key: 'Company',   val: contact.company  },
        ].filter(f => f.val).map(f => (
          <div key={f.key} className="intel-field-row">
            <span className="intel-field-key">{f.key}</span>
            <span className="intel-field-val">{f.val}</span>
          </div>
        ))}
      </div>
      {!contact.company && !contact.jobTitle && (
        <div className="empty-assoc" style={{ marginTop: 24 }}><p>No intelligence data available for this contact.</p></div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────
export default function ContactDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [contact,    setContact]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [notFound,   setNotFound]   = useState(false)
  const [centerTab,  setCenterTab]  = useState('Overview')
  const [recentActs, setRecentActs] = useState([])

  // Active modal: null | 'note' | 'email' | 'call' | 'meeting' | 'task'
  const [activeModal,    setActiveModal]    = useState(null)
  const [feedRefreshKey, setFeedRefreshKey] = useState(0)
  const [editOpen,       setEditOpen]       = useState(false)

  useEffect(() => {
    setLoading(true); setNotFound(false)
    api.get(`/contacts/${id}`)
      .then(r => setContact(r.data))
      .catch(e => { if (e.response?.status === 404) setNotFound(true) })
      .finally(() => setLoading(false))
  }, [id])

  // Load recent activities for Overview tab
  useEffect(() => {
    if (!id) return
    api.get('/activities', { params: { contactId: id, type: 'all' } })
      .then(r => setRecentActs(r.data))
      .catch(() => {})
  }, [id])

  const onActivitySaved = (newAct) => {
    setRecentActs(prev => [newAct, ...prev])
    setFeedRefreshKey(k => k + 1)
  }

  const openModal = (type) => { setActiveModal(type); setCenterTab('Activities') }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10, color: '#94a3b8' }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading contact…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (notFound || !contact) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
      Contact not found.{' '}
      <span style={{ color: '#3b82f6', cursor: 'pointer', fontWeight: 500 }} onClick={() => navigate('/contacts')}>
        ← Back to Contacts
      </span>
    </div>
  )

  const displayName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email
  const initials    = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const enriched    = { ...contact, _ownerName: contact.owner?.name || null }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="detail-layout">

        {/* ── LEFT ── */}
        <div className="detail-left">
          <div className="detail-left-nav">
            <span className="detail-back-link" onClick={() => navigate('/contacts')}>
              <ChevronLeft size={14} /> Contacts
            </span>
            <button className="detail-actions-btn">Actions <ChevronDown size={12} /></button>
          </div>

          <div className="detail-entity-header">
            <div className="detail-entity-logo" style={{ borderRadius: '50%', background: 'linear-gradient(135deg,#e63329,#c0271e)' }}>
              {initials}
            </div>
            <h2 className="detail-entity-name">{displayName}</h2>
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="detail-entity-domain">
                {contact.email} <ExternalLink size={11} />
              </a>
            )}
          </div>

          {/* Action buttons */}
          <div className="detail-action-icons">
            {[
              { Icon: FileText,       label: 'Note',    type: 'note'    },
              { Icon: Mail,           label: 'Email',   type: 'email'   },
              { Icon: Phone,          label: 'Call',    type: 'call'    },
              { Icon: CheckSquare,    label: 'Task',    type: 'task'    },
              { Icon: Calendar,       label: 'Meeting', type: 'meeting' },
              { Icon: MoreHorizontal, label: 'More',    type: null      },
            ].map(({ Icon, label, type }) => (
              <button
                key={label}
                className="action-icon-btn"
                onClick={() => {
                  if (type === 'call') {
                    const phone = contact?.phone || ''
                    const dialUrl = phone
                      ? `https://dialer.callhippo.com/dial#/?phone=${encodeURIComponent(phone)}`
                      : 'https://dialer.callhippo.com/dial#/'
                    if (phone) navigator.clipboard.writeText(phone).catch(() => {})
                    window.open(dialUrl, '_blank', 'noreferrer')
                  } else {
                    type && openModal(type)
                  }
                }}
              >
                <Icon size={16} />{label}
              </button>
            ))}
          </div>

          <div className="detail-about-header">
            About this contact
            <button className="detail-actions-btn" onClick={() => setEditOpen(true)}>Edit</button>
          </div>

          <div className="detail-field-list">
            {LEFT_FIELDS.map(f => {
              const val = enriched[f.key]
              return (
                <div key={f.key} className="detail-field-row">
                  <span className="detail-field-label">{f.label}</span>
                  {f.isEmail && val
                    ? <a href={`mailto:${val}`} className="detail-field-value link">{val}</a>
                    : f.isPhone && val
                    ? <span className="detail-field-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {val}
                        <button
                          title="Open CallHippo dialer"
                          onClick={() => {
                            const phone = val || ''
                            const dialUrl = phone
                              ? `https://dialer.callhippo.com/dial#/?phone=${encodeURIComponent(phone)}`
                              : 'https://dialer.callhippo.com/dial#/'
                            if (phone) navigator.clipboard.writeText(phone).catch(() => {})
                            window.open(dialUrl, '_blank', 'noreferrer')
                          }}
                          style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', padding: 0 }}
                        >
                          <Phone size={14} />
                        </button>
                      </span>
                    : <span className="detail-field-value">{val || '--'}</span>}
                </div>
              )
            })}
          </div>

          <button className="detail-create-activities" onClick={() => openModal('note')}>
            Create activities <ChevronDown size={13} />
          </button>
        </div>

        {/* ── CENTER ── */}
        <div className="detail-center">
          <div className="detail-center-tabs">
            {CENTER_TABS.map(t => (
              <button key={t} className={`detail-tab ${centerTab === t ? 'active' : ''}`} onClick={() => setCenterTab(t)}>{t}</button>
            ))}
          </div>

          {centerTab === 'Overview' && (
            <div className="detail-center-body">
              <OverviewTab contact={contact} recentActs={recentActs} onAction={openModal} />
            </div>
          )}

          {centerTab === 'Activities' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ActivityFeed contactId={id} contactEmail={contact.email} onAction={openModal} refreshKey={feedRefreshKey} />
            </div>
          )}

          {centerTab === 'Intelligence' && (
            <div className="detail-center-body">
              <IntelligenceTab contact={contact} />
            </div>
          )}
        </div>

        {/* ── RIGHT ── */}
        <div className="detail-right">
          <div className="right-panel-section">
            <div className="right-panel-header">
              <div className="right-panel-header-left"><ChevronDown size={14} /> Companies ({contact.company ? 1 : 0})</div>
              <button className="right-panel-add"><Plus size={12} /> Add</button>
            </div>
            {contact.company ? (
              <div className="contact-card">
                <div className="contact-card-header">
                  <div className="contact-card-logo">
                    {contact.company.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>{contact.company}</span>
                </div>
              </div>
            ) : (
              <div className="right-empty-state"><p className="right-empty-text">No associated company.</p></div>
            )}
          </div>

          <div className="right-panel-section">
            <div className="right-panel-header">
              <div className="right-panel-header-left"><ChevronDown size={14} /> Deals ({contact.deals?.length || 0})</div>
              <button className="right-panel-add"><Plus size={12} /> Add</button>
            </div>
            {(contact.deals || []).length === 0 ? (
              <div className="right-empty-state"><p className="right-empty-text">Track the revenue opportunities associated with this record.</p></div>
            ) : contact.deals.map(d => (
              <div key={d.id} className="contact-card">
                <div style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>{d.title}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{d.stage} · ₹{d.value?.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="right-panel-section">
            <div className="right-panel-header">
              <div className="right-panel-header-left"><ChevronDown size={14} /> Tickets (0)</div>
              <button className="right-panel-add"><Plus size={12} /> Add</button>
            </div>
            <div className="right-empty-state"><p className="right-empty-text">No tickets associated.</p></div>
          </div>

          <div className="right-panel-section">
            <div className="right-panel-header">
              <div className="right-panel-header-left"><ChevronDown size={14} /> Activity summary</div>
            </div>
            <div style={{ padding: '8px 16px 16px' }}>
              {[
                { label: 'Total activities', val: recentActs.length },
                { label: 'Notes',            val: recentActs.filter(a => a.type === 'note').length },
                { label: 'Emails',           val: recentActs.filter(a => a.type === 'email').length },
                { label: 'Calls',            val: recentActs.filter(a => a.type === 'call').length },
                { label: 'Meetings',         val: recentActs.filter(a => a.type === 'meeting').length },
                { label: 'Tasks',            val: recentActs.filter(a => a.type === 'task').length },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f8fafc' }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{f.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>{f.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Edit contact modal ── */}
      {editOpen && (
        <EditRecordModal
          type="contact"
          id={id}
          record={contact}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => setContact(prev => ({ ...prev, ...updated }))}
        />
      )}

      {/* ── Activity Modals ── */}
      {activeModal === 'note' && (
        <NoteModal
          contactId={id}
          onClose={() => setActiveModal(null)}
          onSaved={onActivitySaved}
        />
      )}
      {activeModal === 'email' && (
        <EmailModal
          contactId={id}
          contactEmail={contact.email}
          onClose={() => setActiveModal(null)}
          onSaved={onActivitySaved}
        />
      )}
      {activeModal === 'call' && (
        <CallModal
          contactId={id}
          contactName={displayName}
          onClose={() => setActiveModal(null)}
          onSaved={onActivitySaved}
        />
      )}
      {activeModal === 'meeting' && (
        <MeetingModal
          contactId={id}
          contactName={displayName}
          contactEmail={contact.email}
          onClose={() => setActiveModal(null)}
          onSaved={onActivitySaved}
        />
      )}
      {activeModal === 'task' && (
        <TaskModal
          contactId={id}
          contactName={displayName}
          onClose={() => setActiveModal(null)}
          onSaved={onActivitySaved}
        />
      )}
    </>
  )
}
