import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src -> packages/server -> 项目根
const projectRoot = path.resolve(__dirname, '../../..');
function parseHosts(value) {
    if (!value)
        return [];
    return value
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}
function parsePorts(value) {
    if (!value)
        return [22, 23, 25, 3306, 6379, 27017, 11211];
    return value
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0 && n <= 65535);
}
export const config = {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    dbPath: process.env.DB_PATH ?? path.join(projectRoot, 'data', 'app.db'),
    projectRoot,
    // 代理与 SSRF
    maxResponseBytes: Number(process.env.MAX_RESPONSE_BYTES ?? 10 * 1024 * 1024),
    maxImportBytes: Number(process.env.MAX_IMPORT_BYTES ?? 5 * 1024 * 1024),
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000),
    maxTimeoutMs: 60_000,
    connectTimeoutMs: 10_000,
    headersTimeoutMs: 15_000,
    bodyTimeoutMs: 20_000,
    maxRedirects: 5,
    blockedPorts: parsePorts(process.env.BLOCKED_PORTS),
    /** 内网例外白名单：精确 host，豁免内网网段拦截 */
    ssrfInternalAllowlist: parseHosts(process.env.SSRF_INTERNAL_ALLOWLIST),
    /** 若设置，则除黑名单外仅允许这些 host（支持 *.example.com） */
    allowedHosts: parseHosts(process.env.ALLOWED_HOSTS),
    // 历史
    historyRetention: Number(process.env.HISTORY_RETENTION ?? 200),
    responsePreviewBytes: Number(process.env.RESPONSE_PREVIEW_BYTES ?? 4096),
    // 静态托管（生产环境）
    webDistPath: path.join(projectRoot, 'packages', 'web', 'dist'),
};
//# sourceMappingURL=config.js.map