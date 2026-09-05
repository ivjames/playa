// pm2 process definition for playa (lab980 shape) — the by-hand reference.
// The operate CLI (bin/playa) registers the same process from its START_CMD
// on a first deploy, with NODE_ENV=production and PORT in a scrubbed env;
// prefer `playa deploy` over `pm2 start ecosystem.config.js`.
// PORT is read from ./.env by server.js (provision-site seeds it).
module.exports = {
  apps: [
    {
      name: 'playa',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '150M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
