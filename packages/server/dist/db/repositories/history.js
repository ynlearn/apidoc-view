import { randomUUID } from 'node:crypto';
import { config } from '../../config.js';
import { db } from '../index.js';
const SENSITIVE_HEADERS = /^(authorization|x-api-key|cookie|set-cookie|token|x-auth-token|proxy-authorization)$/i;
/** 对敏感请求头脱敏 */
export function sanitizeHeaders(headers) {
    const out = {};
    for (const [key, value] of Object.entries(headers ?? {})) {
        out[key] = SENSITIVE_HEADERS.test(key) ? '******' : value;
    }
    return out;
}
function truncate(value, limit) {
    if (value == null)
        return undefined;
    return value.length > limit ? value.slice(0, limit) + '\n…[已截断]' : value;
}
function toEntry(row) {
    let headers = {};
    try {
        headers = JSON.parse(row.request_headers_json);
    }
    catch {
        /* ignore */
    }
    return {
        id: row.id,
        method: row.method,
        urlTemplate: row.url_template ?? undefined,
        urlActual: row.url_actual,
        requestHeaders: headers,
        requestBody: row.request_body ?? undefined,
        statusCode: row.status_code ?? null,
        durationMs: row.duration_ms ?? null,
        responseSize: row.response_size ?? null,
        responsePreview: row.response_preview ?? undefined,
        error: row.error ?? undefined,
        createdAt: row.created_at,
    };
}
export function insertHistory(input) {
    const id = randomUUID();
    db.prepare(`INSERT INTO history
      (id, method, url_template, url_actual, request_headers_json, request_body,
       status_code, duration_ms, response_size, response_preview, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.method, input.urlTemplate ?? null, input.urlActual, JSON.stringify(sanitizeHeaders(input.requestHeaders)), truncate(input.requestBody, config.responsePreviewBytes) ?? null, input.statusCode ?? null, input.durationMs ?? null, input.responseSize ?? null, truncate(input.responsePreview, config.responsePreviewBytes) ?? null, input.error ?? null, Date.now());
    // 保留最近 N 条
    db.prepare(`DELETE FROM history WHERE id IN (
       SELECT id FROM history ORDER BY created_at DESC LIMIT -1 OFFSET ?
     )`).run(config.historyRetention);
    return id;
}
export function listHistory(limit = 50, offset = 0) {
    const total = db.prepare('SELECT COUNT(*) AS c FROM history').get().c;
    const rows = db
        .prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(limit, offset);
    return { total, items: rows.map(toEntry) };
}
export function getHistory(id) {
    const row = db.prepare('SELECT * FROM history WHERE id = ?').get(id);
    return row ? toEntry(row) : undefined;
}
export function deleteHistory(id) {
    return db.prepare('DELETE FROM history WHERE id = ?').run(id).changes > 0;
}
export function clearHistory() {
    db.prepare('DELETE FROM history').run();
}
//# sourceMappingURL=history.js.map