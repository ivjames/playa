#!/usr/bin/env node
'use strict';

/*
 * playa — Playa.Earth server.
 *
 * Serves the static site (public/: landing + beta app shell) and the JSON API
 * (/api/*). lab980 shape: one app on a local port (8060+), pm2-managed, nginx
 * proxying <fqdn> -> 127.0.0.1:PORT. Config in ./.env (provision-site seeds
 * PORT). Data in ./data (SQLite via Prisma).
 */

const env = require('./src/env');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const prisma = require('./src/db');
const auth = require('./src/auth');
const authRouter = require('./src/routes/auth');
const profileRouter = require('./src/routes/profile');
const discoveryRouter = require('./src/routes/discovery');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind nginx

app.use(express.json({ limit: '64kb' }));
app.use(cookieParser(env.SESSION_SECRET));
app.use(auth.loadUser);

// ---- API ----
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/me', authRouter.me);
app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api', discoveryRouter); // /directory /map /regions /camps /profile/:id

// DELETE /api/account — hard delete (cascades to profile/sessions/etc.)
app.delete('/api/account', auth.requireAuth, async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: req.user.id } });
    auth.clearSessionCookie(res);
    res.json({ ok: true, deleted: true });
  } catch (e) { next(e); }
});

// Unknown API routes -> JSON 404 (don't fall through to static).
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// ---- static site ----
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=300'),
}));

// ---- error handler ----
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'internal error' });
});

const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`playa listening on http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
});

function shutdown() {
  server.close(() => prisma.$disconnect().finally(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
