import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const native = new DatabaseSync(config.dbPath);
native.exec('PRAGMA journal_mode = WAL');
native.exec('PRAGMA foreign_keys = ON');
native.exec('PRAGMA busy_timeout = 5000');

/**
 * 极简适配器：把 node:sqlite 的包成 better-sqlite3 风格 API，
 * 让各 repository 无需改动即可使用。
 */

interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

class StatementAdapter {
  constructor(private readonly stmt: ReturnType<DatabaseSync['prepare']>) {}

  run(...params: unknown[]): RunResult {
    const info = this.stmt.run(...(params as any[]));
    return {
      changes: Number(info.changes),
      lastInsertRowid: info.lastInsertRowid,
    } as RunResult;
  }

  get(...params: unknown[]): Record<string, any> | undefined {
    return this.stmt.get(...(params as any[])) as Record<string, any> | undefined;
  }

  all(...params: unknown[]): Record<string, any>[] {
    return this.stmt.all(...(params as any[])) as Record<string, any>[];
  }
}

export const db = {
  prepare(sql: string): StatementAdapter {
    return new StatementAdapter(native.prepare(sql));
  },
  exec(sql: string): void {
    native.exec(sql);
  },
  pragma(_name: string): void {
    // PRAGMA 已在初始化时设置
  },
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: any[]) => {
      native.exec('BEGIN');
      try {
        const result = fn(...args);
        native.exec('COMMIT');
        return result;
      } catch (err) {
        native.exec('ROLLBACK');
        throw err;
      }
    }) as T;
  },
};
