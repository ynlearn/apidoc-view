import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { createApp } from './app.js';

migrate();

const app = createApp();

app.listen(config.port, config.host, () => {
  console.log(`[apidoc-view] server listening on http://${config.host}:${config.port}`);
  console.log(`[apidoc-view] db: ${config.dbPath}`);
  if (config.ssrfInternalAllowlist.length) {
    console.log(`[apidoc-view] SSRF internal allowlist: ${config.ssrfInternalAllowlist.join(', ')}`);
  }
});
