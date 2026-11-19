import { db } from './index.js';

/**
 * 每条语句单独执行：
 * - mysql2 的 query 默认不开 multipleStatements，多条合并成一句会直接报错；
 * - mysql 不支持 CREATE INDEX IF NOT EXISTS，索引全部内联在建表语句里（表存在时整体跳过）。
 */

const SQLITE_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS documents (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC)`,

  `CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      variables_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_environments_active ON environments(is_active)`,

  `CREATE TABLE IF NOT EXISTS globals (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at INTEGER NOT NULL
    )`,

  `CREATE TABLE IF NOT EXISTS history (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC)`,

  // 分享链接：target_type=operation 时 operation_id 必填（method:PATH 格式）
  // password_hash 为空表示无需口令；expires_at 为空表示永久有效
  `CREATE TABLE IF NOT EXISTS shares (
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
    )`,
  `CREATE INDEX IF NOT EXISTS idx_shares_document ON shares(document_id)`,
];

const MYSQL_DDL: string[] = [
  // 大文本用 MEDIUMTEXT（16MB）：raw_content / normalized_json 可能远超 TEXT 的 64KB 上限
  // 索引列/主键列用 VARCHAR(255)，TEXT 不能做主键且唯一索引有长度限制
  `CREATE TABLE IF NOT EXISTS documents (
      id VARCHAR(255) PRIMARY KEY,
      title VARCHAR(512) NOT NULL,
      source_type VARCHAR(32) NOT NULL,
      source_value TEXT NULL,
      spec_version VARCHAR(64) NULL,
      raw_content MEDIUMTEXT NOT NULL,
      raw_format VARCHAR(16) NOT NULL,
      normalized_json MEDIUMTEXT NOT NULL,
      operation_count INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      KEY idx_documents_updated_at (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS environments (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      variables_json MEDIUMTEXT NOT NULL,
      is_active INT NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      KEY idx_environments_active (is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // key 是 MySQL 保留字，建表与查询都必须加反引号（查询侧见 globals 仓储的 ident()）
  `CREATE TABLE IF NOT EXISTS globals (
      \`key\` VARCHAR(255) PRIMARY KEY,
      value MEDIUMTEXT NOT NULL,
      description TEXT NULL,
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS history (
      id VARCHAR(255) PRIMARY KEY,
      method VARCHAR(16) NOT NULL,
      url_template TEXT NULL,
      url_actual TEXT NOT NULL,
      request_headers_json MEDIUMTEXT NOT NULL,
      request_body MEDIUMTEXT NULL,
      status_code INT NULL,
      duration_ms BIGINT NULL,
      response_size BIGINT NULL,
      response_preview MEDIUMTEXT NULL,
      error TEXT NULL,
      created_at BIGINT NOT NULL,
      KEY idx_history_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS shares (
      id VARCHAR(255) PRIMARY KEY,
      token VARCHAR(255) NOT NULL UNIQUE,
      target_type VARCHAR(32) NOT NULL,
      document_id VARCHAR(255) NOT NULL,
      operation_id TEXT NULL,
      title VARCHAR(512) NOT NULL,
      password_hash VARCHAR(255) NULL,
      expires_at BIGINT NULL,
      enabled INT NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      KEY idx_shares_document (document_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const PG_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_value TEXT,
      spec_version TEXT,
      raw_content TEXT NOT NULL,
      raw_format TEXT NOT NULL,
      normalized_json TEXT NOT NULL,
      operation_count INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC)`,

  `CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      variables_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_environments_active ON environments(is_active)`,

  `CREATE TABLE IF NOT EXISTS globals (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at BIGINT NOT NULL
    )`,

  `CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      method TEXT NOT NULL,
      url_template TEXT,
      url_actual TEXT NOT NULL,
      request_headers_json TEXT NOT NULL,
      request_body TEXT,
      status_code INTEGER,
      duration_ms BIGINT,
      response_size BIGINT,
      response_preview TEXT,
      error TEXT,
      created_at BIGINT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      target_type TEXT NOT NULL,
      document_id TEXT NOT NULL,
      operation_id TEXT,
      title TEXT NOT NULL,
      password_hash TEXT,
      expires_at BIGINT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )`,
  `CREATE INDEX IF NOT EXISTS idx_shares_document ON shares(document_id)`,
];

export async function migrate(): Promise<void> {
  const ddl = db.dialect === 'mysql' ? MYSQL_DDL : db.dialect === 'postgres' ? PG_DDL : SQLITE_DDL;
  for (const stmt of ddl) {
    await db.exec(stmt);
  }
}
