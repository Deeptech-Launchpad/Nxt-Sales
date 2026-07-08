import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { APP_CONFIG } from '../config/app'
import '../styles/login.css'

const CHECK_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)

const GOOGLE_LOGO = (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
    <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
  </svg>
)

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)

  const { auth } = APP_CONFIG

  const handlePasswordLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !email.includes('@')) { setError('Please enter a valid work email.'); return }
    if (!password) { setError('Please enter your password.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (res.ok && data.success !== false) {
        login(data.user, data.token)
        navigate(APP_CONFIG.redirectAfterLogin)
      } else {
        setError(data.message || 'Invalid email or password.')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setError('')
    if (!name) { setError('Please enter your name.'); return }
    if (!email || !email.includes('@')) { setError('Please enter a valid work email.'); return }
    if (!password || password.length < 6) { setError('Password must be at least 6 characters.'); return }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json()
      if (res.ok && data.success !== false) {
        login(data.user, data.token)
        navigate(APP_CONFIG.redirectAfterLogin)
      } else {
        setError(data.message || 'Registration failed.')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = () => {
    setGoogleLoading(true)
    window.location.href = '/auth/google'
  }

  return (
    <div className="page">

      {/* ── Left Panel ── */}
      <div className="left">
        <div className="geo" aria-hidden="true">
          <div className="geo-1" />
          <div className="geo-2" />
          <div className="geo-3" />
        </div>

        <div className="logo-wrap">
          <img src="/AltiusNXT_Logo-01.png" alt="AltiusNxt Technologies" style={{ height: 30 }} />
        </div>

        <div className="left-body">
          <div className="left-divider" />
          <p className="access-label">Secure Workspace Access</p>
          <h2 className="app-name-left">{APP_CONFIG.appName}</h2>
          <div className="red-rule" />
          <ul className="feature-list">
            {APP_CONFIG.features.map((f, i) => (
              <li key={i} className="feature-item">
                <span className="feat-icon">{CHECK_ICON}</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="left-bottom">
          <div className="bottom-divider" />
          <p className="suite-label">Part of AltiusNxt Suite</p>
          <div className="suite-chips">
            {(APP_CONFIG.suite || []).map(s => {
              const isActive = s === APP_CONFIG.suiteKey
              const url = APP_CONFIG.suiteLinks?.[s]
              if (isActive) return <span key={s} className="suite-chip active">{s}</span>
              return url
                ? <a key={s} className="suite-chip" href={url} target="_blank" rel="noopener noreferrer">{s}</a>
                : <span key={s} className="suite-chip">{s}</span>
            })}
          </div>
          <p className="left-foot">© 2026 AltiusNxt Technologies Pvt. Ltd.</p>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="right">
        <div className="right-content">
          <div className="app-badge" style={{ background: APP_CONFIG.appColor }}>
            <span className="app-badge-short">{APP_CONFIG.appShort}</span>
          </div>
          <h1 className="right-title">Welcome back</h1>
          <p className="right-sub">{APP_CONFIG.tagline}</p>

          {auth.google && auth.password && (
            <>
              <button type="button" className="google-btn" onClick={handleGoogle} disabled={googleLoading}>
                {googleLoading ? <span className="spinner spinner-dark" /> : GOOGLE_LOGO}
                Continue with Google
              </button>
              <div className="or-divider">or sign in with email</div>
            </>
          )}

          {auth.password && (
            <>
              <form className="form" onSubmit={isSignUp ? handleSignUp : handlePasswordLogin} noValidate>
                {isSignUp && (
                  <div className="field">
                    <label htmlFor="inp-name">Full Name</label>
                    <input
                      type="text" id="inp-name"
                      placeholder="Rajesh Kumar"
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="inp-email">Work Email</label>
                  <input
                    type="email" id="inp-email"
                    placeholder="you@altiusnxt.com"
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="field">
                  <div className="label-row">
                    <label htmlFor="inp-password">Password</label>
                    {!isSignUp && (
                      <button type="button" className="forgot-btn" onClick={() => navigate('/forgot-password')}>
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    type="password" id="inp-password"
                    placeholder="••••••••"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>

                {error && <p className="msg-error">{error}</p>}

                <button type="submit" className="submit-btn" disabled={loading}>
                  {loading ? <span className="spinner" /> : (isSignUp ? 'Create Account' : 'Sign In')}
                </button>
              </form>

              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 16 }}>
                {isSignUp ? (
                  <>
                    Already have an account?{' '}
                    <button style={{ background: 'none', border: 'none', color: '#e63329', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }} onClick={() => { setIsSignUp(false); setError(''); }}>
                      Sign In
                    </button>
                  </>
                ) : (
                  <>
                    Don't have an account?{' '}
                    <button style={{ background: 'none', border: 'none', color: '#e63329', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }} onClick={() => { setIsSignUp(true); setError(''); }}>
                      Sign Up
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          <div className="right-foot">
            Need help? <a href={`mailto:${APP_CONFIG.supportEmail}`}>Contact IT Support</a>
          </div>
        </div>
      </div>

    </div>
  )
}
