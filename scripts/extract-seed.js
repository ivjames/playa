'use strict';
/*
 * Build-time extractor: pulls the open-data literals (CITY region coords,
 * REGION_CONTINENT, CONTINENT_ORDER, CAMPS) out of public/beta.html and writes
 * prisma/seed-data.json. These are the legit seedable pieces (regions, camps);
 * member profiles are intentionally NOT extracted — real members come from real
 * signups.
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'beta.html'), 'utf8');

// Extract a balanced {...} or [...] literal following `var NAME =`.
function extractLiteral(src, name) {
  const anchor = new RegExp('var\\s+' + name + '\\s*=\\s*'); // first occurrence
  const m = anchor.exec(src);
  if (!m) throw new Error('not found: ' + name);
  let i = m.index + m[0].length;
  const open = src[i];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, q = '', esc = false;
  const start = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === q) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) { i++; break; } }
  }
  const literal = src.slice(start, i);
  // eslint-disable-next-line no-new-func
  return Function('return (' + literal + ')')();
}

const CITY = extractLiteral(html, 'CITY');
const REGION_CONTINENT = extractLiteral(html, 'REGION_CONTINENT');
const CONTINENT_ORDER = extractLiteral(html, 'CONTINENT_ORDER');
const CAMPS = extractLiteral(html, 'CAMPS');

// Reproduce the FULL roster (curated 51 + deterministic generator = ~200) by
// running the demo's own member-building code span in Node. It's pure/seeded,
// so the output matches the demo exactly. Span: `var VIS =` .. end of the
// generator IIFE (`MEMBERS = MEMBERS.concat(generateMembers(149));})();`).
function buildRoster(src) {
  const start = src.indexOf('var VIS = {');
  const genIdx = src.indexOf('concat(generateMembers(');
  if (start < 0 || genIdx < 0) throw new Error('member-generator span not found');
  const end = src.indexOf('})();', genIdx) + '})();'.length;
  const code = src.slice(start, end);
  // eslint-disable-next-line no-new-func
  return Function(code + '\n; return MEMBERS;')();
}
const MEMBERS = buildRoster(html);

const regions = Object.keys(CITY).map((name) => ({
  name,
  continent: REGION_CONTINENT[name] || null,
  lat: CITY[name].lat,
  lng: CITY[name].lng,
}));

// Camps reference free-text region names that don't all match CITY keys; keep
// the raw region string and link by name where it matches during seeding.
const camps = CAMPS.map((c) => ({
  name: c.name,
  region: c.region || '',
  url: c.url || '',
  description: c.desc || '',
}));

// Curated members — the demo's hand-authored roster. Seeded so the pilot
// directory/map are populated. Kept verbatim; visibility/verified as authored.
const members = MEMBERS.map((m) => ({
  pn: m.pn, dn: m.dn || '', pronouns: m.pronouns || '', avatar: m.avatar || '',
  region: m.region || '', bio: m.bio || '', years: m.years || 0, burns: m.burns || 0,
  camp: m.camp || '', role: m.role || '', skills: m.skills || [], interests: m.interests || [],
  projects: m.projects || [], looking: m.looking || [], langs: m.langs || [],
  avail: m.avail || '', regional: m.regional || [],
  contact: m.contact || 'In-app message', verified: m.verified || 'unverified',
  vis: m.vis || 'beacon',
}));

const out = { continentOrder: CONTINENT_ORDER, regions, camps, members };
fs.writeFileSync(path.join(__dirname, '..', 'prisma', 'seed-data.json'), JSON.stringify(out, null, 2));
console.log(`extracted: ${regions.length} regions, ${camps.length} camps, ${members.length} members`);
