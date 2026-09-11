// ─────────────────────────────────────────────────────────
//  Overview Tab — live metrics, chart, recent logs, AI insights
// ─────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import { formatDistanceToNow } from 'date-fns'

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay },
})

export default function OverviewTab({ detection }) {
  const { status, logs, confidenceHistory } = detection

  const uptimeStr = formatUptime(status.uptime_seconds)
  const recentLogs = logs.slice(0, 8)

  return (
    <div className="space-y-5">

      {/* ── Metric cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          delay={0}
          label="Detections"
          value={status.total_detections}
          color="text-fire-red glow-red"
          sub={status.last_detection_time
            ? `Last: ${formatDistanceToNow(new Date(status.last_detection_time), { addSuffix: true })}`
            : 'No detections yet'}
        />
        <MetricCard
          delay={0.05}
          label="Confidence"
          value={`${status.confidence}%`}
          color={status.fire_detected ? 'text-fire-red glow-red' : 'text-fire-orange glow-orange'}
          sub={status.fire_detected ? '🔥 FIRE ACTIVE' : 'Monitoring...'}
        />
        <MetricCard
          delay={0.1}
          label="FPS"
          value={status.fps || '—'}
          color="text-green-400 glow-green"
          sub={status.is_running ? 'Camera active' : 'Detection off'}
        />
        <MetricCard
          delay={0.15}
          label="Uptime"
          value={uptimeStr}
          color="text-blue-400"
          sub={status.is_running ? 'System running' : 'Idle'}
        />
      </div>

      {/* ── Confidence chart + AI Insights ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Chart */}
        <motion.div {...fadeUp(0.2)} className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-xs tracking-[3px] uppercase text-muted">
              Confidence History
            </h3>
            <span className="font-mono text-xs text-fire-orange">
              Last {confidenceHistory.length} frames
            </span>
          </div>
          {confidenceHistory.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={confidenceHistory}>
                <defs>
                  <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#FF2D00" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#FF2D00" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,107,0,0.06)" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#7A8A99', fontSize: 10, fontFamily: 'Share Tech Mono' }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#7A8A99', fontSize: 10, fontFamily: 'Share Tech Mono' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ background: '#0D1117', border: '1px solid rgba(255,107,0,0.3)', borderRadius: 8, fontFamily: 'Share Tech Mono', fontSize: 12 }}
                  labelStyle={{ color: '#7A8A99' }}
                  itemStyle={{ color: '#FF6B00' }}
                />
                <Area
                  type="monotone"
                  dataKey="confidence"
                  stroke="#FF2D00"
                  strokeWidth={2}
                  fill="url(#confGrad)"
                  name="Confidence %"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted font-mono text-sm">
              Waiting for data...
            </div>
          )}
        </motion.div>

        {/* AI Insights */}
        <motion.div {...fadeUp(0.25)} className="card space-y-3">
          <h3 className="font-display font-semibold text-xs tracking-[3px] uppercase text-muted mb-4">
            🧠 AI Insights
          </h3>
          <AIInsight detection={detection} />
        </motion.div>
      </div>

      {/* ── Recent Events ─────────────────────────────── */}
      <motion.div {...fadeUp(0.3)} className="card">
        <h3 className="font-display font-semibold text-xs tracking-[3px] uppercase text-muted mb-4">
          Recent Events
        </h3>
        {recentLogs.length === 0 ? (
          <p className="text-muted font-mono text-sm py-4 text-center">No events yet. Start detection to begin.</p>
        ) : (
          <div className="space-y-2">
            {recentLogs.map(log => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </motion.div>

    </div>
  )
}

function MetricCard({ label, value, color, sub, delay }) {
  return (
    <motion.div {...fadeUp(delay)} className="card text-center">
      <div className={`font-display text-3xl font-bold ${color} mb-1`}>
        {value}
      </div>
      <div className="font-mono text-xs text-muted tracking-widest uppercase mb-1">{label}</div>
      <div className="text-xs text-muted/70">{sub}</div>
    </motion.div>
  )
}

function LogRow({ log }) {
  const colors = { HIGH: 'text-fire-red bg-fire-red/10 border-fire-red/30', MED: 'text-fire-orange bg-fire-orange/10 border-fire-orange/30', LOW: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' }
  const c = colors[log.severity] || colors.LOW
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/2 text-sm"
    >
      <span className={`font-mono text-xs px-2 py-0.5 rounded border ${c} min-w-[44px] text-center`}>{log.severity}</span>
      <span className="flex-1 text-white/80">{log.confidence}% confidence</span>
      <span className="font-mono text-xs text-muted">{new Date(log.timestamp).toLocaleTimeString()}</span>
    </motion.div>
  )
}

function AIInsight({ detection }) {
  const { status, confidenceHistory, logs } = detection
  const insights = []

  if (!status.is_running) {
    insights.push({ icon: '⏸', text: 'Detection is paused. Start detection to begin monitoring.', color: 'text-muted' })
  } else if (status.fire_detected) {
    insights.push({ icon: '🔥', text: `High confidence fire signal: ${status.confidence}%. Immediate action required.`, color: 'text-fire-red' })
  } else {
    insights.push({ icon: '✅', text: 'No fire detected. Environment appears safe.', color: 'text-green-400' })
  }

  // Trend analysis
  if (confidenceHistory.length >= 5) {
    const recent = confidenceHistory.slice(-5).map(h => h.confidence)
    const avg    = recent.reduce((a, b) => a + b, 0) / recent.length
    const trend  = recent[recent.length - 1] - recent[0]
    if (trend > 10) insights.push({ icon: '📈', text: `Confidence rising (+${trend.toFixed(0)}% in last 5 frames). Monitor closely.`, color: 'text-fire-orange' })
    else if (trend < -10) insights.push({ icon: '📉', text: 'Confidence declining. Situation improving.', color: 'text-green-400' })
    if (avg > 50) insights.push({ icon: '⚠️', text: `Average confidence elevated at ${avg.toFixed(0)}%. Possible smoke present.`, color: 'text-yellow-400' })
  }

  // High frequency
  if (logs.length >= 10) {
    const recent10 = logs.slice(0, 10)
    const highCount = recent10.filter(l => l.severity === 'HIGH').length
    if (highCount >= 5) insights.push({ icon: '🚨', text: `${highCount}/10 recent events are HIGH severity. Consider evacuation protocol.`, color: 'text-fire-red' })
  }

  return (
    <div className="space-y-3">
      {insights.map((ins, i) => (
        <div key={i} className="flex gap-3 text-sm leading-relaxed">
          <span className="text-lg flex-shrink-0">{ins.icon}</span>
          <span className={ins.color}>{ins.text}</span>
        </div>
      ))}
    </div>
  )
}

function formatUptime(seconds) {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
