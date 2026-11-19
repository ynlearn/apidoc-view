/**
 * 冒烟回归：一条命令跑完关键链路，退出码可判定。
 *
 * 设计取舍（别改成"打到开发机上那个 3000 实例"）：
 * - 自己拉起服务、自己建临时 DB，跑完自己清掉——不受本机 .env / 存量数据影响；
 * - 只走 HTTP，不开浏览器——冒烟要快，UI 断言交给 verify-*.mjs 那类脚本；
 * - 有失败就 exit 1，这样它才配挂进 CI。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, request, createRunner } from './lib/api.mjs';

const PORT = Number(process.env.TEST_PORT ?? 3111);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'smoke-pass-2026';
// 临时 DB 放系统临时目录：不污染仓库 data/，删不掉也只是垃圾文件，不影响下次运行
const TMP_DIR = path.join(os.tmpdir(), 'apidoc-view-smoke');
const DB_PATH = path.join(TMP_DIR, `smoke-${Date.now()}.db`);
const SERVER_DIR = path.join(ROOT, 'packages', 'server');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures-real-openapi.json');

const R = createRunner();
let serverLog = '';

function startServer() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  // 用 --import tsx 直接跑 TS 源码：spawn 出来的就是 node 本体，Windows 上也能一次 kill 干净
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DB_PATH,
      ADMIN_USERNAME,
      ADMIN_PASSWORD,
      // 空值覆盖：浏览端保持开放，才能验证「不配口令即开放」这条口径
      VIEW_PASSWORD: '',
      AUTH_SECRET: 'smoke-test-secret',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const onData = (buf) => {
    serverLog += buf.toString();
    if (serverLog.length > 8000) serverLog = serverLog.slice(-8000);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  return child;
}

async function waitForHealth(child, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // 子进程先挂了（最典型是端口被占 EADDRINUSE）：不要傻等，也不要打到别人的端口上
    if (child.exitCode !== null) return false;
    try {
      const res = await request(`${BASE}/api/health`);
      // 只认自己这套服务的响应：光看 200 会把"端口上跑着别的服务"当成就绪
      if (res.status === 200 && res.json?.status === 'ok') {
        const status = await request(`${BASE}/api/auth/status`);
        if (status.json?.adminLoginRequired === true) return true;
      }
    } catch {
      /* 还没起来，继续等 */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** 杀掉自己拉起的服务并等它真的退出：不等就删 DB，Windows 上文件还被句柄占着 */
function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 2000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function cleanupDb() {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(DB_PATH + suffix, { force: true });
    } catch {
      /* 忽略：Windows 上句柄没完全释放时删不掉，临时目录里的垃圾不影响结论 */
    }
  }
}

const countOperations = (doc) =>
  (doc?.normalized?.groups ?? []).reduce((sum, g) => sum + (g.operations?.length ?? 0), 0);

