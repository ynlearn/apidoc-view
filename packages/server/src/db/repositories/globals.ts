import type { GlobalVariable, MergedVariables } from '@openapi-view/shared';
import { db } from '../index.js';
import { getActiveEnvironment } from './environments.js';

type Row = Record<string, any>;

// key 是 MySQL 保留字，列名引用统一走方言引号（sqlite/pg 双引号、MySQL 反引号）
const KEY = db.ident('key');

export async function listGlobals(): Promise<GlobalVariable[]> {
  const rows = (await db.prepare(`SELECT * FROM globals ORDER BY ${KEY} ASC`).all()) as Row[];
  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    description: row.description ?? undefined,
    updatedAt: row.updated_at,
  }));
}

export async function replaceGlobals(
  variables: Array<{ key: string; value: string; description?: string }>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.prepare('DELETE FROM globals').run();
    const stmt = tx.prepare(
      `INSERT INTO globals (${KEY}, value, description, updated_at) VALUES (?, ?, ?, ?)`,
    );
    const now = Date.now();
    for (const v of variables) {
      await stmt.run(v.key, v.value, v.description ?? null, now);
    }
  });
}

/** 合并变量：全局优先被环境覆盖 */
export async function getMergedVariables(): Promise<MergedVariables> {
  const merged: MergedVariables = {};
  for (const g of await listGlobals()) merged[g.key] = g.value;
  const active = await getActiveEnvironment();
  if (active) Object.assign(merged, active.variables);
  return merged;
}
