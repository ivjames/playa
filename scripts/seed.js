'use strict';
// Seeds Regions (name, continent, city-level coords) and Camps from
// prisma/seed-data.json (extracted from the demo's open-data literals).
// Idempotent: safe to re-run. Does NOT create member profiles.
require('../src/env');
const fs = require('fs');
const path = require('path');
const ngeohash = require('ngeohash');
const prisma = require('../src/db');

const SEED_DOMAIN = 'seed.playa.earth'; // synthetic accounts — purge with seed:clear
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const enc = (a) => JSON.stringify(Array.isArray(a) ? a : []);

// The demo's exact per-member jitter (±0.04° ≈ ~4km, centered on the city,
// derived from the playa name). Replicated so seeded pins land where the demo
// put them — near their cities, not on a coarse grid cell.
function demoJitter(pn) {
  let h = 0;
  for (let k = 0; k < pn.length; k++) h = (h * 31 + pn.charCodeAt(k)) >>> 0;
  return { lat: (((h % 2000) / 1000) - 1) * 0.04, lng: ((((h >>> 8) % 2000) / 1000) - 1) * 0.04 };
}
// Synthetic demo members are placed at city precision (they're not real people,
// so the ~5km privacy fuzz that applies to real signups isn't needed here).
const SEED_GEOHASH_PRECISION = 7; // ~150m — round-trips the city+jitter point

async function main() {
  const dataPath = path.join(__dirname, '..', 'prisma', 'seed-data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('seed-data.json missing — run: node scripts/extract-seed.js');
    process.exit(1);
  }
  const { regions, camps, members = [] } = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  let r = 0;
  for (const reg of regions) {
    await prisma.region.upsert({
      where: { name: reg.name },
      update: { continent: reg.continent, lat: reg.lat, lng: reg.lng },
      create: { name: reg.name, continent: reg.continent, lat: reg.lat, lng: reg.lng },
    });
    r++;
  }

  // Map region names present in the regions table for camp linking.
  const regionByName = new Map((await prisma.region.findMany()).map((x) => [x.name, x.id]));

  let c = 0, skipped = 0;
  for (const camp of camps) {
    // Avoid duplicate camp rows on re-run: key on (name, region string).
    const existing = await prisma.camp.findFirst({ where: { name: camp.name, url: camp.url || null } });
    const regionId = regionByName.get(camp.region) || null;
    if (existing) {
      await prisma.camp.update({ where: { id: existing.id }, data: { regionId, description: camp.description || null } });
      skipped++;
    } else {
      await prisma.camp.create({
        data: { name: camp.name, regionId, url: camp.url || null, description: camp.description || null },
      });
      c++;
    }
  }
  // ---- Members (curated roster) ----
  const regionRows = await prisma.region.findMany();
  const regionRowByName = new Map(regionRows.map((x) => [x.name, x]));
  let m = 0;
  for (const mem of members) {
    const email = `${slug(mem.pn)}@${SEED_DOMAIN}`;
    const region = regionRowByName.get(mem.region) || null;
    // Place at city coords + the demo's jitter (spreads a region's members
    // across its real cities); fall back to region centroid if no city.
    let geohash = null;
    if (mem.lat != null && mem.lng != null) {
      const j = demoJitter(mem.pn);
      geohash = ngeohash.encode(mem.lat + j.lat, mem.lng + j.lng, SEED_GEOHASH_PRECISION);
    } else if (region && region.lat != null && region.lng != null) {
      geohash = ngeohash.encode(region.lat, region.lng, 5);
    }
    const user = await prisma.user.upsert({
      where: { email }, update: { over18: true }, create: { email, over18: true },
    });
    const profileData = {
      pn: mem.pn, dn: mem.dn || null, pronouns: mem.pronouns || null, avatar: mem.avatar || null,
      bio: mem.bio || null, years: mem.years || 0, burns: mem.burns || 0,
      camp: mem.camp || null, role: mem.role || null, avail: mem.avail || null,
      contactPref: mem.contact === 'Email after intro' ? 'email_after_intro' : 'in_app',
      visibility: mem.vis === 'ghost' ? 'private' : 'searchable',
      flagged: !!mem.flagged,
      regionId: region ? region.id : null, geohash, homeCity: mem.city || null,
      skills: enc(mem.skills), interests: enc(mem.interests), projects: enc(mem.projects),
      looking: enc(mem.looking), langs: enc(mem.langs), regional: enc(mem.regional),
    };
    await prisma.profile.upsert({
      where: { userId: user.id },
      update: profileData,
      create: { ...profileData, userId: user.id },
    });
    m++;
  }

  console.log(`seeded regions: ${r}; camps created: ${c}, updated: ${skipped}; members: ${m}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
