'use strict';
const nodemailer = require('nodemailer');
const env = require('./env');

// Resend over SMTP. In non-prod (or with no API key) we don't send — we log the
// link to the console so the flow is testable without a verified domain.
let transporter = null;
function getTransport() {
  if (transporter) return transporter;
  if (env.RESEND_API_KEY && env.isProd) {
    transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: env.RESEND_API_KEY },
      // Bound how long a send can block. Without these, an unreachable or slow
      // SMTP host hangs the HTTP request indefinitely instead of failing fast.
      connectionTimeout: 10 * 1000,
      greetingTimeout: 10 * 1000,
      socketTimeout: 15 * 1000,
    });
  }
  return transporter;
}

async function sendMail(to, subject, text) {
  const t = getTransport();
  if (!t) {
    // No transport (dev, or prod without a key): log the message so the flow is
    // testable. `configured: false` distinguishes this from a real send failure.
    console.log(`\n[mailer:dev] to ${to} — ${subject}\n${text}\n`);
    return { delivered: false, configured: false };
  }
  try {
    await t.sendMail({ from: env.MAIL_FROM, to, subject, text });
    return { delivered: true, configured: true };
  } catch (e) {
    // Resend rejections (unverified domain, wrong `from`, bad key) and SMTP
    // timeouts land here. Log the underlying reason for the operator, but don't
    // throw — a delivery failure must not become an opaque 500 for the caller.
    const detail = e && (e.response || e.message) ? (e.response || e.message) : e;
    console.error(`[mailer:error] failed to send to ${to} — ${detail}`);
    return { delivered: false, configured: true, error: e };
  }
}

async function sendMagicLink(email, url) {
  const subject = 'Your Playa.Earth sign-in link';
  const text = `Sign in to Playa.Earth:\n\n${url}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`;
  const r = await sendMail(email, subject, text);
  if (r.delivered) return { delivered: true };
  // Not delivered: expose the link for local testing (no transport configured),
  // and flag whether the send was actually attempted and failed.
  return { delivered: false, configured: r.configured, devLink: url };
}

module.exports = { sendMagicLink, sendMail };
