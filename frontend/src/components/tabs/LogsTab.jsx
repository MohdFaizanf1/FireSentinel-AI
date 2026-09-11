// ─────────────────────────────────────────────────────────
//  Logs Tab — detection event table with CSV export
// ─────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Search } from 'lucide-react'

const SEV_COLORS = {
  HIGH: 'text-fire-red   bg-fire-red/10   border-fire-red/40',
  MED:  'text-fire-orange bg-fire-orange/10 border-fire-orange/40',
  LOW:  'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
}

export default function LogsTab({ detection }) {
  const { logs, exportCSV } = detection
  const [search,  setSearch]  = useState('')
  const [sevFilter, setSev]   = useState('ALL')

  const filtered = logs
    .filter(l => sevFilter === 'ALL' || l.severity === sevFilter)
    .filter(l => !search || l.confidence.toString().includes(search) || l.severity.includes(search.toUpperCase()))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          {['ALL', 'HIGH', 'MED', 'LOW'].map(s => (
            <button
              key={s}
              onClick={() => setSev(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono tracking-wider border transition-colors ${
                sevFilter === s
                  ? 'bg-fire-orange/20 border-fire-orange/50 text-fire-orange'
                  : 'border-white/10 text-muted hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 pr-3 py-2 bg-dark-700 border border-white/10 rounded-lg text-sm text-white placeholder-muted focus:outline-none focus:border-fire-orange/50 font-mono w-44"
            />
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fire-orange/10 border border-fire-orange/30 text-fire-orange text-xs font-mono hover:bg-fire-orange/20 transition-colors"
          >
            <Download size={14} />
            EXPORT CSV
          </button>
        </div>
      </div>

      {/* Count */}
      <p className="font-mono text-xs text-muted">
        Showing {filtered.length} of {logs.length} events
      </p>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['#', 'Timestamp', 'Severity', 'Confidence', 'FPS'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-display text-xs tracking-[2px] uppercase text-muted font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-muted font-mono text-sm">
                    No events found
                  </td>
                </tr>
              ) : (
                filtered.map((log, i) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.01 }}
                    className="border-b border-white/3 hover:bg-white/2 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs text-white/70">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-mono text-xs px-2 py-0.5 rounded border ${SEV_COLORS[log.severity] || SEV_COLORS.LOW}`}>
                        {log.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-sm font-bold ${
                          log.severity === 'HIGH' ? 'text-fire-red' :
                          log.severity === 'MED'  ? 'text-fire-orange' : 'text-yellow-400'
                        }`}>
                          {log.confidence}%
                        </span>
                        <div className="flex-1 h-1.5 bg-dark-700 rounded-full max-w-[80px]">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-fire-red to-fire-orange"
                            style={{ width: `${log.confidence}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {log.fps || '—'}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
