import { randomUUID } from 'node:crypto';
import type { HistoryEntry } from '@openapi-view/shared';
import { config } from '../../config.js';
import { db } from '../index.js';

type Row = Record<string, any>;

const SENSITIVE_HEADERS = /^(authorization|x-api-key|cookie|set-cookie|token|x-auth-token|proxy-authorization)$/i;

/** 对敏感请求头脱敏 */
export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    out[key] = SENSITIVE_HEADERS.test(key) ? '******' : value;
  }
  return out;
}

function truncate(value: string | undefined, limit: number): string | undefined {
  if (value == null) return undefined;
  return value.length > limit ? value.slice(0, limit) + '\n…[已截断]' : value;
}

function toEntry(row: Row): HistoryEntry {
  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(row.request_headers_json);
  } catch {
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

export interface InsertHistoryInput {
  method: string;
  urlTemplate?: string;
  urlActual: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  statusCode?: number | null;
  durationMs?: number | null;
  responseSize?: number | null;
  responsePreview?: string;
  error?: string;
}

export function insertHistory(input: InsertHistoryInput): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO history
      (id, method, url_template, url_actual, request_headers_json, request_body,
       status_code, duration_ms, response_size, response_preview, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.method,
    input.urlTemplate ?? null,
    input.urlActual,
    JSON.stringify(sanitizeHeaders(input.requestHeaders)),
    truncate(input.requestBody, config.responsePreviewBytes) ?? null,
    input.statusCode ?? null,
    input.durationMs ?? null,
    input.responseSize ?? null,
    truncate(input.responsePreview, config.responsePreviewBytes) ?? null,
    input.error ?? null,
    Date.now(),
  );

  // 保留最近 N 条
  db.prepare(
    `DELETE FROM history WHERE id IN (
       SELECT id FROM history ORDER BY created_at DESC LIMIT -1 OFFSET ?
     )`,
  ).run(config.historyRetention);
  return id;
}

export function listHistory(limit = 50, offset = 0): { total: number; items: HistoryEntry[] } {
  const total = (db.prepare('SELECT COUNT(*) AS c FROM history').get() as Row).c;
  const rows = db
    .prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as Row[];
  return { total, items: rows.map(toEntry) };
}

export function getHistory(id: string): HistoryEntry | undefined {
  const row = db.prepare('SELECT * FROM history WHERE id = ?').get(id) as Row | undefined;
  return row ? toEntry(row) : undefined;
}

export function deleteHistory(id: string): boolean {
  return db.prepare('DELETE FROM history WHERE id = ?').run(id).changes > 0;
}

export function clearHistory(): void {
  db.prepare('DELETE FROM history').run();
}
