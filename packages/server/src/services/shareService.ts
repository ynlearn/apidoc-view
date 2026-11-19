import crypto from 'node:crypto';
import type { ShareRecord } from '../db/repositories/shares.js';
import { signPayload, verifySignedPayload } from './authService.js';

/**
 * 口令验证通过后签发的分享访问凭据。
 * 有效期 2 小时，避免用户在分享页每翻一次都重新输口令；过期只需重输，无状态可实现。
 */
const ACCESS_TTL_MS = 2 * 3600_000;

export function generateShareToken(): string {
  // 16 字节 → 22 字符 base64url，足够抗枚举，也不至于让链接长得没法看
  return crypto.randomBytes(16).toString('base64url');
}

/** scrypt 加盐哈希：分享口令也是口令，不存明文 */
export function hashSharePassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 32);
  return `${salt.toString('base64url')}:${derived.toString('base64url')}`;
}

export function verifySharePassword(password: string, stored: string): boolean {
  const [saltPart, hashPart] = stored.split(':');
  if (!saltPart || !hashPart) return false;
  const salt = Buffer.from(saltPart, 'base64url');
  const expected = Buffer.from(hashPart, 'base64url');
  if (!expected.length) return false;
  const derived = crypto.scryptSync(password, salt, expected.length);
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

export type ShareAvailability = 'ok' | 'expired' | 'disabled' | 'not_found';

export function evaluateShare(record: ShareRecord): ShareAvailability {
  if (!record.enabled) return 'disabled';
  if (record.expiresAt && record.expiresAt <= Date.now()) return 'expired';
  return 'ok';
}

export function issueShareAccessToken(shareId: string): { accessToken: string; expiresAt: number } {
  const expiresAt = Date.now() + ACCESS_TTL_MS;
  return { accessToken: signPayload({ s: shareId, e: expiresAt }), expiresAt };
}

export function verifyShareAccessToken(token: string | null | undefined): string | null {
  const data = verifySignedPayload<{ s?: string }>(token);
  return typeof data?.s === 'string' ? data.s : null;
}
