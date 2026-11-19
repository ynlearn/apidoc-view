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
}
