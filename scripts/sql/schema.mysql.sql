-- =====================================================================
-- apidoc-view · MySQL 建表脚本
-- 与 packages/server/src/db/migrate.ts 的 MYSQL_DDL 同源（逐字一致）。
-- 用途：DBA 预审 / 应用账号无 DDL 权限时预先建表。
-- 说明：服务启动也会自动幂等建表（CREATE TABLE IF NOT EXISTS），
--       本脚本是可选的手动路径；两边结构一致时启动不会改任何东西。
--       修改 migrate.ts 的 DDL 时必须同步修改本文件。
-- =====================================================================

-- ---------- 第 0 步：建库与账号（DBA 执行，按环境调整名称/密码） ----------
-- 库必须用 utf8mb4：normalized_json 要存 emoji/特殊字符，utf8 会写坏数据。
-- CREATE DATABASE apidoc_view CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE USER 'apidoc'@'%' IDENTIFIED BY 'changeme';
--
-- 方式 A：应用账号自行建表（不跑本脚本时）
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON apidoc_view.* TO 'apidoc'@'%';
--
-- 方式 B：DBA 先跑本脚本建表，应用账号只给 DML（最小权限，推荐）
-- GRANT SELECT, INSERT, UPDATE, DELETE ON apidoc_view.* TO 'apidoc'@'%';
-- FLUSH PRIVILEGES;

-- ---------- 第 1 步：建表（在 apidoc_view 库内执行） ----------
-- USE apidoc_view;

-- 大文本用 MEDIUMTEXT（16MB）：raw_content / normalized_json 可能远超 TEXT 的 64KB 上限
-- 索引列/主键列用 VARCHAR(255)，TEXT 不能做主键且唯一索引有长度限制
CREATE TABLE IF NOT EXISTS documents (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS environments (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    variables_json MEDIUMTEXT NOT NULL,
    is_active INT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    KEY idx_environments_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- key 是 MySQL 保留字，建表与查询都必须加反引号（查询侧见 globals 仓储的 ident()）
CREATE TABLE IF NOT EXISTS globals (
    `key` VARCHAR(255) PRIMARY KEY,
    value MEDIUMTEXT NOT NULL,
    description TEXT NULL,
    updated_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS history (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shares (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
