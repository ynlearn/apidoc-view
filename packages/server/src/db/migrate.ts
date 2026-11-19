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
  `);
}
