import { Router } from 'express';
import { z } from 'zod';
import YAML from 'yaml';
import { AppError } from '../middleware/AppError.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { getDocument, insertDocument, listDocuments, deleteDocument } from '../db/repositories/documents.js';
import { parseAndNormalize } from '../services/openapiService.js';
import { config } from '../config.js';
import { proxyRequest } from '../services/proxyService.js';
export const documentsRouter = Router();
const createSchema = z.object({
    title: z.string().optional(),
    content: z.string().min(1, '文档内容不能为空'),
    format: z.enum(['json', 'yaml']),
    sourceType: z.enum(['paste', 'file', 'url']),
    sourceValue: z.string().optional(),
});
const importUrlSchema = z.object({
    url: z.string().url('请输入有效的 URL'),
});
async function createFromContent(dto) {
    if (Buffer.byteLength(dto.content, 'utf8') > config.maxImportBytes) {
        throw new AppError(413, 'PAYLOAD_TOO_LARGE', '文档内容超过大小限制');
    }
    // URL 导入内容也需经过 SSRF：在 import-url 路由中已校验，这里只解析
    const normalized = await parseAndNormalize(dto.content, dto.format);
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
documentsRouter.get('/', (_req, res) => {
    res.json(listDocuments());
});
documentsRouter.get('/:id', asyncHandler(async (req, res) => {
    const doc = getDocument(req.params.id);
    if (!doc)
        throw new AppError(404, 'NOT_FOUND', '文档不存在');
    // 读取时用原始内容实时重新归一化：
    // 1) 旧版本导入的存量文档自动获得新解析器的修复（如 $ref 百分号编码解码）
    // 2) 解析失败时回退已存储的归一化结果，保证接口可用
    if (doc.rawContent) {
        try {
            doc.normalized = await parseAndNormalize(doc.rawContent, doc.rawFormat === 'yaml' ? 'yaml' : 'json');
        }
        catch { /* 回退存储值 */ }
    }
    res.json(doc);
}));
documentsRouter.post('/', validateBody(createSchema), asyncHandler(async (req, res) => {
    const result = await createFromContent(req.body);
    res.status(201).json(result);
}));
/** URL 导入：先 SSRF 校验，再由服务端拉取 */
documentsRouter.post('/import-url', validateBody(importUrlSchema), asyncHandler(async (req, res) => {
    const { url } = req.body;
    const result = await proxyRequest({
        method: 'GET',
        url,
        timeoutMs: config.requestTimeoutMs,
    });
    if (result.status < 200 || result.status >= 300) {
        throw new AppError(400, 'FETCH_FAILED', `拉取文档失败：HTTP ${result.status}`);
    }
    const format = detectFormat(result.body);
    const id = await createFromContent({
        content: result.body,
        format,
        sourceType: 'url',
        sourceValue: url,
    });
    res.status(201).json(id);
}));
documentsRouter.delete('/:id', (req, res) => {
    const ok = deleteDocument(req.params.id);
    if (!ok)
        throw new AppError(404, 'NOT_FOUND', '文档不存在');
    res.status(204).end();
});
documentsRouter.get('/:id/export', (req, res) => {
    const doc = getDocument(req.params.id);
    if (!doc)
        throw new AppError(404, 'NOT_FOUND', '文档不存在');
    const format = req.query.format === 'yaml' ? 'yaml' : 'json';
    let content = doc.rawContent;
    if (format !== doc.rawFormat) {
        // 需要格式转换
        if (format === 'json') {
            content = JSON.stringify(YAML.parse(doc.rawContent), null, 2);
        }
        else {
            content = YAML.stringify(JSON.parse(doc.rawContent));
        }
    }
    const ext = format === 'yaml' ? 'yaml' : 'json';
    res.setHeader('Content-Disposition', `attachment; filename="openapi.${ext}"`);
    res.type(format === 'yaml' ? 'application/yaml' : 'application/json');
    res.send(content);
});
function detectFormat(content) {
    const trimmed = content.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('['))
        return 'json';
    return 'yaml';
}
//# sourceMappingURL=documents.js.map