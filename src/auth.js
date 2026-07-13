'use strict';
const crypto = require('crypto');
const prisma = require('./db');

const MAGIC_TTL_MS = 15 * 60 * 1000; // 15 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const COOKIE = 'pe_sid';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

// ---- magic link ----
async function issueMagicToken(email) {
  const normalized = String(email).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    const err = new Error('invalid email');
    err.status = 400;
    throw err;
  }
  const token = randomToken();
  await prisma.user.upsert({
    where: { email: normalized },
    update: { magicTokenHash: sha256(token), magicExpires: new Date(Date.now() + MAGIC_TTL_MS) },
    create: { email: normalized, magicTokenHash: sha256(token), magicExpires: new Date(Date.now() + MAGIC_TTL_MS) },
  });
  return { email: normalized, token };
}

async function consumeMagicToken(email, token) {
  const normalized = String(email || '').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || !user.magicTokenHash || !user.magicExpires) return null;
  if (user.magicExpires.getTime() < Date.now()) return null;
  if (sha256(String(token || '')) !== user.magicTokenHash) return null;
  await prisma.user.update({ where: { id: user.id }, data: { magicTokenHash: null, magicExpires: null } });
  return user;
}

// ---- sessions ----
async function createSession(userId) {
  const token = randomToken();
  await prisma.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return token;
}

async function destroySession(token) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { token } });
}

function setSessionCookie(res, token, isProd) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// Attaches req.user (with profile) if a valid session cookie is present.
async function loadUser(req, _res, next) {
  try {
    const token = req.cookies && req.cookies[COOKIE];
    if (token) {
      const session = await prisma.session.findUnique({ where: { token }, include: { user: { include: { profile: { include: { region: true } } } } } });
      if (session && session.expiresAt.getTime() > Date.now() && !session.user.deletedAt) {
        req.user = session.user;
        req.sessionToken = token;
      }
    }
  } catch (e) { /* fall through unauthenticated */ }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth required' });
  next();
}

module.exports = {
  COOKIE,
  issueMagicToken,
  consumeMagicToken,
  createSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  loadUser,
  requireAuth,
};
