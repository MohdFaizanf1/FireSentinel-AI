// ─────────────────────────────────────────────────────────
//  FireShield AI — server.js  (PRODUCTION FIXED)
//
//  FIXES vs previous version:
//  1. SESSION_SECRET — crashes on startup if missing from .env
//     (was silently using hardcoded 'fireshield_secret' — security risk)
//  2. Rate limiting added on all /api routes
//  3. Socket 'connection' handler now sends boxes + gallery count
//     as the comment promised but the code didn't do
//  4. Graceful shutdown — stops detection before process exits
// ─────────────────────────────────────────────────────────
require('dotenv').config();

// FIX 1: Crash fast if critical env vars are missing in production
if (process.env.NODE_ENV === 'production') {
  const required = ['SESSION_SECRET', 'FRONTEND_URL'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`[Server] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const express       = require('express');
const http          = require('http');
const cors          = require('cors');
const cookieParser  = require('cookie-parser');
const session       = require('express-session');
const passport      = require('passport');
const morgan        = require('morgan');
const path          = require('path');
const fs            = require('fs');
const { Server }    = require('socket.io');
// FIX 2: Rate limiting
const rateLimit     = require('express-rate-limit');

const authRoutes       = require('./routes/auth');
const apiRoutes        = require('./routes/api');
const detectionService = require('./services/detectionService');

require('./config/passport');

const app    = express();
const server = http.createServer(app);

// ── Socket.io ────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
    methods:     ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);
detectionService.setIO(io);

// ── Middleware ───────────────────────────────────────────
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(session({
  // FIX 1: Falls back to a random secret in dev, crashes in prod if missing
  secret:            process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'),
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   7 * 24 * 60 * 60 * 1000,
  },
}));

app.use(passport.initialize());
app.use(passport.session());

// FIX 2: Rate limiting — 100 requests per minute per IP on API routes
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      100,
  message:  { error: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Static files ─────────────────────────────────────────
const alarmFile = path.join(__dirname, 'alarm.mp3');
if (fs.existsSync(alarmFile)) {
  app.get('/alarm.mp3', (req, res) => res.sendFile(alarmFile));
  console.log('[Server] alarm.mp3 served at /alarm.mp3');
} else {
  console.warn('[Server] alarm.mp3 NOT found — frontend alarm will be silent');
}

const detectionsDir = path.join(__dirname, 'detections');
if (!fs.existsSync(detectionsDir)) fs.mkdirSync(detectionsDir, { recursive: true });
app.use('/detections', express.static(detectionsDir));

// ── Routes ───────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api',  apiLimiter, apiRoutes);   // FIX 2: rate limit applied

app.get('/health', (req, res) =>
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    mode:      detectionService.getStatus().mode,
  })
);

// ── WebSocket Events ─────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // Send full current state on connect
  const status = detectionService.getStatus();
  socket.emit('status', status);

  // FIX 3: Send boxes immediately so overlay renders without waiting for next frame
  if (status.boxes && status.boxes.length > 0) {
    socket.emit('fire_detected', {
      confidence: status.confidence,
      boxes:      status.boxes,
    });
  }

  // FIX 3: Send gallery count so GalleryTab badge is correct immediately
  const gallery = detectionService.getGalleryImages();
  socket.emit('gallery_count', { count: gallery.length });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// ── Start server ─────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, async () => {
  console.log(`\nFireShield AI Backend — port ${PORT}`);
  console.log(`   Frontend : ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`   Env      : ${process.env.NODE_ENV || 'development'}`);

  console.log('\n[Detection] Auto-starting...');
  try {
    await detectionService.start();
  } catch (err) {
    console.error('[Detection] Auto-start failed:', err.message);
  }
});

// FIX 4: Graceful shutdown
async function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down cleanly`);
  await detectionService.stop();
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
  // Force exit after 5s if server hangs
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = { app, io };