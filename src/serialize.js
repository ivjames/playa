'use strict';
// Helpers for encoding/decoding JSON list fields and shaping API responses.

const LIST_FIELDS = ['skills', 'interests', 'projects', 'looking', 'langs', 'regional'];

function decodeList(v) {
  try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}

function encodeList(v) {
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => String(x)).filter(Boolean).slice(0, 40));
  if (typeof v === 'string') return JSON.stringify(v.split(',').map((s) => s.trim()).filter(Boolean));
  return '[]';
}

// Shape a profile for API output. `self` includes owner-only fields.
function publicProfile(p, { self = false } = {}) {
  if (!p) return null;
  const out = {
    id: p.id,
    pn: p.pn,
    dn: p.dn || '',
    pronouns: p.pronouns || '',
    avatar: p.avatar || '',
    bio: p.bio || '',
    years: p.years || 0,
    burns: p.burns || 0,
    role: p.role || '',
    camp: p.camp || '',
    avail: p.avail || '',
    contactPref: p.contactPref,
    verified: p.verified,
    region: p.region ? p.region.name : (p.regionName || ''),
    homeCity: p.homeCity || '',
  };
  for (const f of LIST_FIELDS) out[f] = decodeList(p[f]);
  if (self) {
    out.visibility = p.visibility;
  }
  return out;
}

module.exports = { LIST_FIELDS, decodeList, encodeList, publicProfile };
