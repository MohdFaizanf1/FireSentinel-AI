// ─────────────────────────────────────────────────────────
//  WebcamTab — FIXED
//
//  FIXES:
//  1. Draws REAL YOLO bounding boxes from status.boxes
//     (no more fake animated rectangle)
//  2. Canvas dimensions always sync to actual video size
//  3. Correct bbox scaling when canvas CSS size ≠ internal size
// ─────────────────────────────────────────────────────────
import { useRef, useState, useEffect } from 'react'
import { motion } from 'framer-motion'

const MODEL_W = 640  // width the Python model runs at
const MODEL_H = 480  // height the Python model runs at

export default function WebcamTab({ detection }) {
  const { status } = detection
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const animRef   = useRef(null)
  const alarmRef  = useRef(null)
  const alarmPlayingRef = useRef(false)

  const [camActive,  setCamActive]  = useState(false)
  const [camError,   setCamError]   = useState('')
  const [frameCount, setFrameCount] = useState(0)
  const [alarmOn,    setAlarmOn]    = useState(false)

  const statusRef = useRef(status)
  useEffect(() => { statusRef.current = status }, [status])

  // ── Alarm audio ────────────────────────────────────────
  useEffect(() => {
    const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
    const audio   = new Audio(`${BACKEND}/alarm.mp3`)
    audio.loop    = true
    audio.volume  = 0.8
    alarmRef.current = audio
    return () => { audio.pause(); audio.src = '' }
  }, [])

  useEffect(() => {
    if (status.fire_detected && camActive) playAlarm()
    else stopAlarm()
  }, [status.fire_detected, camActive])

  function playAlarm() {
    if (alarmPlayingRef.current) return
    alarmRef.current?.play()
      .then(() => { alarmPlayingRef.current = true; setAlarmOn(true) })
      .catch(() => {})
  }

  function stopAlarm() {
    if (!alarmRef.current) return
    alarmRef.current.pause()
    alarmRef.current.currentTime = 0
    alarmPlayingRef.current = false
    setAlarmOn(false)
  }

  // ── Camera ─────────────────────────────────────────────
  async function startCamera() {
    setCamError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      video.onloadedmetadata = async () => {
        await video.play()
        setCamActive(true)
        startOverlay()
      }
    } catch (err) {
      if (err.name === 'NotAllowedError')
        setCamError('Camera permission denied. Please allow camera access.')
      else if (err.name === 'NotFoundError')
        setCamError('No camera found. Please connect a webcam.')
      else
        setCamError(`Camera error: ${err.message}`)
    }
  }

  function stopCamera() {
    stopAlarm()
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    cancelAnimationFrame(animRef.current)
    animRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setCamActive(false)
    setCamError('')
    setFrameCount(0)
  }

  // ── Canvas overlay with REAL bounding boxes ────────────
  function startOverlay() {
    const video  = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d')
    let fc = 0

    function draw() {
      animRef.current = requestAnimationFrame(draw)
      fc++
      setFrameCount(fc)

      // Sync canvas internal size to actual video pixels
      const vw = video.videoWidth  || MODEL_W
      const vh = video.videoHeight || MODEL_H
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width  = vw
        canvas.height = vh
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const st = statusRef.current

      // ─── FIX: Draw REAL YOLO boxes from backend ──────────
      if (st.fire_detected && st.boxes && st.boxes.length > 0) {
        // Scale factors in case model resolution ≠ camera resolution
        const scaleX = canvas.width  / MODEL_W
        const scaleY = canvas.height / MODEL_H

        st.boxes.forEach(box => {
          const x1 = Math.round(box.x1 * scaleX)
          const y1 = Math.round(box.y1 * scaleY)
          const x2 = Math.round(box.x2 * scaleX)
          const y2 = Math.round(box.y2 * scaleY)
          const bw = x2 - x1
          const bh = y2 - y1

          // Glow effect
          ctx.shadowColor = '#FF2D00'
          ctx.shadowBlur  = 20
          ctx.strokeStyle = '#FF2D00'
          ctx.lineWidth   = 3
          ctx.strokeRect(x1, y1, bw, bh)
          ctx.shadowBlur  = 0

          // Corner accents
          drawCorners(ctx, x1, y1, bw, bh, '#FF2D00')

          // Label background + text
          const label = `fire  ${box.confidence}%`
          const lw    = label.length * 9 + 12
          ctx.fillStyle = 'rgba(255,45,0,0.88)'
          ctx.fillRect(x1, y1 - 28, lw, 28)
          ctx.fillStyle = '#ffffff'
          ctx.font      = 'bold 13px monospace'
          ctx.fillText(label, x1 + 6, y1 - 8)
        })
      }

      // Scan line
      const scanY = (fc * 2) % canvas.height
      const grad  = ctx.createLinearGradient(0, scanY - 6, 0, scanY + 6)
      grad.addColorStop(0, 'transparent')
      grad.addColorStop(0.5, 'rgba(255,107,0,0.05)')
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.fillRect(0, scanY - 6, canvas.width, 12)

      drawCrosshairs(ctx, canvas.width, canvas.height)
    }

    draw()
  }

  useEffect(() => () => stopCamera(), [])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Frames',     value: frameCount },
          { label: 'Boxes',      value: (status.boxes || []).length },
          { label: 'FPS',        value: status.fps || '—' },
        ].map(m => (
          <div key={m.label} className="card text-center">
            <div className="font-display text-2xl font-bold text-fire-orange">{m.value}</div>
            <div className="font-mono text-xs text-muted tracking-widest uppercase mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Alarm banner */}
      {alarmOn && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between px-5 py-3 rounded-xl bg-fire-red/20 border border-fire-red/60"
          style={{ boxShadow: '0 0 30px rgba(255,45,0,0.3)' }}
        >
          <div className="flex items-center gap-3">
            <span className="animate-ping w-3 h-3 rounded-full bg-fire-red inline-block" />
            <span className="font-display font-bold text-fire-red tracking-widest text-sm">
              🔥 FIRE DETECTED — {status.confidence}% CONFIDENCE
            </span>
          </div>
          <button
            onClick={stopAlarm}
            className="font-mono text-xs text-fire-red border border-fire-red/40 px-3 py-1 rounded-lg hover:bg-fire-red/20 transition-colors"
          >
            MUTE
          </button>
        </motion.div>
      )}

      {/* Camera card */}
      <div className="card flex flex-col items-center">

        <div style={{ display: camActive ? 'block' : 'none' }}>
          <div
            className="relative border-2 rounded-xl overflow-hidden"
            style={{
              borderColor: alarmOn ? '#FF2D00' : 'rgba(255,45,0,0.4)',
              boxShadow:   alarmOn ? '0 0 60px rgba(255,45,0,0.5)' : '0 0 40px rgba(255,45,0,0.2)',
              transition:  'box-shadow 0.3s, border-color 0.3s',
            }}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              style={{
                display: 'block',
                width: '640px', maxWidth: '100%',
                height: '480px', objectFit: 'cover',
                background: '#000',
              }}
            />
            {/* Canvas overlay — same size as video element */}
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: '100%', height: '100%',
                pointerEvents: 'none',
              }}
            />

            {/* HUD */}
            <div style={{
              position: 'absolute', top: 12, left: 12, right: 12,
              display: 'flex', justifyContent: 'space-between',
              pointerEvents: 'none',
            }}>
              <div
                className="font-mono text-xs px-3 py-1 rounded-full border"
                style={status.fire_detected
                  ? { background: 'rgba(255,45,0,0.85)', borderColor: '#FF2D00', color: '#fff' }
                  : { background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.1)', color: '#4ade80' }}
              >
                {status.fire_detected ? '🔥 FIRE DETECTED' : '● MONITORING'}
              </div>
              <div
                className="font-mono text-xs px-3 py-1 rounded-full"
                style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              >
                {status.fps} FPS
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-3 mt-4">
            <button
              onClick={stopCamera}
              className="px-6 py-2 rounded-xl border border-red-500/30 text-red-400 text-xs font-mono hover:bg-red-500/10 transition-colors tracking-wider"
            >
              ■ STOP WEBCAM
            </button>
            {alarmOn && (
              <button
                onClick={stopAlarm}
                className="px-6 py-2 rounded-xl border border-yellow-500/30 text-yellow-400 text-xs font-mono hover:bg-yellow-500/10 transition-colors tracking-wider"
              >
                🔇 MUTE ALARM
              </button>
            )}
          </div>
        </div>

        {!camActive && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">📷</div>
            <p className="text-muted mb-2 text-sm">Start webcam to see live YOLO bounding boxes</p>
            <p className="text-muted/50 text-xs mb-6 font-mono">
              Real boxes from backend · {status.mode === 'python' ? '🟢 Python/YOLO' : '🟡 Demo mode'}
            </p>
            {camError && (
              <div className="mb-5 mx-auto max-w-md px-4 py-3 rounded-lg bg-fire-red/10 border border-fire-red/30 text-fire-red text-xs font-mono text-left">
                {camError}
              </div>
            )}
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={startCamera}
              className="px-8 py-3 rounded-xl bg-gradient-to-r from-fire-red to-fire-orange text-white font-display font-bold tracking-widest text-sm uppercase"
            >
              ▶ START WEBCAM
            </motion.button>
          </div>
        )}
      </div>

      {/* Mode info */}
      <div className="card border-blue-500/20 bg-blue-500/5">
        <p className="text-xs text-muted leading-relaxed">
          <span className="text-blue-400 font-mono">ℹ HOW IT WORKS:</span>{' '}
          Detection auto-starts when the backend boots. Click{' '}
          <span className="text-fire-orange font-mono">▶ START WEBCAM</span> to see live video.
          Bounding boxes shown here are real YOLO outputs from the Python backend
          {status.mode === 'demo' ? ' (currently in DEMO mode — copy fire.pt to backend/fire.pt)' : ''}.
        </p>
      </div>

    </motion.div>
  )
}

