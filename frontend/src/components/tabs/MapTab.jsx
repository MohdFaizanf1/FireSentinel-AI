// ─────────────────────────────────────────────────────────
//  Map Tab — mock GPS heatmap of detection locations
// ─────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

// Mock locations for demo — replace with real GPS data
const MOCK_LOCATIONS = [
  { id: 1, name: 'Industrial Zone B',     lat: 28.63, lng: 77.21, severity: 'HIGH', count: 5  },
  { id: 2, name: 'Forest Sector 12-N',    lat: 28.65, lng: 77.19, severity: 'MED',  count: 3  },
  { id: 3, name: 'Warehouse District C',  lat: 28.61, lng: 77.23, severity: 'HIGH', count: 8  },
  { id: 4, name: 'Residential Block 7',   lat: 28.67, lng: 77.22, severity: 'LOW',  count: 1  },
  { id: 5, name: 'Chemical Plant Unit 3', lat: 28.62, lng: 77.18, severity: 'HIGH', count: 12 },
  { id: 6, name: 'Server Farm Node 2',    lat: 28.64, lng: 77.25, severity: 'MED',  count: 2  },
]

const SEV_COLOR = { HIGH: '#FF2D00', MED: '#FF6B00', LOW: '#FFD700' }

export default function MapTab({ detection }) {
  const { logs } = detection
  const [selected, setSelected] = useState(null)

  // Merge real log counts into locations
  const locations = MOCK_LOCATIONS.map(loc => ({
    ...loc,
    // Add random variation to make it feel live
    count: loc.count + Math.floor(logs.filter(l => l.severity === loc.severity).length / 3),
  }))

  const maxCount = Math.max(...locations.map(l => l.count))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* SVG Map */}
        <div className="lg:col-span-2 card">
          <h3 className="font-display text-xs tracking-[3px] uppercase text-muted mb-4">
            🌍 Detection Heatmap — Delhi NCR Region (Mock)
          </h3>
          <div className="relative bg-dark-700 rounded-xl overflow-hidden" style={{ paddingBottom: '60%' }}>
            <svg
              viewBox="0 0 500 300"
              className="absolute inset-0 w-full h-full"
              style={{ background: 'linear-gradient(135deg, #080B10 0%, #111820 100%)' }}
            >
              {/* Grid lines */}
              {Array.from({ length: 10 }, (_, i) => (
                <line key={`h${i}`} x1="0" y1={i * 30} x2="500" y2={i * 30} stroke="rgba(255,107,0,0.05)" strokeWidth="1" />
              ))}
              {Array.from({ length: 17 }, (_, i) => (
                <line key={`v${i}`} x1={i * 30} y1="0" x2={i * 30} y2="300" stroke="rgba(255,107,0,0.05)" strokeWidth="1" />
              ))}

              {/* Location dots */}
              {locations.map(loc => {
                // Map lat/lng to SVG coordinates
                const x = ((loc.lng - 77.17) / 0.1) * 150 + 50
                const y = ((28.68 - loc.lat) / 0.1) * 120 + 40
                const r = 8 + (loc.count / maxCount) * 20
                const color = SEV_COLOR[loc.severity]

                return (
                  <g key={loc.id} onClick={() => setSelected(loc)} className="cursor-pointer">
                    {/* Pulse ring */}
                    <circle cx={x} cy={y} r={r + 8} fill="none" stroke={color} strokeWidth="1" opacity="0.3">
                      <animate attributeName="r" values={`${r + 4};${r + 16};${r + 4}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
                    </circle>
                    {/* Main dot */}
                    <circle cx={x} cy={y} r={r} fill={color} opacity="0.8" />
                    <circle cx={x} cy={y} r={r * 0.4} fill="white" opacity="0.9" />
                    {/* Count label */}
                    <text x={x} y={y + r + 14} textAnchor="middle" fill={color}
                      fontSize="9" fontFamily="Share Tech Mono">{loc.count}</text>
                  </g>
                )
              })}

              {/* Legend */}
              {Object.entries(SEV_COLOR).map(([sev, color], i) => (
                <g key={sev} transform={`translate(${10 + i * 70}, 280)`}>
                  <circle cx="5" cy="5" r="5" fill={color} />
                  <text x="14" y="9" fill="#7A8A99" fontSize="9" fontFamily="Share Tech Mono">{sev}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Location list */}
        <div className="card overflow-hidden p-0">
          <div className="p-4 border-b border-white/5">
            <h3 className="font-display text-xs tracking-[3px] uppercase text-muted">Hot Zones</h3>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '380px' }}>
            {[...locations].sort((a, b) => b.count - a.count).map(loc => (
              <button
                key={loc.id}
                onClick={() => setSelected(loc)}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-white/3 hover:bg-white/3 transition-colors text-left ${selected?.id === loc.id ? 'bg-fire-orange/5' : ''}`}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: SEV_COLOR[loc.severity], boxShadow: `0 0 8px ${SEV_COLOR[loc.severity]}` }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{loc.name}</div>
                  <div className="font-mono text-xs text-muted">{loc.count} events</div>
                </div>
                <span className="font-mono text-xs px-1.5 py-0.5 rounded border"
                  style={{ color: SEV_COLOR[loc.severity], borderColor: SEV_COLOR[loc.severity] + '60' }}>
                  {loc.severity}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selected location details */}
      {selected && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card border-fire-orange/30"
        >
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-display font-bold text-white text-lg">{selected.name}</h4>
              <div className="flex gap-4 mt-2 text-sm text-muted font-mono">
                <span>LAT: {selected.lat.toFixed(4)}</span>
                <span>LNG: {selected.lng.toFixed(4)}</span>
                <span>EVENTS: {selected.count}</span>
              </div>
            </div>
            <span className="font-mono text-sm px-3 py-1 rounded border"
              style={{ color: SEV_COLOR[selected.severity], borderColor: SEV_COLOR[selected.severity] + '60', background: SEV_COLOR[selected.severity] + '15' }}>
              {selected.severity} RISK
            </span>
          </div>
        </motion.div>
      )}

      <div className="card border-blue-500/20 bg-blue-500/5">
        <p className="text-xs text-muted">
          <span className="text-blue-400 font-mono">ℹ NOTE:</span> Map shows mock GPS coordinates.
          To use real locations, add GPS metadata to your detection events in <code className="text-fire-orange">fire_ws.py</code>.
        </p>
      </div>

    </motion.div>
  )
}
