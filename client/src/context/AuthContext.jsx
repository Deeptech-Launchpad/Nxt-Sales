import { createContext, useContext, useState, useEffect } from 'react'
import { getSocket, disconnectSocket } from '../socket'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const appearance = JSON.parse(localStorage.getItem('nxt_appearance') || '{}')
      const accents = { navy: '#071B52', blue: '#3267E3', red: '#EF1B16' }
      document.documentElement.dataset.density = appearance.density || 'comfortable'
      document.documentElement.dataset.theme = appearance.theme || 'light'
      document.documentElement.style.setProperty('--color-focus', accents[appearance.accent] || accents.navy)
    } catch { /* use brand defaults */ }
    const stored = localStorage.getItem('mwz_user')
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch { localStorage.removeItem('mwz_user') }
    }
    setLoading(false)
  }, [])

  const login = (userData, token) => {
    localStorage.setItem('mwz_user', JSON.stringify(userData))
    localStorage.setItem('mwz_token', token)
    setUser(userData)
    // getSocket() may have already been constructed (with no token) before
    // login — force a fresh connection now that one exists.
    disconnectSocket()
    getSocket().connect()
  }

  const logout = () => {
    localStorage.removeItem('mwz_user')
    localStorage.removeItem('mwz_token')
    setUser(null)
    disconnectSocket()
  }

  const updateUser = (updates) => {
    setUser(current => {
      const next = { ...(current || {}), ...updates }
      localStorage.setItem('mwz_user', JSON.stringify(next))
      return next
    })
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
