import type { RequestHandler } from 'express';
import type { AuthRole } from '@openapi-view/shared';
import { AppError } from './AppError.js';
import { isViewGateEnabled, verifyToken } from '../services/authService.js';

/** 从请求头取 token：标准 Authorization: Bearer <token>，兼容 x-auth-token */
function readToken(req: Parameters<RequestHandler>[0]): string | null {
  const header = req.get('authorization');
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1].trim() : null;
  }
  const raw = req.get('x-auth-token');
  return raw?.trim() || null;
}

export function readRole(req: Parameters<RequestHandler>[0]): AuthRole | null {
  return verifyToken(readToken(req))?.role ?? null;
}

/** 管理接口：必须携带有效管理员 token */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  const role = readRole(req);
  if (role !== 'admin') {
    next(new AppError(401, 'UNAUTHORIZED', '需要管理员登录'));
    return;
  }
  next();
};

/**
 * 浏览接口：未配置 VIEW_PASSWORD 时完全开放；
 * 配置后需携带浏览 token（管理员 token 视为超集，同样放行）。
 */
export const requireView: RequestHandler = (req, _res, next) => {
  if (!isViewGateEnabled()) {
    next();
    return;
  }
  const role = readRole(req);
  if (role !== 'admin' && role !== 'view') {
    next(new AppError(401, 'UNAUTHORIZED', '需要访问口令'));
    return;
  }
  next();
};
