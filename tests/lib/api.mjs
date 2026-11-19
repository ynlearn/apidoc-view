import fs from 'node:fs';
import path from 'node:path';

/** 项目根目录（tests/lib -> tests -> 根） */
export const ROOT = path.resolve(import.meta.dirname, '../..');

/** 测试目标地址：可用 TEST_BASE 覆盖，默认跟 PORT 走本机 */
export function baseUrl() {
  if (process.env.TEST_BASE) return process.env.TEST_BASE.replace(/\/$/, '');
  return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

/** 极简请求封装：只做测试需要的事——带 token、吐 JSON、不抛异常 */
export async function request(url, { method = 'GET', body, token, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!init.headers['content-type']) init.headers['content-type'] = 'application/json';
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text, headers: res.headers };
}

/**
 * 管理端账号：优先环境变量，其次读服务落盘的 data/.admin-password。
 * 这样脚本既能打「自己拉起的隔离实例」，也能打「开发机上正跑着的实例」。
 */
export function resolveAdminCredentials() {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    const file = path.join(ROOT, 'data', '.admin-password');
    if (fs.existsSync(file)) password = fs.readFileSync(file, 'utf8').trim();
  }
  if (!password) {
    throw new Error('找不到管理端密码：请设置 ADMIN_PASSWORD 或先启动一次服务生成 data/.admin-password');
  }
  return { username, password };
}

export async function loginAdmin(base = baseUrl()) {
  const { username, password } = resolveAdminCredentials();
  const res = await request(`${base}/api/auth/login`, {
    method: 'POST',
    body: { mode: 'admin', username, password },
  });
  if (res.status !== 200 || !res.json?.token) {
    throw new Error(`管理端登录失败：HTTP ${res.status} ${res.text.slice(0, 120)}`);
  }
  return res.json.token;
}

/** 断言行与退出码：PASS/FAIL 逐条打印，有失败就以非 0 退出，供 CI 判定 */
export function createRunner() {
  let passed = 0;
  let failed = 0;
  return {
    check(id, ok, detail = '') {
      if (ok) passed += 1;
      else failed += 1;
      const suffix = detail ? ` :: ${detail}` : '';
      console.log(`[${ok ? 'PASS' : 'FAIL'}] ${id}${suffix}`);
      return ok;
    },
    summary() {
      console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
      return failed;
    },
  };
}