function drawCorners(ctx, x, y, w, h, color) {
  const len = 18
  ctx.strokeStyle = color; ctx.lineWidth = 3
  ctx.shadowColor = color; ctx.shadowBlur = 8
  ;[
    [[x, y + len], [x, y], [x + len, y]],
    [[x + w - len, y], [x + w, y], [x + w, y + len]],
    [[x, y + h - len], [x, y + h], [x + len, y + h]],
    [[x + w - len, y + h], [x + w, y + h], [x + w, y + h - len]],
  ].forEach(pts => {
    ctx.beginPath()
    ctx.moveTo(...pts[0])
    ctx.lineTo(...pts[1])
    ctx.lineTo(...pts[2])
    ctx.stroke()
  })
  ctx.shadowBlur = 0
}

function drawCrosshairs(ctx, w, h) {
  const size = 12
  ctx.strokeStyle = 'rgba(255,107,0,0.20)'; ctx.lineWidth = 1
  ;[[0, 0], [w, 0], [0, h], [w, h]].forEach(([cx, cy]) => {
    const dx = cx === 0 ? size : -size
    const dy = cy === 0 ? size : -size
    ctx.beginPath(); ctx.moveTo(cx, cy + dy); ctx.lineTo(cx, cy); ctx.lineTo(cx + dx, cy); ctx.stroke()
  })
}
