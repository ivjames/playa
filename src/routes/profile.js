'use strict';
const express = require('express');
const prisma = require('../db');
const auth = require('../auth');
const geo = require('../geo');
const { encodeList, publicProfile, LIST_FIELDS } = require('../serialize');

const router = express.Router();

const SCALARS = ['dn', 'pronouns', 'avatar', 'bio', 'role', 'camp', 'avail', 'homeCity'];

function ageFromDob(dob) {
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

async function linkRegion(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const region = await prisma.region.upsert({ where: { name: n }, update: {}, create: { name: n } });
  // Ensure the region has a coarse centroid so members without a resolvable
  // city still get a map point (via resolveGeohash's region fallback). We
  // geocode the region name once and persist it; geocode() is itself cached.
  if (region.lat == null || region.lng == null) {
    const g = await geo.geocode(n);
    if (g) {
      return prisma.region.update({ where: { id: region.id }, data: { lat: g.lat, lng: g.lng } });
    }
  }
  return region;
}

function buildData(body) {
  const data = {};
  for (const f of SCALARS) if (body[f] !== undefined) data[f] = String(body[f] || '').slice(0, 2000);
  if (body.pn !== undefined) data.pn = String(body.pn || '').trim().slice(0, 80);
  if (body.years !== undefined) data.years = Math.max(0, Math.min(80, parseInt(body.years, 10) || 0));
  if (body.burns !== undefined) data.burns = Math.max(0, Math.min(80, parseInt(body.burns, 10) || 0));
  if (body.contactPref !== undefined) {
    data.contactPref = body.contactPref === 'email_after_intro' ? 'email_after_intro' : 'in_app';
  }
  for (const f of LIST_FIELDS) if (body[f] !== undefined) data[f] = encodeList(body[f]);
  return data;
}

// POST /api/profile — create profile (onboarding). Enforces the 18+ gate.
router.post('/', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.user.profile) return res.status(409).json({ error: 'profile already exists' });
    const body = req.body || {};

    // 18+ gate: require a DOB proving >= 18, unless the account is already marked over18.
    let over18 = req.user.over18;
    if (!over18) {
      const age = ageFromDob(body.dob);
      if (age === null) return res.status(400).json({ error: 'date of birth required' });
      if (age < 18) return res.status(403).json({ error: 'Playa.Earth is 18+ only' });
      over18 = true;
    }

    const pn = String(body.pn || '').trim();
    if (!pn) return res.status(400).json({ error: 'playa name (pn) is required' });

    const data = buildData(body);
    data.pn = pn;
    data.visibility = 'private'; // invariant: new profiles start Private
    const region = await linkRegion(body.region);
    if (region) data.regionId = region.id;
    // Coarse location: derive a ~5km geohash from city/region. Exact coords are
    // used transiently by the geocoder and never stored.
    const geohash = await geo.resolveGeohash({ city: data.homeCity, region });
    if (geohash) data.geohash = geohash;

    await prisma.user.update({ where: { id: req.user.id }, data: { over18: true } });
    const profile = await prisma.profile.create({
      data: { ...data, userId: req.user.id },
      include: { region: true },
    });
    res.status(201).json({ profile: publicProfile(profile, { self: true }) });
  } catch (e) { next(e); }
});

// PATCH /api/profile — update owner's profile
router.patch('/', auth.requireAuth, async (req, res, next) => {
  try {
    if (!req.user.profile) return res.status(404).json({ error: 'no profile yet' });
    const body = req.body || {};
    const data = buildData(body);
    let region;
    if (body.region !== undefined) {
      region = await linkRegion(body.region);
      data.regionId = region ? region.id : null;
    }
    // Recompute coarse geohash if city or region changed.
    if (body.homeCity !== undefined || body.region !== undefined) {
      if (region === undefined && req.user.profile.regionId) {
        region = await prisma.region.findUnique({ where: { id: req.user.profile.regionId } });
      }
      const city = data.homeCity !== undefined ? data.homeCity : req.user.profile.homeCity;
      data.geohash = await geo.resolveGeohash({ city, region });
    }
    const profile = await prisma.profile.update({
      where: { id: req.user.profile.id }, data, include: { region: true },
    });
    res.json({ profile: publicProfile(profile, { self: true }) });
  } catch (e) { next(e); }
});

// POST /api/profile/visibility — { visibility: 'private' | 'searchable' }
router.post('/visibility', auth.requireAuth, async (req, res, next) => {
  try {
    if (!req.user.profile) return res.status(404).json({ error: 'no profile yet' });
    const v = (req.body && req.body.visibility) === 'searchable' ? 'searchable' : 'private';
    const profile = await prisma.profile.update({
      where: { id: req.user.profile.id }, data: { visibility: v }, include: { region: true },
    });
    res.json({ profile: publicProfile(profile, { self: true }) });
  } catch (e) { next(e); }
});

module.exports = router;
