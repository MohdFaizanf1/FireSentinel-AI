// ─────────────────────────────────────────────────────────
//  Login Page — Google OAuth entry point
// ─────────────────────────────────────────────────────────
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export default function LoginPage() {
  const { user }          = useAuth()
  const navigate          = useNavigate()
  const [params]          = useSearchParams()
  const error             = params.get('error')

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  function handleGoogleLogin() {
    window.location.href = `${BACKEND}/auth/google`
  }

  return (
    <div className="min-h-screen bg-dark-900 bg-grid flex items-center justify-center relative overflow-hidden">

      {/* Ambient fire glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-fire-red/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-fire-orange/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-fire-red/3 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <motion.div
            animate={{ boxShadow: ['0 0 20px rgba(255,45,0,0.4)', '0 0 40px rgba(255,45,0,0.8)', '0 0 20px rgba(255,45,0,0.4)'] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-fire-red to-fire-orange text-4xl mb-6"
          >
            🔥
          </motion.div>
          <h1 className="font-display text-4xl font-bold text-white tracking-wider">
            FIRESHIELD <span className="text-fire-orange">AI</span>
          </h1>
          <p className="font-mono text-xs text-muted tracking-[4px] uppercase mt-2">
            Real-Time Fire Detection System
          </p>
        </div>

        {/* Card */}
        <div className="card border-fire-orange/30 rounded-2xl p-8">
          <h2 className="font-display text-xl font-semibold text-white mb-2">
            Welcome back
          </h2>
          <p className="text-sm text-muted mb-8 leading-relaxed">
            Sign in to access your fire detection dashboard and real-time monitoring system.
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-6 p-3 rounded-lg bg-fire-red/10 border border-fire-red/30 text-fire-red text-sm font-mono"
            >
              Authentication failed. Please try again.
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: 1.02, boxShadow: '0 0 30px rgba(255,107,0,0.3)' }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold transition-colors duration-200"
          >
            <GoogleIcon />
            Continue with Google
          </motion.button>

          <div className="mt-8 pt-6 border-t border-white/5 text-center">
            <p className="text-xs text-muted">
              Protected by Google OAuth 2.0 · End-to-end encrypted
            </p>
          </div>
        </div>

        {/* Features hint */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          {[
            { icon: '⚡', label: 'Real-time' },
            { icon: '🎯', label: 'YOLOv8 AI' },
            { icon: '🔔', label: 'Instant Alerts' },
          ].map(f => (
            <div key={f.label} className="text-muted text-xs">
              <div className="text-xl mb-1">{f.icon}</div>
              <div className="font-mono tracking-wider">{f.label}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
