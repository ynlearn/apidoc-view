import type { NormalizedDocument } from '@openapi-view/shared';

/**
 * Markdown 文档归一化。
 * 只做两件必要的事：取出标题、给出与 OpenAPI 同构的空壳结构，
 * 让上层（列表、存储、前端）不需要为 Markdown 单独写一套数据模型。
 * 正文渲染交给前端 markdown-it，服务端不碰 HTML。
 */
export function normalizeMarkdown(content: string, fallbackTitle?: string): NormalizedDocument {
  return {
    title: extractTitle(content) || fallbackTitle?.trim() || '未命名文档',
    version: undefined,
    description: undefined,
    servers: [],
    groups: [],
    operationCount: 0,
  };
}

/** 标题优先级：首个 H1 → 首个非空行 → 兜底 */
function extractTitle(content: string): string {
  const h1 = /^ {0,3}#\s+(.+?)\s*#*\s*$/m.exec(content);
  if (h1) return stripInline(h1[1]).slice(0, 120);

  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return '';
  return stripInline(firstLine.replace(/^#{1,6}\s*/, '')).slice(0, 120);
}

/** 去掉标题里的行内标记，避免列表里显示 `# **标题**` 这类残留 */
function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 图片
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接保留文字
    .replace(/[*_~`]/g, '')
    .trim();
}
