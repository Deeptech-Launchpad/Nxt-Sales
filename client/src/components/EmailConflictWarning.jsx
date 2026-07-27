import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../api/client'

// Advisory warning shown while editing a company's email addresses: flags any
// address that already belongs to a DIFFERENT company.
//
// Why it matters: Email Sync stores one Activity row per Gmail message, so a
// message can only ever belong to one company — whichever claimed it first.
// Two companies sharing an address means the second one silently receives no
// conversations. Surfacing that here turns a confusing "sync is broken" report
// into an obvious, fixable data issue at the moment it is created.
//
// Deliberately non-blocking: it never prevents a save. Shared addresses are
// occasionally legitimate, and the user is the right person to judge.
//
// Shared by CreateCompanyModal and EditRecordModal so the check, the debounce
// and the wording stay identical across both save surfaces.
export default function EmailConflictWarning({ emails, excludeCompanyId }) {
  const [conflicts, setConflicts] = useState([])

  // Compare by normalised content, not array identity — MultiValueInput hands
  // back a new array on every keystroke, which would otherwise refire the
  // request even when the addresses are unchanged.
  const addressKey = JSON.stringify(
    [...new Set(
      (emails || [])
        .filter(e => typeof e === 'string')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean)
    )].sort()
  )

  useEffect(() => {
    const addrs = JSON.parse(addressKey)
    if (addrs.length === 0) { setConflicts([]); return }

    let cancelled = false
    // Debounced so typing an address doesn't fire a request per character.
    const timer = setTimeout(() => {
      api.post('/companies/email-conflicts', { emails: addrs, excludeCompanyId })
        .then(r => { if (!cancelled) setConflicts(r.data?.conflicts || []) })
        .catch(() => { if (!cancelled) setConflicts([]) })  // advisory only — never surface an error
    }, 400)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [addressKey, excludeCompanyId])

  if (conflicts.length === 0) return null

  return (
    <div
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        marginTop: 8, padding: '8px 10px',
        background: '#fffbeb', border: '1px solid #fde68a',
        borderRadius: 6, fontSize: 11.5, color: '#92400e', lineHeight: 1.5,
      }}
    >
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        {conflicts.map(c => (
          <div key={c.email}>
            <strong>{c.email}</strong> already belongs to{' '}
            {c.companies.map((co, i) => (
              <span key={co.id}>
                {i > 0 && ', '}
                <strong>{co.name}</strong>
              </span>
            ))}
            .
          </div>
        ))}
        <div style={{ marginTop: 4, opacity: 0.85 }}>
          Email conversations for a shared address are stored against whichever company
          claimed them first, so this company may not receive them. You can still save.
        </div>
      </div>
    </div>
  )
}
