import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronDown, ChevronLeft, FileText, Mail, Phone,
  CheckSquare, Calendar, MoreHorizontal, Search,
  Plus, ExternalLink, Loader2, Pencil, Trash2
} from 'lucide-react'
import api from '../../api/client'
import NoteModal    from '../../components/activities/NoteModal'
import EmailModal   from '../../components/activities/EmailModal'
import CallModal    from '../../components/activities/CallModal'
import MeetingModal from '../../components/activities/MeetingModal'
import TaskModal    from '../../components/activities/TaskModal'
import ActivityFeed      from '../../components/activities/ActivityFeed'
import EditRecordModal   from '../../components/EditRecordModal'
import CreateDealModal   from '../../components/modals/CreateDealModal'
import { valueList } from '../../utils/multiValue'
import '../../styles/detail-page.css'
import '../../styles/activity-modals.css'

// Small "Primary" tag shown next to the first value when there are several.
const PRIMARY_TAG = {
  fontSize: 9, fontWeight: 700, color: '#0d9488', background: '#f0fdfa',
  border: '1px solid #99f6e4', borderRadius: 3, padding: '1px 4px', marginLeft: 6,
}

const LEFT_FIELDS = [
  { label: 'Email',           key: 'email',        isEmail: true },
  { label: 'Phone number',    key: 'phone',        isPhone: true  },
  { label: 'Company URL',     key: 'domain'                      },
  { label: 'Lead Owner',      key: '_ownerName'                  },
  { label: 'Industry',        key: 'industry'                    },
  { label: 'Lifecycle stage', key: 'lifecycleStage'              },
  { label: 'Lead status',     key: 'leadStatus'                  },
  { label: 'Contact Person',  key: 'contactPersons', isMulti: true },
  { label: 'Linked Profile',  key: 'linkedProfiles',  isMulti: true },
  { label: 'End PDP URL',     key: 'endPdpUrl'                    },
  { label: 'CMS',             key: 'cms'                          },
  { label: 'Remarks',         key: 'remarks'                      },
]

const CENTER_TABS = ['Overview', 'Activities', 'Intelligence']

function OverviewTab({ company, recentActs, onAction }) {
  const createdAt = company.createdAt
    ? new Date(company.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
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
          <span className="highlight-value">{company.lifecycleStage || '--'}</span>
        </div>
        <div className="highlight-item">
          <span className="highlight-label">Lead Status</span>
          <span className="highlight-value">{company.leadStatus || '--'}</span>
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
    </div>
  )
}

function IntelligenceTab({ company }) {
  return (
    <div>
      <div className="data-highlights" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 20 }}>
        <div className="highlight-item">
          <span className="highlight-label">Lifecycle Stage</span>
          <span className="highlight-value">{company.lifecycleStage || '--'}</span>
        </div>
        <div className="highlight-item">
          <span className="highlight-label">Lead Status</span>
          <span className="highlight-value">{company.leadStatus || '--'}</span>
        </div>
      </div>
      <div className="intel-fields">
        {[
          { key: 'Email',    val: company.email    },
          { key: 'Phone',    val: company.phone    },
          { key: 'Company URL', val: company.domain },
          { key: 'Industry', val: company.industry },
        ].filter(f => f.val).map(f => (
          <div key={f.key} className="intel-field-row">
            <span className="intel-field-key">{f.key}</span>
            <span className="intel-field-val">{f.val}</span>
          </div>
        ))}
      </div>
      {!company.email && !company.domain && !company.industry && (
        <div className="empty-assoc" style={{ marginTop: 24 }}><p>No intelligence data available.</p></div>
      )}
    </div>
  )
}

