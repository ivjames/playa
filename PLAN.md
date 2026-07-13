# Playa.Earth — build plan (demo → real product)

Turning the beta (`public/beta.html`, a front-end-only demo with hardcoded
data) into a working app, without disturbing the landing page or the design.

## Locked decisions

- **Scope:** full build, phased (1→4 below).
- **Auth:** passwordless **magic-link** email.
- **Geocoding:** **external geocoder (Nominatim/OSM)** → coarse to ~5km.
- **Stack:** Node 18.18+ · **Express** · **Prisma + SQLite** (`data/playa.db`,
  per lab980 convention) · **nodemailer** (pluggable transport) · existing
  HTML/CSS/JS front-end calling a JSON API.
- **Deploy:** unchanged lab980 shape — pm2 + nginx + local port. Landing stays
  static; the server now also mounts `/api/*` and serves the beta app shell.

## Core invariants (privacy is the product)

1. **Exact location never persists.** Geocode → geohash+jitter to ~5km →
   store only the coarse value. Raw lat/lng is discarded in the same request.
2. **Private (ghost) is invisible, server-side.** Every discovery query
   (map, directory, region, search) filters to Searchable (beacon) only.
   Never rely on the client to hide anyone.
3. **Default to less exposure.** New accounts are Private. Becoming
   Searchable is an explicit action.
4. **18+ enforced at account creation.** Store the over-18 assertion.
5. **Delete means gone.** Hard-delete + backup purge on a clock.
6. **No data sale / no public profile API.** Discovery endpoints are
   session-gated and rate-limited; no bulk export.

## Data model (Prisma)

- `User` — email (unique), magicToken/expiry, over18, createdAt, deletedAt
- `Session` — token, userId, expiresAt
- `Profile` — 1:1 User; pn, dn, pronouns, avatar, bio, years, burns, role,
  contactPref, visibility (`private|searchable`), verified
  (`unverified|verified|flagged`), regionId, geohash (coarse), homeCity
- `Profile*` join tables — skills, interests, projects, looking, langs,
  regionalEvents (string lists, normalized where useful)
- `Region` — name, continent, lat, lng (city-level, public)
- `Camp` — name, regionId, url, description
- `CampMember` — campId, profileId, role (`member|lead`)
- `Verification` — profileId, voucherProfileId, method, status, createdAt
- `Message` — fromProfileId, toProfileId, body, createdAt, readAt
- `Report` / `Block` — actor, target, reason, createdAt

## API surface (v1)

- **Auth:** `POST /api/auth/request` (email→magic link), `GET /api/auth/verify`,
  `POST /api/auth/logout`, `GET /api/me`
- **Onboarding/profile:** `POST /api/profile`, `PATCH /api/profile`,
  `POST /api/profile/visibility`, `DELETE /api/account`
- **Discovery:** `GET /api/directory` (filters, Searchable-only, paginated),
  `GET /api/map` (coarse points, Searchable-only), `GET /api/regions`,
  `GET /api/camps`, `GET /api/profile/:id`
- **Trust/contact:** `POST /api/verify/request`, `POST /api/verify/:id/approve`,
  `POST /api/messages`, `GET /api/messages`, `POST /api/report`, `POST /api/block`

## Phases

- **Phase 1 — foundation:** Express+Prisma skeleton, magic-link auth, sessions,
  onboarding persistence, profile CRUD, 18+ gate. Everyone Private; nothing
  discoverable yet.
- **Phase 2 — discovery:** Searchable visibility, directory + map APIs with
  real Nominatim geocoding → geohash fuzzing, camps/regions seeded from the
  demo's open-data lists. Front-end swaps hardcoded arrays for `fetch`.
- **Phase 3 — trust & contact:** verification vouching, messaging + email
  notifications, block/report + moderation, account deletion + backup purge.
- **Phase 4 — polish:** donations (external link via `DONATE_URL`; no in-app
  checkout, never pay-for-visibility) ✓; admin/moderation console at
  `/admin.html` (ADMIN_EMAILS-gated) ✓. **i18n deferred:** the mechanism is in
  place (string catalog + language-aware map tiles), but shipping locales is a
  translation effort needing native review — intentionally not auto-generated.

## External dependencies (confirm network policy on the droplet)

- **Email provider** (magic links + notifications): nodemailer transport via
  env (`SMTP_*` or provider API key). Dev falls back to console/JSON transport.
- **Nominatim/OSM** geocoding: outbound HTTPS, descriptive User-Agent,
  ≤1 req/s, results cached in DB to minimize calls.

## Front-end integration

Keep `public/beta.html` verbatim in structure/design; replace the inline
`MEMBERS`/`CAMPS`/`CITY` constants and the no-op action handlers with `fetch`
calls to the API. Onboarding steps POST to `/api/profile`. Auth via magic-link
adds a lightweight signed-in state to the existing header.
