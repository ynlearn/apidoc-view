import { Router } from 'express';
import { z } from 'zod';
import YAML from 'yaml';
import type { CreateDocumentDto, DocumentFormat } from '@openapi-view/shared';
import { AppError } from '../middleware/AppError.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAdmin, requireView } from '../middleware/auth.js';
import { getDocument, insertDocument, listDocuments, deleteDocument } from '../db/repositories/documents.js';
import { parseAndNormalize } from '../services/openapiService.js';
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
});

const importUrlSchema = z.object({
  url: z.string().url('请输入有效的 URL'),
});

async function createFromContent(dto: CreateDocumentDto) {
  if (Buffer.byteLength(dto.content, 'utf8') > config.maxImportBytes) {
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', '文档内容超过大小限制');
  }
  // URL 导入内容也需经过 SSRF：在 import-url 路由中已校验，这里只解析
  const normalized =
    dto.format === 'markdown'
      ? normalizeMarkdown(dto.content, dto.title)
      : await parseAndNormalize(dto.content, dto.format);
  const id = insertDocument({
    title: dto.title?.trim() || normalized.title,
    sourceType: dto.sourceType,
    sourceValue: dto.sourceValue,
    specVersion: undefined,
    rawContent: dto.content,
    rawFormat: dto.format,
    normalized,
  });
  return { id };
}

documentsRouter.get('/', requireView, (_req, res) => {
  res.json(listDocuments());
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
  res.status(204).end();
});

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
