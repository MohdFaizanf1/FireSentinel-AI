// ─────────────────────────────────────────────────────────
//  Passport — Google OAuth 2.0 Strategy
//
//  IMPORTANT: callbackURL must be the BACKEND URL (port 4000).
//  Google redirects to this URL after auth, then Express
//  issues a JWT and redirects the browser to the React frontend.
// ─────────────────────────────────────────────────────────
const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // This MUST match exactly what you set in Google Cloud Console
    // Authorized redirect URIs: http://localhost:4000/auth/google/callback
    callbackURL:  `${process.env.BACKEND_URL || 'http://localhost:4000'}/auth/google/callback`,
  },
  (accessToken, refreshToken, profile, done) => {
    const user = {
      id:       profile.id,
      name:     profile.displayName,
      email:    profile.emails?.[0]?.value || '',
      picture:  profile.photos?.[0]?.value || '',
      provider: 'google',
    };
    return done(null, user);
  }
));

passport.serializeUser((user, done)   => done(null, user));
passport.deserializeUser((user, done) => done(null, user));
