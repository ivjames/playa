'use strict';
// Repair map placement for real members. Two modes:
//
//   node scripts/backfill-geohash.js              (default: fill NULLs only)
//   node scripts/backfill-geohash.js --recompute  (also re-place existing pins)
//
// Default mode gives a coarse geohash to any profile that lacks one (earlier
// signups that left the city blank on a DB whose regions had no coordinates
// were saved with geohash = null and never appeared on the map).
//
// --recompute additionally RE-derives the geohash for every real (non-seed)
// member using the current resolver. This corrects members mislocated by the
// old resolveGeohash bug, which dropped the region qualifier from the geocode
// query so an ambiguous city (e.g. "Springfield") resolved to the wrong place.
// It never overwrites a good value with null, and never touches seed accounts.
require('../src/env');
const prisma = require('../src/db');
const geo = require('../src/geo');

const RECOMPUTE = process.argv.includes('--recompute');
const SEED_EMAIL_SUFFIX = '@seed.playa.earth';

async function main() {
  // 1. Backfill region centroids so the region fallback always has data.
  const regions = await prisma.region.findMany({ where: { OR: [{ lat: null }, { lng: null }] } });
  let regionsFixed = 0;
  for (const r of regions) {
    const g = await geo.geocode(r.name);
    if (g) {
      await prisma.region.update({ where: { id: r.id }, data: { lat: g.lat, lng: g.lng } });
      regionsFixed++;
    }
  }

  // 2. Select the profiles to (re)resolve.
  //   default   -> only those missing a geohash (any account)
  //   recompute -> every real (non-seed) member, regardless of current value
  const where = RECOMPUTE
    ? { user: { deletedAt: null, NOT: { email: { endsWith: SEED_EMAIL_SUFFIX } } } }
    : { geohash: null };
  const profiles = await prisma.profile.findMany({ where, include: { region: true } });

  let filled = 0; // was null, now set
  let moved = 0; // had a value, changed to a new one
  let unchanged = 0; // resolved to the same value (or resolver returned same)
  let unresolved = 0; // still null after resolving
  for (const p of profiles) {
    const geohash = await geo.resolveGeohash({ city: p.homeCity, region: p.region });
    if (!geohash) {
      if (!p.geohash) unresolved++; else unchanged++; // don't wipe a good value with null
      continue;
    }
    if (geohash === p.geohash) { unchanged++; continue; }
    await prisma.profile.update({ where: { id: p.id }, data: { geohash } });
    if (p.geohash) moved++; else filled++;
  }

  console.log(
    `mode: ${RECOMPUTE ? 'recompute (real members)' : 'fill nulls'}; ` +
    `regions backfilled: ${regionsFixed}; considered: ${profiles.length}; ` +
    `filled: ${filled}; re-placed: ${moved}; unchanged: ${unchanged}; unresolved: ${unresolved}`
  );
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
