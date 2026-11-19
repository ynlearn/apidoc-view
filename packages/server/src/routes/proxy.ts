import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/AppError.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { requireAdmin, requireView } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { clearHistory, deleteHistory, getHistory, insertHistory, listHistory } from '../db/repositories/history.js';
import { proxyRequest } from '../services/proxyService.js';
import { getMergedVariables } from '../db/repositories/globals.js';
import { interpolateRequest } from '../services/interpolate.js';

export const proxyRouter = Router();
export const historyRouter = Router();

const proxySchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  url: z.string().min(1, 'URL 不能为空'),
  headers: z.record(z.string()).optional(),
  query: z.record(z.string()).optional(),
  body: z.string().optional(),
  bodyType: z.enum(['none', 'json', 'form-data', 'raw']).optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
  followRedirects: z.boolean().optional(),
  urlTemplate: z.string().optional(),
  /** 是否在后端执行变量插值（前端默认已插值；后端兜底） */
  interpolate: z.boolean().optional(),
});

proxyRouter.post('/', requireView, validateBody(proxySchema), asyncHandler(async (req, res) => {
  const input = { ...(req.body as z.infer<typeof proxySchema>) };
  const unresolved: string[] = [];

  // 后端兜底插值：前端通常已完成，但保留此能力以便直接调用 API
  if (input.interpolate) {
    const merged = await getMergedVariables();
    const result = interpolateRequest(input as any, merged);
    Object.assign(input, result.dto);
    unresolved.push(...result.unresolved);
  }

  try {
    const result = await proxyRequest(input as any);
    // 记录成功历史
    await insertHistory({
      method: input.method,
      urlTemplate: input.urlTemplate,
      urlActual: result.finalUrl,
      requestHeaders: input.headers ?? {},
      requestBody: input.body,
      statusCode: result.status,
      durationMs: result.durationMs,
      responseSize: result.size,
      responsePreview: result.body,
    });
    res.json({ ...result, ...(unresolved.length ? { unresolved } : {}) });
  } catch (err: any) {
    // 记录失败历史
    await insertHistory({
      method: input.method,
      urlTemplate: input.urlTemplate,
      urlActual: input.url,
      requestHeaders: input.headers ?? {},
      requestBody: input.body,
      error: err?.message ?? String(err),
    });
    throw err;
  }
}));

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

historyRouter.get('/', requireAdmin, validateQuery(historyQuerySchema), asyncHandler(async (_req, res) => {
  const { limit, offset } = res.locals.query as { limit: number; offset: number };
  res.json(await listHistory(limit, offset));
}));

historyRouter.get('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const entry = await getHistory(req.params.id);
  if (!entry) throw new AppError(404, 'NOT_FOUND', '历史记录不存在');
  res.json(entry);
}));

historyRouter.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const ok = await deleteHistory(req.params.id);
  if (!ok) throw new AppError(404, 'NOT_FOUND', '历史记录不存在');
  res.status(204).end();
}));

historyRouter.delete('/', requireAdmin, asyncHandler(async (_req, res) => {
  await clearHistory();
  res.status(204).end();
}));
