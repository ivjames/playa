# Deploying playa (Playa.Earth) to lab980

`playa` is a **static site** — a landing page (`public/index.html`) and a beta
map/directory (`public/beta.html`, self-contained, pulls Leaflet/d3/Esri tiles
from CDNs at runtime). It's served by a tiny zero-dependency Node static server
(`server.js`) on a local port, managed by **pm2**, with **nginx** proxying the
fqdn to that port and **certbot** handling TLS — the standard lab980 shape.

- Web root / app dir: `/var/www/playa`
- Default subdomain: `playa.lab980.com` (landing at `/`, beta at `/beta.html`)
- Local port: assigned by `provision-site` (next free 8060+), seeded into `.env`

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
npm ci --omit=dev        # no runtime deps; just validates
npm run build            # sanity-checks the static assets exist
pm2 start ecosystem.config.js
pm2 save
```

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
