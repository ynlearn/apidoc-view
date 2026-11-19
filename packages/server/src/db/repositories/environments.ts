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

export async function listEnvironments(): Promise<Environment[]> {
  const rows = (await db.prepare('SELECT * FROM environments ORDER BY created_at ASC').all()) as Row[];
  return rows.map(toEnv);
}

export async function getEnvironment(id: string): Promise<Environment | undefined> {
  const row = (await db.prepare('SELECT * FROM environments WHERE id = ?').get(id)) as Row | undefined;
  return row ? toEnv(row) : undefined;
}

export async function createEnvironment(name: string, variables: Record<string, string>): Promise<Environment> {
  const id = randomUUID();
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO environments (id, name, variables_json, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
    )
    .run(id, name, JSON.stringify(variables), now, now);
  return (await getEnvironment(id))!;
}

export async function updateEnvironment(
  id: string,
  patch: { name?: string; variables?: Record<string, string> },
): Promise<Environment | undefined> {
  const current = await getEnvironment(id);
  if (!current) return undefined;
  const name = patch.name ?? current.name;
  const variables = patch.variables ?? current.variables;
  await db.prepare('UPDATE environments SET name = ?, variables_json = ?, updated_at = ? WHERE id = ?').run(
    name,
    JSON.stringify(variables),
    Date.now(),
    id,
  );
  return getEnvironment(id);
}

export async function deleteEnvironment(id: string): Promise<boolean> {
  return (await db.prepare('DELETE FROM environments WHERE id = ?').run(id)).changes > 0;
}

/** 激活环境：事务内先全部置 0，再置 1，保证任意时刻恰好一个激活 */
export async function activateEnvironment(id: string): Promise<Environment | undefined> {
  const exists = await getEnvironment(id);
  if (!exists) return undefined;
  await db.transaction(async (tx) => {
    await tx.prepare('UPDATE environments SET is_active = 0').run();
    await tx.prepare('UPDATE environments SET is_active = 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
  });
  return getEnvironment(id);
}

export async function getActiveEnvironment(): Promise<Environment | undefined> {
  const row = (await db.prepare('SELECT * FROM environments WHERE is_active = 1 LIMIT 1').get()) as
    | Row
    | undefined;
  return row ? toEnv(row) : undefined;
}
