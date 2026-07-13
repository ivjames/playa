'use strict';
// Seeds Regions (name, continent, city-level coords) and Camps from
// prisma/seed-data.json (extracted from the demo's open-data literals).
// Idempotent: safe to re-run. Does NOT create member profiles.
require('../src/env');
const fs = require('fs');
const path = require('path');
const prisma = require('../src/db');

async function main() {
  const dataPath = path.join(__dirname, '..', 'prisma', 'seed-data.json');
  if (!fs.existsSync(dataPath)) {
    console.error('seed-data.json missing — run: node scripts/extract-seed.js');
    process.exit(1);
  }
  const { regions, camps } = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

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
  console.log(`seeded regions: ${r}; camps created: ${c}, updated: ${skipped}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
