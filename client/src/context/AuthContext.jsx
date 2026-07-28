import { createContext, useContext, useState, useEffect } from 'react'
import { getSocket, disconnectSocket } from '../socket'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
