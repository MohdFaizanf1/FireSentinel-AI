// ─────────────────────────────────────────────────────────
//  useDetection — FIXED
//
//  FIXES:
//  1. boxes state exposed so WebcamTab can draw REAL bboxes
//  2. gallery state updated when new_image socket event arrives
//  3. Safer api() call — won't crash if token is null
//  4. Loads initial gallery images on mount
// ─────────────────────────────────────────────────────────
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import axios from 'axios'
import toast from 'react-hot-toast'

const BACKEND     = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
const MAX_HISTORY = 60

export function useDetection() {
  const { socket }   = useSocket()
  const { getToken } = useAuth()

  const [status, setStatus] = useState({
    fire_detected:       false,
    confidence:          0,
    total_detections:    0,
    last_detection_time: null,
    fps:                 0,
    uptime_seconds:      0,
    is_running:          false,
    mode:                'idle',
    boxes:               [],   // ← REAL bounding boxes from YOLO
  })

  const [logs,              setLogs]       = useState([])
  const [images,            setImages]     = useState([])   // gallery images
  const [confidenceHistory, setConfHistory] = useState([])
  const [isStarting,        setIsStarting] = useState(false)

  const alarmRef    = useRef(null)
  const prevFireRef = useRef(false)

  // ── Stable axios helper ───────────────────────────────
  const api = useCallback((config) => {
    const token = getToken()
    return axios({
      ...config,
      url:     `${BACKEND}${config.url}`,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...config.headers,
      },
      withCredentials: true,
    })
  }, [getToken])

  // ── Alarm ─────────────────────────────────────────────
  function getAlarm() {
    if (!alarmRef.current) {
      alarmRef.current      = new Audio(`${BACKEND}/alarm.mp3`)
      alarmRef.current.loop = true
    }
    return alarmRef.current
  }

  function playAlarm() {
    try { getAlarm().play().catch(() => {}) } catch {}
  }

  function stopAlarm() {
    try {
      if (alarmRef.current) {
        alarmRef.current.pause()
        alarmRef.current.currentTime = 0
      }
    } catch {}
  }

  // ── Socket event listeners ────────────────────────────
  useEffect(() => {
    if (!socket) return

    function onStatus(data) {
      // FIX: include boxes in status so WebcamTab gets real YOLO boxes
      setStatus(data)

      setConfHistory(prev => {
        const point = {
          time:       new Date().toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          }),
          confidence: data.confidence,
          fps:        data.fps,
        }
        return [...prev, point].slice(-MAX_HISTORY)
      })

      if (!data.fire_detected && prevFireRef.current) {
        stopAlarm()
        prevFireRef.current = false
      }
    }

    function onFireDetected({ confidence }) {
      if (prevFireRef.current) return
      prevFireRef.current = true
      playAlarm()
      toast.error(`🔥 FIRE DETECTED — ${confidence}% confidence`, {
        duration: 6000,
        style: {
          background: '#FF2D00',
          color:      '#fff',
          fontWeight: '700',
          border:     '1px solid #FF6B00',
          fontFamily: 'Rajdhani, sans-serif',
          fontSize:   '15px',
        },
      })
    }

    function onLog(entry) {
      setLogs(prev => [entry, ...prev].slice(0, 200))
    }

    function onAlarm({ state }) {
      if (state === 'on') playAlarm()
      else stopAlarm()
    }

    // FIX: new_image event pushed from backend when Python saves screenshot
    function onNewImage(imgData) {
      setImages(prev => {
        // Avoid duplicates
        if (prev.find(i => i.filename === imgData.filename)) return prev
        return [imgData, ...prev].slice(0, 100)
      })
      toast(`📸 Screenshot saved: ${imgData.filename}`, {
        duration: 3000,
        icon: '🔥',
        style: {
          background: '#1a1a2e',
          color:      '#FF6B00',
          border:     '1px solid rgba(255,107,0,0.4)',
          fontFamily: 'Share Tech Mono, monospace',
          fontSize:   '12px',
        },
      })
    }

    socket.on('status',        onStatus)
    socket.on('fire_detected', onFireDetected)
    socket.on('log',           onLog)
    socket.on('alarm',         onAlarm)
    socket.on('new_image',     onNewImage)     // FIX: gallery real-time update

    // Load initial data
    api({ method: 'GET', url: '/api/logs', params: { limit: 100 } })
      .then(r => setLogs(r.data.logs || []))
      .catch(() => {})

    api({ method: 'GET', url: '/api/images' })
      .then(r => setImages(r.data.images || []))
      .catch(() => {})

    return () => {
      socket.off('status',        onStatus)
      socket.off('fire_detected', onFireDetected)
      socket.off('log',           onLog)
      socket.off('alarm',         onAlarm)
      socket.off('new_image',     onNewImage)
    }
  }, [socket])

  // ── Start / Stop detection ────────────────────────────
  async function startDetection() {
    setIsStarting(true)
    try {
      await api({ method: 'POST', url: '/api/start-detection' })
      toast.success('🔥 Detection started', { duration: 3000 })
    } catch (err) {
      toast.error('Failed to start detection')
    } finally {
      setIsStarting(false)
    }
  }

  async function stopDetection() {
    try {
      stopAlarm()
      await api({ method: 'POST', url: '/api/stop-detection' })
      toast('Detection stopped', { icon: '⏹', duration: 3000 })
    } catch {
      toast.error('Failed to stop detection')
    }
  }

  // ── Gallery helpers (passed down to GalleryTab) ───────
  async function loadImages() {
    try {
      const r = await api({ method: 'GET', url: '/api/images' })
      setImages(r.data.images || [])
    } catch {}
  }

  async function deleteImage(filename) {
    try {
      await api({ method: 'DELETE', url: `/api/images/${filename}` })
      setImages(prev => prev.filter(img => img.filename !== filename))
    } catch { throw new Error('Delete failed') }
  }

  async function deleteAllImages() {
    try {
      await api({ method: 'DELETE', url: '/api/images' })
      setImages([])
    } catch { throw new Error('Delete all failed') }
  }

  function exportCSV() {
    const token = getToken()
    window.open(
      `${BACKEND}/api/logs/export${token ? `?token=${token}` : ''}`,
      '_blank'
    )
  }

  return {
    status,
    logs,
    images,
    confidenceHistory,
    isStarting,
    startDetection,
    stopDetection,
    exportCSV,
    api,
    BACKEND,
    // Gallery
    loadImages,
    deleteImage,
    deleteAllImages,
  }
}
