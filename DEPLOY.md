# Deploying playa (Playa.Earth) to lab980

`playa` is a **Node app** (Express + Prisma/SQLite). It serves the static site
— landing (`public/index.html`) and beta app shell (`public/beta.html`) — plus
a JSON API at `/api/*`. Managed by **pm2** on a local port, with **nginx**
proxying the fqdn to that port and **certbot** handling TLS — the standard
lab980 shape. Data (SQLite) lives in `data/`; config in `.env`.

- Web root / app dir: `/var/www/playa`
- Default subdomain: `playa.lab980.com` (landing at `/`, beta at `/beta.html`)
- Local port: assigned by `provision-site` (next free 8060+), seeded into `.env`
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
cd /var/www/playa
npm ci --omit=dev            # installs deps (incl. prisma)
npm run migrate:deploy       # applies prisma/migrations to data/playa.db
npm run seed                 # seeds regions + camps (idempotent; from committed seed-data.json)
npm run build                # prisma generate + static-asset check
pm2 start ecosystem.config.js
pm2 save
```

Re-run `npm run seed` only when `prisma/seed-data.json` changes (regenerate it
from the beta page with `npm run extract-seed`). It never touches member data.

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

playa redeploy    # git pull -> npm ci -> build -> pm2 restart -> pm2 save
playa restart
playa logs
playa status
playa backup      # tars public/ + .env
```

## 4. Redeploys

Land changes on `main`, then on the droplet:

```bash
playa redeploy
```

## Notes

- **Reboot survival** needs the pm2 boot hook installed once per droplet
  (see platform CLAUDE.md): `pm2 startup systemd -u root --hp /root`, run the
  line it prints, then `pm2 save`. Verify `systemctl is-enabled pm2-root`.
- The beta links in `index.html` point to a **relative** `beta.html`, so both
  pages live on the one `playa.lab980.com` host. To split the beta onto its own
  subdomain later (mirroring the intended `beta.playa.earth`), provision
  `beta.playa` as its own site and repoint those links.
- HTML is kept byte-for-byte as delivered; design tokens/CSS are untouched.
