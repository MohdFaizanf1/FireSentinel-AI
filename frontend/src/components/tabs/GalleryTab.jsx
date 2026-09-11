// ─────────────────────────────────────────────────────────
//  GalleryTab — FIXED
//
//  FIXES:
//  1. Images now come from detection.images (socket-driven)
//     — auto-updates when new screenshots are saved
//  2. Uses detection.deleteImage / deleteAllImages helpers
//  3. Manual refresh still available
// ─────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RefreshCw, Trash2, Trash } from 'lucide-react'

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

export default function GalleryTab({ detection }) {
  const { images, loadImages, deleteImage, deleteAllImages } = detection

  const [loading,    setLoading]    = useState(false)
  const [selected,   setSelected]   = useState(null)
  const [deleting,   setDeleting]   = useState(null)
  const [confirmAll, setConfirmAll] = useState(false)

  async function handleDelete(filename, e) {
    e?.stopPropagation()
    setDeleting(filename)
    try {
      await deleteImage(filename)
      if (selected?.filename === filename) setSelected(null)
    } catch {
      alert('Failed to delete image')
    } finally {
      setDeleting(null)
    }
  }

  async function handleDeleteAll() {
    setConfirmAll(false)
    setLoading(true)
    try {
      await deleteAllImages()
      setSelected(null)
    } catch {
      alert('Failed to delete all images')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefresh() {
    setLoading(true)
    await loadImages()
    setLoading(false)
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xs tracking-[3px] uppercase text-muted">
          Detection Screenshots — {images.length} files
          <span className="ml-2 text-green-400/70">(live)</span>
        </h2>
        <div className="flex items-center gap-2">
          {images.length > 0 && (
            confirmAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400 font-mono">Delete all?</span>
                <button
                  onClick={handleDeleteAll}
                  className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-mono hover:bg-red-500/30 transition-colors"
                >
                  YES
                </button>
                <button
                  onClick={() => setConfirmAll(false)}
                  className="px-3 py-1.5 rounded-lg border border-white/10 text-muted text-xs font-mono hover:text-white transition-colors"
                >
                  NO
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmAll(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 text-red-400/70 text-xs font-mono hover:text-red-400 hover:border-red-500/40 transition-colors"
              >
                <Trash size={12} />
                DELETE ALL
              </button>
            )
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-muted text-xs font-mono hover:text-white hover:border-fire-orange/30 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            REFRESH
          </button>
        </div>
      </div>

      {/* Grid */}
      {images.length === 0 ? (
        <div className="card text-center py-20">
          <div className="text-4xl mb-4">🖼️</div>
          <p className="text-muted text-sm">No screenshots yet.</p>
          <p className="text-muted/60 text-xs mt-2">
            Screenshots are saved automatically when fire is detected by the Python model.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <AnimatePresence>
            {images.map((img, i) => (
              <motion.div
                key={img.filename}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
                onClick={() => setSelected(img)}
                className="cursor-pointer group relative rounded-xl overflow-hidden border border-fire-red/20 hover:border-fire-red/60 transition-all duration-200 aspect-video bg-dark-700"
              >
                <img
                  src={`${BACKEND}${img.url}`}
                  alt={img.filename}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={e => { e.target.style.opacity = '0.3' }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="font-mono text-xs text-white truncate">{img.filename}</p>
                </div>
                <div className="absolute top-2 left-2">
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-fire-red/80 text-white border border-fire-red/60">
                    🔥
                  </span>
                </div>
                <button
                  onClick={(e) => handleDelete(img.filename, e)}
                  disabled={deleting === img.filename}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 border border-red-500/30 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/30 transition-all"
                >
                  {deleting === img.filename
                    ? <span className="text-xs font-mono">...</span>
                    : <Trash2 size={12} />}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelected(null)}
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.85 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.85 }}
              onClick={e => e.stopPropagation()}
              className="relative max-w-4xl w-full"
            >
              <button
                onClick={() => setSelected(null)}
                className="absolute -top-10 right-0 text-white/60 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
              <img
                src={`${BACKEND}${selected.url}`}
                alt={selected.filename}
                className="w-full rounded-xl border border-fire-red/30"
              />
              <div className="mt-3 flex items-center justify-between">
                <p className="font-mono text-xs text-muted">{selected.filename}</p>
                <div className="flex items-center gap-4">
                  <p className="font-mono text-xs text-muted">
                    {new Date(selected.timestamp).toLocaleString()}
                  </p>
                  <button
                    onClick={() => handleDelete(selected.filename)}
                    disabled={deleting === selected.filename}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-mono hover:bg-red-500/30 transition-colors"
                  >
                    <Trash2 size={12} />
                    {deleting === selected.filename ? 'Deleting...' : 'DELETE'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  )
}
