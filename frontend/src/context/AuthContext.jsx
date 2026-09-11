// ─────────────────────────────────────────────────────────
//  Auth Context — manages JWT + user state
// ─────────────────────────────────────────────────────────
import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'


const AuthContext = createContext(null)
const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount, check if we have a stored token and verify it
  useEffect(() => {
    const token = localStorage.getItem('fs_token')
    if (token) {
      axios.get(`${BACKEND}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => setUser(r.data.user))
        .catch(() => localStorage.removeItem('fs_token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  function login(token) {
    localStorage.setItem('fs_token', token)
    try {
      // Decode JWT payload (not verification — backend does that)
      const payload = JSON.parse(atob(token.split('.')[1]))
      setUser(payload)
    } catch {
      setUser({ name: 'User' })
    }
  }

  function logout() {
    localStorage.removeItem('fs_token')
    setUser(null)
    axios.post(`${BACKEND}/auth/logout`, {}, { withCredentials: true }).catch(() => {})
  }

  function getToken() {
    return localStorage.getItem('fs_token')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
