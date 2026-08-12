import { useRef } from 'react'
import {
  X, Building2, User, Phone, Mail, MapPin, Globe, Link2, Tag, Briefcase,
  Star, Target, ClipboardList, Calendar, CalendarCheck, CheckCircle2, XCircle, FileText,
} from 'lucide-react'
import { useCustomFieldDefinitions } from '../../hooks/useCustomFieldDefinitions'
import { renderCustomCell } from '../../utils/customFieldRender'
import { formatCurrency } from '../../utils/formatCurrency'
import '../../styles/modal.css'
import '../../styles/dealView.css'

function Field({ icon: Icon, label, value, full }) {
  const isEmpty = value === null || value === undefined || value === ''
  return (
    <div className={`dv-field${full ? ' dv-full' : ''}`}>
      <div className="dv-field-label">{Icon && <Icon size={12} />}{label}</div>
      <div className={`dv-field-value${isEmpty ? ' is-empty' : ''}`}>{isEmpty ? '--' : value}</div>
    </div>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="dv-section">
      <div className="dv-section-title">{Icon && <Icon size={13} />}{title}</div>
      <div className="dv-grid">{children}</div>
    </div>
  )
}

// Read-only summary of a deal — opened by clicking a Board card (view, not
// edit). Same field set/values as CreateDealModal's edit form, just grouped
// into scannable sections instead of one long flat list. Editing still only
// happens via the pencil icon (unchanged), which opens CreateDealModal.
export default function ViewDealModal({ deal, onClose }) {
  const { fields: customFields } = useCustomFieldDefinitions('Deal')

  // See CreateCompanyModal.jsx for why this exists — the overlay must only
  // close when BOTH mousedown and the resulting click land directly on it.
  const mouseDownOnOverlay = useRef(false)

  const dateStr = (v) => v ? renderCustomCell('date', v) : null

  const websiteHref = deal.clientWebsiteUrl
    ? (/^https?:\/\//i.test(deal.clientWebsiteUrl) ? deal.clientWebsiteUrl : `https://${deal.clientWebsiteUrl}`)
    : null

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => { mouseDownOnOverlay.current = e.target === e.currentTarget }}
      onClick={e => {
        if (mouseDownOnOverlay.current && e.target === e.currentTarget) onClose()
        mouseDownOnOverlay.current = false
      }}
    >
      <div className="modal-drawer">
        <div className="modal-header">
          <h2>{deal.title}</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <div className="dv-hero">
            <div className="dv-hero-top">
              <div className="dv-hero-company">
                <Building2 size={14} />
                <span>{deal.companyName || deal.company?.name || '--'}</span>
              </div>
              {deal.stage && <span className="dv-stage-pill">{deal.stage}</span>}
            </div>
            <div className="dv-hero-value">{formatCurrency(deal.value, deal.currency)}</div>
            <div className="dv-hero-flags">
              <span className={`dv-flag-pill ${deal.poc ? 'is-yes' : 'is-no'}`}>
                {deal.poc ? <CheckCircle2 size={12} /> : <XCircle size={12} />} POC {deal.poc ? 'Yes' : 'No'}
              </span>
              <span className={`dv-flag-pill ${deal.proposalShared ? 'is-yes' : 'is-no'}`}>
                {deal.proposalShared ? <CheckCircle2 size={12} /> : <XCircle size={12} />} Proposal {deal.proposalShared ? 'Shared' : 'Not Shared'}
              </span>
            </div>
          </div>

          <Section icon={User} title="Contact">
            <Field icon={User} label="Contact Person" value={deal.contactPerson} />
            <Field icon={Phone} label="Contact Phone Number" value={deal.contactPhone} />
            <Field icon={Mail} label="Contact Email" value={deal.contactEmail} />
            <Field icon={MapPin} label="Country" value={deal.country} />
          </Section>

          <Section icon={Globe} title="Company & Web">
            <Field icon={Globe} label="Domain Name" value={deal.domainName} />
            <Field
              icon={Link2}
              label="Client Website URL"
              value={websiteHref ? <a href={websiteHref} target="_blank" rel="noreferrer">{deal.clientWebsiteUrl}</a> : null}
            />
          </Section>

          <Section icon={Briefcase} title="Opportunity">
            <Field icon={Tag} label="Client Type" value={deal.clientType} />
            <Field icon={Briefcase} label="Opportunity Type" value={deal.opportunityType} />
            <Field icon={ClipboardList} label="Service Requirements" value={deal.serviceRequirement} full />
            <Field icon={Star} label="Strategic Importance" value={deal.strategicImportance} full />
            <Field icon={Target} label="Expected Outcome" value={deal.expectedOutcome} full />
          </Section>

          <Section icon={Calendar} title="Timeline">
            <Field icon={Calendar} label="POC Received Date" value={dateStr(deal.pocReceivedDate)} />
            <Field icon={CalendarCheck} label="POC Delivered Date" value={dateStr(deal.pocDeliveredDate)} />
          </Section>

          <div className="dv-section">
            <div className="dv-section-title"><FileText size={13} />Notes</div>
            <div className={`dv-notes-box${deal.notes ? '' : ' is-empty'}`}>{deal.notes || '--'}</div>
          </div>

          {customFields.length > 0 && (
            <Section icon={Tag} title="Custom Fields">
              {customFields.map(f => (
                <Field key={f.id} label={f.label} value={renderCustomCell(f.type, deal[`custom.${f.key}`])} />
              ))}
            </Section>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-modal-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
