import { Router, type Request } from 'express';
import { z } from 'zod';
import type { ShareContent, ShareMeta, ShareTargetType } from '@openapi-view/shared';
import { AppError } from '../middleware/AppError.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAdmin } from '../middleware/auth.js';
import { getDocument } from '../db/repositories/documents.js';
import {
  deleteShare,
  getShareById,
  getShareByToken,
  insertShare,
  listShares,
  updateShare,
  type ShareRecord,
} from '../db/repositories/shares.js';
import {
  evaluateShare,
  generateShareToken,
  hashSharePassword,
  issueShareAccessToken,
  verifyShareAccessToken,
  verifySharePassword,
} from '../services/shareService.js';
import { clearLoginFailures, isLoginBlocked, recordLoginFailure } from '../services/authService.js';
import { parseAndNormalize } from '../services/openapiService.js';
import { findOperation } from '../services/operationService.js';

export const sharesRouter = Router();

const createShareSchema = z.object({
  targetType: z.enum(['document', 'operation']),
  documentId: z.string().min(1, '缺少文档 ID'),
  operationId: z.string().optional(),
  title: z.string().optional(),
  password: z.string().optional(),
  expiresInDays: z.number().int().min(0).max(3650).optional(),
});

const updateShareSchema = z.object({
  title: z.string().optional(),
  /** 传 null 清除口令，传字符串重设 */
  password: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  /** 传 null 改为永久 */
  expiresInDays: z.number().int().min(0).max(3650).nullable().optional(),
});

function expiresAtFromDays(days: number | null | undefined): number | null {
  if (days === null) return null;
  if (!days || days <= 0) return null;
  return Date.now() + days * 86_400_000;
}

/** 分享默认标题：接口取「方法 路径 - 摘要」，文档取文档标题 */
function defaultTitle(documentTitle: string, targetType: ShareTargetType, draft?: { method: string; path: string; summary?: string }): string {
  if (targetType === 'operation' && draft) {
    return draft.summary ? `${draft.summary} (${draft.method} ${draft.path})` : `${draft.method} ${draft.path}`;
  }
  return documentTitle;
}

// ---------- 管理端（需管理员登录） ----------

sharesRouter.get('/', requireAdmin, asyncHandler(async (req, res) => {
  const documentId = typeof req.query.documentId === 'string' ? req.query.documentId : undefined;
  res.json(await listShares(documentId));
}));

sharesRouter.post('/', requireAdmin, validateBody(createShareSchema), asyncHandler(async (req, res) => {
  const dto = req.body as z.infer<typeof createShareSchema>;
  const doc = await getDocument(dto.documentId);
  if (!doc) throw new AppError(404, 'NOT_FOUND', '文档不存在');

  let title = dto.title?.trim();
  if (dto.targetType === 'operation') {
    if (!dto.operationId) throw new AppError(400, 'MISSING_OPERATION', '分享单个接口时必须指定接口');
    const found = findOperation(doc.normalized, dto.operationId);
    if (!found) throw new AppError(404, 'OPERATION_NOT_FOUND', '接口不存在');
    title = title || defaultTitle(doc.title, 'operation', found.operation);
  } else {
    title = title || defaultTitle(doc.title, 'document');
  }

  const id = await insertShare({
    token: generateShareToken(),
    targetType: dto.targetType,
    documentId: dto.documentId,
    operationId: dto.targetType === 'operation' ? dto.operationId : undefined,
    title: title ?? doc.title,
    passwordHash: dto.password?.trim() ? hashSharePassword(dto.password.trim()) : undefined,
    expiresAt: expiresAtFromDays(dto.expiresInDays) ?? undefined,
  });
  const created = (await getShareById(id))!;
  res.status(201).json({
    id,
    token: created.token,
    targetType: created.targetType,
    documentId: created.documentId,
    documentTitle: doc.title,
    operationId: created.operationId,
    title: created.title,
    hasPassword: Boolean(created.passwordHash),
    expiresAt: created.expiresAt,
    enabled: created.enabled,
    createdAt: created.createdAt,
  });
}));

sharesRouter.patch('/:id', requireAdmin, validateBody(updateShareSchema), asyncHandler(async (req, res) => {
  const dto = req.body as z.infer<typeof updateShareSchema>;
  const existing = await getShareById(req.params.id);
  if (!existing) throw new AppError(404, 'NOT_FOUND', '分享不存在');

  const patch: Parameters<typeof updateShare>[1] = {};
  if (dto.title !== undefined) patch.title = dto.title.trim() || existing.title;
  if (dto.password !== undefined) {
    patch.passwordHash = dto.password && dto.password.trim() ? hashSharePassword(dto.password.trim()) : null;
  }
  if (dto.enabled !== undefined) patch.enabled = dto.enabled;
  if (dto.expiresInDays !== undefined) patch.expiresAt = expiresAtFromDays(dto.expiresInDays);

  await updateShare(existing.id, patch);
  res.json((await listShares(existing.documentId)).find((s) => s.id === existing.id));
}));

