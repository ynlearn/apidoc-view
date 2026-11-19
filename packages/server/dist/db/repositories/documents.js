import { randomUUID } from 'node:crypto';
import { db } from '../index.js';
function toSummary(row) {
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
export function listDocuments() {
    const rows = db.prepare('SELECT * FROM documents ORDER BY updated_at DESC').all();
    return rows.map(toSummary);
}
export function getDocument(id) {
    const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!row)
        return undefined;
    let normalized;
    try {
        normalized = JSON.parse(row.normalized_json);
    }
    catch {
        normalized = { title: row.title, servers: [], groups: [], operationCount: 0 };
    }
    return { ...toSummary(row), rawContent: row.raw_content, normalized };
}
export function insertDocument(input) {
    const id = randomUUID();
    const now = Date.now();
    db.prepare(`INSERT INTO documents
      (id, title, source_type, source_value, spec_version, raw_content, raw_format, normalized_json, operation_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.title, input.sourceType, input.sourceValue ?? null, input.specVersion ?? null, input.rawContent, input.rawFormat, JSON.stringify(input.normalized), input.normalized.operationCount, now, now);
    return id;
}
export function deleteDocument(id) {
    return db.prepare('DELETE FROM documents WHERE id = ?').run(id).changes > 0;
}
//# sourceMappingURL=documents.js.map