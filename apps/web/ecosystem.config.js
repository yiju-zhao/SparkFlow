// PM2 process definition for the SparkFlow web app.
// Usage on the server:
//   cd apps/web && pm2 start ecosystem.config.js && pm2 save
// After code updates:
//   pm2 restart sparkflow-web
//
// Override PORT via env: `PORT=3001 pm2 restart sparkflow-web --update-env`.

/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "sparkflow-web",
      cwd: __dirname,
      script: "npm",
      args: `run start -- --port ${process.env.PORT || 3003}`,
      node_args: "--disable-warning=UNDICI-EHPA",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "1G",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--disable-warning=UNDICI-EHPA",
      },
      error_file: path.join(__dirname, ".pm2-logs", "err.log"),
      out_file: path.join(__dirname, ".pm2-logs", "out.log"),
      merge_logs: true,
      time: true,
    },
  ],
};
