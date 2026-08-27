import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  ChevronDown, ChevronLeft, ChevronRight, FileText, Mail, Phone,
  CheckSquare, Calendar, MoreHorizontal,
  Plus, ExternalLink, Loader2, Pencil, Trash2, Star
} from 'lucide-react'
import api from '../../api/client'
import NoteModal    from '../../components/activities/NoteModal'
import CallModal    from '../../components/activities/CallModal'
import MeetingModal from '../../components/activities/MeetingModal'
import TaskModal    from '../../components/activities/TaskModal'
import ActivityFeed      from '../../components/activities/ActivityFeed'
import EditRecordModal   from '../../components/EditRecordModal'
import CreateDealModal   from '../../components/modals/CreateDealModal'
import CompanyIntelligence from '../../components/CompanyIntelligence'
import { valueList } from '../../utils/multiValue'
import { normalizeUrl } from '../../utils/url'
import { invalidateCompanyEmail } from '../../utils/emailCache'
import { formatCurrency } from '../../utils/formatCurrency'
import '../../styles/detail-page.css'
import '../../styles/activity-modals.css'

// Small "Primary" tag shown next to the first value when there are several.
const PRIMARY_TAG = {
  fontSize: 12, fontWeight: 700, color: '#0d9488', background: '#f0fdfa',
  border: '1px solid #99f6e4', borderRadius: 3, padding: '1px 4px', marginLeft: 6,
}

const LEFT_FIELDS = [
  { label: 'Email',           key: 'email',        isEmail: true },
  { label: 'Phone number',    key: 'phone',        isPhone: true  },
  { label: 'Company URL',     key: 'domain'                      },
  { label: 'Lead Owner',      key: '_ownerName'                  },
  { label: 'Industry',        key: 'industry'                    },
  { label: 'Lead status',     key: 'leadStatus'                  },
  { label: 'Contact Person',  key: 'contactPersons', isMulti: true },
  { label: 'Linked Profile',  key: 'linkedProfiles',  isMulti: true },
  { label: 'End PDP URL',     key: 'endPdpUrl'                    },
  { label: 'CMS',             key: 'cms'                          },
  { label: 'Remarks',         key: 'remarks'                      },
]

const CENTER_TABS = ['Overview', 'Activities', 'Intelligence']

const PROPERTY_ICONS = {
  email: 'mail', phone: 'call', domain: 'language', _ownerName: 'person',
  industry: 'category', leadStatus: 'flag', contactPersons: 'badge',
  linkedProfiles: 'link', endPdpUrl: 'link', cms: 'web', remarks: 'notes',
}

function MaterialIcon({ children, filled = false }) {
  return <span className={`material-symbols-rounded${filled ? ' filled' : ''}`} aria-hidden="true">{children}</span>
}

function CompanyProperties({ enriched, openComposer }) {
  return (
    <div className="company-property-grid">
      {LEFT_FIELDS.map(f => {
        let content = '--'
        if (f.isEmail) {
          const list = valueList(enriched.email, enriched.emails)
          content = list.length ? list.map((email, i) => (
            <span key={email} className="company-property-multi-item">
              <button className="company-property-link" title="Compose in Marketing → Email" onClick={() => openComposer(email)}>{email}</button>
              {i === 0 && list.length > 1 && <span className="company-primary-tag">Primary</span>}
            </span>
          )) : '--'
        } else if (f.isPhone) {
          const list = valueList(enriched.phone, enriched.phones)
          content = list.length ? list.map((phone, i) => (
            <span key={phone} className="company-property-multi-item">
              <span>{phone}</span>
              <button
                className="company-inline-icon-btn"
                title="Open CallHippo dialer"
                onClick={() => {
                  navigator.clipboard.writeText(phone).catch(() => {})
                  window.open(`https://dialer.callhippo.com/dial#/?phone=${encodeURIComponent(phone)}`, '_blank', 'noreferrer')
                }}
              ><MaterialIcon>call</MaterialIcon></button>
              {i === 0 && list.length > 1 && <span className="company-primary-tag">Primary</span>}
            </span>
          )) : '--'
        } else if (f.isMulti) {
          const list = Array.isArray(enriched[f.key]) ? enriched[f.key].filter(Boolean) : []
          content = list.length ? list.map((value, i) => {
            const url = f.key === 'linkedProfiles' ? normalizeUrl(value) : null
            return (
              <span key={`${value}-${i}`} className="company-property-multi-item">
                {url ? <a href={url} target="_blank" rel="noopener noreferrer">{value}</a> : <span>{value}</span>}
                {i === 0 && list.length > 1 && <span className="company-primary-tag">Primary</span>}
              </span>
            )
          }) : '--'
        } else {
          const value = enriched[f.key]
          const url = (f.key === 'domain' || f.key === 'endPdpUrl') ? normalizeUrl(value) : null
          content = url ? <a href={url} target="_blank" rel="noopener noreferrer">{value}</a> : (value || '--')
        }

        return (
          <div key={f.key} className="company-property-item">
            <div className="company-property-label"><MaterialIcon>{PROPERTY_ICONS[f.key]}</MaterialIcon>{f.label}</div>
            <div className="company-property-value">{content}</div>
          </div>
        )
      })}
    </div>
  )
}