export default function CompanyDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()

  const [company,    setCompany]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [notFound,   setNotFound]   = useState(false)
  const [centerTab,  setCenterTab]  = useState('Overview')
  const [recentActs, setRecentActs] = useState([])

  const [activeModal,     setActiveModal]     = useState(null)
  const [feedRefreshKey,  setFeedRefreshKey]  = useState(0)
  const [editOpen,        setEditOpen]        = useState(false)
  const [deals,           setDeals]           = useState([])
  const [showDealModal,   setShowDealModal]   = useState(false)
  const [editDeal,        setEditDeal]        = useState(null)

  useEffect(() => {
    setLoading(true); setNotFound(false)
    api.get(`/companies/${id}`)
      .then(r => setCompany(r.data))
      .catch(e => { if (e.response?.status === 404) setNotFound(true) })
      .finally(() => setLoading(false))
  }, [id])

  // Deals linked to this company (also visible on the global Deals dashboard).
  const fetchDeals = () => {
    if (!id) return
    api.get('/deals', { params: { companyId: id } })
      .then(r => setDeals(Array.isArray(r.data) ? r.data : []))
      .catch(() => setDeals([]))
  }
  useEffect(() => { fetchDeals() }, [id])

  const handleDeleteDeal = async (dealId) => {
    if (!window.confirm('Delete this deal? This action cannot be undone.')) return
    try {
      await api.delete(`/deals/${dealId}`)
      setDeals(prev => prev.filter(d => d.id !== dealId))
    } catch {
      // no-op — matches existing lightweight error handling style on this page
    }
  }

  useEffect(() => {
    if (!id) return
    api.get('/activities', { params: { companyId: id, type: 'all' } })
      .then(r => setRecentActs(r.data))
      .catch(() => {})
  }, [id, feedRefreshKey])

  const onActivitySaved = (newAct) => {
    setRecentActs(prev => [newAct, ...prev])
    setFeedRefreshKey(k => k + 1)
  }

  const openModal = (type) => { setActiveModal(type); setCenterTab('Activities') }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10, color: '#94a3b8' }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading company…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (notFound || !company) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
      Company not found.{' '}
      <span style={{ color: '#3b82f6', cursor: 'pointer', fontWeight: 500 }} onClick={() => navigate('/companies')}>
        ← Back to Companies
      </span>
    </div>
  )

  const displayName = company.name
  const initials    = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const enriched    = { ...company, _ownerName: company.owner?.name || null }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="detail-layout">

        {/* ── LEFT ── */}
        <div className="detail-left">
          <div className="detail-left-nav">
            <span className="detail-back-link" onClick={() => navigate('/companies')}>
              <ChevronLeft size={14} /> Companies
            </span>
            <button className="detail-actions-btn">Actions <ChevronDown size={12} /></button>
          </div>

          <div className="detail-entity-header">
            <div className="detail-entity-logo" style={{ borderRadius: '50%', background: 'linear-gradient(135deg,#0891b2,#06b6d4)' }}>
              {initials}
            </div>
            <h2 className="detail-entity-name">{displayName}</h2>
            {company.domain && (
              <a href={/^https?:\/\//i.test(company.domain) ? company.domain : `https://${company.domain}`} target="_blank" rel="noreferrer" className="detail-entity-domain">
                {company.domain} <ExternalLink size={11} />
              </a>
            )}
          </div>

          {/* Action buttons — same layout as ContactDetail */}
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
                    const phone = company?.phone || ''
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
            About this company
            <button className="detail-actions-btn" onClick={() => setEditOpen(true)}>Edit</button>
          </div>

          <div className="detail-field-list">
            {LEFT_FIELDS.map(f => {
              if (f.isEmail) {
                const list = valueList(enriched.email, enriched.emails)
                return (
                  <div key={f.key} className="detail-field-row">
                    <span className="detail-field-label">{f.label}</span>
                    <span className="detail-field-value" style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                      {list.length
                        ? list.map((e, i) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <a href={`mailto:${e}`} className="link">{e}</a>
                              {i === 0 && list.length > 1 && <span style={PRIMARY_TAG}>Primary</span>}
                            </span>
                          ))
                        : '--'}
                    </span>
                  </div>
                )
              }
              if (f.isPhone) {
                const list = valueList(enriched.phone, enriched.phones)
                return (
                  <div key={f.key} className="detail-field-row">
                    <span className="detail-field-label">{f.label}</span>
                    <span className="detail-field-value" style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                      {list.length
                        ? list.map((p, i) => (
                            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {p}
                              <button
                                title="Open CallHippo dialer"
                                onClick={() => {
                                  const dialUrl = `https://dialer.callhippo.com/dial#/?phone=${encodeURIComponent(p)}`
                                  navigator.clipboard.writeText(p).catch(() => {})
                                  window.open(dialUrl, '_blank', 'noreferrer')
                                }}
                                style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', padding: 0 }}
                              >
                                <Phone size={14} />
                              </button>
                              {i === 0 && list.length > 1 && <span style={PRIMARY_TAG}>Primary</span>}
                            </span>
                          ))
                        : '--'}
                    </span>
                  </div>
                )
              }
              if (f.isMulti) {
                const list = Array.isArray(enriched[f.key]) ? enriched[f.key].filter(Boolean) : []
                return (
                  <div key={f.key} className="detail-field-row">
                    <span className="detail-field-label">{f.label}</span>
                    <span className="detail-field-value" style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                      {list.length
                        ? list.map((v, i) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                              {v}
                              {i === 0 && list.length > 1 && <span style={PRIMARY_TAG}>Primary</span>}
                            </span>
                          ))
                        : '--'}
                    </span>
                  </div>
                )
              }
              const val = enriched[f.key]
              return (
                <div key={f.key} className="detail-field-row">
                  <span className="detail-field-label">{f.label}</span>
                  <span className="detail-field-value">{val || '--'}</span>
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
              <OverviewTab company={company} recentActs={recentActs} onAction={openModal} />
            </div>
          )}

          {centerTab === 'Activities' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ActivityFeed companyId={id} contactEmail={company.email} onAction={openModal} refreshKey={feedRefreshKey} />
            </div>
          )}

          {centerTab === 'Intelligence' && (
            <div className="detail-center-body">
              <IntelligenceTab company={company} />
            </div>
          )}
        </div>

        {/* ── RIGHT ── same structure as ContactDetail */}
        <div className="detail-right">
          <div className="right-panel-section">
            <div className="right-panel-header">
              <div className="right-panel-header-left"><ChevronDown size={14} /> Deals ({deals.length})</div>
              <button className="right-panel-add" onClick={() => setShowDealModal(true)}><Plus size={12} /> Add</button>
            </div>
            {deals.length === 0 ? (
              <div className="right-empty-state"><p className="right-empty-text">Track the revenue opportunities associated with this record.</p></div>
            ) : (
              <div style={{ padding: '4px 12px 12px' }}>
                {deals.map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 4px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{d.stage}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
                        {d.value > 0 ? Number(d.value).toLocaleString() : '--'}
                      </span>
                      <button onClick={() => setEditDeal(d)} title="Edit deal" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', padding: 2 }}><Pencil size={13} /></button>
                      <button onClick={() => handleDeleteDeal(d.id)} title="Delete deal" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', padding: 2 }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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

      {/* ── Edit company modal ── */}
      {editOpen && (
        <EditRecordModal
          type="company"
          id={id}
          record={company}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => setCompany(updated)}
        />
      )}

      {/* ── Create deal (from company) — also appears on the global Deals dashboard ── */}
      {showDealModal && (
        <CreateDealModal
          companyId={id}
          onClose={() => setShowDealModal(false)}
          onSaved={() => fetchDeals()}
        />
      )}

      {editDeal && (
        <CreateDealModal
          deal={editDeal}
          onClose={() => setEditDeal(null)}
          onSaved={() => fetchDeals()}
        />
      )}

      {/* ── Activity Modals — same pattern as ContactDetail ── */}
      {activeModal === 'note' && (
        <NoteModal
          companyId={id}
          onClose={() => setActiveModal(null)}
          onSaved={onActivitySaved}
        />
      )}
      {activeModal === 'email' && (
        <EmailModal
          companyId={id}
          contactEmail={company.email}
          onClose={() => setActiveModal(null)}
          onSaved={onActivitySaved}
        />
      )}
      {activeModal === 'call' && (
        <CallModal
          companyId={id}
          contactName={displayName}
          onClose={() => setActiveModal(null)}
          onSaved={onActivitySaved}
        />
      )}
      {activeModal === 'meeting' && (
        <MeetingModal
          companyId={id}
          contactName={displayName}
          contactEmail={company.email}
          onClose={() => setActiveModal(null)}
          onSaved={onActivitySaved}
        />
      )}
      {activeModal === 'task' && (
        <TaskModal
          companyId={id}
          contactName={displayName}
          onClose={() => setActiveModal(null)}
          onSaved={onActivitySaved}
        />
      )}
    </>
  )
}
