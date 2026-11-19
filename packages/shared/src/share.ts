import type { DocumentFormat } from './document.js';
import type { OperationGroupView, OperationView, ServerView } from './openapi.js';

/** 分享对象：整份文档 或 单个接口 */
export type ShareTargetType = 'document' | 'operation';

export interface ShareSummary {
  id: string;
  /** 公开访问短 token，拼在前端路由 /s/:token 里 */
  token: string;
  targetType: ShareTargetType;
  documentId: string;
  documentTitle: string;
  operationId?: string;
  /** 分享页标题，默认取文档/接口标题 */
  title: string;
  hasPassword: boolean;
  /** 毫秒时间戳，空表示永久有效 */
  expiresAt?: number;
  enabled: boolean;
  createdAt: number;
}

export interface CreateShareDto {
  targetType: ShareTargetType;
  documentId: string;
  operationId?: string;
  title?: string;
  password?: string;
  /** 有效期天数，空或 0 表示永久 */
  expiresInDays?: number;
}

export interface UpdateShareDto {
  title?: string;
  /** 传 null 表示清除口令 */
  password?: string | null;
  enabled?: boolean;
  /** 传 null 表示改为永久 */
  expiresInDays?: number | null;
}

/** 未解锁前能拿到的公开信息，用于渲染口令页 */
export interface ShareMeta {
  title: string;
  targetType: ShareTargetType;
  documentTitle: string;
  needPassword: boolean;
  /** 已过期 / 已停用 / 已删除，一律视为不可用 */
  unavailable: boolean;
  unavailableReason?: 'expired' | 'disabled' | 'not_found';
}

export interface ShareUnlockResult {
  accessToken: string;
  expiresAt: number;
}

/** 分享页内容。单接口分享只返回该接口，不泄漏同文档其他接口 */
export interface ShareContent extends ShareMeta {
  servers: ServerView[];
  rawFormat: DocumentFormat;
  /** targetType=document 且为 OpenAPI 时返回整份归一化文档 */
  document?: {
    title: string;
    version?: string;
    description?: string;
    servers: ServerView[];
    groups: OperationGroupView[];
    operationCount: number;
  };
  /** targetType=operation 时返回 */
  operation?: OperationView;
  groupName?: string;
  /** Markdown 文档分享时的正文 */
  markdown?: string;
}
