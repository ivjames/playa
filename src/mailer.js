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
    });
  }
  return transporter;
}

async function sendMagicLink(email, url) {
  const t = getTransport();
  const subject = 'Your Playa.Earth sign-in link';
  const text = `Sign in to Playa.Earth:\n\n${url}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`;
  if (!t) {
    // Dev / unconfigured: surface the link instead of sending.
    console.log(`\n[mailer:dev] magic link for ${email}\n  ${url}\n`);
    return { delivered: false, devLink: url };
  }
  await t.sendMail({ from: env.MAIL_FROM, to: email, subject, text });
  return { delivered: true };
}

module.exports = { sendMagicLink };
