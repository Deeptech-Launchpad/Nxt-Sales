import { useNavigate } from 'react-router-dom'
import { Settings as SettingsIcon, User, Bell, Shield, Plug, Palette, ListChecks, ListPlus } from 'lucide-react'

// Settings — most sections are UI-only placeholders for now; "Dropdown
// Lists" (Update 2) and "Custom Fields" (Dynamic Custom Fields) are functional.
const SECTIONS = [
  { Icon: ListChecks, title: 'Dropdown Lists', desc: 'Manage Industry, Country, Lead Status, and Deal option values.', to: '/settings/dropdowns' },
  { Icon: ListPlus,   title: 'Custom Fields',  desc: 'Add business-specific fields to Company and Deal records.', to: '/settings/custom-fields' },
  { Icon: User,   title: 'Account',       desc: 'Manage your name, email and profile details.' },
  { Icon: Bell,   title: 'Notifications', desc: 'Choose which alerts you receive and how.' },
  { Icon: Shield, title: 'Security',      desc: 'Password and sign-in preferences.' },
  { Icon: Plug,   title: 'Integrations',  desc: 'Gmail, calendar and other connected services.' },
  { Icon: Palette,title: 'Appearance',    desc: 'Theme and display options.' },
]

export default function Settings() {
  const navigate = useNavigate()
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <SettingsIcon size={20} color="#0f172a" />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Settings</h1>
      </div>
      <p style={{ fontSize: 16, color: '#475467', marginBottom: 20 }}>Configuration options will be available here soon.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {SECTIONS.map(({ Icon, title, desc, to }) => (
          <div
            key={title}
            onClick={to ? () => navigate(to) : undefined}
            style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, opacity: to ? 1 : 0.9, cursor: to ? 'pointer' : 'default' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color="#64748b" />
              </div>
              <span style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>{title}</span>
            </div>
            <p style={{ fontSize: 15.5, color: '#344054', lineHeight: 1.5, margin: 0 }}>{desc}</p>
            {!to && (
              <span style={{ display: 'inline-block', marginTop: 12, fontSize: 14, fontWeight: 600, color: '#475467', background: '#f1f5f9', borderRadius: 12, padding: '3px 10px' }}>Coming soon</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
