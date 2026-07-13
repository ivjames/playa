// pm2 process definition for playa (lab980 shape).
// Start:   pm2 start ecosystem.config.js && pm2 save
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
