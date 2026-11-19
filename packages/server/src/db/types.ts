/** 数据库门面类型：三种方言（sqlite/mysql/postgres）共用同一套异步接口 */

export type Dialect = 'sqlite' | 'mysql' | 'postgres';

export interface RunResult {
  /** 受影响行数（INSERT/UPDATE/DELETE） */
  changes: number;
}

export interface Statement {
  run(...params: unknown[]): Promise<RunResult>;
  get(...params: unknown[]): Promise<Record<string, any> | undefined>;
  all(...params: unknown[]): Promise<Record<string, any>[]>;
}

/** 事务内的查询面：与 Database 同构，但绑定到事务专用连接（连接池方言尤其重要） */
export interface Queryable {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  readonly dialect: Dialect;
  /** 方言引号包裹标识符（表名/列名）：MySQL 保留字（如 key）必须用 */
  ident(name: string): string;
  /** 事务：fn 收到的 tx 绑定事务连接；fn 抛错自动回滚并向上抛 */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
