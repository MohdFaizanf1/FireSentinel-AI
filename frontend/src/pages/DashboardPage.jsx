// ─────────────────────────────────────────────────────────
//  Dashboard Page — full app shell with sidebar + tab views
// ─────────────────────────────────────────────────────────
import { useState } from 'react'
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../context/SocketContext'
import { useDetection } from '../hooks/useDetection'

import OverviewTab  from '../components/tabs/OverviewTab'
import WebcamTab    from '../components/tabs/WebcamTab'
import LogsTab      from '../components/tabs/LogsTab'
import AnalyticsTab from '../components/tabs/AnalyticsTab'
import GalleryTab   from '../components/tabs/GalleryTab'
import MapTab       from '../components/tabs/MapTab'

import {
  LayoutDashboard, Camera, ClipboardList,
  BarChart2, Image, Map, LogOut, Wifi, WifiOff
} from 'lucide-react'

const NAV = [
  { path: '/',          label: 'Overview',  icon: LayoutDashboard },
  { path: '/webcam',    label: 'Webcam',    icon: Camera },
  { path: '/logs',      label: 'Logs',      icon: ClipboardList },
  { path: '/analytics', label: 'Analytics', icon: BarChart2 },
  { path: '/gallery',   label: 'Gallery',   icon: Image },
  { path: '/map',       label: 'Map View',  icon: Map },
]

export default function DashboardPage() {
  const { user, logout }          = useAuth()
  const { connected }             = useSocket()
  const detection                 = useDetection()
  const [sidebarOpen, setSidebar] = useState(false)
  const navigate                  = useNavigate()
  const location                  = useLocation()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const fireActive = detection.status.fire_detected

  return (
    <div className="flex min-h-screen bg-dark-900 bg-grid">

      {/* ── Sidebar ──────────────────────────────────── */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 flex flex-col
        w-64 bg-dark-800 border-r border-white/5
        transform transition-transform duration-300
        lg:translate-x-0 lg:static lg:flex
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 p-5 border-b border-white/5">
          <motion.div
            animate={fireActive ? {
              boxShadow: ['0 0 20px rgba(255,45,0,0.5)', '0 0 40px rgba(255,45,0,0.9)', '0 0 20px rgba(255,45,0,0.5)']
            } : {}}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-fire-red to-fire-orange flex items-center justify-center text-xl flex-shrink-0"
          >
            🔥
          </motion.div>
          <div>
            <div className="font-display font-bold text-white tracking-wide leading-tight">FireShield AI</div>
            <div className="font-mono text-xs text-muted tracking-widest">v2.0 SAAS</div>
          </div>
        </div>

        {/* Connection status */}
        <div className="px-5 py-3 border-b border-white/5">
          <div className={`flex items-center gap-2 text-xs font-mono ${connected ? 'text-green-400' : 'text-red-400'}`}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {connected ? 'CONNECTED' : 'DISCONNECTED'}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              onClick={() => setSidebar(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-fire-orange/10 text-fire-orange border border-fire-orange/20'
                    : 'text-muted hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon size={16} />
              <span className="font-display tracking-wide">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 mb-3">
            {user?.picture
              ? <img src={user.picture} alt={user.name} className="w-9 h-9 rounded-full border border-fire-orange/30" />
              : <div className="w-9 h-9 rounded-full bg-fire-orange/20 flex items-center justify-center text-fire-orange font-bold">
                  {user?.name?.[0] || 'U'}
                </div>
            }
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.name}</div>
              <div className="text-xs text-muted truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs text-muted hover:text-fire-red hover:bg-fire-red/5 transition-colors font-mono tracking-wider"
          >
            <LogOut size={12} />
            LOGOUT
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebar(false)} />
      )}

      {/* ── Main content ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 lg:px-6 py-3 bg-dark-800/80 backdrop-blur border-b border-white/5">
          <button
            onClick={() => setSidebar(true)}
            className="lg:hidden p-2 rounded-lg text-muted hover:text-white"
          >
            ☰
          </button>

          {/* Fire alert banner */}
          <AnimatePresence>
            {fireActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="alert-pulse flex items-center gap-2 px-4 py-2 rounded-full bg-fire-red/20 border border-fire-red/50 text-fire-red font-mono text-xs tracking-widest font-bold"
              >
                <span className="animate-ping w-2 h-2 rounded-full bg-fire-red inline-block" />
                🔥 FIRE DETECTED — {detection.status.confidence}%
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-3">
            {detection.status.is_running ? (
              <button
                onClick={detection.stopDetection}
                className="px-4 py-2 rounded-xl bg-dark-700 border border-red-500/30 text-red-400 text-xs font-mono tracking-wider hover:bg-red-500/10 transition-colors"
              >
                ⏹ STOP
              </button>
            ) : (
              <button
                onClick={detection.startDetection}
                disabled={detection.isStarting}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-fire-red to-fire-orange text-white text-xs font-mono tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {detection.isStarting ? '⏳ STARTING...' : '▶ START DETECTION'}
              </button>
            )}
          </div>
        </header>

        {/* Page content — key prop prevents stale state across tab switches */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Routes location={location} key={location.pathname}>
            <Route path="/"          element={<OverviewTab  detection={detection} />} />
            <Route path="/webcam"    element={<WebcamTab    detection={detection} />} />
            <Route path="/logs"      element={<LogsTab      detection={detection} />} />
            <Route path="/analytics" element={<AnalyticsTab detection={detection} />} />
            <Route path="/gallery"   element={<GalleryTab   detection={detection} />} />
            <Route path="/map"       element={<MapTab       detection={detection} />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}