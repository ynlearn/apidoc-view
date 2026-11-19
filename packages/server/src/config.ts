import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src -> packages/server -> 项目根
const projectRoot = path.resolve(__dirname, '../../..');

/**
 * 优先加载项目根目录的 .env（Node 20.12+ 内置能力，不引 dotenv）。
 * loadEnvFile 不覆盖已存在的环境变量——线上用环境变量注入密码时，不会被仓库里的 .env 顶掉。
 * 没有 .env 文件是正常情况（纯环境变量部署），忽略异常即可。
 */
try {
  process.loadEnvFile(path.join(projectRoot, '.env'));
} catch {
  /* 无 .env，走纯环境变量 */
}

function parseHosts(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parsePorts(value: string | undefined): number[] {
  if (!value) return [22, 23, 25, 3306, 6379, 27017, 11211];
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

  // 鉴权
  /** 管理端登录账号 */
  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  /** 管理端登录密码；未设置时启动时生成随机密码并落盘 data/.admin-password */
  adminPassword: process.env.ADMIN_PASSWORD,
  /** 浏览端访问口令；未设置则浏览端完全开放 */
  viewPassword: process.env.VIEW_PASSWORD,
  /** token 签名密钥；未设置时生成随机密钥并落盘 data/.auth-secret */
  authSecret: process.env.AUTH_SECRET,
  /** 登录态有效期（小时） */
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),

  // 静态托管（生产环境）
  webDistPath: path.join(projectRoot, 'packages', 'web', 'dist'),
};
