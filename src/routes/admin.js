'use strict';
const express = require('express');
const prisma = require('../db');
const env = require('../env');
const { publicProfile } = require('../serialize');

const router = express.Router();

// Admin = an email listed in ADMIN_EMAILS. Everything here is gated.
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth required' });
  if (!env.ADMIN_EMAILS.includes(String(req.user.email).toLowerCase())) {
    return res.status(403).json({ error: 'admin only' });
  }
  next();
}

// GET /api/admin/reports -> reports grouped by target, with counts
router.get('/reports', requireAdmin, async (_req, res, next) => {
  try {
    const reports = await prisma.report.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    const byTarget = new Map();
    for (const r of reports) {
      if (!byTarget.has(r.targetId)) byTarget.set(r.targetId, []);
      byTarget.get(r.targetId).push({ reason: r.reason, createdAt: r.createdAt });
    }
    const targetIds = [...byTarget.keys()];
    const profiles = await prisma.profile.findMany({ where: { id: { in: targetIds } } });
    const pById = new Map(profiles.map((p) => [p.id, p]));
    res.json({
      targets: targetIds.map((id) => ({
        profile: pById.has(id) ? publicProfile(pById.get(id), { self: true }) : { id, pn: '(deleted)' },
        count: byTarget.get(id).length,
        reports: byTarget.get(id),
      })).sort((a, b) => b.count - a.count),
    });
  } catch (e) { next(e); }
});

// POST /api/admin/flag { profileId, flagged: true|false } -> toggle moderation flag
router.post('/flag', requireAdmin, async (req, res, next) => {
  try {
    const profileId = String((req.body && req.body.profileId) || '');
    const flagged = !!(req.body && req.body.flagged);
    const p = await prisma.profile.update({ where: { id: profileId }, data: { flagged } });
    res.json({ ok: true, flagged: p.flagged });
  } catch (e) { next(e); }
});

// POST /api/admin/remove { profileId } -> hard-delete the offending account
router.post('/remove', requireAdmin, async (req, res, next) => {
  try {
    const profileId = String((req.body && req.body.profileId) || '');
    const p = await prisma.profile.findUnique({ where: { id: profileId } });
    if (!p) return res.status(404).json({ error: 'not found' });
    await prisma.user.delete({ where: { id: p.userId } });
    res.json({ ok: true, removed: true });
  } catch (e) { next(e); }
});

module.exports = router;
