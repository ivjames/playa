# playa — Playa.Earth

Static site for **Playa.Earth**: a privacy-first landing page plus a live beta
map/directory for finding Burners, camps, and regional crews year-round.

- `public/index.html` — landing page
- `public/beta.html` — beta map + directory (self-contained; Leaflet/d3/Esri via CDN)
- `server.js` — zero-dependency static server (serves `public/` only)

## Run locally

```bash
npm start           # http://127.0.0.1:8060  (PORT overridable via env or .env)
```

## Deploy

Served on the lab980 droplet the standard way (pm2 + nginx + certbot).
Default subdomain: `playa.lab980.com`. See [DEPLOY.md](DEPLOY.md).
