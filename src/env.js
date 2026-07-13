'use strict';
// Minimal .env loader (no dotenv dependency). Must run before PrismaClient is
// constructed so DATABASE_URL is present. Existing process.env wins.
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
try {
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const val = m[2].trim().replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
} catch { /* no .env — rely on real environment */ }

module.exports = {
  PORT: parseInt(process.env.PORT, 10) || 8060,
  HOST: process.env.HOST || '127.0.0.1',
  APP_URL: process.env.APP_URL || `http://127.0.0.1:${parseInt(process.env.PORT, 10) || 8060}`,
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-only-change-me',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  MAIL_FROM: process.env.MAIL_FROM || 'Playa.Earth <onboarding@resend.dev>',
  ADMIN_EMAILS: (process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
};
