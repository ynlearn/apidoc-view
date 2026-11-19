import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const native = new DatabaseSync(config.dbPath);
native.exec('PRAGMA journal_mode = WAL');
native.exec('PRAGMA foreign_keys = ON');
native.exec('PRAGMA busy_timeout = 5000');
class StatementAdapter {
    stmt;
    constructor(stmt) {
        this.stmt = stmt;
    }
    run(...params) {
        const info = this.stmt.run(...params);
        return {
            changes: Number(info.changes),
            lastInsertRowid: info.lastInsertRowid,
        };
    }
    get(...params) {
        return this.stmt.get(...params);
    }
    all(...params) {
        return this.stmt.all(...params);
    }
}
export const db = {
    prepare(sql) {
        return new StatementAdapter(native.prepare(sql));
    },
    exec(sql) {
        native.exec(sql);
    },
    pragma(_name) {
        // PRAGMA 已在初始化时设置
    },
    transaction(fn) {
        return ((...args) => {
            native.exec('BEGIN');
            try {
                const result = fn(...args);
                native.exec('COMMIT');
                return result;
            }
            catch (err) {
                native.exec('ROLLBACK');
                throw err;
            }
        });
    },
};
//# sourceMappingURL=index.js.map