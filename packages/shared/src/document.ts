export interface DocumentSummary {
  id: string;
  title: string;
  operationCount: number;
  sourceType: string;
  sourceValue?: string;
  specVersion?: string;
  rawFormat: string;
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
  format: 'json' | 'yaml';
  sourceType: 'paste' | 'file' | 'url';
  sourceValue?: string;
}
