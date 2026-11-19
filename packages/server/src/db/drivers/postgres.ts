import { config } from '../../config.js';
import type { Database, Queryable, Statement } from '../types.js';

interface QueryResult {
  rows: Record<string, any>[];
  rowCount: number | null;
}

/**
 * ? → $n 占位符重写（pg 只认 $1..$n）。
 * 约束：SQL 字符串字面量里不得出现 ?——本项目 SQL 全部是代码内常量模板，已遵守；
 * 若将来 SQL 里需要字面问号，必须改成参数传入，不能直接写进模板。
 */
function toPgSql(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

function makeStatement(runSql: (sql: string, params: unknown[]) => Promise<QueryResult>, sql: string): Statement {
  const rewritten = toPgSql(sql);
  return {
    async run(...params: unknown[]): Promise<{ changes: number }> {
      const result = await runSql(rewritten, params);
      return { changes: result.rowCount ?? 0 };
    },
    async get(...params: unknown[]): Promise<Record<string, any> | undefined> {
      const result = await runSql(rewritten, params);
      return result.rows[0];
    },
    async all(...params: unknown[]): Promise<Record<string, any>[]> {
      const result = await runSql(rewritten, params);
      return result.rows;
    },
  };
}

export async function createPostgresDb(): Promise<Database> {
  const pg = (await import('pg')).default;
  // int8（BIGINT / COUNT(*)）默认按字符串返回，会把 createdAt / total 变成 "179..."；
  // 统一转 number（毫秒级时间戳与行数都在 JS 安全整数范围内）
  pg.types.setTypeParser(20, (v: string) => Number(v));

  const pool = config.dbUrl
    ? new pg.Pool({ connectionString: config.dbUrl, max: config.dbPoolSize })
    : new pg.Pool({
        host: config.dbHost,
        port: config.dbPort,
        user: config.dbUser,
        password: config.dbPassword,
        database: config.dbName,
        max: config.dbPoolSize,
      });

  const runPoolSql = (sql: string, params: unknown[]) =>
    pool.query(sql, params) as unknown as Promise<QueryResult>;

  const poolQueryable: Queryable = {
    prepare: (sql) => makeStatement(runPoolSql, sql),
    async exec(sql) {
      await pool.query(toPgSql(sql));
    },
  };

  return {
    dialect: 'postgres',
    ...poolQueryable,
    ident: (name) => `"${name.replace(/"/g, '""')}"`,
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tx: Queryable = {
          prepare: (sql) =>
            makeStatement(
              (s, params) => client.query(s, params) as unknown as Promise<QueryResult>,
              sql,
            ),
          async exec(s) {
            await client.query(toPgSql(s));
          },
        };
        const result = await fn(tx);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* 连接可能已断开，rollback 失败不影响向上抛原始错误 */
        }
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
