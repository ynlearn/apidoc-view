import type { NormalizedDocument, OperationDraft, OperationView } from '@openapi-view/shared';
import { AppError } from '../middleware/AppError.js';

const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'];
const DEFAULT_GROUP = '默认分组';

function assertDraft(draft: OperationDraft): void {
  const method = (draft.method ?? '').toUpperCase();
  if (!VALID_METHODS.includes(method)) {
    throw new AppError(400, 'INVALID_METHOD', `接口方法不合法：${draft.method || '(空)'}`);
  }
  if (!draft.path || !draft.path.startsWith('/')) {
    throw new AppError(400, 'INVALID_PATH', '接口路径必须以 / 开头');
  }
  if (!Array.isArray(draft.parameters) || !Array.isArray(draft.responses)) {
    throw new AppError(400, 'INVALID_DRAFT', '参数与响应字段格式不正确');
  }
}

export function findOperation(
  normalized: NormalizedDocument,
  operationId: string,
): { groupIndex: number; operationIndex: number; operation: OperationView } | null {
  for (let gi = 0; gi < normalized.groups.length; gi += 1) {
    const group = normalized.groups[gi];
    const oi = group.operations.findIndex((op) => op.id === operationId);
    if (oi >= 0) return { groupIndex: gi, operationIndex: oi, operation: group.operations[oi] };
  }
  return null;
}

function buildOperation(draft: OperationDraft, groupName: string): OperationView {
  const method = draft.method.toUpperCase();
  return {
    id: `${method}:${draft.path}`,
    method,
    path: draft.path,
    summary: draft.summary?.trim() || undefined,
    description: draft.description?.trim() || undefined,
    // 分组即 tags[0]，保持 single source of truth，避免归一化往返时分组漂移
    tags: [groupName],
    operationId: draft.operationId?.trim() || undefined,
    deprecated: Boolean(draft.deprecated),
    parameters: draft.parameters,
    requestBody: draft.requestBody,
    responses: draft.responses.length ? draft.responses : [{ status: '200', description: 'OK', contentTypes: [] }],
    security: undefined,
  };
}

function pushToGroup(normalized: NormalizedDocument, groupName: string, operation: OperationView): void {
  let group = normalized.groups.find((g) => g.name === groupName);
  if (!group) {
    group = { name: groupName, operations: [] };
    normalized.groups.push(group);
  }
  group.operations.push(operation);
}

/** 分组被删空后清理掉，避免左侧树出现空分组 */
function dropEmptyGroups(normalized: NormalizedDocument): void {
  normalized.groups = normalized.groups.filter((g) => g.operations.length > 0);
}

function recount(normalized: NormalizedDocument): void {
  normalized.operationCount = normalized.groups.reduce((sum, g) => sum + g.operations.length, 0);
}

/**
 * 新增接口。返回新的归一化结果，由调用方连同重新生成的 OpenAPI 原文一起落库。
 */
export function addOperation(normalized: NormalizedDocument, draft: OperationDraft): NormalizedDocument {
  assertDraft(draft);
  const next = structuredClone(normalized);
  const operation = buildOperation(draft, draft.group?.trim() || DEFAULT_GROUP);

  if (findOperation(next, operation.id)) {
    throw new AppError(409, 'OPERATION_EXISTS', `接口已存在：${operation.id}`);
  }
  pushToGroup(next, draft.group?.trim() || DEFAULT_GROUP, operation);
  recount(next);
  return next;
}

/**
 * 更新接口。oldOperationId 为改动前的 id（method:path），
 * 允许同时改方法、路径和分组——相当于把接口从旧位置摘下来再挂到新位置。
 */
export function updateOperation(
  normalized: NormalizedDocument,
  oldOperationId: string,
  draft: OperationDraft,
): NormalizedDocument {
  assertDraft(draft);
  const next = structuredClone(normalized);
  const current = findOperation(next, oldOperationId);
  if (!current) {
    throw new AppError(404, 'OPERATION_NOT_FOUND', `接口不存在：${oldOperationId}`);
  }

  const groupName = draft.group?.trim() || DEFAULT_GROUP;
  const operation = buildOperation(draft, groupName);

  // id 变了要先查重（排除自己）
  if (operation.id !== oldOperationId && findOperation(next, operation.id)) {
    throw new AppError(409, 'OPERATION_EXISTS', `接口已存在：${operation.id}`);
  }

  next.groups[current.groupIndex].operations.splice(current.operationIndex, 1);
  dropEmptyGroups(next);
  pushToGroup(next, groupName, operation);
  recount(next);
  return next;
}

export function removeOperation(normalized: NormalizedDocument, operationId: string): NormalizedDocument {
  const next = structuredClone(normalized);
  const current = findOperation(next, operationId);
  if (!current) {
    throw new AppError(404, 'OPERATION_NOT_FOUND', `接口不存在：${operationId}`);
  }
  next.groups[current.groupIndex].operations.splice(current.operationIndex, 1);
  dropEmptyGroups(next);
  recount(next);
  return next;
}

/** 导入时把所有接口强制归入指定分组 */
export function regroupAllOperations(normalized: NormalizedDocument, groupName: string): NormalizedDocument {
  const next = structuredClone(normalized);
  const all = next.groups.flatMap((g) => g.operations);
  for (const op of all) op.tags = [groupName];
  next.groups = all.length ? [{ name: groupName, operations: all }] : [];
  recount(next);
  return next;
}

/** base64url 编解码：接口 id 含 `/` 与 `:`，直接塞进路径会被路由解析撕碎 */
export function encodeOperationKey(operationId: string): string {
  return Buffer.from(operationId, 'utf8').toString('base64url');
}

export function decodeOperationKey(key: string): string {
  try {
    return Buffer.from(key, 'base64url').toString('utf8');
  } catch {
    throw new AppError(400, 'INVALID_OPERATION_KEY', '接口标识不合法');
  }
}
