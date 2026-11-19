/** 文档原始格式：json/yaml 为 OpenAPI 3.0 规范文档，markdown 为普通 Markdown 文档 */
export type DocumentFormat = 'json' | 'yaml' | 'markdown';

export interface DocumentSummary {
  id: string;
  title: string;
  operationCount: number;
  sourceType: string;
  sourceValue?: string;
  specVersion?: string;
  rawFormat: DocumentFormat;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentDetail extends DocumentSummary {
  rawContent: string;
  normalized: import('./openapi.js').NormalizedDocument;
}

export interface CreateDocumentDto {
  title?: string;
  content: string;
  format: DocumentFormat;
  sourceType: 'paste' | 'file' | 'url';
  sourceValue?: string;
  /** 指定后本次导入的所有接口统一归入该分组；不传则沿用 OpenAPI tags 自动分组 */
  targetGroup?: string;
}
