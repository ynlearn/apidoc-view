import { db } from './index.js';

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_value TEXT,
      spec_version TEXT,
      raw_content TEXT NOT NULL,
      raw_format TEXT NOT NULL,
      normalized_json TEXT NOT NULL,
      operation_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);

    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      variables_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_environments_active ON environments(is_active);

    CREATE TABLE IF NOT EXISTS globals (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      url_template TEXT,
      url_actual TEXT NOT NULL,
      request_headers_json TEXT NOT NULL,
      request_body TEXT,
      status_code INTEGER,
      duration_ms INTEGER,
      response_size INTEGER,
      response_preview TEXT,
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);

    -- 分享链接：target_type=operation 时 operation_id 必填（method:PATH 格式）
    -- password_hash 为空表示无需口令；expires_at 为空表示永久有效
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      target_type TEXT NOT NULL,
      document_id TEXT NOT NULL,
      operation_id TEXT,
      title TEXT NOT NULL,
      password_hash TEXT,
      expires_at INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shares_document ON shares(document_id);
  `);
}
