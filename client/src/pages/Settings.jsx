import { Settings as SettingsIcon, User, Bell, Shield, Plug, Palette } from 'lucide-react'

// Settings — UI only for now. Functionality will be implemented later.
const SECTIONS = [
  { Icon: User,   title: 'Account',       desc: 'Manage your name, email and profile details.' },
  { Icon: Bell,   title: 'Notifications', desc: 'Choose which alerts you receive and how.' },
  { Icon: Shield, title: 'Security',      desc: 'Password and sign-in preferences.' },
  { Icon: Plug,   title: 'Integrations',  desc: 'Gmail, calendar and other connected services.' },
  { Icon: Palette,title: 'Appearance',    desc: 'Theme and display options.' },
]

export default function Settings() {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <SettingsIcon size={20} color="#0f172a" />
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Settings</h1>
      </div>
      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>Configuration options will be available here soon.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {SECTIONS.map(({ Icon, title, desc }) => (
          <div key={title} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, opacity: 0.9 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color="#64748b" />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>{title}</span>
            </div>
            <p style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.5, margin: 0 }}>{desc}</p>
            <span style={{ display: 'inline-block', marginTop: 12, fontSize: 11, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', borderRadius: 12, padding: '3px 10px' }}>Coming soon</span>
          </div>
        ))}
      </div>
    </div>
  )
}
