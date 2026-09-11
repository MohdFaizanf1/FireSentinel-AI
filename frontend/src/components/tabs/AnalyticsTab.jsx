// ─────────────────────────────────────────────────────────
//  Analytics Tab — hourly bar chart, severity pie, daily stats
// ─────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line
} from 'recharts'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export default function AnalyticsTab({ detection }) {
  const { api, logs } = detection
  const [analytics, setAnalytics] = useState(null)

  useEffect(() => {
    api({ method: 'GET', url: '/api/analytics' })
      .then(r => setAnalytics(r.data))
      .catch(() => {})
  }, [logs.length])  // refresh when new logs come in

  const severityData = analytics ? [
    { name: 'HIGH', value: analytics.severity_distribution?.HIGH || 0, color: '#FF2D00' },
    { name: 'MED',  value: analytics.severity_distribution?.MED  || 0, color: '#FF6B00' },
    { name: 'LOW',  value: analytics.severity_distribution?.LOW  || 0, color: '#FFD700' },
  ] : []

  const hourlyData = analytics?.hourly?.filter(h => h.detections > 0) || []

  // Build confidence trend from logs (last 30 entries reversed for chronological)
  const trendData = [...logs].reverse().slice(-30).map((l, i) => ({
    i,
    confidence: l.confidence,
    time: new Date(l.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  }))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Events',  value: logs.length,            color: 'text-fire-orange' },
          { label: 'HIGH Severity', value: analytics?.severity_distribution?.HIGH || 0, color: 'text-fire-red' },
          { label: 'MED Severity',  value: analytics?.severity_distribution?.MED  || 0, color: 'text-fire-orange' },
          { label: 'LOW Severity',  value: analytics?.severity_distribution?.LOW  || 0, color: 'text-yellow-400' },
        ].map(m => (
          <div key={m.label} className="card text-center">
            <div className={`font-display text-3xl font-bold ${m.color}`}>{m.value}</div>
            <div className="font-mono text-xs text-muted uppercase tracking-widest mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Hourly bar chart */}
        <div className="card">
          <h3 className="font-display text-xs tracking-[3px] uppercase text-muted mb-4">Detections by Hour</h3>
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyData}>
                <CartesianGrid stroke="rgba(255,107,0,0.06)" />
                <XAxis dataKey="hour" tick={{ fill: '#7A8A99', fontSize: 10, fontFamily: 'Share Tech Mono' }} tickLine={false} tickFormatter={h => `${h}:00`} />
                <YAxis tick={{ fill: '#7A8A99', fontSize: 10, fontFamily: 'Share Tech Mono' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0D1117', border: '1px solid rgba(255,107,0,0.3)', borderRadius: 8, fontFamily: 'Share Tech Mono', fontSize: 12 }}
                  itemStyle={{ color: '#FF6B00' }}
                />
                <Bar dataKey="detections" fill="#FF6B00" radius={[4, 4, 0, 0]} name="Detections" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted font-mono text-sm">
              {logs.length === 0 ? 'No detection data yet' : 'No hourly data available'}
            </div>
          )}
        </div>

        {/* Severity pie chart */}
        <div className="card">
          <h3 className="font-display text-xs tracking-[3px] uppercase text-muted mb-4">Severity Distribution</h3>
          {severityData.some(s => s.value > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={severityData}
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {severityData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Legend
                  formatter={val => <span style={{ color: '#7A8A99', fontFamily: 'Share Tech Mono', fontSize: 11 }}>{val}</span>}
                />
                <Tooltip
                  contentStyle={{ background: '#0D1117', border: '1px solid rgba(255,107,0,0.3)', borderRadius: 8, fontFamily: 'Share Tech Mono', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted font-mono text-sm">No data yet</div>
          )}
        </div>
      </div>

      {/* Confidence trend line */}
      <div className="card">
        <h3 className="font-display text-xs tracking-[3px] uppercase text-muted mb-4">
          Confidence Trend — Last 30 Events
        </h3>
        {trendData.length > 1 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trendData}>
              <CartesianGrid stroke="rgba(255,107,0,0.06)" />
              <XAxis dataKey="time" tick={{ fill: '#7A8A99', fontSize: 10, fontFamily: 'Share Tech Mono' }} tickLine={false} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fill: '#7A8A99', fontSize: 10, fontFamily: 'Share Tech Mono' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#0D1117', border: '1px solid rgba(255,107,0,0.3)', borderRadius: 8, fontFamily: 'Share Tech Mono', fontSize: 12 }}
                itemStyle={{ color: '#FF6B00' }}
              />
              <Line type="monotone" dataKey="confidence" stroke="#FF6B00" strokeWidth={2} dot={false} name="Confidence %" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-muted font-mono text-sm">
            Need at least 2 events to show trend
          </div>
        )}
      </div>

    </motion.div>
  )
}
