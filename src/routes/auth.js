'use strict';
const express = require('express');
const env = require('../env');
const auth = require('../auth');
const { sendMagicLink } = require('../mailer');
const { publicProfile } = require('../serialize');

const router = express.Router();

// Simple per-email rate limit for link requests (in-memory; fine per-process).
const lastRequest = new Map();
const REQUEST_COOLDOWN_MS = 20 * 1000;

// POST /api/auth/request  { email }
router.post('/request', async (req, res, next) => {
  try {
    const email = (req.body && req.body.email) || '';
    const key = String(email).trim().toLowerCase();
    const now = Date.now();
    if (lastRequest.has(key) && now - lastRequest.get(key) < REQUEST_COOLDOWN_MS) {
      return res.status(429).json({ error: 'please wait a moment before requesting another link' });
    }
    const { email: normalized, token } = await auth.issueMagicToken(email);
    lastRequest.set(key, now);
    const url = `${env.APP_URL}/api/auth/verify?email=${encodeURIComponent(normalized)}&token=${encodeURIComponent(token)}`;
    const result = await sendMagicLink(normalized, url);
    // A user row is upserted for every request regardless, so surfacing a
    // delivery failure here doesn't reveal whether the address already existed.
    if (!result.delivered && result.configured) {
      // The send was attempted and failed (Resend rejection / SMTP timeout).
      // Report it plainly instead of an opaque 500 so the user can retry and
      // the operator sees the cause in the server log (see mailer).
      return res.status(502).json({ error: "couldn't send the sign-in email right now — please try again in a moment" });
    }
    // Delivered, or no transport configured. Never reveal whether the address
    // exists. In dev (no transport), expose the link for testing.
    const body = { ok: true };
    if (!result.delivered && !env.isProd) body.devLink = url;
    res.json(body);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    next(e);
  }
});

// GET /api/auth/verify?email&token  -> sets session cookie, redirects into the app
router.get('/verify', async (req, res, next) => {
  try {
    const user = await auth.consumeMagicToken(req.query.email, req.query.token);
    if (!user) return res.redirect('/beta.html?auth=invalid');
    const token = await auth.createSession(user.id);
    auth.setSessionCookie(res, token, env.isProd);
    const dest = user.profile ? '/beta.html?auth=ok' : '/beta.html?auth=ok&onboard=1';
    res.redirect(dest);
  } catch (e) { next(e); }
});

// POST /api/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    await auth.destroySession(req.sessionToken);
    auth.clearSessionCookie(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;

// GET /api/me  (mounted separately in server.js so it's outside /api/auth)
module.exports.me = async (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({
    user: { email: req.user.email, over18: req.user.over18 },
    profile: req.user.profile ? publicProfile(req.user.profile, { self: true }) : null,
  });
};
