import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { createApp } from './app.js';
migrate();
const app = createApp();
app.listen(config.port, config.host, () => {
    console.log(`[bluebull-cu] server listening on http://${config.host}:${config.port}`);
    console.log(`[bluebull-cu] db: ${config.dbPath}`);
    if (config.ssrfInternalAllowlist.length) {
        console.log(`[bluebull-cu] SSRF internal allowlist: ${config.ssrfInternalAllowlist.join(', ')}`);
    }
});
//# sourceMappingURL=index.js.map