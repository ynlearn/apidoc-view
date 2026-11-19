import { config } from '../config.js';
import type { Database, Dialect, Queryable, RunResult, Statement } from './types.js';

export type { Database, Dialect, Queryable, RunResult, Statement };

/**
 * 唯一约束冲突识别（三方言统一判断）：
 * - node:sqlite：SqliteError.errcode = 2067（SQLITE_CONSTRAINT_UNIQUE）/ 1555（_PRIMARYKEY）
 * - mysql2：ER_DUP_ENTRY（errno 1062）
 * - pg：SQLSTATE 23505 unique_violation
 */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; errno?: number; errcode?: number } | null;
  if (!e) return false;
  if (typeof e.errcode === 'number' && (e.errcode === 2067 || e.errcode === 1555)) return true;
  if (typeof e.code === 'string') {
    if (e.code.startsWith('SQLITE_CONSTRAINT')) return true;
    if (e.code.startsWith('ER_DUP_ENTRY')) return true;
    if (e.code === '23505') return true;
  }
  return e.errno === 1062;
}

async function createDb(): Promise<Database> {
  switch (config.dbType) {
    case 'sqlite': {
      const { createSqliteDb } = await import('./drivers/sqlite.js');
      return createSqliteDb();
    }
    case 'mysql': {
      const { createMysqlDb } = await import('./drivers/mysql.js');
      return createMysqlDb();
    }
    case 'postgres': {
      const { createPostgresDb } = await import('./drivers/postgres.js');
      return createPostgresDb();
    }
  }
}

/** 模块级单例：驱动按 DB_TYPE 懒加载，sqlite 模式不引入 mysql2/pg */
export const db: Database = await createDb();
