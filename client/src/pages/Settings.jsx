import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Settings as SettingsIcon, User, Bell, Shield, Plug, Palette, ListChecks,
  ListPlus, ChevronRight, Save, Check, Mail, ExternalLink, Unplug, Lock,
  Building2, AtSign, Clock3, Monitor, Sparkles, Loader2,
} from 'lucide-react'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import '../styles/settings.css'

const NAV = [
  { id: 'account', label: 'Account', Icon: User, help: 'Profile and workspace' },
  { id: 'notifications', label: 'Notifications', Icon: Bell, help: 'Alerts and summaries' },
  { id: 'security', label: 'Security', Icon: Shield, help: 'Password and sessions' },
  { id: 'integrations', label: 'Integrations', Icon: Plug, help: 'Connected services' },
  { id: 'appearance', label: 'Appearance', Icon: Palette, help: 'Display preferences' },
]

const EMPTY = {
  profile: { name: '', email: '', companyName: '', role: '' },
  preferences: {
    notifications: { taskReminders: true, overdueAlerts: true, dealUpdates: true, emailActivity: true, browserNotifications: false, dailyDigest: false },
    security: { loginAlerts: true, sessionTimeout: '7d' },
    appearance: { theme: 'light', density: 'comfortable', accent: 'navy' },
  },
  security: { hasPassword: false },
  integrations: { gmail: { connected: false, email: null } },
}

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="st-toggle-row">
      <span><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  )
}

function SaveButton({ saving, children = 'Save changes' }) {
  return <button className="st-primary" type="submit" disabled={saving}>{saving ? <Loader2 size={15} className="st-spin" /> : <Save size={15} />}{children}</button>
}

