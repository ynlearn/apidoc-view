import { Router } from 'express';
import { z } from 'zod';
import YAML from 'yaml';
import type { CreateDocumentDto, DocumentDetail, DocumentFormat, NormalizedDocument, OperationDraft } from '@openapi-view/shared';
import { AppError } from '../middleware/AppError.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAdmin, requireView } from '../middleware/auth.js';
import {
  getDocument,
  insertDocument,
  listDocuments,
  deleteDocument,
  replaceDocumentContent,
} from '../db/repositories/documents.js';
import { deleteSharesByDocument } from '../db/repositories/shares.js';
import { parseAndNormalize, normalizedToOpenApi } from '../services/openapiService.js';
import {
  addOperation,
  decodeOperationKey,
  regroupAllOperations,
  removeOperation,
  updateOperation,
} from '../services/operationService.js';
import { normalizeMarkdown } from '../services/markdownService.js';
import { config } from '../config.js';
import { proxyRequest } from '../services/proxyService.js';

export const documentsRouter = Router();

const createSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1, '文档内容不能为空'),
  format: z.enum(['json', 'yaml', 'markdown']),
  sourceType: z.enum(['paste', 'file', 'url']),
  sourceValue: z.string().optional(),
  targetGroup: z.string().optional(),
});

const importUrlSchema = z.object({
  url: z.string().url('请输入有效的 URL'),
});

async function createFromContent(dto: CreateDocumentDto) {
  if (Buffer.byteLength(dto.content, 'utf8') > config.maxImportBytes) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', '文档内容超过大小限制');
  }
  // URL 导入内容也需经过 SSRF：在 import-url 路由中已校验，这里只解析
  let normalized =
    dto.format === 'markdown'
      ? normalizeMarkdown(dto.content, dto.title)
      : await parseAndNormalize(dto.content, dto.format);

  let rawContent = dto.content;
  let rawFormat: DocumentFormat = dto.format;
  const targetGroup = dto.targetGroup?.trim();
  if (targetGroup && dto.format !== 'markdown') {
    // 归组也要回写原文：GET /documents/:id 会拿原文本重新归一化，不回写分组会被冲掉
    normalized = regroupAllOperations(normalized, targetGroup);
    rawContent = JSON.stringify(normalizedToOpenApi(normalized), null, 2);
    rawFormat = 'json';
  }

  const id = insertDocument({
    title: dto.title?.trim() || normalized.title,
    sourceType: dto.sourceType,
    sourceValue: dto.sourceValue,
    specVersion: undefined,
    rawContent,
    rawFormat,
    normalized,
  });
  return { id };
}

documentsRouter.get('/', requireView, (_req, res) => {
  res.json(listDocuments());
});

/**
 * 供导入对话框选择「归属分组」：汇总现有文档里的所有分组名。
 * 必须定义在 /:id 之前，否则会被当成文档 id 匹配掉。
 */
documentsRouter.get('/groups', requireView, (_req, res) => {
  const names = new Set<string>();
  for (const summary of listDocuments()) {
    const detail = getDocument(summary.id);
    for (const group of detail?.normalized.groups ?? []) names.add(group.name);
  }
  res.json([...names].sort());
});

documentsRouter.get('/:id', requireView, asyncHandler(async (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc) throw new AppError(404, 'NOT_FOUND', '文档不存在');
  // 读取时用原始内容实时重新归一化：
  // 1) 旧版本导入的存量文档自动获得新解析器的修复（如 $ref 百分号编码解码）
  // 2) 解析失败时回退已存储的归一化结果，保证接口可用
  // Markdown 不需要重解析，正文由前端 markdown-it 渲染
  if (doc.rawContent && doc.rawFormat !== 'markdown') {
    try {
      doc.normalized = await parseAndNormalize(doc.rawContent, doc.rawFormat === 'yaml' ? 'yaml' : 'json');
    } catch { /* 回退存储值 */ }
  }
  res.json(doc);
}));

documentsRouter.post('/', requireAdmin, validateBody(createSchema), asyncHandler(async (req, res) => {
  const result = await createFromContent(req.body as CreateDocumentDto);
  res.status(201).json(result);
}));

/** URL 导入：先 SSRF 校验，再由服务端拉取 */
documentsRouter.post('/import-url', requireAdmin, validateBody(importUrlSchema), asyncHandler(async (req, res) => {
  const { url } = req.body as { url: string };
  const result = await proxyRequest({
    method: 'GET',
    url,
    timeoutMs: config.requestTimeoutMs,
  });
  if (result.status < 200 || result.status >= 300) {
    throw new AppError(400, 'FETCH_FAILED', `拉取文档失败：HTTP ${result.status}`);
  }
  const format = detectFormat(result.body, result.headers, url);
  const id = await createFromContent({
    content: result.body,
    format,
    sourceType: 'url',
    sourceValue: url,
  });
  res.status(201).json(id);
}));

documentsRouter.delete('/:id', requireAdmin, (req, res) => {
  const ok = deleteDocument(req.params.id);
  if (!ok) throw new AppError(404, 'NOT_FOUND', '文档不存在');
  // 连带清掉分享链接，避免留下指向空文档的死链
  deleteSharesByDocument(req.params.id);
  res.status(204).end();
});

