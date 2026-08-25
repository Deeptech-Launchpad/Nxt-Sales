import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../api/client'

export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const token    = searchParams.get('token')
  const navigate = useNavigate()

  const [inviteUser, setInviteUser] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [tokenError, setTokenError] = useState('')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [showPw, setShowPw]         = useState(false)
  const [error, setError]           = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess]       = useState(false)

  useEffect(() => {
    if (!token) {
      setTokenError('Invalid invite link. Please ask your administrator to resend the invitation.')
      setLoading(false)
      return
    }
    api.get(`/auth/validate-invite?token=${token}`)
      .then(r => { setInviteUser(r.data.user); setLoading(false) })
      .catch(() => {
        setTokenError('This invite link is invalid or has expired. Please ask your administrator to resend the invitation.')
        setLoading(false)
      })
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSubmitting(true)
    try {
      const { data } = await api.post('/auth/accept-invite', { token, password })
      localStorage.setItem('mwz_user', JSON.stringify(data.user))
      localStorage.setItem('mwz_token', data.token)
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 2200)
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 8,
    padding: '10px 14px', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'DM Sans, system-ui, sans-serif',
    color: '#0f172a', background: '#fff',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: 'DM Sans, system-ui, sans-serif', padding: 16,
    }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 36, width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#e63329,#c0271e)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22, fontWeight: 800, color: '#fff' }}>N</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>NXT Sales</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Accept your invitation</div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 14 }}>
            Validating your invite link…
          </div>
        )}

        {!loading && tokenError && (
          <div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '14px 16px', marginBottom: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>⚠️</div>
              <p style={{ margin: 0, color: '#991b1b', fontSize: 13, lineHeight: 1.5 }}>{tokenError}</p>
            </div>
            <button onClick={() => navigate('/login')} style={{ width: '100%', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Go to Login
            </button>
          </div>
        )}

        {!loading && !tokenError && success && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 18 }}>Account activated!</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>Redirecting you to the dashboard…</p>
          </div>
        )}

        {!loading && !tokenError && !success && inviteUser && (
          <>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 22 }}>
              <p style={{ margin: 0, color: '#475569', fontSize: 13 }}>
                Hi <strong style={{ color: '#0f172a' }}>{inviteUser.name}</strong>! Set a password to activate your account at <strong style={{ color: '#0f172a' }}>{inviteUser.email}</strong>.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>New Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    required type={showPw ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    style={{ ...inputStyle, paddingRight: 44 }}
                  />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12 }}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Confirm Password</label>
                <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" style={inputStyle} />
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                  <p style={{ margin: 0, color: '#991b1b', fontSize: 13 }}>{error}</p>
                </div>
              )}

              <button type="submit" disabled={submitting} style={{ width: '100%', background: '#e11d48', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Activating…' : 'Activate Account'}
              </button>
            </form>
          </>
        )}

        <p style={{ textAlign: 'center', marginTop: 20, marginBottom: 0, fontSize: 12, color: '#94a3b8' }}>
          Already have an account?{' '}
          <span onClick={() => navigate('/login')} style={{ color: '#e11d48', cursor: 'pointer', fontWeight: 600 }}>Sign in</span>
        </p>
      </div>
    </div>
  )
}
