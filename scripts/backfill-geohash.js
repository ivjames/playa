'use strict';
// One-time repair: give every profile that is missing a coarse geohash a map
// point. Earlier signups (especially those that left the city blank, on a DB
// whose regions had no stored coordinates) were saved with geohash = null and
// so never appeared on the map even when Searchable. This first backfills any
// region centroids that are missing, then recomputes a geohash for every
// profile that lacks one. Safe to run repeatedly.
require('../src/env');
const prisma = require('../src/db');
const geo = require('../src/geo');

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

  // 2. Recompute a geohash for every profile that has none.
  const profiles = await prisma.profile.findMany({
    where: { geohash: null }, include: { region: true },
  });
  let fixed = 0;
  let stillNull = 0;
  for (const p of profiles) {
    const geohash = await geo.resolveGeohash({ city: p.homeCity, region: p.region });
    if (geohash) {
      await prisma.profile.update({ where: { id: p.id }, data: { geohash } });
      fixed++;
    } else {
      stillNull++;
    }
  }

  console.log(`regions backfilled: ${regionsFixed}; profiles fixed: ${fixed}; still unresolvable: ${stillNull} (of ${profiles.length} missing)`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
