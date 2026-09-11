// ─────────────────────────────────────────────────────────
//  Auth Routes — Google OAuth + JWT
// ─────────────────────────────────────────────────────────
const express  = require('express');
const passport = require('passport');
const jwt      = require('jsonwebtoken');
const router   = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET   = process.env.JWT_SECRET   || 'fireshield_jwt_secret';

// ── Initiate Google OAuth ────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// ── Google OAuth Callback ────────────────────────────────
// Google calls this on 4000 directly; we issue JWT + redirect to React frontend
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${FRONTEND_URL}/login?error=auth_failed` }),
  (req, res) => {
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email, name: req.user.name, picture: req.user.picture },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set httpOnly cookie for future requests
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    // Redirect to React's /auth/callback page with token in query string.
    // IMPORTANT: This must go to FRONTEND_URL (port 5173), NOT back to Express.
    // The Vite proxy must NOT proxy /auth/callback — only /auth/google.
    res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  }
);

// ── Safety net: if /auth/callback somehow hits Express,
//    re-redirect to the React frontend ─────────────────────
router.get('/callback', (req, res) => {
  const { token } = req.query;
  if (token) {
    return res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
  }
  return res.redirect(`${FRONTEND_URL}/login?error=missing_token`);
});

// ── Get current user (from JWT cookie or Bearer token) ───
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ── Logout ───────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  req.logout?.(() => {});
  res.json({ success: true });
});

// ── Auth Middleware (exported for use in api.js) ──────────
function requireAuth(req, res, next) {
  const token =
    req.cookies?.auth_token ||
    req.headers.authorization?.replace('Bearer ', '') ||
    req.query?.token;   // allow ?token= for CSV download links

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = router;
module.exports.requireAuth = requireAuth;
