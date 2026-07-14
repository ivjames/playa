'use strict';
const express = require('express');
const prisma = require('../db');
const { sendMail } = require('../mailer');

const router = express.Router();

// All social actions require the caller to have a profile.
async function requireProfile(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth required' });
  if (!req.user.profile) return res.status(403).json({ error: 'create a profile first' });
  next();
}

async function blockExists(aId, bId) {
  const b = await prisma.block.findFirst({
    where: { OR: [{ actorId: aId, targetId: bId }, { actorId: bId, targetId: aId }] },
  });
  return !!b;
}

// ---- Messaging ----
const msgTimes = new Map();
router.post('/messages', requireProfile, async (req, res, next) => {
  try {
    const me = req.user.profile;
    const toId = String((req.body && req.body.toId) || '');
    const body = String((req.body && req.body.body) || '').trim().slice(0, 4000);
    if (!toId || !body) return res.status(400).json({ error: 'toId and body required' });
    if (toId === me.id) return res.status(400).json({ error: "you can't message yourself" });

    const to = await prisma.profile.findFirst({ where: { id: toId, user: { deletedAt: null } }, include: { user: true } });
    if (!to) return res.status(404).json({ error: 'recipient not found' });
    if (await blockExists(me.id, to.id)) return res.status(403).json({ error: 'messaging unavailable' });

    // Rate limit: 1 msg / 5s / sender.
    const now = Date.now();
    if (msgTimes.has(me.id) && now - msgTimes.get(me.id) < 5000) {
      return res.status(429).json({ error: 'slow down a moment' });
    }
    msgTimes.set(me.id, now);

    const msg = await prisma.message.create({ data: { fromId: me.id, toId: to.id, body } });

    // Notify by email without exposing the recipient's address to the sender.
    if (to.contactPref === 'email_after_intro' && to.user && to.user.email) {
      sendMail(to.user.email, 'New Playa.Earth message',
        `${me.pn} sent you a message on Playa.Earth. Sign in to read and reply.`).catch(() => {});
    }
    res.status(201).json({ ok: true, id: msg.id });
  } catch (e) { next(e); }
});

// GET /api/messages -> conversations (latest first)
router.get('/messages', requireProfile, async (req, res, next) => {
  try {
    const me = req.user.profile.id;
    const msgs = await prisma.message.findMany({
      where: { OR: [{ fromId: me }, { toId: me }] },
      orderBy: { createdAt: 'desc' }, take: 200,
      include: { from: true, to: true },
    });
    res.json({
      messages: msgs.map((m) => ({
        id: m.id, mine: m.fromId === me, body: m.body, createdAt: m.createdAt,
        readAt: m.readAt,
        with: m.fromId === me
          ? { id: m.toId, pn: m.to.pn, avatar: m.to.avatar || '' }
          : { id: m.fromId, pn: m.from.pn, avatar: m.from.avatar || '' },
      })),
    });
  } catch (e) { next(e); }
});

router.post('/messages/read', requireProfile, async (req, res, next) => {
  try {
    const me = req.user.profile.id;
    await prisma.message.updateMany({ where: { toId: me, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- Block / Report ----
router.post('/block', requireProfile, async (req, res, next) => {
  try {
    const me = req.user.profile.id;
    const targetId = String((req.body && req.body.targetId) || '');
    if (!targetId || targetId === me) return res.status(400).json({ error: 'invalid target' });
    await prisma.block.upsert({
      where: { actorId_targetId: { actorId: me, targetId } },
      update: {}, create: { actorId: me, targetId },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/block/:targetId', requireProfile, async (req, res, next) => {
  try {
    const me = req.user.profile.id;
    await prisma.block.deleteMany({ where: { actorId: me, targetId: req.params.targetId } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/report', requireProfile, async (req, res, next) => {
  try {
    const me = req.user.profile.id;
    const targetId = String((req.body && req.body.targetId) || '');
    const reason = String((req.body && req.body.reason) || '').slice(0, 2000);
    if (!targetId || targetId === me) return res.status(400).json({ error: 'invalid target' });
    await prisma.report.create({ data: { actorId: me, targetId, reason } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