async function main() {
  const fixture = fs.readFileSync(FIXTURE, 'utf8');
  const child = startServer();
  try {
    if (!(await waitForHealth(child))) {
      console.error(`服务未就绪（端口 ${PORT} 可能已被占用，或服务启动失败），启动日志：\n` + serverLog);
      return 1;
    }

  // ---------- 1. 基础可用性 ----------
  const health = await request(`${BASE}/api/health`);
  R.check('S01 健康检查', health.status === 200 && health.json?.status === 'ok', `HTTP ${health.status}`);

  const status = await request(`${BASE}/api/auth/status`);
  R.check(
    'S02 鉴权状态（管理端必登录 / 浏览端开放）',
    status.json?.adminLoginRequired === true && status.json?.viewGate === false,
    JSON.stringify(status.json),
  );

  // ---------- 2. 鉴权边界 ----------
  const listOpen = await request(`${BASE}/api/documents`);
  R.check('S03 未配 VIEW_PASSWORD 时浏览端无 token 可读', listOpen.status === 200, `HTTP ${listOpen.status}`);

  const createNoToken = await request(`${BASE}/api/documents`, {
    method: 'POST',
    body: { content: fixture, format: 'json', sourceType: 'file' },
  });
  R.check('S04 写接口无 token 必须 401', createNoToken.status === 401, `HTTP ${createNoToken.status}`);

  const badLogin = await request(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: { mode: 'admin', username: ADMIN_USERNAME, password: 'wrong-password' },
  });
  R.check('S05 错误密码 401', badLogin.status === 401, `HTTP ${badLogin.status}`);

  const login = await request(`${BASE}/api/auth/login`, {
    method: 'POST',
    body: { mode: 'admin', username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  const token = login.json?.token;
  R.check('S06 正确密码登录拿到 admin token', login.status === 200 && login.json?.role === 'admin' && !!token);

  const tampered = await request(`${BASE}/api/documents`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}tampered` },
    body: { content: fixture, format: 'json', sourceType: 'file' },
  });
  R.check('S07 篡改 token 必须 401', tampered.status === 401, `HTTP ${tampered.status}`);

  // ---------- 3. 文档导入与读取 ----------
  const created = await request(`${BASE}/api/documents`, {
    method: 'POST',
    token,
    body: { content: fixture, format: 'json', sourceType: 'file' },
  });
  const docId = created.json?.id;
  R.check('S08 导入真实 OpenAPI 文档', created.status === 201 && !!docId, `HTTP ${created.status} id=${docId}`);

  const detail = await request(`${BASE}/api/documents/${docId}`);
  const opCount = countOperations(detail.json);
  R.check(
    'S09 读取文档详情（分组/接口非空）',
    detail.status === 200 && (detail.json?.normalized?.groups?.length ?? 0) > 0 && opCount > 0,
    `groups=${detail.json?.normalized?.groups?.length} ops=${opCount}`,
  );

  const list = await request(`${BASE}/api/documents`);
  const listItems = Array.isArray(list.json) ? list.json : [];
  R.check(
    'S10 列表包含新导入文档且接口数一致',
    listItems.some((d) => d.id === docId && d.operationCount === opCount),
    `count=${listItems.length}`,
  );

  // ---------- 4. 单接口 CRUD（含原文回写） ----------
  const draft = {
    method: 'POST',
    path: '/smoke/ping',
    summary: '冒烟新增接口',
    description: '由 tests/smoke.mjs 创建',
    group: '冒烟分组',
    parameters: [],
    responses: [{ status: '200', description: 'OK', schema: undefined }],
  };
  const added = await request(`${BASE}/api/documents/${docId}/operations`, {
    method: 'POST',
    token,
    body: { draft },
  });
  const opsAfterAdd = countOperations(added.json);
  R.check(
    'S11 新增接口',
    added.status === 201 && opsAfterAdd === opCount + 1,
    `HTTP ${added.status} ops ${opCount} -> ${opsAfterAdd}`,
  );

  const opKey = Buffer.from('POST:/smoke/ping', 'utf8').toString('base64url');
  const updated = await request(`${BASE}/api/documents/${docId}/operations/${opKey}`, {
    method: 'PUT',
    token,
    body: { draft: { ...draft, summary: '冒烟改过的摘要' } },
  });
  const edited = (updated.json?.normalized?.groups ?? [])
    .flatMap((g) => g.operations ?? [])
    .find((o) => o.path === '/smoke/ping');
  R.check('S12 修改接口摘要', updated.status === 200 && edited?.summary === '冒烟改过的摘要', edited?.summary);

  // 手改接口必须回写原文，否则 GET 会拿旧 raw_content 重新归一化把手改内容吃掉
  const reread = await request(`${BASE}/api/documents/${docId}`);
  const rereadOp = (reread.json?.normalized?.groups ?? [])
    .flatMap((g) => g.operations ?? [])
    .find((o) => o.path === '/smoke/ping');
  R.check('S13 重读后手改内容仍在（原文已回写）', rereadOp?.summary === '冒烟改过的摘要', rereadOp?.summary);

  const exported = await request(`${BASE}/api/documents/${docId}/export?format=json`);
  let exportOk = false;
  try {
    exportOk = Boolean(JSON.parse(exported.text)?.paths?.['/smoke/ping']);
  } catch {
    exportOk = false;
  }
  R.check('S14 导出 JSON 且包含手改接口', exported.status === 200 && exportOk, `HTTP ${exported.status}`);

  // ---------- 5. 分享链路 ----------
  const share = await request(`${BASE}/api/shares`, {
    method: 'POST',
    token,
    body: { targetType: 'document', documentId: docId, password: 'smoke-1234', expiresInDays: 1 },
  });
  const shareToken = share.json?.token;
  R.check('S15 创建带口令的文档分享', share.status === 201 && !!shareToken && share.json?.hasPassword === true, `HTTP ${share.status}`);

  const meta = await request(`${BASE}/api/shares/${shareToken}/meta`);
  R.check('S16 分享 meta 提示需要口令', meta.status === 200 && meta.json?.needPassword === true && meta.json?.unavailable === false);

  const lockedContent = await request(`${BASE}/api/shares/${shareToken}/content`);
  R.check('S17 未解锁访问内容必须 401', lockedContent.status === 401, `HTTP ${lockedContent.status}`);

  const wrongUnlock = await request(`${BASE}/api/shares/${shareToken}/unlock`, {
    method: 'POST',
    body: { password: 'not-the-password' },
  });
  R.check('S18 分享错误口令 401', wrongUnlock.status === 401, `HTTP ${wrongUnlock.status}`);

  const unlock = await request(`${BASE}/api/shares/${shareToken}/unlock`, {
    method: 'POST',
    body: { password: 'smoke-1234' },
  });
  const accessToken = unlock.json?.accessToken;
  R.check('S19 分享正确口令拿到访问票', unlock.status === 200 && !!accessToken, `HTTP ${unlock.status}`);

  const shareContent = await request(`${BASE}/api/shares/${shareToken}/content`, { token: accessToken });
  R.check(
    'S20 解锁后可读分享内容（含手改接口）',
    shareContent.status === 200 &&
      (shareContent.json?.document?.groups ?? [])
        .flatMap((g) => g.operations ?? [])
        .some((o) => o.path === '/smoke/ping'),
    `HTTP ${shareContent.status}`,
  );

  const disableShare = await request(`${BASE}/api/shares/${share.json?.id}`, {
    method: 'PATCH',
    token,
    body: { enabled: false },
  });
  const disabledMeta = await request(`${BASE}/api/shares/${shareToken}/meta`);
  R.check(
    'S21 停用分享后 meta 标记不可用',
    disableShare.status === 200 && disabledMeta.json?.unavailable === true,
    `unavailable=${disabledMeta.json?.unavailable}`,
  );

  // ---------- 6. 清理与级联 ----------
  const removedOp = await request(`${BASE}/api/documents/${docId}/operations/${opKey}`, { method: 'DELETE', token });
  R.check(
    'S22 删除接口',
    removedOp.status === 200 && countOperations(removedOp.json) === opCount,
    `ops=${countOperations(removedOp.json)}`,
  );

  const removedDoc = await request(`${BASE}/api/documents/${docId}`, { method: 'DELETE', token });
  const gone = await request(`${BASE}/api/documents/${docId}`);
  const shareAfterDelete = await request(`${BASE}/api/shares/${shareToken}/meta`);
  R.check(
    'S23 删除文档 204 且分享链接随之失效',
    removedDoc.status === 204 && gone.status === 404 && shareAfterDelete.json?.unavailable === true,
    `doc=${removedDoc.status}/${gone.status} shareUnavailable=${shareAfterDelete.json?.unavailable}`,
  );

    R.check('S24 无脚本级异常（服务仍在运行）', child.exitCode === null, child.exitCode === null ? '' : serverLog.slice(-300));
    return R.summary() > 0 ? 1 : 0;
  } finally {
    await stopServer(child);
    cleanupDb();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error('冒烟脚本自身异常：', err);
    console.error('服务日志尾部：\n' + serverLog.slice(-1500));
    process.exitCode = 1;
  });
