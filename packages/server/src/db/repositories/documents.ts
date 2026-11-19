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

export function listDocuments(): DocumentSummary[] {
  const rows = db.prepare('SELECT * FROM documents ORDER BY updated_at DESC').all() as Row[];
  return rows.map(toSummary);
}

export function getDocument(id: string): DocumentDetail | undefined {
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Row | undefined;
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

export function insertDocument(input: InsertDocumentInput): string {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO documents
      (id, title, source_type, source_value, spec_version, raw_content, raw_format, normalized_json, operation_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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

export function deleteDocument(id: string): boolean {
  return db.prepare('DELETE FROM documents WHERE id = ?').run(id).changes > 0;
}
