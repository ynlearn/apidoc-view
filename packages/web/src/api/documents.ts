import type { DocumentDetail, DocumentFormat, DocumentSummary, OperationDraft } from '@openapi-view/shared';
import { http } from './http';

export function listDocuments() {
  return http.get<DocumentSummary[]>('/documents').then((r) => r.data);
}

/** 现有文档里出现过的分组名，供导入时选择归属分组 */
export function listGroupNames() {
  return http.get<string[]>('/documents/groups').then((r) => r.data);
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
  /** 指定后本次导入的接口统一归入该分组 */
  targetGroup?: string;
}) {
  return http.post<{ id: string }>('/documents', data).then((r) => r.data);
}

export function importDocumentFromUrl(url: string, targetGroup?: string) {
  return http.post<{ id: string }>('/documents/import-url', { url, targetGroup }).then((r) => r.data);
}

export function deleteDocument(id: string) {
  return http.delete(`/documents/${id}`);
}

export function exportDocumentUrl(id: string, format: DocumentFormat) {
  return `/api/documents/${id}/export?format=${format}`;
}

// ---------- 单接口维护 ----------

/** 接口 id 形如 `GET:/users/{id}`，直接塞进 URL 会被路径解析撕碎，统一 base64url */
export function encodeOperationKey(operationId: string): string {
  const bytes = new TextEncoder().encode(operationId);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createOperation(docId: string, draft: OperationDraft) {
  return http.post<DocumentDetail>(`/documents/${docId}/operations`, { draft }).then((r) => r.data);
}

export function updateOperation(docId: string, operationId: string, draft: OperationDraft) {
  return http
    .put<DocumentDetail>(`/documents/${docId}/operations/${encodeOperationKey(operationId)}`, { draft })
    .then((r) => r.data);
}

export function deleteOperation(docId: string, operationId: string) {
  return http
    .delete<DocumentDetail>(`/documents/${docId}/operations/${encodeOperationKey(operationId)}`)
    .then((r) => r.data);
}