sharesRouter.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  if (!(await deleteShare(req.params.id))) throw new AppError(404, 'NOT_FOUND', '分享不存在');
  res.status(204).end();
}));

// ---------- 公开访问（无需登录，凭 token） ----------

async function loadUsableShare(token: string): Promise<ShareRecord> {
  const record = await getShareByToken(token);
  if (!record) throw new AppError(404, 'SHARE_NOT_FOUND', '分享链接不存在或已被删除');
  const availability = evaluateShare(record);
  if (availability === 'disabled') throw new AppError(410, 'SHARE_DISABLED', '分享已停用');
  if (availability === 'expired') throw new AppError(410, 'SHARE_EXPIRED', '分享已过期');
  return record;
}

sharesRouter.get('/:token/meta', asyncHandler(async (req, res) => {
  const record = await getShareByToken(req.params.token);
  if (!record) {
    const body: ShareMeta = {
      title: '链接无效',
      targetType: 'document',
      documentTitle: '',
      needPassword: false,
      unavailable: true,
      unavailableReason: 'not_found',
    };
    res.json(body);
    return;
  }
  const availability = evaluateShare(record);
  const body: ShareMeta = {
    title: record.title,
    targetType: record.targetType,
    documentTitle: (await getDocument(record.documentId))?.title ?? '',
    needPassword: Boolean(record.passwordHash),
    unavailable: availability !== 'ok',
    unavailableReason: availability === 'ok' ? undefined : availability,
  };
  res.json(body);
}));

sharesRouter.post('/:token/unlock', validateBody(z.object({ password: z.string().optional() })), asyncHandler(async (req, res) => {
  const record = await loadUsableShare(req.params.token);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (record.passwordHash) {
    const throttleKey = `share:${record.id}:${req.ip ?? 'unknown'}`;
    if (isLoginBlocked(throttleKey)) {
      throw new AppError(429, 'TOO_MANY_ATTEMPTS', '尝试过于频繁，请 10 分钟后再试');
    }
    if (!password || !verifySharePassword(password, record.passwordHash)) {
      recordLoginFailure(throttleKey);
      throw new AppError(401, 'INVALID_SHARE_PASSWORD', '访问口令错误');
    }
    clearLoginFailures(throttleKey);
  }

  res.json(issueShareAccessToken(record.id));
}));

function readShareToken(req: Request): string | null {
  const header = req.get('authorization');
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match) return match[1].trim();
  }
  return req.get('x-share-token')?.trim() || null;
}

sharesRouter.get('/:token/content', asyncHandler(async (req, res) => {
  const record = await loadUsableShare(req.params.token);

  if (record.passwordHash) {
    const shareId = verifyShareAccessToken(readShareToken(req));
    if (shareId !== record.id) {
      throw new AppError(401, 'SHARE_LOCKED', '需要先输入访问口令');
    }
  }

  const doc = await getDocument(record.documentId);
  if (!doc) throw new AppError(404, 'SHARE_NOT_FOUND', '分享的文档已被删除');

  let normalized = doc.normalized;
  if (doc.rawFormat !== 'markdown') {
    try {
      normalized = await parseAndNormalize(doc.rawContent, doc.rawFormat === 'yaml' ? 'yaml' : 'json');
    } catch {
      /* 解析失败回退存储值，分享页至少能看 */
    }
  }

  const base = {
    title: record.title,
    targetType: record.targetType,
    documentTitle: doc.title,
    needPassword: Boolean(record.passwordHash),
    unavailable: false,
    rawFormat: doc.rawFormat,
    servers: normalized.servers,
  };

  if (record.targetType === 'operation') {
    // 单接口分享只回该接口，不把同文档其他接口一起吐出去
    const found = record.operationId ? findOperation(normalized, record.operationId) : null;
    if (!found) throw new AppError(404, 'OPERATION_NOT_FOUND', '分享的接口已不存在');
    const body: ShareContent = {
      ...base,
      operation: found.operation,
      groupName: normalized.groups[found.groupIndex]?.name,
    };
    res.json(body);
    return;
  }

  if (doc.rawFormat === 'markdown') {
    const body: ShareContent = { ...base, markdown: doc.rawContent };
    res.json(body);
    return;
  }

  const body: ShareContent = { ...base, document: normalized };
  res.json(body);
}));
