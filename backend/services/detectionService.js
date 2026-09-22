// ─────────────────────────────────────────────────────────
// FireSentinel AI — detectionService.js  (PRODUCTION FIXED)
//
//  FIXES vs previous version:
//  1. total_detections counts fire *events* not frames
//     (was incrementing every frame while fire was active)
//  2. Analytics hourly avg_conf fixed — proper running average
//     (was doing (prev + new) / 2 which collapses to latest value)
//  3. Removed silent demo fallback on Python error —
//     now logs real error and emits error status to frontend
//     (was hiding Python crashes behind fake demo data)
//  4. Gallery images cached — reads disk once, invalidated on new screenshot
//     (was reading disk on every API call)
//  5. Demo mode throttled — emits on state change only, not every 500ms
// ─────────────────────────────────────────────────────────
const { spawn }      = require('child_process');
const path           = require('path');
const fs             = require('fs');
const { v4: uuidv4 } = require('uuid');

let io           = null;
let pyProcess    = null;
let demoInterval = null;
let isRunning    = false;
let startTime    = null;
let logs         = [];

// FIX 4: Gallery cache
let galleryCache          = null;
let galleryCacheInvalidated = true;

let state = {
  fire_detected:       false,
  confidence:          0,
  total_detections:    0,   // FIX 1: counts events only
  last_detection_time: null,
  fps:                 0,
  uptime_seconds:      0,
  is_running:          false,
  mode:                'idle',
  boxes:               [],
  error:               null,   // surface Python errors to frontend
};

// FIX 2: Analytics accumulator — proper running totals
const hourlyAccumulator = Array.from({ length: 24 }, () => ({
  detections: 0,
  conf_sum:   0,
}));

function setIO(socketIO) {
  io = socketIO;
}

// ── Find model ───────────────────────────────────────────
function findModel() {
  const base = path.join(__dirname, '..');
  const candidates = [
    process.env.MODEL_PATH ? path.join(base, process.env.MODEL_PATH) : null,
    path.join(base, 'fire.pt'),
    path.join(base, 'models', 'fire.pt'),
    path.join(base, 'yolov8n (1).pt'),
    path.join(base, 'yolov8n_1.pt'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      console.log(`[Detection] Found model: ${p}`);
      return p;
    }
  }
  return null;
}

async function start() {
  if (isRunning) return;
  isRunning        = true;
  startTime        = Date.now();
  state.is_running = true;
  state.error      = null;

  const pythonPath = process.env.PYTHON_PATH || 'python3';
  const scriptPath = path.join(__dirname, '..', 'fire_ws.py');
  const modelPath  = findModel();

  if (!modelPath) {
    console.warn('[Detection] No model found — DEMO mode');
    startDemoMode();
    broadcastStatus();
    return;
  }

  console.log(`[Detection] Spawning: ${pythonPath} ${scriptPath} --model ${modelPath}`);
  state.mode = 'python';

  pyProcess = spawn(pythonPath, [scriptPath, '--model', modelPath], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env },
  });

  // FIX 3: No silent fallback — wait 20s for first output, then report real error
  let receivedOutput = false;
  const fallbackTimer = setTimeout(() => {
    if (isRunning && !receivedOutput) {
      const msg = 'No output from Python after 20s. Check python3 path and model file.';
      console.error(`[Detection] ${msg}`);
      state.error = msg;
      state.mode  = 'error';
      io?.emit('detector_error', { message: msg });
      broadcastStatus();
      // Still start demo so frontend isn't blank, but show error clearly
      startDemoMode();
    }
  }, 20000);

  let buffer = '';
  pyProcess.stdout.on('data', (data) => {
    if (!receivedOutput) {
      receivedOutput = true;
      clearTimeout(fallbackTimer);
    }
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.filter(Boolean).forEach(line => {
      try { handlePythonEvent(JSON.parse(line)); }
      catch { console.log(`[Python raw] ${line}`); }
    });
  });

  pyProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    // Only surface real errors — suppress YOLOv8 routine logs
    const isError = msg.toLowerCase().includes('error') ||
                    msg.toLowerCase().includes('traceback') ||
                    msg.toLowerCase().includes('exception');
    if (isError) {
      console.error(`[Python ERR] ${msg}`);
      // FIX 3: Surface to frontend
      io?.emit('detector_error', { message: msg.slice(0, 300) });
    }
  });

  pyProcess.on('close', (code) => {
    clearTimeout(fallbackTimer);
    console.log(`[Detection] Python exited with code ${code}`);
    if (isRunning) {
      // FIX 3: Report exit to frontend before any fallback
      const msg = `Python process exited (code ${code}). Check logs.`;
      state.error = msg;
      io?.emit('detector_error', { message: msg });
      broadcastStatus();
      // Restart after delay instead of silent demo
      setTimeout(() => {
        if (isRunning) {
          console.log('[Detection] Restarting Python process...');
          state.error = null;
          _spawnPython(pythonPath, scriptPath, modelPath);
        }
      }, 5000);
    }
  });

  pyProcess.on('error', (err) => {
    clearTimeout(fallbackTimer);
    const msg = `Cannot spawn Python: ${err.message}. Is python3 installed?`;
    console.error(`[Detection] ${msg}`);
    state.error = msg;
    state.mode  = 'error';
    io?.emit('detector_error', { message: msg });
    broadcastStatus();
    startDemoMode(); // only fallback when Python isn't available at all
  });

  broadcastStatus();
}

