import axios from 'axios';
import type {
  CreateShareDto,
  ShareContent,
  ShareMeta,
  ShareSummary,
  ShareUnlockResult,
  UpdateShareDto,
} from '@openapi-view/shared';
import { http } from './http';

/**
 * 公开分享访问专用客户端。
 * 不复用 http：那边 401 会清登录态并广播退出，而分享页的 401 只是"还没输口令"。
 */
const publicHttp = axios.create({ baseURL: '/api', timeout: 30_000 });

// ---------- 管理端 ----------

export function listShares(documentId?: string) {
  return http
    .get<ShareSummary[]>('/shares', { params: documentId ? { documentId } : {} })
    .then((r) => r.data);
}

export function createShare(dto: CreateShareDto) {
  return http.post<ShareSummary>('/shares', dto).then((r) => r.data);
}

export function updateShare(id: string, dto: UpdateShareDto) {
  return http.patch<ShareSummary>(`/shares/${id}`, dto).then((r) => r.data);
}

export function deleteShare(id: string) {
  return http.delete(`/shares/${id}`);
}

// ---------- 公开访问 ----------

export function getShareMeta(token: string) {
  return publicHttp.get<ShareMeta>(`/shares/${token}/meta`).then((r) => r.data);
}

export function unlockShare(token: string, password?: string) {
  return publicHttp.post<ShareUnlockResult>(`/shares/${token}/unlock`, { password }).then((r) => r.data);
}

export function getShareContent(token: string, accessToken?: string) {
  return publicHttp
    .get<ShareContent>(`/shares/${token}/content`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })
    .then((r) => r.data);
}

export function shareUrl(token: string): string {
  return `${window.location.origin}/s/${token}`;
}
