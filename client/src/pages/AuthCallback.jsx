import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Landing page for the Google sign-in redirect.
// The backend redirects here as /auth/callback?token=…&user=…
// We store the session and send the user into the app.
export default function AuthCallback() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true

    const params = new URLSearchParams(window.location.search)
    const token  = params.get('token')
    const userRaw = params.get('user')

    if (!token || !userRaw) {
      navigate('/login?error=google', { replace: true })
      return
    }

    try {
      const user = JSON.parse(decodeURIComponent(userRaw))
      login(user, token)
      navigate('/dashboard', { replace: true })
    } catch {
      navigate('/login?error=google', { replace: true })
    }
  }, [login, navigate])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', color: '#344054', fontFamily: 'DM Sans, system-ui, sans-serif',
      gap: 10, fontSize: 18,
    }}>
      <span className="spinner spinner-dark" /> Signing you in…
    </div>
  )
}