// Extracted so restart can reuse it
function _spawnPython(pythonPath, scriptPath, modelPath) {
  if (pyProcess) { pyProcess.kill(); pyProcess = null; }
  // Re-call start() to re-run all the setup cleanly
  isRunning = false;
  start();
}

function handlePythonEvent(event) {
  if (event.type === 'screenshot') {
    // FIX 4: Invalidate gallery cache on new screenshot
    galleryCacheInvalidated = true;
    const imageData = {
      filename:   event.filename,
      url:        `/detections/${event.filename}`,
      timestamp:  event.timestamp || new Date().toISOString(),
      confidence: event.confidence,
    };
    io?.emit('new_image', imageData);
    return;
  }

  if (event.type === 'alarm') {
    io?.emit('alarm', { state: event.state });
    return;
  }

  if (event.type === 'error') {
    console.error('[Python]', event.message);
    state.error = event.message;
    io?.emit('detector_error', { message: event.message });
    broadcastStatus();
    return;
  }

  if (event.type !== 'frame') return;

  const wasDetected    = state.fire_detected;
  state.fire_detected  = event.fire_detected;
  state.confidence     = parseFloat((event.confidence || 0).toFixed(1));
  state.fps            = parseFloat((event.fps        || 0).toFixed(1));
  state.boxes          = event.boxes || [];
  state.uptime_seconds = Math.floor((Date.now() - startTime) / 1000);
  state.error          = null;

  // FIX 1: Only count on the RISING edge — first frame of a new fire event
  if (event.fire_detected && !wasDetected) {
    state.total_detections++;
    state.last_detection_time = new Date().toISOString();

    const entry = addLog({
      confidence: state.confidence,
      severity:   getSeverity(state.confidence),
      fps:        state.fps,
    });

    io?.emit('fire_detected', {
      confidence: state.confidence,
      log:        entry,
      boxes:      state.boxes,
    });
  }

  broadcastStatus();
}

