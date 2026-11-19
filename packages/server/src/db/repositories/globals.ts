import type { GlobalVariable, MergedVariables } from '@bluebull/shared';
import { db } from '../index.js';
import { getActiveEnvironment } from './environments.js';

type Row = Record<string, any>;

export function listGlobals(): GlobalVariable[] {
  return (
    db.prepare('SELECT * FROM globals ORDER BY key ASC').all() as Row[]
  ).map((row) => ({
    key: row.key,
    value: row.value,
    description: row.description ?? undefined,
    updatedAt: row.updated_at,
  }));
}

export function replaceGlobals(variables: Array<{ key: string; value: string; description?: string }>): void {
  const run = db.transaction(() => {
    db.prepare('DELETE FROM globals').run();
    const stmt = db.prepare(
      'INSERT INTO globals (key, value, description, updated_at) VALUES (?, ?, ?, ?)',
    );
    const now = Date.now();
    for (const v of variables) {
      stmt.run(v.key, v.value, v.description ?? null, now);
    }
  });
  run();
}

/** 合并变量：全局优先被环境覆盖 */
export function getMergedVariables(): MergedVariables {
  const merged: MergedVariables = {};
  for (const g of listGlobals()) merged[g.key] = g.value;
  const active = getActiveEnvironment();
  if (active) Object.assign(merged, active.variables);
  return merged;
}