// ---------- 单接口维护 ----------

const operationDraftSchema = z.object({
  method: z.string().min(1, '接口方法不能为空'),
  path: z.string().min(1, '接口路径不能为空'),
  summary: z.string().optional(),
  description: z.string().optional(),
  group: z.string().optional(),
  operationId: z.string().optional(),
  deprecated: z.boolean().optional(),
  // 参数与响应结构由前端表单构造，这里不做深层校验，避免改一处 schema 就要同步两处
  parameters: z.array(z.any()).default([]),
  requestBody: z.any().optional(),
  responses: z.array(z.any()).default([]),
});

/** 读接口维护前先拿「以原文为准」的归一化结果，存量文档也能吃到解析器修复 */
async function currentNormalized(doc: DocumentDetail): Promise<NormalizedDocument> {
  try {
    return await parseAndNormalize(doc.rawContent, doc.rawFormat === 'yaml' ? 'yaml' : 'json');
  } catch {
    return doc.normalized;
  }
}

/** 归一化结果落库时必须同时重写 OpenAPI 原文，否则读取时的重新归一化会把手改内容覆盖掉 */
function persistNormalized(id: string, normalized: NormalizedDocument): void {
  replaceDocumentContent(id, {
    rawContent: JSON.stringify(normalizedToOpenApi(normalized), null, 2),
    rawFormat: 'json',
    normalized,
  });
}

async function loadEditableDocument(id: string): Promise<{ doc: DocumentDetail; normalized: NormalizedDocument }> {
  const doc = getDocument(id);
  if (!doc) throw new AppError(404, 'NOT_FOUND', '文档不存在');
  if (doc.rawFormat === 'markdown') {
    throw new AppError(400, 'NOT_SUPPORTED', 'Markdown 文档不支持单接口维护');
  }
  return { doc, normalized: await currentNormalized(doc) };
}

documentsRouter.post(
  '/:docId/operations',
  requireAdmin,
  validateBody(z.object({ draft: operationDraftSchema })),
  asyncHandler(async (req, res) => {
    const { doc, normalized } = await loadEditableDocument(req.params.docId);
    const next = addOperation(normalized, req.body.draft as OperationDraft);
    persistNormalized(doc.id, next);
    res.status(201).json(getDocument(doc.id));
  }),
);

documentsRouter.put(
  '/:docId/operations/:opKey',
  requireAdmin,
  validateBody(z.object({ draft: operationDraftSchema })),
  asyncHandler(async (req, res) => {
    const { doc, normalized } = await loadEditableDocument(req.params.docId);
    const oldOperationId = decodeOperationKey(req.params.opKey);
    const next = updateOperation(normalized, oldOperationId, req.body.draft as OperationDraft);
    persistNormalized(doc.id, next);
    res.json(getDocument(doc.id));
  }),
);

documentsRouter.delete('/:docId/operations/:opKey', requireAdmin, asyncHandler(async (req, res) => {
  const { doc, normalized } = await loadEditableDocument(req.params.docId);
  const next = removeOperation(normalized, decodeOperationKey(req.params.opKey));
  persistNormalized(doc.id, next);
  res.json(getDocument(doc.id));
}));

documentsRouter.get('/:id/export', requireView, (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc) throw new AppError(404, 'NOT_FOUND', '文档不存在');

  // Markdown 原样导出，不做格式互转
  if (doc.rawFormat === 'markdown') {
    res.setHeader('Content-Disposition', contentDisposition(`${doc.title}.md`));
    res.type('text/markdown');
    res.send(doc.rawContent);
    return;
  }

  const format = req.query.format === 'yaml' ? 'yaml' : 'json';
  let content = doc.rawContent;
  if (format !== doc.rawFormat) {
    try {
      content = format === 'json'
        ? JSON.stringify(YAML.parse(doc.rawContent), null, 2)
        : YAML.stringify(JSON.parse(doc.rawContent));
    } catch (err) {
      throw new AppError(400, 'EXPORT_FAILED', `格式转换失败：${(err as Error).message}`);
    }
  }
  res.setHeader('Content-Disposition', contentDisposition(`openapi.${format}`));
  res.type(format === 'yaml' ? 'application/yaml' : 'application/json');
  res.send(content);
});

/**
 * 格式识别：优先看响应头与 URL 扩展名，再退回内容首字符。
 * Markdown 不能只靠内容判断——YAML 的注释同样以 # 开头，两者会撞车。
 */
function detectFormat(
  content: string,
  headers: Record<string, string> | undefined,
  url: string,
): DocumentFormat {
  const contentType = (headers?.['content-type'] ?? '').toLowerCase();
  if (contentType.includes('markdown')) return 'markdown';

  if (/\.(md|markdown)$/i.test(safePathname(url))) return 'markdown';

  const trimmed = content.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  return 'yaml';
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

/** 中文文件名走 RFC 5987 编码，避免响应头里出现非法字符 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