// ── Demo mode — FIX 5: throttled, state-change driven ────
function startDemoMode() {
  if (demoInterval) return;
  if (!state.mode || state.mode === 'idle') state.mode = 'demo';
  state.is_running = true;
  if (!startTime) startTime = Date.now();
  console.log('[Detection] DEMO mode active — replace fire.pt for real detection');

  let tick = 0;
  let lastDemoState = null;

  demoInterval = setInterval(() => {
    tick++;
    const inBurst  = (tick % 40) > 32;
    const detected = inBurst && Math.random() > 0.4;
    const conf     = detected ? parseFloat((76 + Math.random() * 20).toFixed(1)) : 0;
    const wasDetected = state.fire_detected;

    state.fire_detected   = detected;
    state.confidence      = conf;
    state.fps             = parseFloat((12 + Math.random() * 6).toFixed(1));
    state.uptime_seconds  = Math.floor((Date.now() - startTime) / 1000);
    state.boxes           = detected
      ? [{ x1: 180, y1: 120, x2: 460, y2: 360, confidence: conf, class: 'fire' }]
      : [];

    // FIX 1 + FIX 5: rising edge only, emit on change only
    if (detected && !wasDetected) {
      state.total_detections++;
      state.last_detection_time = new Date().toISOString();
      const entry = addLog({ confidence: conf, severity: getSeverity(conf), fps: state.fps });
      io?.emit('fire_detected', { confidence: conf, log: entry, boxes: state.boxes });
    }

    // FIX 5: only broadcast when something meaningful changed
    const sig = `${detected}|${Math.round(conf)}`;
    if (sig !== lastDemoState) {
      lastDemoState = sig;
      broadcastStatus();
    }
  }, 500);
}

async function stop() {
  isRunning           = false;
  state.is_running    = false;
  state.fire_detected = false;
  state.fps           = 0;
  state.mode          = 'idle';
  state.boxes         = [];
  state.error         = null;
  if (pyProcess)    { pyProcess.kill('SIGTERM'); pyProcess = null; }
  if (demoInterval) { clearInterval(demoInterval); demoInterval = null; }
  broadcastStatus();
}

function broadcastStatus() {
  io?.emit('status', getStatus());
}

function addLog({ confidence, severity, fps }) {
  const entry = {
    id:         uuidv4(),
    timestamp:  new Date().toISOString(),
    confidence: parseFloat((confidence || 0).toFixed(1)),
    severity,
    fps:        parseFloat((fps || 0).toFixed(1)),
  };

  // FIX 2: Update hourly accumulator with proper running totals
  const h = new Date(entry.timestamp).getHours();
  hourlyAccumulator[h].detections++;
  hourlyAccumulator[h].conf_sum += entry.confidence;

  logs.unshift(entry);
  if (logs.length > 500) logs = logs.slice(0, 500);
  io?.emit('log', entry);
  return entry;
}

function getSeverity(c) {
  return c >= 85 ? 'HIGH' : c >= 70 ? 'MED' : 'LOW';
}

function getStatus() {
  return { ...state, log_count: logs.length };
}

function getLogs(n = 100) {
  return logs.slice(0, n);
}

// FIX 2: Correct analytics — proper average from accumulator
function getAnalytics() {
  const hourly = hourlyAccumulator.map((acc, i) => ({
    hour:       i,
    detections: acc.detections,
    avg_conf:   acc.detections > 0
      ? parseFloat((acc.conf_sum / acc.detections).toFixed(1))
      : 0,
  }));

  const sev = { HIGH: 0, MED: 0, LOW: 0 };
  logs.forEach(l => {
    if (sev[l.severity] !== undefined) sev[l.severity]++;
  });

  return {
    hourly,
    severity_distribution: sev,
    total_detections:      state.total_detections,
    uptime_seconds:        state.uptime_seconds,
    mode:                  state.mode,
    error:                 state.error,
  };
}

// FIX 4: Cached gallery — only reads disk when invalidated
function getGalleryImages() {
  const detectionsDir = path.join(__dirname, '..', 'detections');

  if (!galleryCacheInvalidated && galleryCache) {
    return galleryCache;
  }

  if (!fs.existsSync(detectionsDir)) {
    galleryCache          = [];
    galleryCacheInvalidated = false;
    return galleryCache;
  }

  galleryCache = fs.readdirSync(detectionsDir)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .map(f => {
      const fullPath = path.join(detectionsDir, f);
      return {
        filename:   f,
        url:        `/detections/${f}`,
        timestamp:  fs.statSync(fullPath).mtime.toISOString(),
        // Parse confidence from filename: fire_20260419_190510_89.jpg → 89
        confidence: parseInt(f.split('_').pop()) || null,
      };
    })
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 100);

  galleryCacheInvalidated = false;
  return galleryCache;
}

module.exports = {
  setIO, start, stop,
  getStatus, getLogs, getAnalytics, getGalleryImages,
};