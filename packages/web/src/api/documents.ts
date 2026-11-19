import type { DocumentDetail, DocumentFormat, DocumentSummary } from '@openapi-view/shared';
import { http } from './http';

export function listDocuments() {
  return http.get<DocumentSummary[]>('/documents').then((r) => r.data);
}

export function getDocument(id: string) {
  return http.get<DocumentDetail>(`/documents/${id}`).then((r) => r.data);
}

export function createDocument(data: {
  content: string;
  format: DocumentFormat;
  sourceType: 'paste' | 'file' | 'url';
  title?: string;
  sourceValue?: string;
}) {
  return http.post<{ id: string }>('/documents', data).then((r) => r.data);
}

export function importDocumentFromUrl(url: string) {
  return http.post<{ id: string }>('/documents/import-url', { url }).then((r) => r.data);
}

export function deleteDocument(id: string) {
  return http.delete(`/documents/${id}`);
}

export function exportDocumentUrl(id: string, format: DocumentFormat) {
  return `/api/documents/${id}/export?format=${format}`;
}