// Resizable side panels (drag the handle between panels). Persisted per
// browser, same localStorage-preference pattern used elsewhere in the app
// (Companies' visible columns, Deals' view mode).
const PANEL_WIDTHS_KEY = 'mwz_company_detail_panel_widths'
const DEFAULT_LEFT_WIDTH  = 280 // matches .detail-left's original fixed width
const DEFAULT_RIGHT_WIDTH = 300 // matches .detail-right's original fixed width
const LEFT_MIN   = 220
const LEFT_MAX   = 450
const RIGHT_MIN  = 220
const RIGHT_MAX  = 450
const CENTER_MIN = 320 // Activities/Overview/Intelligence must always keep at least this much room

function loadPanelWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_WIDTHS_KEY))
    return {
      left:  typeof saved?.left === 'number' ? saved.left : DEFAULT_LEFT_WIDTH,
      right: typeof saved?.right === 'number' ? saved.right : DEFAULT_RIGHT_WIDTH,
    }
  } catch {
    return { left: DEFAULT_LEFT_WIDTH, right: DEFAULT_RIGHT_WIDTH }
  }
}

// Keeps both side panels within their own min/max AND guarantees the center
// panel never gets squeezed below CENTER_MIN — shrinks both side panels
// proportionally (never below their own MIN) if the container is too
// narrow to fit the current widths, so this also serves as the
// on-window-resize safety net for small screens.
function clampPanelWidths(containerWidth, left, right) {
  let l = Math.min(LEFT_MAX, Math.max(LEFT_MIN, left))
  let r = Math.min(RIGHT_MAX, Math.max(RIGHT_MIN, right))
  if (!containerWidth) return { left: l, right: r }
  const overflow = (l + r + CENTER_MIN) - containerWidth
  if (overflow > 0) {
    const lRoom = l - LEFT_MIN
    const rRoom = r - RIGHT_MIN
    const totalRoom = lRoom + rRoom
    if (totalRoom > 0) {
      const shrink = Math.min(totalRoom, overflow)
      l -= shrink * (lRoom / totalRoom)
      r -= shrink * (rRoom / totalRoom)
    }
  }
  return { left: Math.round(l), right: Math.round(r) }
}

