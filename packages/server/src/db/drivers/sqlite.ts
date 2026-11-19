import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import type { Database, Queryable, RunResult, Statement } from '../types.js';

class SqliteStatement implements Statement {
  constructor(private readonly stmt: ReturnType<DatabaseSync['prepare']>) {}

  // node:sqlite 本身是同步调用，包成 Promise 只为与异步驱动同构
  run(...params: unknown[]): Promise<RunResult> {
    const info = this.stmt.run(...(params as any[]));
    return Promise.resolve({ changes: Number(info.changes) });
  }

  get(...params: unknown[]): Promise<Record<string, any> | undefined> {
    return Promise.resolve(this.stmt.get(...(params as any[])) as Record<string, any> | undefined);
  }

  all(...params: unknown[]): Promise<Record<string, any>[]> {
    return Promise.resolve(this.stmt.all(...(params as any[])) as Record<string, any>[]);
  }
}

export function createSqliteDb(): Database {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  const native = new DatabaseSync(config.dbPath);
  native.exec('PRAGMA journal_mode = WAL');
  native.exec('PRAGMA foreign_keys = ON');
  native.exec('PRAGMA busy_timeout = 5000');

  const queryable: Queryable = {
    prepare(sql) {
      return new SqliteStatement(native.prepare(sql));
    },
    async exec(sql) {
      native.exec(sql);
    },
  };

  // 事务串行队列：单连接下避免并发事务互相交叉。
  // 约束：事务体内不得有真实异步 I/O（当前仓储事务体只含同步 SQL 调用，天然满足）；
  // 如果将来某个事务需要等外部 I/O，应该换 mysql/pg 或专门加锁，不要在这里硬撑。
  let txQueue: Promise<unknown> = Promise.resolve();

  return {
    dialect: 'sqlite',
    ...queryable,
    ident: (name) => `"${name.replace(/"/g, '""')}"`,
    transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const run = txQueue.then(async () => {
        native.exec('BEGIN');
        try {
          const result = await fn(queryable);
          native.exec('COMMIT');
          return result;
        } catch (err) {
          native.exec('ROLLBACK');
          throw err;
        }
      });
      // 错误只交给调用方；队列自身吞掉异常继续走，避免一次失败堵死后续事务
      txQueue = run.catch(() => undefined);
      return run;
    },
    async close() {
      native.close();
    },
  };
}
