'use strict';
const express = require('express');
const prisma = require('../db');
const geo = require('../geo');
const { publicProfile, decodeList } = require('../serialize');

const router = express.Router();

// Every discovery query enforces the core invariant: Searchable only, and
// never a deleted account.
const SEARCHABLE = { visibility: 'searchable', user: { deletedAt: null } };

// Profile ids the signed-in viewer has blocked or been blocked by — hidden
// from their directory/map. Returns [] for anonymous viewers.
async function hiddenIdsFor(req) {
  const me = req.user && req.user.profile;
  if (!me) return [];
  const blocks = await prisma.block.findMany({
    where: { OR: [{ actorId: me.id }, { targetId: me.id }] },
  });
  const ids = new Set();
  for (const b of blocks) ids.add(b.actorId === me.id ? b.targetId : b.actorId);
  return [...ids];
}

function matchesLooking(profile, looking) {
  if (!looking) return true;
  return decodeList(profile.looking).some((x) => x.toLowerCase() === looking.toLowerCase());
}

// GET /api/directory?q=&continent=&region=&looking=&page=
router.get('/directory', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const continent = String(req.query.continent || '').trim();
    const region = String(req.query.region || '').trim();
    const looking = String(req.query.looking || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = 24;

    const where = { ...SEARCHABLE };
    if (region) where.region = { name: region };
    else if (continent) where.region = { continent };
    const hidden = await hiddenIdsFor(req);
    if (hidden.length) where.id = { notIn: hidden };

    // Fetch candidates, then apply text/looking filters in app (JSON lists).
    const candidates = await prisma.profile.findMany({
      where, include: { region: true }, orderBy: { createdAt: 'desc' },
    });
    const filtered = candidates.filter((p) => {
      if (looking && !matchesLooking(p, looking)) return false;
      if (!q) return true;
      const hay = [p.pn, p.dn, p.bio, p.role, p.camp,
        ...decodeList(p.skills), ...decodeList(p.interests), ...decodeList(p.projects)]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });

    const total = filtered.length;
    const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
    res.json({
      total, page, pageSize,
      results: slice.map((p) => publicProfile(p)),
    });
  } catch (e) { next(e); }
});

// GET /api/map?layer=  -> coarse points for Searchable members
router.get('/map', async (req, res, next) => {
  try {
    const hidden = await hiddenIdsFor(req);
    const where = { ...SEARCHABLE, geohash: { not: null } };
    if (hidden.length) where.id = { notIn: hidden };
    const members = await prisma.profile.findMany({ where, include: { region: true } });
    const points = members.map((p) => {
      const pt = geo.displayPoint(p.geohash, p.id);
      if (!pt) return null;
      return { id: p.id, pn: p.pn, avatar: p.avatar || '',
        region: p.region ? p.region.name : '', lat: pt.lat, lng: pt.lng };
    }).filter(Boolean);
    res.json({ total: points.length, points });
  } catch (e) { next(e); }
});

// GET /api/regions  -> regions grouped, with searchable member + camp counts
router.get('/regions', async (_req, res, next) => {
  try {
    const regions = await prisma.region.findMany({ orderBy: { name: 'asc' } });
    const memberCounts = await prisma.profile.groupBy({
      by: ['regionId'], where: SEARCHABLE, _count: { _all: true },
    });
    const campCounts = await prisma.camp.groupBy({ by: ['regionId'], _count: { _all: true } });
    const mc = new Map(memberCounts.map((x) => [x.regionId, x._count._all]));
    const cc = new Map(campCounts.map((x) => [x.regionId, x._count._all]));
    res.json({
      regions: regions.map((r) => ({
        name: r.name, continent: r.continent,
        members: mc.get(r.id) || 0, camps: cc.get(r.id) || 0,
      })),
    });
  } catch (e) { next(e); }
});

// GET /api/camps?q=&hasSite=&region=
router.get('/camps', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const hasSite = String(req.query.hasSite || '') === '1';
    const region = String(req.query.region || '').trim();
    const where = {};
    if (region) where.region = { name: region };
    if (hasSite) where.url = { not: null };
    let camps = await prisma.camp.findMany({ where, include: { region: true }, orderBy: { name: 'asc' } });
    if (q) camps = camps.filter((c) => (c.name + ' ' + (c.description || '')).toLowerCase().includes(q));
    res.json({
      total: camps.length,
      camps: camps.map((c) => ({
        id: c.id, name: c.name, url: c.url || '',
        description: c.description || '', region: c.region ? c.region.name : '',
      })),
    });
  } catch (e) { next(e); }
});

// GET /api/profile/:id  -> single Searchable profile (public view)
router.get('/profile/:id', async (req, res, next) => {
  try {
    const p = await prisma.profile.findFirst({
      where: { id: req.params.id, ...SEARCHABLE }, include: { region: true },
    });
    if (!p) return res.status(404).json({ error: 'not found' });
    res.json({ profile: publicProfile(p) });
  } catch (e) { next(e); }
});

module.exports = router;
