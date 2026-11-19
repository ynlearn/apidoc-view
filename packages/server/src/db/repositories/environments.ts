import { randomUUID } from 'node:crypto';
import type { Environment } from '@openapi-view/shared';
import { db } from '../index.js';

type Row = Record<string, any>;

function toEnv(row: Row): Environment {
  let variables: Record<string, string> = {};
  try {
    variables = JSON.parse(row.variables_json);
  } catch {
    /* ignore */
  }
  return {
    id: row.id,
    name: row.name,
    variables,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listEnvironments(): Environment[] {
  return (db.prepare('SELECT * FROM environments ORDER BY created_at ASC').all() as Row[]).map(toEnv);
}

export function getEnvironment(id: string): Environment | undefined {
  const row = db.prepare('SELECT * FROM environments WHERE id = ?').get(id) as Row | undefined;
  return row ? toEnv(row) : undefined;
}

export function createEnvironment(name: string, variables: Record<string, string>): Environment {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO environments (id, name, variables_json, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
  ).run(id, name, JSON.stringify(variables), now, now);
  return getEnvironment(id)!;
}

export function updateEnvironment(
  id: string,
  patch: { name?: string; variables?: Record<string, string> },
): Environment | undefined {
  const current = getEnvironment(id);
  if (!current) return undefined;
  const name = patch.name ?? current.name;
  const variables = patch.variables ?? current.variables;
  db.prepare(
    'UPDATE environments SET name = ?, variables_json = ?, updated_at = ? WHERE id = ?',
  ).run(name, JSON.stringify(variables), Date.now(), id);
  return getEnvironment(id);
}

export function deleteEnvironment(id: string): boolean {
  return db.prepare('DELETE FROM environments WHERE id = ?').run(id).changes > 0;
}

/** 激活环境：事务内先全部置 0，再置 1 */
export function activateEnvironment(id: string): Environment | undefined {
  const exists = getEnvironment(id);
  if (!exists) return undefined;
  const run = db.transaction(() => {
    db.prepare('UPDATE environments SET is_active = 0').run();
    db.prepare('UPDATE environments SET is_active = 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
  });
  run();
  return getEnvironment(id);
}

export function getActiveEnvironment(): Environment | undefined {
  const row = db.prepare('SELECT * FROM environments WHERE is_active = 1 LIMIT 1').get() as
    | Row
    | undefined;
  return row ? toEnv(row) : undefined;
}