export default function Settings() {
  const navigate = useNavigate()
  const { updateUser } = useAuth()
  const [active, setActive] = useState('account')
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [message, setMessage] = useState(null)
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })

  const notify = (text, type = 'success') => {
    setMessage({ text, type })
    window.setTimeout(() => setMessage(null), 3200)
  }

  const load = async () => {
    try {
      const response = await api.get('/settings')
      setData(response.data)
      applyAppearance(response.data.preferences.appearance)
    } catch (error) {
      notify(error.response?.data?.message || 'Could not load settings.', 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const applyAppearance = value => {
    const root = document.documentElement
    root.dataset.density = value?.density || 'comfortable'
    root.dataset.theme = value?.theme || 'light'
    const accents = { navy: '#071B52', blue: '#3267E3', red: '#EF1B16' }
    root.style.setProperty('--color-focus', accents[value?.accent] || accents.navy)
    localStorage.setItem('nxt_appearance', JSON.stringify(value || {}))
  }

  const saveProfile = async e => {
    e.preventDefault(); setSaving('profile')
    try {
      const response = await api.put('/settings/profile', data.profile)
      setData(current => ({ ...current, profile: { ...current.profile, ...response.data.profile } }))
      updateUser(response.data.profile)
      notify('Profile details updated.')
    } catch (error) { notify(error.response?.data?.message || 'Could not update profile.', 'error') }
    finally { setSaving('') }
  }

  const savePreferences = async section => {
    setSaving(section)
    try {
      const response = await api.put(`/settings/preferences/${section}`, data.preferences[section])
      setData(current => ({ ...current, preferences: response.data.preferences }))
      if (section === 'appearance') applyAppearance(response.data.preferences.appearance)
      if (section === 'notifications') {
        localStorage.setItem('nxt_notification_preferences', JSON.stringify(response.data.preferences.notifications))
        window.dispatchEvent(new CustomEvent('nxt-notification-preferences', { detail: response.data.preferences.notifications }))
      }
      notify(`${section[0].toUpperCase() + section.slice(1)} preferences saved.`)
    } catch (error) { notify(error.response?.data?.message || 'Could not save preferences.', 'error') }
    finally { setSaving('') }
  }

  const setPreference = (section, key, value) => setData(current => ({
    ...current,
    preferences: { ...current.preferences, [section]: { ...current.preferences[section], [key]: value } },
  }))

  const changePassword = async e => {
    e.preventDefault()
    if (password.newPassword !== password.confirmPassword) return notify('New passwords do not match.', 'error')
    setSaving('password')
    try {
      const response = await api.post('/settings/change-password', password)
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setData(current => ({ ...current, security: { hasPassword: true } }))
      notify(response.data.message)
    } catch (error) { notify(error.response?.data?.message || 'Could not update password.', 'error') }
    finally { setSaving('') }
  }

  const connectGmail = async () => {
    try {
      const { data: result } = await api.get('/email/gmail/auth-url')
      const popup = window.open(result.url, 'gmail_connect', 'width=560,height=700')
      const listener = event => {
        if (event.data === 'gmail_success') { window.removeEventListener('message', listener); popup?.close(); load(); notify('Gmail connected successfully.') }
      }
      window.addEventListener('message', listener)
    } catch (error) { notify(error.response?.data?.message || 'Could not start Gmail connection.', 'error') }
  }

  const disconnectGmail = async () => {
    setSaving('gmail')
    try { await api.delete('/email/gmail/disconnect'); await load(); notify('Gmail disconnected.') }
    catch (error) { notify(error.response?.data?.message || 'Could not disconnect Gmail.', 'error') }
    finally { setSaving('') }
  }

  const initials = useMemo(() => (data.profile.name || 'NXT').split(/\s+/).map(v => v[0]).slice(0, 2).join('').toUpperCase(), [data.profile.name])

  if (loading) return <div className="st-loading"><Loader2 className="st-spin" /> Loading your workspace settings…</div>

  return (
    <main className="st-page">
      {message && <div className={`st-toast ${message.type}`}><Check size={15} />{message.text}</div>}
      <header className="st-hero">
        <div className="st-hero-icon"><SettingsIcon size={22} /></div>
        <div><span>Workspace controls</span><h1>Settings</h1><p>Manage your profile, alerts, security and connected tools from one place.</p></div>
        <div className="st-hero-status"><i /> All changes are securely saved</div>
      </header>

      <section className="st-shell">
        <aside className="st-sidebar">
          <p>Personal settings</p>
          {NAV.map(({ id, label, help, Icon }) => (
            <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}>
              <span className="st-nav-icon"><Icon size={16} /></span><span><strong>{label}</strong><small>{help}</small></span><ChevronRight size={14} />
            </button>
          ))}
          <div className="st-admin-links">
            <p>Workspace setup</p>
            <button onClick={() => navigate('/settings/dropdowns')}><ListChecks size={16} /><span>Dropdown lists</span><ChevronRight size={14} /></button>
            <button onClick={() => navigate('/settings/custom-fields')}><ListPlus size={16} /><span>Custom fields</span><ChevronRight size={14} /></button>
          </div>
        </aside>

        <div className="st-content">
          {active === 'account' && (
            <form onSubmit={saveProfile}>
              <div className="st-section-head"><div><h2>Account profile</h2><p>Keep the details your team sees up to date.</p></div><SaveButton saving={saving === 'profile'} /></div>
              <div className="st-profile-banner"><div className="st-avatar">{initials}</div><div><strong>{data.profile.name}</strong><span>{data.profile.role || 'Member'} · Active account</span></div></div>
              <div className="st-form-grid">
                <label><span>Full name</span><div className="st-input"><User size={15} /><input value={data.profile.name} onChange={e => setData(v => ({ ...v, profile: { ...v.profile, name: e.target.value } }))} required /></div></label>
                <label><span>Email address</span><div className="st-input"><AtSign size={15} /><input type="email" value={data.profile.email} onChange={e => setData(v => ({ ...v, profile: { ...v.profile, email: e.target.value } }))} required /></div></label>
                <label className="st-full"><span>Company / workspace</span><div className="st-input"><Building2 size={15} /><input value={data.profile.companyName || ''} placeholder="Your company name" onChange={e => setData(v => ({ ...v, profile: { ...v.profile, companyName: e.target.value } }))} /></div></label>
              </div>
            </form>
          )}

          {active === 'notifications' && (
            <div>
              <div className="st-section-head"><div><h2>Notifications</h2><p>Choose the updates that deserve your attention.</p></div><button className="st-primary" onClick={() => savePreferences('notifications')} disabled={saving === 'notifications'}><Save size={15} />Save preferences</button></div>
              <div className="st-group-title">In-app alerts</div>
              <div className="st-toggle-list">
                <Toggle label="Task reminders" description="Get notified before assigned tasks are due." checked={data.preferences.notifications.taskReminders} onChange={v => setPreference('notifications', 'taskReminders', v)} />
                <Toggle label="Overdue alerts" description="See alerts when tasks pass their due date." checked={data.preferences.notifications.overdueAlerts} onChange={v => setPreference('notifications', 'overdueAlerts', v)} />
                <Toggle label="Deal updates" description="Changes to deals you own or follow." checked={data.preferences.notifications.dealUpdates} onChange={v => setPreference('notifications', 'dealUpdates', v)} />
                <Toggle label="Email activity" description="Replies and engagement on tracked emails." checked={data.preferences.notifications.emailActivity} onChange={v => setPreference('notifications', 'emailActivity', v)} />
              </div>
              <div className="st-group-title">Delivery</div>
              <div className="st-toggle-list">
                <Toggle label="Browser notifications" description="Show desktop alerts while NXT Sales is open." checked={data.preferences.notifications.browserNotifications} onChange={v => setPreference('notifications', 'browserNotifications', v)} />
                <Toggle label="Daily digest" description="Receive a compact daily workspace summary." checked={data.preferences.notifications.dailyDigest} onChange={v => setPreference('notifications', 'dailyDigest', v)} />
              </div>
            </div>
          )}

          {active === 'security' && (
            <div>
              <div className="st-section-head"><div><h2>Security</h2><p>Protect your account and control sign-in behaviour.</p></div></div>
              <form className="st-security-card" onSubmit={changePassword}>
                <div className="st-card-heading"><Lock size={18} /><div><strong>{data.security.hasPassword ? 'Change password' : 'Create a password'}</strong><span>Use at least 8 characters with uppercase, lowercase and a number.</span></div></div>
                <div className="st-form-grid">
                  {data.security.hasPassword && <label className="st-full"><span>Current password</span><input className="st-plain-input" type="password" value={password.currentPassword} onChange={e => setPassword(v => ({ ...v, currentPassword: e.target.value }))} required /></label>}
                  <label><span>New password</span><input className="st-plain-input" type="password" value={password.newPassword} onChange={e => setPassword(v => ({ ...v, newPassword: e.target.value }))} required /></label>
                  <label><span>Confirm password</span><input className="st-plain-input" type="password" value={password.confirmPassword} onChange={e => setPassword(v => ({ ...v, confirmPassword: e.target.value }))} required /></label>
                </div>
                <SaveButton saving={saving === 'password'}>{data.security.hasPassword ? 'Update password' : 'Create password'}</SaveButton>
              </form>
              <div className="st-group-title">Sign-in preferences</div>
              <div className="st-toggle-list">
                <Toggle label="New sign-in alerts" description="Get notified when your account is used on a new device." checked={data.preferences.security.loginAlerts} onChange={v => setPreference('security', 'loginAlerts', v)} />
                <label className="st-select-row"><span><strong>Session duration</strong><small>Choose how long you stay signed in.</small></span><select value={data.preferences.security.sessionTimeout} onChange={e => setPreference('security', 'sessionTimeout', e.target.value)}><option value="1d">1 day</option><option value="7d">7 days</option><option value="30d">30 days</option></select></label>
              </div>
              <button className="st-secondary st-save-below" onClick={() => savePreferences('security')}><Save size={14} />Save sign-in preferences</button>
            </div>
          )}

          {active === 'integrations' && (
            <div>
              <div className="st-section-head"><div><h2>Integrations</h2><p>Connect the tools your sales workflow depends on.</p></div></div>
              <div className="st-integration-card">
                <div className="st-google-icon"><Mail size={20} /></div>
                <div className="st-integration-copy"><strong>Google Workspace</strong><span>Send and sync Gmail messages, create Calendar events and Google Meet links.</span>{data.integrations.gmail.connected && <small><i /> Connected as {data.integrations.gmail.email}</small>}</div>
                {data.integrations.gmail.connected ? <button className="st-secondary" onClick={disconnectGmail} disabled={saving === 'gmail'}><Unplug size={14} />Disconnect</button> : <button className="st-primary" onClick={connectGmail}><ExternalLink size={14} />Connect Google</button>}
              </div>
              <div className="st-integration-card muted"><div className="st-card-logo">CH</div><div className="st-integration-copy"><strong>CallHippo</strong><span>Call activity is managed through your workspace server configuration.</span><small><i /> Workspace managed</small></div><span className="st-badge">Configured by admin</span></div>
            </div>
          )}

          {active === 'appearance' && (
            <div>
              <div className="st-section-head"><div><h2>Appearance</h2><p>Make the workspace comfortable for the way you work.</p></div><button className="st-primary" onClick={() => savePreferences('appearance')}><Save size={15} />Save appearance</button></div>
              <div className="st-group-title">Theme</div>
              <div className="st-choice-grid two">
                {[['light', 'Light', Monitor], ['system', 'Use system setting', Sparkles]].map(([value, label, Icon]) => <button key={value} className={data.preferences.appearance.theme === value ? 'selected' : ''} onClick={() => { setPreference('appearance', 'theme', value); applyAppearance({ ...data.preferences.appearance, theme: value }) }}><Icon size={18} /><span><strong>{label}</strong><small>Clean, accessible workspace</small></span>{data.preferences.appearance.theme === value && <Check size={16} />}</button>)}
              </div>
              <div className="st-group-title">Content density</div>
              <div className="st-choice-grid two">
                {['comfortable', 'compact'].map(value => <button key={value} className={data.preferences.appearance.density === value ? 'selected' : ''} onClick={() => { setPreference('appearance', 'density', value); applyAppearance({ ...data.preferences.appearance, density: value }) }}><Clock3 size={18} /><span><strong>{value === 'comfortable' ? 'Comfortable' : 'Compact'}</strong><small>{value === 'comfortable' ? 'More breathing room' : 'Fit more information'}</small></span>{data.preferences.appearance.density === value && <Check size={16} />}</button>)}
              </div>
              <div className="st-group-title">Focus colour</div>
              <div className="st-colours">{[['navy','#071B52'],['blue','#3267E3'],['red','#EF1B16']].map(([name, colour]) => <button key={name} className={data.preferences.appearance.accent === name ? 'selected' : ''} onClick={() => { setPreference('appearance', 'accent', name); applyAppearance({ ...data.preferences.appearance, accent: name }) }}><i style={{ background: colour }} />{name}<Check size={14} /></button>)}</div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
