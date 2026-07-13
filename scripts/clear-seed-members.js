'use strict';
// Remove all synthetic seed members (accounts under @seed.playa.earth).
// Run this once real signups make the demo roster unnecessary.
require('../src/env');
const prisma = require('../src/db');

async function main() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: '@seed.playa.earth' } } });
  if (!users.length) { console.log('no seed members to clear'); return; }
  const ids = users.map((u) => u.id);
  await prisma.user.deleteMany({ where: { id: { in: ids } } }); // cascades to profile/messages/etc.
  console.log(`removed ${ids.length} seed members`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
