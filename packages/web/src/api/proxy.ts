import type { ProxyRequestDto, ProxyResponseDto, HistoryEntry } from '@bluebull/shared';
import { http } from './http';

export function sendRequest(dto: ProxyRequestDto) {
  return http.post<ProxyResponseDto & { unresolved?: string[] }>('/proxy', dto).then((r) => r.data);
}

export function listHistory(limit = 50, offset = 0) {
  return http
    .get<{ total: number; items: HistoryEntry[] }>('/history', { params: { limit, offset } })
    .then((r) => r.data);
}

export function getHistory(id: string) {
  return http.get<HistoryEntry>(`/history/${id}`).then((r) => r.data);
}

export function deleteHistory(id: string) {
  return http.delete(`/history/${id}`);
}

export function clearHistory() {
  return http.delete('/history');
}
