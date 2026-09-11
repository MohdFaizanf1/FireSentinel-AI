// ─────────────────────────────────────────────────────────
//  API Routes — Detection, Logs, Images, Analytics
// ─────────────────────────────────────────────────────────
const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const router    = express.Router();
const { requireAuth } = require('./auth');
const detectionService = require('../services/detectionService');

// All API routes require authentication
router.use(requireAuth);

// ── GET /api/status ───────────────────────────────────────
router.get('/status', (req, res) => {
  res.json(detectionService.getStatus());
});

// ── GET /api/logs ─────────────────────────────────────────
router.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json({ logs: detectionService.getLogs(limit) });
});

// ── GET /api/images ───────────────────────────────────────
router.get('/images', (req, res) => {
  const detectionsDir = path.join(__dirname, '..', 'detections');
  if (!fs.existsSync(detectionsDir)) return res.json({ images: [] });

  const files = fs.readdirSync(detectionsDir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .map(f => ({
      filename:  f,
      url:       `/detections/${f}`,
      timestamp: fs.statSync(path.join(detectionsDir, f)).mtime.toISOString(),
    }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 50);

  res.json({ images: files });
});

// ── DELETE /api/images/:filename ──────────────────────────
router.delete('/images/:filename', (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(__dirname, '..', 'detections', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: `Deleted ${filename}` });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete: ${err.message}` });
  }
});

// ── DELETE /api/images ────────────────────────────────────
router.delete('/images', (req, res) => {
  const detectionsDir = path.join(__dirname, '..', 'detections');

  if (!fs.existsSync(detectionsDir)) {
    return res.json({ success: true, deleted: 0 });
  }

  try {
    const files = fs.readdirSync(detectionsDir)
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f));
    files.forEach(f => fs.unlinkSync(path.join(detectionsDir, f)));
    res.json({ success: true, deleted: files.length });
  } catch (err) {
    res.status(500).json({ error: `Failed to delete all: ${err.message}` });
  }
});

// ── POST /api/start-detection ─────────────────────────────
router.post('/start-detection', async (req, res) => {
  try {
    await detectionService.start();
    res.json({ success: true, message: 'Detection started' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/stop-detection ──────────────────────────────
router.post('/stop-detection', async (req, res) => {
  try {
    await detectionService.stop();
    res.json({ success: true, message: 'Detection stopped' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/analytics ────────────────────────────────────
router.get('/analytics', (req, res) => {
  res.json(detectionService.getAnalytics());
});

// ── GET /api/logs/export ──────────────────────────────────
router.get('/logs/export', (req, res) => {
  const logs   = detectionService.getLogs(10000);
  const header = 'timestamp,confidence,severity,fps\n';
  const rows   = logs.map(l =>
    `${l.timestamp},${l.confidence},${l.severity},${l.fps || ''}`
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="fireshield_logs.csv"');
  res.send(header + rows);
});

module.exports = router;