-- =====================================================================
-- apidoc-view · PostgreSQL 建表脚本
-- 与 packages/server/src/db/migrate.ts 的 PG_DDL 同源（逐字一致）。
-- 用途：DBA 预审 / 应用账号无 DDL 权限时预先建表。
-- 说明：服务启动也会自动幂等建表（CREATE TABLE IF NOT EXISTS），
--       本脚本是可选的手动路径；两边结构一致时启动不会改任何东西。
--       修改 migrate.ts 的 DDL 时必须同步修改本文件。
-- =====================================================================

-- ---------- 第 0 步：建库与账号（DBA 执行，按环境调整名称/密码） ----------
-- 时间戳列统一 BIGINT（Unix 毫秒），JSON 以 TEXT 存储——应用层负责序列化，
-- 跨方言数据模型一致，建库用默认 UTF8 编码即可。
-- CREATE DATABASE apidoc_view ENCODING 'UTF8';
-- CREATE USER apidoc WITH PASSWORD 'changeme';
--
-- 方式 A：应用账号自行建表（不跑本脚本时）
-- GRANT CONNECT ON DATABASE apidoc_view TO apidoc;
-- GRANT CREATE, USAGE ON SCHEMA public TO apidoc;
--
-- 方式 B：DBA 先跑本脚本建表，应用账号只给 DML（最小权限，推荐）
-- GRANT CONNECT ON DATABASE apidoc_view TO apidoc;
-- GRANT USAGE ON SCHEMA public TO apidoc;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO apidoc;
-- FLUSH PRIVILEGES 无需；PG 授权即时生效

-- ---------- 第 1 步：建表（连接到 apidoc_view 库执行） ----------

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
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);

CREATE TABLE IF NOT EXISTS environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    variables_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_environments_active ON environments(is_active);

-- key 在 PostgreSQL 中不是保留字，可直接作列名（与 migrate.ts 的 PG_DDL 保持一致，不加引号）
CREATE TABLE IF NOT EXISTS globals (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS history (
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
);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON history(created_at DESC);

CREATE TABLE IF NOT EXISTS shares (
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
);
CREATE INDEX IF NOT EXISTS idx_shares_document ON shares(document_id);