function OverviewTab({ company, recentActs }) {
  const createdAt = company.createdAt
    ? new Date(company.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '--'

  return (
    <div>
      <div className="data-highlights" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="highlight-item">
          <span className="highlight-label">Create Date</span>
          <span className="highlight-value">{createdAt}</span>
        </div>
        <div className="highlight-item">
          <span className="highlight-label">Lead Status</span>
          <span className="highlight-value">{company.leadStatus || '--'}</span>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-section-header">
          Recent activities
        </div>
        {recentActs.length === 0 ? (
          <div className="empty-assoc"><p>No recent activities. Log a note, call, or email below.</p></div>
        ) : recentActs.slice(0, 5).map(a => (
          <div key={a.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f8fafc', fontSize: 16 }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{a.title || a.type}</span>
            <span style={{ marginLeft: 8, color: '#475467', fontSize: 14 }}>
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
      {/* AI-generated pre-call/pre-email insights — explicit Generate button,
          reuses the Email Tool's saved Gemini configuration. */}
      <CompanyIntelligence company={company} />

      {/* Factual CRM data, kept clearly separate from the AI section above. */}
      <div className="data-highlights" style={{ gridTemplateColumns: '1fr', marginBottom: 20 }}>
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
  const { id }     = useParams()
  const navigate   = useNavigate()
  const location   = useLocation()

  // Carried over from Companies.jsx's row click (see openCompany there) so
  // Previous/Next below walks the exact same filtered/sorted/tab-scoped list
  // the user was viewing — not the unfiltered full table. Arriving here any
  // other way (direct link, bookmark, browser back) has no context, so it
  // falls back to the unfiltered "All companies" order, same as opening
  // Companies fresh with no filters applied.
  const listContext = location.state?.listContext || {}

  const [company,    setCompany]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [notFound,   setNotFound]   = useState(false)
  const [centerTab,  setCenterTab]  = useState('Overview')
  const [recentActs, setRecentActs] = useState([])
  const [neighbors,  setNeighbors]  = useState({ prevId: null, nextId: null })

  const [activeModal,     setActiveModal]     = useState(null)
  const [feedRefreshKey,  setFeedRefreshKey]  = useState(0)
  const [editOpen,        setEditOpen]        = useState(false)
  const [deals,           setDeals]           = useState([])
  const [showDealModal,   setShowDealModal]   = useState(false)
  const [editDeal,        setEditDeal]        = useState(null)

  // Resizable side panels — see loadPanelWidths/clampPanelWidths above.
  const layoutRef = useRef(null)
  const dragRef   = useRef(null) // { side, startX, startWidth } while a drag is in progress
  const [panelWidths, setPanelWidths] = useState(loadPanelWidths)
  const [draggingSide, setDraggingSide] = useState(null) // null | 'left' | 'right'

  const handleDragMove = useCallback((e) => {
    const drag = dragRef.current
    if (!drag) return
    const containerWidth = layoutRef.current?.offsetWidth || 0
    const delta = e.clientX - drag.startX
    setPanelWidths(prev => {
      const next = drag.side === 'left'
        ? { left: drag.startWidth + delta, right: prev.right }
        : { left: prev.left, right: drag.startWidth - delta }
      return clampPanelWidths(containerWidth, next.left, next.right)
    })
  }, [])

  const handleDragEnd = useCallback(() => {
    dragRef.current = null
    setDraggingSide(null)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', handleDragMove)
    window.removeEventListener('mouseup', handleDragEnd)
    setPanelWidths(prev => {
      localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(prev))
      return prev
    })
  }, [handleDragMove])

  const startDrag = (side) => (e) => {
    e.preventDefault()
    dragRef.current = { side, startX: e.clientX, startWidth: side === 'left' ? panelWidths.left : panelWidths.right }
    setDraggingSide(side)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', handleDragMove)
    window.addEventListener('mouseup', handleDragEnd)
  }

  // Re-clamp on viewport resize so a narrow window never squeezes the
  // center panel below CENTER_MIN — panels never grow back on their own,
  // only shrink toward their own MIN if the window got smaller.
  useEffect(() => {
    const onResize = () => {
      const containerWidth = layoutRef.current?.offsetWidth || 0
      setPanelWidths(prev => clampPanelWidths(containerWidth, prev.left, prev.right))
    }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Listeners are only ever attached during an active drag (added/removed
  // in startDrag/handleDragEnd), but clean up defensively on unmount too.
  useEffect(() => () => {
    window.removeEventListener('mousemove', handleDragMove)
    window.removeEventListener('mouseup', handleDragEnd)
  }, [handleDragMove, handleDragEnd])

  useEffect(() => {
    setLoading(true); setNotFound(false)
    api.get(`/companies/${id}`)
      .then(r => setCompany(r.data))
      .catch(e => { if (e.response?.status === 404) setNotFound(true) })
      .finally(() => setLoading(false))
  }, [id])

  // Previous/Next navigation — recomputed for every company shown (not just
  // once) since "next" from company B, arrived at via company A's "Next",
  // must itself point further into the same list.
  useEffect(() => {
    if (!id) return
    api.get(`/companies/${id}/neighbors`, { params: listContext })
      .then(r => setNeighbors({ prevId: r.data.prevId, nextId: r.data.nextId }))
      .catch(() => setNeighbors({ prevId: null, nextId: null }))
  }, [id, JSON.stringify(listContext)])

  // Keeps the current tab (Overview/Activities/Intelligence) as-is across a
  // Prev/Next switch — only the :id param and this component's data change,
  // centerTab is untouched — and carries listContext forward so continued
  // Prev/Next clicks keep walking the same list instead of losing context
  // after one hop.
  const goToCompany = (targetId) => {
    if (!targetId) return
    navigate(`/companies/${targetId}`, { state: { listContext } })
  }

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

  // Every email entry point (Email quick action, "Log an email", and clicking
  // a saved company address) routes to Marketing → Email — the single compose
  // surface — carrying companyId so the sent mail is filed against the company
  // and lands in the right address group immediately.
  const openComposer = (toAddress) => {
    navigate('/email', {
      state: { to: toAddress || company?.email || '', companyId: id, companyName: company?.name || '' },
    })
  }

  const openModal = (type) => {
    if (type === 'email') { openComposer(); return }
    setActiveModal(type); setCenterTab('Activities')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10, color: '#475467' }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading company…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (notFound || !company) return (
    <div style={{ padding: 40, textAlign: 'center', color: '#475467', fontSize: 17 }}>
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

      <div className="company-workspace">
        <div className="company-workspace-nav">
          <button className="company-back-btn" onClick={() => navigate('/companies')}><MaterialIcon>arrow_back</MaterialIcon>Companies</button>
          <div className="company-neighbor-nav">
            <button disabled={!neighbors.prevId} onClick={() => goToCompany(neighbors.prevId)} title="Previous company"><MaterialIcon>chevron_left</MaterialIcon></button>
            <button disabled={!neighbors.nextId} onClick={() => goToCompany(neighbors.nextId)} title="Next company"><MaterialIcon>chevron_right</MaterialIcon></button>
          </div>
        </div>

        <header className="company-workspace-header">
          <div className="company-header-main">
            <div className="company-header-avatar">{initials}</div>
            <div className="company-header-copy">
              <div className="company-header-title-row">
                <h1>{displayName}</h1>
                <button
                  className={`company-pin-btn${company.isPinned ? ' pinned' : ''}`}
                  onClick={async () => {
                    const { data } = await api.patch(`/companies/${id}/pin`)
                    setCompany(prev => ({ ...prev, isPinned: data.isPinned }))
                  }}
                  title={company.isPinned ? 'Unpin company' : 'Pin company'}
                ><MaterialIcon filled={company.isPinned}>star</MaterialIcon></button>
              </div>
              {company.domain && normalizeUrl(company.domain) && (
                <a href={normalizeUrl(company.domain)} target="_blank" rel="noopener noreferrer" className="company-header-domain">
                  {company.domain}<MaterialIcon>open_in_new</MaterialIcon>
                </a>
              )}
              <div className="company-header-meta">
                <span><MaterialIcon>category</MaterialIcon>{company.industry || '--'}</span>
                <span><MaterialIcon>person</MaterialIcon>{company.owner?.name || '--'}</span>
                <span><MaterialIcon>flag</MaterialIcon>{company.leadStatus || '--'}</span>
              </div>
            </div>
          </div>

          <div className="company-quick-actions">
            {[
              { icon: 'note_add', label: 'Note', type: 'note' },
              { icon: 'mail', label: 'Email', type: 'email' },
              { icon: 'call', label: 'Call', type: 'call' },
              { icon: 'add_task', label: 'Task', type: 'task' },
              { icon: 'event', label: 'Meeting', type: 'meeting' },
              { icon: 'more_horiz', label: 'More', type: null },
            ].map(action => (
              <button
                key={action.label}
                title={action.label}
                onClick={() => {
                  if (action.type === 'call') {
                    const phone = company?.phone || ''
                    if (phone) navigator.clipboard.writeText(phone).catch(() => {})
                    window.open(phone ? `https://dialer.callhippo.com/dial#/?phone=${encodeURIComponent(phone)}` : 'https://dialer.callhippo.com/dial#/', '_blank', 'noreferrer')
                  } else action.type && openModal(action.type)
                }}
              ><MaterialIcon>{action.icon}</MaterialIcon><span>{action.label}</span></button>
            ))}
          </div>
        </header>

        <nav className="company-workspace-tabs" aria-label="Company sections">
          {CENTER_TABS.map(tab => (
            <button key={tab} className={centerTab === tab ? 'active' : ''} onClick={() => setCenterTab(tab)}>{tab}</button>
          ))}
        </nav>

        {centerTab === 'Overview' && (
          <main className="company-workspace-body">
            <section className="company-summary-strip">
              <div><span>Create Date</span><strong>{company.createdAt ? new Date(company.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '--'}</strong></div>
              <div><span>Lead Status</span><strong>{company.leadStatus || '--'}</strong></div>
              <div><span>Lead Owner</span><strong>{company.owner?.name || '--'}</strong></div>
              <div><span>Industry</span><strong>{company.industry || '--'}</strong></div>
            </section>

            <section className="company-workspace-card company-about-card">
              <div className="company-card-header">
                <div><h2>About this company</h2><p>Company profile and contact information</p></div>
                <button className="company-secondary-btn" onClick={() => setEditOpen(true)}><MaterialIcon>edit</MaterialIcon>Edit</button>
              </div>
              <CompanyProperties enriched={enriched} openComposer={openComposer} />
            </section>

            <div className="company-overview-grid">
              <section className="company-workspace-card company-activity-card">
                <div className="company-card-header">
                  <div><h2>Recent activities</h2><p>Latest interactions with this company</p></div>
                  <button className="company-text-btn" onClick={() => setCenterTab('Activities')}>View all<MaterialIcon>arrow_forward</MaterialIcon></button>
                </div>
                <div className="company-recent-list">
                  {recentActs.length === 0 ? (
                    <div className="company-compact-empty"><MaterialIcon>history</MaterialIcon><span>No recent activities. Log a note, call, or email below.</span></div>
                  ) : recentActs.slice(0, 5).map(activity => (
                    <div key={activity.id} className="company-recent-item">
                      <span className="company-timeline-icon"><MaterialIcon>history</MaterialIcon></span>
                      <div><strong>{activity.title || activity.type}</strong><span>{new Date(activity.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="company-workspace-card company-deals-card">
                <div className="company-card-header">
                  <div><h2>Deals ({deals.length})</h2><p>Revenue opportunities</p></div>
                  <button className="company-secondary-btn" onClick={() => setShowDealModal(true)}><MaterialIcon>add</MaterialIcon>Add</button>
                </div>
                {deals.length === 0 ? (
                  <div className="company-compact-empty"><MaterialIcon>payments</MaterialIcon><span>Track the revenue opportunities associated with this record.</span></div>
                ) : (
                  <div className="company-deal-list">
                    {deals.map(deal => (
                      <div key={deal.id} className="company-deal-row">
                        <div><strong>{deal.title}</strong><span>{deal.stage}</span></div>
                        <div className="company-deal-actions">
                          <b>{formatCurrency(deal.value, deal.currency)}</b>
                          <button onClick={() => setEditDeal(deal)} title="Edit deal"><MaterialIcon>edit</MaterialIcon></button>
                          <button className="danger" onClick={() => handleDeleteDeal(deal.id)} title="Delete deal"><MaterialIcon>delete</MaterialIcon></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </main>
        )}

        {centerTab === 'Activities' && (
          <main className="company-workspace-body company-activities-body">
            <ActivityFeed companyId={id} companyName={company.name} contactEmail={company.email} onAction={openModal} refreshKey={feedRefreshKey} />
          </main>
        )}

        {centerTab === 'Intelligence' && (
          <main className="company-workspace-body"><IntelligenceTab company={company} /></main>
        )}
      </div>

      {/* ── Edit company modal ── */}
      {editOpen && (
        <EditRecordModal
          id={id}
          record={company}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setCompany(updated)
            // Saved addresses drive the whole conversation grouping, so any
            // edit makes the cached Emails tab stale.
            invalidateCompanyEmail(id)
            setFeedRefreshKey(k => k + 1)
          }}
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

      {/* ── Activity Modals ── */}
      {activeModal === 'note' && (
        <NoteModal
          companyId={id}
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
