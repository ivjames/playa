# Deploying playa (Playa.Earth) to lab980

`playa` is a **Node app** (Express + Prisma/SQLite). It serves the static site
— landing (`public/index.html`) and beta app shell (`public/beta.html`) — plus
a JSON API at `/api/*`. Managed by **pm2** on a local port, with **nginx**
proxying the fqdn to that port and **certbot** handling TLS — the standard
lab980 shape. Data (SQLite) lives in `data/`; config in `.env`.

- Web root / app dir: `/var/www/playa`
- Default subdomain: `playa.lab980.com` (landing at `/`, beta at `/beta.html`)
- Local port: assigned by `provision-site` (next free 8060+), seeded into `.env`;
  `bin/playa` reads it from there (registry record: 8063), so the CLI, the
  process and the vhost agree without anyone hardcoding it
- Database: `data/playa.db` (SQLite, Prisma migrations in `prisma/migrations/`)

## 0. Secrets — fill in `.env` before first deploy

`provision-site` seeds `PORT`. Add the rest (copy from `.env.example`):

```bash
cd /var/www/playa
cp -n .env.example .env   # if not present
# then edit .env and set:
#   APP_URL=https://playa.lab980.com
#   SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
#   RESEND_API_KEY=re_...           # from resend.com (transactional email)
#   MAIL_FROM="Playa.Earth <noreply@your-verified-domain>"
#   ADMIN_EMAILS=you@example.com    # who can use /admin.html (moderation)
#   DONATE_URL=https://...          # optional external donation link
#   NODE_ENV=production
```

Moderation console lives at `https://playa.lab980.com/admin.html` — sign in with
an `ADMIN_EMAILS` address (magic link lands on the beta; return to `/admin.html`).

Magic-link email only sends when `NODE_ENV=production` **and** `RESEND_API_KEY`
is set; otherwise links are logged to the console (dev). `MAIL_FROM` must use a
domain verified in Resend.

## 1. Provision (once, on the droplet, as root)

```bash
# DNS A-record + /var/www/playa clone + nginx proxy vhost + TLS
provision-site playa ivjames/playa
```

`provision-site` picks a free local port (8060–8099), writes `/var/www/playa/.env`
with `PORT=<n>`, and generates an nginx vhost that proxies
`playa.lab980.com -> 127.0.0.1:<PORT>`. No nginx hand-editing needed — this app
is built to sit behind exactly that proxy vhost.

## 2. Deploy (once, after provision)

```bash
ln -sf /var/www/playa/bin/playa /usr/local/bin/playa
playa deploy                 # npm ci --omit=dev, migrate:deploy, build, first pm2 start, probe, save
cd /var/www/playa && npm run seed   # seeds regions + camps (idempotent; from committed seed-data.json)
```

`playa deploy` sees that nothing named `playa` is registered with pm2 and runs
the `pm2 start` in `START_CMD` at the top of `bin/playa`:
`server.js --name playa --max-memory-restart 150M`, with `NODE_ENV=production`
and `PORT` in the process environment — the same process
`ecosystem.config.js` describes (that file stays as the by-hand reference).
Every pm2 call the CLI makes is **scrubbed**: `env -i` plus `PATH`, `HOME`,
`LANG`, `PM2_HOME`/`TERM` if set, `PORT` (read from `.env`) and
`NODE_ENV=production`. pm2 copies the environment of the `pm2 start` call into
the process and into `~/.pm2/dump.pm2`, so nothing from the shell that ran
`deploy` reaches either; every secret (`SESSION_SECRET`, `RESEND_API_KEY`, …)
reaches the app from `.env` via `src/env.js`, and there is no box-level key
store. `NODE_ENV` is passed explicitly rather than trusted to `.env` because
`src/env.js` gives `process.env` precedence and magic-link mail only sends in
production. Don't `pm2 start` or `pm2 restart --update-env` by hand; use the
CLI.

`npm run seed` loads regions + camps **and** the curated member roster (51
synthetic profiles under `@seed.playa.earth`, so the pilot directory/map aren't
empty). It's idempotent (upserts). When real signups make the demo roster
unnecessary, purge just the synthetic members with `npm run seed:clear`
(regions/camps and real accounts are untouched). Regenerate `seed-data.json`
from the beta page with `npm run extract-seed`.

Confirm it's up:

```bash
curl -sI http://127.0.0.1:$(grep -E '^PORT=' .env | cut -d= -f2)/ | head -1   # 200 OK
curl -sI https://playa.lab980.com/ | head -1                                  # 200 OK
curl -sI https://playa.lab980.com/beta.html | head -1                         # 200 OK
```

## 3. Operate CLI

Symlink once, then drive the site from anywhere:

```bash
ln -sf /var/www/playa/bin/playa /usr/local/bin/playa

playa deploy [--no-build]   # sync to origin/main, npm ci --omit=dev, migrate:deploy, build, pm2 start/restart, probe, save
playa redeploy              # alias of deploy (the old name)
playa restart               # pm2 restart + probe
playa logs [-n N]           # tail this app's pm2 logs
playa status                # HEAD, pm2 state, .env key presence, local + public probe, cert days
playa backup                # SQLite snapshot + .env -> backup-playa-<ts>.tar.gz (gitignored, mode 600)
```

## 4. Redeploys

Land changes on `main` (via a PR — see the conventions file), then on the
droplet:

```bash
playa deploy
```

**How `deploy` syncs:** `git fetch` then `git reset --hard origin/main`. A
tracked file edited on the droplet is destroyed silently on the next deploy —
fix it in the repo. The gitignored state survives and is meant to be edited on
the box: `.env`, `data/`, `node_modules/`, `backup-*.tar.gz`.

`prisma migrate deploy` runs before the restart on every deploy (a no-op when
nothing is pending), so new code never meets an old schema. `deploy` exits
non-zero when nothing answers on `127.0.0.1:<PORT>/api/health` afterwards (up
to `PLAYA_PROBE_TRIES`, default 10, tries a second apart) — a dead app is a
failed deploy, and nothing is saved. `pm2 save` also only runs when every
registered pm2 process is online.

Overrides: `PLAYA_FQDN` (default `playa.lab980.com`), `PLAYA_BRANCH` (default
`main`), `PLAYA_PORT` (default: `PORT` from `.env`, else 8063),
`PLAYA_PROBE_TRIES` (default 10).

## Notes

- **Reboot survival** needs the pm2 boot hook installed once per droplet
  (see platform CLAUDE.md): `pm2 startup systemd -u root --hp /root`, run the
  line it prints, then `playa deploy` (which saves once the probe passes).
  Verify `systemctl is-enabled pm2-root`.
- The beta links in `index.html` point to a **relative** `beta.html`, so both
  pages live on the one `playa.lab980.com` host. To split the beta onto its own
  subdomain later (mirroring the intended `beta.playa.earth`), provision
  `beta.playa` as its own site and repoint those links.
- HTML is kept byte-for-byte as delivered; design tokens/CSS are untouched.
