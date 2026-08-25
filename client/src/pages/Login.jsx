import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { APP_CONFIG } from '../config/app'
import '../styles/login.css'

const GOOGLE_LOGO = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
)

const EyeIcon = ({ hidden }) => hidden ? (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.3A10.8 10.8 0 0112 4c5.5 0 9 5 9 5a16.8 16.8 0 01-3.1 3.5M6.6 6.6C4.4 8.1 3 10 3 10s3.5 5 9 5c1 0 2-.2 2.8-.5"/></svg>
) : (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-5 9-5 9 5 9 5-3.5 5-9 5-9-5-9-5z"/><circle cx="12" cy="12" r="2.5"/></svg>
)

const BENEFITS = [
  ['pipeline', 'See every opportunity in one clear pipeline'],
  ['automation', 'Automate follow-ups without losing the human touch'],
  ['activity', 'Know what needs attention before the day begins'],
]

const BenefitIcon = ({ type }) => {
  if (type === 'pipeline') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>
  if (type === 'automation') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v4M17 17H7v-4"/><path d="M14 8l3-3 3 3M10 16l-3 3-3-3"/></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></svg>
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const isSignUp = location.pathname === '/signup'

  const [form, setForm] = useState({ name: '', email: '', companyName: '', password: '' })
  const [touched, setTouched] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [demoLoading, setDemoLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const passwordChecks = useMemo(() => ({
    length: form.password.length >= 8,
    uppercase: /[A-Z]/.test(form.password),
    number: /\d/.test(form.password),
  }), [form.password])

  const errors = useMemo(() => {
    const next = {}
    if (isSignUp && form.name.trim().length < 2) next.name = 'Please enter your full name.'
    if (!emailPattern.test(form.email.trim())) next.email = 'Please enter a valid work email.'
    if (isSignUp && form.companyName.trim().length < 2) next.companyName = 'Please enter your company name.'
    if (isSignUp) {
      if (!Object.values(passwordChecks).every(Boolean)) next.password = 'Use 8+ characters with an uppercase letter and number.'
    } else if (!form.password) {
      next.password = 'Please enter your password.'
    }
    return next
  }, [form, isSignUp, passwordChecks])

  const canSubmit = Object.keys(errors).length === 0 && !loading && !demoLoading && !success

  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }))
    setServerError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    setTouched({ name: true, email: true, companyName: true, password: true })
    setServerError('')
    if (!canSubmit) return

    setLoading(true)
    try {
      const endpoint = isSignUp ? '/api/auth/register' : '/api/auth/login'
      const payload = isSignUp
        ? { name: form.name.trim(), email: form.email.trim(), companyName: form.companyName.trim(), password: form.password }
        : { email: form.email.trim(), password: form.password }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.success === false) {
        setServerError(data.message || (isSignUp ? 'We could not create your account.' : 'Invalid email or password.'))
        return
      }
      setSuccess(true)
      login(data.user, data.token)
      window.setTimeout(() => navigate(APP_CONFIG.redirectAfterLogin), 450)
    } catch {
      setServerError('We could not connect to NXT Sales. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = () => {
    setGoogleLoading(true)
    window.location.href = '/api/auth/google'
  }

  const handleDemo = async () => {
    setDemoLoading(true)
    setServerError('')
    try {
      const response = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.token) throw new Error()
      login(data.user, data.token)
      navigate(APP_CONFIG.redirectAfterLogin)
    } catch {
      setServerError('Demo workspace is temporarily unavailable.')
    } finally {
      setDemoLoading(false)
    }
  }

  const fieldError = (key) => touched[key] ? errors[key] : ''

  return (
    <main className="auth-page">
      <header className="auth-brandbar">
        <a className="auth-brand" href="/login" aria-label="NXT Sales home">
          <span className="auth-logo-crop"><img src="/nxt-sales-logo-clean.png" alt="NXT Sales" /></span>
        </a>
        <a className="auth-support-link" href={`mailto:${APP_CONFIG.supportEmail}`}>Need help?</a>
      </header>

      <section className={`auth-shell ${isSignUp ? 'auth-shell-signup' : ''}`}>
        <div className="auth-card">
          <h1>{isSignUp ? 'Create your sales workspace' : 'Welcome back'}</h1>
          <p className="auth-intro">
            {isSignUp
              ? 'Get your team, pipeline and follow-ups moving together—in just a few minutes.'
              : 'Pick up where you left off and keep every opportunity moving.'}
          </p>

          {APP_CONFIG.auth.google && (
            <button type="button" className="auth-google" onClick={handleGoogle} disabled={googleLoading || loading}>
              {googleLoading ? <span className="auth-spinner auth-spinner-dark" /> : GOOGLE_LOGO}
              {googleLoading ? 'Connecting to Google…' : isSignUp ? 'Sign up with Google' : 'Continue with Google'}
            </button>
          )}

          <div className="auth-divider"><span>{isSignUp ? 'or continue with work email' : 'or sign in with work email'}</span></div>

          <form className={`auth-form ${isSignUp ? 'auth-form-signup' : ''}`} onSubmit={submit} noValidate>
            {isSignUp && (
              <div className={`auth-field ${fieldError('name') ? 'has-error' : ''}`}>
                <label htmlFor="auth-name">Full Name</label>
                <input id="auth-name" name="name" type="text" autoComplete="name" placeholder="Enter your full name" value={form.name}
                  onChange={e => update('name', e.target.value)} onBlur={() => setTouched(t => ({ ...t, name: true }))}
                  aria-invalid={Boolean(fieldError('name'))} aria-describedby={fieldError('name') ? 'auth-name-error' : undefined} />
                {fieldError('name') && <p id="auth-name-error" className="auth-field-error">{fieldError('name')}</p>}
              </div>
            )}

            <div className={`auth-field ${fieldError('email') ? 'has-error' : ''}`}>
              <label htmlFor="auth-email">Work Email</label>
              <input id="auth-email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="name@company.com" value={form.email}
                onChange={e => update('email', e.target.value)} onBlur={() => setTouched(t => ({ ...t, email: true }))}
                aria-invalid={Boolean(fieldError('email'))} aria-describedby={fieldError('email') ? 'auth-email-error' : undefined} />
              {fieldError('email') && <p id="auth-email-error" className="auth-field-error">{fieldError('email')}</p>}
            </div>

            {isSignUp && (
              <div className={`auth-field ${fieldError('companyName') ? 'has-error' : ''}`}>
                <label htmlFor="auth-company">Company Name</label>
                <input id="auth-company" name="organization" type="text" autoComplete="organization" placeholder="Enter company name" value={form.companyName}
                  onChange={e => update('companyName', e.target.value)} onBlur={() => setTouched(t => ({ ...t, companyName: true }))}
                  aria-invalid={Boolean(fieldError('companyName'))} aria-describedby={fieldError('companyName') ? 'auth-company-error' : undefined} />
                {fieldError('companyName') && <p id="auth-company-error" className="auth-field-error">{fieldError('companyName')}</p>}
              </div>
            )}

            <div className={`auth-field ${fieldError('password') ? 'has-error' : ''}`}>
              <div className="auth-label-row">
                <label htmlFor="auth-password">Password</label>
                {!isSignUp && <button type="button" className="auth-text-button" onClick={() => navigate('/forgot-password')}>Forgot password?</button>}
              </div>
              <div className="auth-password-wrap">
                <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder={isSignUp ? 'Create a secure password' : 'Enter your password'} value={form.password}
                  onChange={e => update('password', e.target.value)} onBlur={() => setTouched(t => ({ ...t, password: true }))}
                  aria-invalid={Boolean(fieldError('password'))} aria-describedby={isSignUp ? 'auth-password-help' : (fieldError('password') ? 'auth-password-error' : undefined)} />
                <button type="button" className="auth-password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  <EyeIcon hidden={showPassword} />
                </button>
              </div>
              {isSignUp && (
                <div id="auth-password-help" className="auth-password-help" aria-live="polite">
                  <span className={passwordChecks.length ? 'met' : ''}>8+ characters</span><i>·</i>
                  <span className={passwordChecks.uppercase ? 'met' : ''}>Uppercase</span><i>·</i>
                  <span className={passwordChecks.number ? 'met' : ''}>Number</span>
                </div>
              )}
              {fieldError('password') && !isSignUp && <p id="auth-password-error" className="auth-field-error">{fieldError('password')}</p>}
            </div>

            {serverError && <p className="auth-server-error" role="alert">{serverError}</p>}
            <button type="submit" className={`auth-primary ${success ? 'is-success' : ''}`} disabled={!canSubmit}>
              {loading ? <><span className="auth-spinner" /> Please wait…</> : success ? 'Workspace ready' : isSignUp ? 'Create my workspace' : 'Sign In'}
            </button>
          </form>

          <p className="auth-switch">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button type="button" onClick={() => { setTouched({}); setServerError(''); navigate(isSignUp ? '/login' : '/signup') }}>
              {isSignUp ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <button type="button" className="auth-demo-link" onClick={handleDemo} disabled={loading || googleLoading || demoLoading}>
            {demoLoading ? 'Opening demo…' : 'Explore demo workspace'} {!demoLoading && <span aria-hidden="true">→</span>}
          </button>
        </div>

        <aside className="auth-trust" aria-label="NXT Sales benefits">
            <div className="auth-visual-media">
              <img src="/sales-team-visual.jpg" alt="Sales team collaborating around a laptop" />
              <div className="auth-visual-shade" />
              <div className="auth-visual-copy">
                <span className="auth-trust-kicker">{isSignUp ? 'Built for modern sales teams' : 'Your sales command centre'}</span>
                <h2>{isSignUp ? 'Your team’s next best action—always in view.' : 'Come back to a pipeline that never stands still.'}</h2>
                <p className="auth-trust-copy">
                  {isSignUp
                    ? 'From first touch to closed-won, keep every conversation and opportunity moving.'
                    : 'Your priorities, follow-ups and team activity are ready when you are.'}
                </p>
              </div>
            </div>

            <div className="auth-pipeline-preview" aria-hidden="true">
              <div className="auth-preview-head">
                <div><span className="auth-preview-dot" />Sales pipeline</div>
                <span>This week</span>
              </div>
              <div className="auth-preview-metric">
                <span>Open opportunities</span>
                <strong>24</strong>
              </div>
              <div className="auth-preview-bars">
                <i style={{ '--bar-width': '72%' }} /><i style={{ '--bar-width': '52%' }} /><i style={{ '--bar-width': '34%' }} />
              </div>
              <div className="auth-preview-labels"><span>Qualified</span><span>Proposal</span><span>Won</span></div>
            </div>

            <div className="auth-benefits">
              {BENEFITS.map(([type, label]) => (
                <div className="auth-benefit" key={type}>
                  <span className="auth-benefit-icon"><BenefitIcon type={type} /></span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </aside>
      </section>

      <footer className="auth-footer">
        <div className="auth-suite">
          <span>Part of the AltiusNxt Suite</span>
          <nav aria-label="AltiusNxt products">
            {(APP_CONFIG.suite || []).map(product => <span key={product} className={product === APP_CONFIG.suiteKey ? 'active' : ''}>{product}</span>)}
          </nav>
        </div>
        <div className="auth-legal">
          <span>© 2026 AltiusNxt Technologies Pvt. Ltd.</span>
          <nav aria-label="Legal links"><a href="#privacy">Privacy</a><a href="#terms">Terms</a><a href={`mailto:${APP_CONFIG.supportEmail}`}>Support</a></nav>
        </div>
      </footer>
    </main>
  )
}
