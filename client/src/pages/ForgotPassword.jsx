import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [sent, setSent]           = useState(false)
  const [devResetLink, setDevResetLink] = useState('') // only ever populated when SMTP isn't configured (local/dev)

  const inputStyle = {
    width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 8,
    padding: '10px 14px', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'DM Sans, system-ui, sans-serif',
    color: '#0f172a', background: '#fff',
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !email.includes('@')) { setError('Please enter a valid email address.'); return }
    setSubmitting(true)
    try {
      const { data } = await api.post('/auth/forgot-password', { email })
      setSent(true)
      setDevResetLink(data?.resetLink || '')
    } catch {
      // The endpoint itself never errors out on a bad/unknown email — a
      // failure here means the request didn't reach the server at all.
      setError('Connection error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      fontFamily: 'DM Sans, system-ui, sans-serif', padding: 16,
    }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 36, width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(0,0,0,.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#e63329,#c0271e)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 22, fontWeight: 800, color: '#fff' }}>N</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>NXT Sales</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Reset your password</div>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit}>
            <p style={{ margin: '0 0 18px', color: '#475569', fontSize: 13.5, lineHeight: 1.5 }}>
              Enter the email address on your account and we'll send you a link to set a new password.
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Work Email</label>
              <input
                type="email" autoFocus value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@altiusnxt.com"
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                <p style={{ margin: 0, color: '#991b1b', fontSize: 13 }}>{error}</p>
              </div>
            )}

            <button type="submit" disabled={submitting} style={{ width: '100%', background: '#e11d48', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
        ) : (
          <div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>✉️</div>
              <p style={{ margin: 0, color: '#166534', fontSize: 13, lineHeight: 1.5 }}>
                If an account exists for <strong>{email}</strong>, a reset link has been sent to that inbox.
              </p>
            </div>

            {devResetLink && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <p style={{ margin: '0 0 8px', color: '#92400e', fontSize: 12, fontWeight: 600 }}>
                  Local/dev mode — no SMTP configured, so here's the link directly:
                </p>
                <a href={devResetLink} style={{ fontSize: 12.5, color: '#1d4ed8', wordBreak: 'break-all' }}>{devResetLink}</a>
              </div>
            )}

            <button onClick={() => navigate('/login')} style={{ width: '100%', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Back to Login
            </button>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: 20, marginBottom: 0, fontSize: 12, color: '#94a3b8' }}>
          <span onClick={() => navigate('/login')} style={{ color: '#e11d48', cursor: 'pointer', fontWeight: 600 }}>Back to sign in</span>
        </p>
      </div>
    </div>
  )
}
