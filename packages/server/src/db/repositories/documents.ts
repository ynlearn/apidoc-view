import { randomUUID } from 'node:crypto';
import type { DocumentDetail, DocumentSummary, NormalizedDocument } from '@openapi-view/shared';
import { db } from '../index.js';

type Row = Record<string, any>;

function toSummary(row: Row): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    operationCount: row.operation_count,
    sourceType: row.source_type,
    sourceValue: row.source_value ?? undefined,
    specVersion: row.spec_version ?? undefined,
    rawFormat: row.raw_format,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const rows = (await db.prepare('SELECT * FROM documents ORDER BY updated_at DESC').all()) as Row[];
  return rows.map(toSummary);
}

export async function getDocument(id: string): Promise<DocumentDetail | undefined> {
  const row = (await db.prepare('SELECT * FROM documents WHERE id = ?').get(id)) as Row | undefined;
  if (!row) return undefined;
  let normalized: NormalizedDocument;
  try {
    normalized = JSON.parse(row.normalized_json);
  } catch {
    normalized = { title: row.title, servers: [], groups: [], operationCount: 0 };
  }
  return { ...toSummary(row), rawContent: row.raw_content, normalized };
}

export interface InsertDocumentInput {
  title: string;
  sourceType: string;
  sourceValue?: string;
  specVersion?: string;
  rawContent: string;
  rawFormat: string;
  normalized: NormalizedDocument;
}

export async function insertDocument(input: InsertDocumentInput): Promise<string> {
  const id = randomUUID();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO documents
      (id, title, source_type, source_value, spec_version, raw_content, raw_format, normalized_json, operation_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.title,
      input.sourceType,
      input.sourceValue ?? null,
      input.specVersion ?? null,
      input.rawContent,
      input.rawFormat,
      JSON.stringify(input.normalized),
      input.normalized.operationCount,
      now,
      now,
    );
  return id;
}

export async function deleteDocument(id: string): Promise<boolean> {
  return (await db.prepare('DELETE FROM documents WHERE id = ?').run(id)).changes > 0;
}

/**
 * 用新的原文本 + 归一化结果覆盖文档。
 * 手工改接口必须走这里：raw_content 与 normalized_json 必须同步更新，
 * 否则 GET /documents/:id 的实时重新归一化会把手改结果覆盖掉。
 */
export async function replaceDocumentContent(
  id: string,
  input: {
    rawContent: string;
    rawFormat: string;
    normalized: NormalizedDocument;
    title?: string;
    sourceType?: string;
  },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE documents
       SET raw_content = ?, raw_format = ?, normalized_json = ?, operation_count = ?,
           title = COALESCE(?, title), source_type = COALESCE(?, source_type), updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.rawContent,
      input.rawFormat,
      JSON.stringify(input.normalized),
      input.normalized.operationCount,
      input.title ?? null,
      input.sourceType ?? null,
      Date.now(),
      id,
    );
  return result.changes > 0;
}
