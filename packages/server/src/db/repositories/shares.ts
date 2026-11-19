import { randomUUID } from 'node:crypto';
import type { ShareSummary, ShareTargetType } from '@openapi-view/shared';
import { db } from '../index.js';

type Row = Record<string, any>;

/** 仓储层内部记录，含口令哈希等不对外暴露的字段 */
export interface ShareRecord {
  id: string;
  token: string;
  targetType: ShareTargetType;
  documentId: string;
  operationId?: string;
  title: string;
  passwordHash?: string;
  expiresAt?: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

function toRecord(row: Row): ShareRecord {
  return {
    id: row.id,
    token: row.token,
    targetType: row.target_type,
    documentId: row.document_id,
    operationId: row.operation_id ?? undefined,
    title: row.title,
    passwordHash: row.password_hash ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSummary(row: Row): ShareSummary {
  return {
    id: row.id,
    token: row.token,
    targetType: row.target_type,
    documentId: row.document_id,
    documentTitle: row.document_title ?? '（文档已删除）',
    operationId: row.operation_id ?? undefined,
    title: row.title,
    hasPassword: Boolean(row.password_hash),
    expiresAt: row.expires_at ?? undefined,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
  };
}

const SELECT_WITH_DOC = `SELECT s.*, d.title AS document_title
  FROM shares s LEFT JOIN documents d ON d.id = s.document_id`;

export async function listShares(documentId?: string): Promise<ShareSummary[]> {
  const rows = documentId
    ? ((await db
        .prepare(`${SELECT_WITH_DOC} WHERE s.document_id = ? ORDER BY s.created_at DESC`)
        .all(documentId)) as Row[])
    : ((await db.prepare(`${SELECT_WITH_DOC} ORDER BY s.created_at DESC`).all()) as Row[]);
  return rows.map(toSummary);
}

export async function getShareById(id: string): Promise<ShareRecord | undefined> {
  const row = (await db.prepare('SELECT * FROM shares WHERE id = ?').get(id)) as Row | undefined;
  return row ? toRecord(row) : undefined;
}

export async function getShareByToken(token: string): Promise<ShareRecord | undefined> {
  const row = (await db.prepare('SELECT * FROM shares WHERE token = ?').get(token)) as Row | undefined;
  return row ? toRecord(row) : undefined;
}

export interface InsertShareInput {
  token: string;
  targetType: ShareTargetType;
  documentId: string;
  operationId?: string;
  title: string;
  passwordHash?: string;
  expiresAt?: number;
}

export async function insertShare(input: InsertShareInput): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO shares
      (id, token, target_type, document_id, operation_id, title, password_hash, expires_at, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      id,
      input.token,
      input.targetType,
      input.documentId,
      input.operationId ?? null,
      input.title,
      input.passwordHash ?? null,
      input.expiresAt ?? null,
      now,
      now,
    );
  return id;
}

export async function updateShare(
  id: string,
  patch: {
    title?: string;
    /** null 表示清除口令 */
    passwordHash?: string | null;
    enabled?: boolean;
    /** null 表示改为永久 */
    expiresAt?: number | null;
  },
): Promise<boolean> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    values.push(patch.title);
  }
  if (patch.passwordHash !== undefined) {
    sets.push('password_hash = ?');
    values.push(patch.passwordHash);
  }
  if (patch.enabled !== undefined) {
    sets.push('enabled = ?');
    values.push(patch.enabled ? 1 : 0);
  }
  if (patch.expiresAt !== undefined) {
    sets.push('expires_at = ?');
    values.push(patch.expiresAt);
  }
  if (!sets.length) return true;
  sets.push('updated_at = ?');
  values.push(Date.now(), id);
  const result = await db.prepare(`UPDATE shares SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export async function deleteShare(id: string): Promise<boolean> {
  return (await db.prepare('DELETE FROM shares WHERE id = ?').run(id)).changes > 0;
}

/** 删除文档时连带清掉其分享链接，避免留下指向空文档的死链 */
export async function deleteSharesByDocument(documentId: string): Promise<number> {
  return (await db.prepare('DELETE FROM shares WHERE document_id = ?').run(documentId)).changes;
}
