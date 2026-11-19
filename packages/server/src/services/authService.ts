import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AuthRole } from '@openapi-view/shared';
import { config } from '../config.js';

/**
 * 无状态签名 token：`base64url(payload).base64url(hmac)`
 * payload = { r: 角色, e: 过期时间戳 }
 * 不引入 JWT 库——只为签发和校验自己发的 token，用 node:crypto 就够，少一个依赖少一个洞。
 */

const DATA_DIR = path.dirname(config.dbPath);

/** 读文件型密钥；不存在则生成并落盘，重启后登录态不失效 */
function loadOrCreateSecret(fileName: string, generate: () => string): { value: string; created: boolean } {
  const file = path.join(DATA_DIR, fileName);
  if (fs.existsSync(file)) {
    const value = fs.readFileSync(file, 'utf8').trim();
    if (value) return { value, created: false };
  }
  const value = generate();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, value, { mode: 0o600 });
  return { value, created: true };
}

let signingSecret: string | null = null;
function getSecret(): string {
  if (signingSecret) return signingSecret;
  if (config.authSecret) {
    signingSecret = config.authSecret;
    return signingSecret;
  }
  const { value } = loadOrCreateSecret('.auth-secret', () => crypto.randomBytes(32).toString('hex'));
  signingSecret = value;
  return signingSecret;
}

let adminPasswordCache: string | null = null;
/** 解析管理端密码：优先环境变量，否则用落盘的随机密码（首次启动生成） */
export function getAdminPassword(): string {
  if (adminPasswordCache) return adminPasswordCache;
  if (config.adminPassword) {
    adminPasswordCache = config.adminPassword;
    return adminPasswordCache;
  }
  const { value, created } = loadOrCreateSecret('.admin-password', () =>
    crypto.randomBytes(9).toString('base64url'),
  );
  adminPasswordCache = value;
  if (created) {
    console.warn(
      `[auth] 未设置 ADMIN_PASSWORD，已生成随机管理密码：${value}\n` +
        `[auth] 已写入 ${path.join(DATA_DIR, '.admin-password')}；生产环境请改用 ADMIN_PASSWORD 环境变量`,
    );
  }
  return adminPasswordCache;
}

/** 浏览端口令门：只有配置了 VIEW_PASSWORD 才需要验证 */
export function isViewGateEnabled(): boolean {
  return Boolean(config.viewPassword);
}

/** 恒定时间字符串比较，避免通过响应耗时逐位爆破 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // 长度不同直接 false，但仍走一次等价比较，避免长度信息泄漏过于明显
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function issueToken(role: AuthRole): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + config.sessionTtlHours * 3600_000;
  const payload = Buffer.from(JSON.stringify({ r: role, e: expiresAt })).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, expiresAt };
}

export function verifyToken(token: string | null | undefined): { role: AuthRole; expiresAt: number } | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      r?: AuthRole;
      e?: number;
    };
    if (data.r !== 'admin' && data.r !== 'view') return null;
    if (typeof data.e !== 'number' || data.e <= Date.now()) return null;
    return { role: data.r, expiresAt: data.e };
  } catch {
    return null;
  }
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  // 两个比较都执行，避免通过短路判断区分"账号错"与"密码错"
  const userOk = safeEqual(username, config.adminUsername);
  const passOk = safeEqual(password, getAdminPassword());
  return userOk && passOk;
}

export function verifyViewPassword(password: string): boolean {
  if (!config.viewPassword) return false;
  return safeEqual(password, config.viewPassword);
}

// ---------- 登录失败限流：内存级，够挡住脚本爆破；多实例部署请换 Redis ----------

const WINDOW_MS = 10 * 60_000;
const MAX_FAILURES = 8;
const failures = new Map<string, { count: number; firstAt: number }>();

export function isLoginBlocked(key: string): boolean {
  const record = failures.get(key);
  if (!record) return false;
  if (Date.now() - record.firstAt > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return record.count >= MAX_FAILURES;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const record = failures.get(key);
  if (!record || now - record.firstAt > WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: now });
    return;
  }
  record.count += 1;
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}
