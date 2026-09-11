// ─────────────────────────────────────────────────────────
//  Auth Callback — receives token from backend redirect
//  URL: /auth/callback?token=<jwt>
//  This is a REACT route — Vite must NOT proxy it to backend
// ─────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthCallback() {
  const [params]      = useSearchParams()
  const { login }     = useAuth()
  const navigate      = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    // Token is passed as ?token=<jwt> query param from backend redirect
    const token = params.get('token')

    if (token) {
      login(token)
      // Small delay so login state propagates before navigating
      setTimeout(() => navigate('/', { replace: true }), 100)
    } else {
      setError('No authentication token received.')
      setTimeout(() => navigate('/login?error=no_token', { replace: true }), 2000)
    }
  }, [])  // eslint-disable-line

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center gap-4">
      {error ? (
        <>
          <div className="text-fire-red font-mono text-sm">{error}</div>
          <div className="text-muted font-mono text-xs">Redirecting to login...</div>
        </>
      ) : (
        <>
          <div className="text-4xl animate-pulse">🔥</div>
          <p className="font-mono text-fire-orange tracking-widest text-sm animate-pulse">
            AUTHENTICATING...
          </p>
          <p className="font-mono text-muted text-xs">Verifying your credentials</p>
        </>
      )}
    </div>
  )
}
