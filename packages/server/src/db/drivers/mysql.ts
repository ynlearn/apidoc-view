import type { Pool, PoolConnection } from 'mysql2/promise';
import { config } from '../../config.js';
import type { Database, Queryable, Statement } from '../types.js';

type QueryResult = [any, any];

/** 语句工厂：绑定 SQL 文本，参数每次执行时传入（连接池语义，无跨连接的预编译句柄） */
function makeStatement(runSql: (sql: string, params: unknown[]) => Promise<QueryResult>, sql: string): Statement {
  return {
    async run(...params: unknown[]): Promise<{ changes: number }> {
      const [result] = await runSql(sql, params);
      return { changes: Number(result?.affectedRows ?? 0) };
    },
    async get(...params: unknown[]): Promise<Record<string, any> | undefined> {
      const [rows] = await runSql(sql, params);
      return (rows as Record<string, any>[] | undefined)?.[0];
    },
    async all(...params: unknown[]): Promise<Record<string, any>[]> {
      const [rows] = await runSql(sql, params);
      return (rows as Record<string, any>[] | undefined) ?? [];
    },
  };
}

function makeQueryable(
  runSql: (sql: string, params: unknown[]) => Promise<QueryResult>,
  runDdl: (sql: string) => Promise<QueryResult>,
): Queryable {
  return {
    prepare: (sql) => makeStatement(runSql, sql),
    // DDL 走 query 而非 execute：部分 DDL 语句无法走服务端预编译协议
    exec: async (sql) => {
      await runDdl(sql);
    },
  };
}

export async function createMysqlDb(): Promise<Database> {
  const mysql = (await import('mysql2/promise')).default;
  const pool: Pool = config.dbUrl
    ? mysql.createPool({ uri: config.dbUrl, connectionLimit: config.dbPoolSize, waitForConnections: true })
    : mysql.createPool({
        host: config.dbHost,
        port: config.dbPort,
        user: config.dbUser,
        password: config.dbPassword,
        database: config.dbName,
        connectionLimit: config.dbPoolSize,
        waitForConnections: true,
      });

  const poolQueryable = makeQueryable(
    (sql, params) => pool.execute(sql, params as any[]) as unknown as Promise<QueryResult>,
    (sql) => pool.query(sql) as unknown as Promise<QueryResult>,
  );

  return {
    dialect: 'mysql',
    ...poolQueryable,
    ident: (name) => `\`${name.replace(/`/g, '``')}\``,
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const conn: PoolConnection = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const tx = makeQueryable(
          (sql, params) => conn.execute(sql, params as any[]) as unknown as Promise<QueryResult>,
          (sql) => conn.query(sql) as unknown as Promise<QueryResult>,
        );
        const result = await fn(tx);
        await conn.commit();
        return result;
      } catch (err) {
        try {
          await conn.rollback();
        } catch {
          /* 连接可能已断开，rollback 失败不影响向上抛原始错误 */
        }
        throw err;
      } finally {
        conn.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
