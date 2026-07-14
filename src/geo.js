'use strict';
const crypto = require('crypto');
const ngeohash = require('ngeohash');
const prisma = require('./db');
const env = require('./env');

// Coarse location model (privacy invariant): we store ONLY a geohash bucket,
// never exact coordinates. Precision 5 ≈ ±2.4km lat / a ~5km cell.
const COARSE_PRECISION = 5;

function coarsen(lat, lng) {
  return ngeohash.encode(lat, lng, COARSE_PRECISION);
}

// Deterministic display point for a geohash cell: the cell center plus a stable
// per-seed jitter within the cell, so members in a city scatter instead of
// stacking on one pin — while the stored value stays coarse.
function displayPoint(geohash, seed) {
  if (!geohash) return null;
  let box;
  try { box = ngeohash.decode_bbox(geohash); } catch { return null; }
  const [minLat, minLng, maxLat, maxLng] = box;
  const h = crypto.createHash('sha256').update(String(seed || geohash)).digest();
  const r1 = h.readUInt32BE(0) / 0xffffffff;
  const r2 = h.readUInt32BE(4) / 0xffffffff;
  return {
    lat: +(minLat + r1 * (maxLat - minLat)).toFixed(4),
    lng: +(minLng + r2 * (maxLng - minLng)).toFixed(4),
  };
}

// ---- Nominatim geocoding (cached; polite rate limit) ----
let lastCall = 0;
const MIN_INTERVAL_MS = 1100;

async function geocode(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const cached = await prisma.geocodeCache.findUnique({ where: { query: q.toLowerCase() } });
  if (cached) return { lat: cached.lat, lng: cached.lng };

  const wait = MIN_INTERVAL_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  let data;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': `playa.earth (${env.MAIL_FROM || 'contact via app'})`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    data = await res.json();
  } catch { return null; }
  if (!Array.isArray(data) || !data.length) return null;
  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);
  if (isNaN(lat) || isNaN(lng)) return null;
  await prisma.geocodeCache.upsert({
    where: { query: q.toLowerCase() },
    update: { lat, lng },
    create: { query: q.toLowerCase(), lat, lng },
  });
  return { lat, lng };
}

// Resolve a coarse geohash for a profile from its city (preferred) or region
// (fallback). `region` may be a Prisma region record or a plain name string.
// Returns null only when nothing at all is resolvable.
async function resolveGeohash({ city, region }) {
  const regionName = typeof region === 'string' ? region : (region && region.name) || '';
  if (city) {
    const g = await geocode(regionName ? `${city}, ${regionName}` : city);
    if (g) return coarsen(g.lat, g.lng);
    const g2 = await geocode(city);
    if (g2) return coarsen(g2.lat, g2.lng);
  }
  // Stored region centroid, if we have one.
  if (region && typeof region === 'object' && region.lat != null && region.lng != null) {
    return coarsen(region.lat, region.lng);
  }
  // Last resort: geocode the region name itself (covers regions that were
  // created without stored coordinates and members who gave no city).
  if (regionName) {
    const g3 = await geocode(regionName);
    if (g3) return coarsen(g3.lat, g3.lng);
  }
  return null;
}

module.exports = { COARSE_PRECISION, coarsen, displayPoint, geocode, resolveGeohash };
