/**
 * 数据库方言契约测试：同一套断言跑 sqlite / mysql / postgres。
 * 直连仓储层（不起 HTTP 服务），每个仓储的关键语义都要在三方言下行为一致。
 *
 * 用法：
 *   node --import tsx tests/db-contract.mjs                          # sqlite（默认，临时文件库）
 *   docker compose -f docker-compose.test.yml up -d                  # 先起 mysql/pg 容器
 *   DB_TYPE=mysql    DB_URL='mysql://root:contract-root@127.0.0.1:3307/apidoc_test'    node --import tsx tests/db-contract.mjs
 *   DB_TYPE=postgres DB_URL='postgres://postgres:contract-pass@127.0.0.1:5433/apidoc_test' node --import tsx tests/db-contract.mjs
 *
 * 设计取舍：
 * - 不起 HTTP：方言差异只可能出在 db 层，直连仓储最小化暴露面，失败时不用猜是路由还是 SQL；
 * - sqlite 用带时间戳的临时文件，跑完即弃；mysql/pg 复用测试容器，测试开头统一清库，可重复执行；
 * - 连接有重试窗口：容器首次初始化（初始化库、建库）要几十秒，测试自己等，不依赖外部脚本轮询。
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRunner } from './lib/api.mjs';

const dialect = (process.env.DB_TYPE ?? 'sqlite').toLowerCase();
const R = createRunner();

// ---------- 环境准备（必须在 import 配置相关模块之前完成） ----------
process.env.HISTORY_RETENTION = process.env.HISTORY_RETENTION ?? '5';

if (dialect === 'sqlite') {
  const tmp = path.join(os.tmpdir(), 'apidoc-view-contract');
  fs.mkdirSync(tmp, { recursive: true });
  process.env.DB_PATH = path.join(tmp, `contract-${Date.now()}.db`);
}

// 动态 import：config/db 在模块加载时读环境变量，env 必须先就位
const dbMod = await import('../packages/server/src/db/index.js');
const { migrate } = await import('../packages/server/src/db/migrate.js');
const documentsRepo = await import('../packages/server/src/db/repositories/documents.js');
const environmentsRepo = await import('../packages/server/src/db/repositories/environments.js');
const globalsRepo = await import('../packages/server/src/db/repositories/globals.js');
const historyRepo = await import('../packages/server/src/db/repositories/history.js');
const sharesRepo = await import('../packages/server/src/db/repositories/shares.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label, tries = 60, delayMs = 1000) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      process.stdout.write(`[${label}] 第 ${i}/${tries} 次失败（${String(err?.code ?? err?.message).slice(0, 100)}），${i < tries ? '重试...' : '放弃'}\n`);
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

/** 清库：让契约测试可以对着持久化的 mysql/pg 容器反复跑 */
async function wipeAll() {
  await historyRepo.clearHistory();
  await globalsRepo.replaceGlobals([]);
  for (const s of await sharesRepo.listShares()) await sharesRepo.deleteShare(s.id);
  for (const d of await documentsRepo.listDocuments()) await documentsRepo.deleteDocument(d.id);
  for (const e of await environmentsRepo.listEnvironments()) await environmentsRepo.deleteEnvironment(e.id);
}

try {
  // ---------- 0. 引擎身份 ----------
  // 探针 SQL 是方言专属的：跑错引擎会直接抛错，防止"声称 mysql 实际还在写 sqlite"的假绿
  const probes = {
    sqlite: 'SELECT sqlite_version() AS v',
    mysql: 'SELECT VERSION() AS v',
    postgres: 'SELECT version() AS v',
  };
  let probeVal;
  let probeErr;
  try {
    probeVal = (await dbMod.db.prepare(probes[dialect]).get())?.v;
  } catch (err) {
    probeErr = err;
  }
  R.check('M00 方言探针可执行（引擎身份正确）', typeof probeVal === 'string' && probeVal.length > 0, probeErr ? String(probeErr.message).slice(0, 120) : String(probeVal));
  R.check('M00b facade 暴露声明方言', dbMod.db.dialect === dialect, String(dbMod.db.dialect));

  // ---------- 1. 迁移 ----------
  await withRetry(() => migrate(), 'migrate');
  let migrateTwiceOk = true;
  try {
    await migrate();
  } catch (err) {
    migrateTwiceOk = false;
    console.error('M01 失败详情：', err);
  }
  R.check('M01 migrate 幂等（重复执行不报错）', migrateTwiceOk);

  await wipeAll();

  // ---------- 2. documents ----------
  const normA = {
    title: '契约文档A',
    servers: [],
    groups: [
      {
        name: '默认分组',
        operations: [{ id: 'GET:/a', method: 'GET', path: '/a', summary: 'A接口', parameters: [], responses: [] }],
      },
    ],
    operationCount: 1,
  };
  const idA = await documentsRepo.insertDocument({
    title: "契约文档A ✨含'引号\"",
    sourceType: 'paste',
    rawContent: "raw-内容A'含引号\"",
    rawFormat: 'json',
    normalized: normA,
  });
  R.check('M02 插入文档返回 id', !!idA, String(idA));

  const detailA = await documentsRepo.getDocument(idA);
  R.check(
    'M03 回读文档字段一致（含引号/emoji 往返）',
    detailA && detailA.title === "契约文档A ✨含'引号\"" && detailA.rawContent === "raw-内容A'含引号\"" && detailA.normalized.operationCount === 1,
    detailA ? detailA.title : String(detailA),
  );
  R.check(
    'M04 时间戳是 number 而非字符串（pg int8 解析）',
    typeof detailA?.createdAt === 'number' && typeof detailA?.updatedAt === 'number',
    `${typeof detailA?.createdAt}/${typeof detailA?.updatedAt}`,
  );

  await sleep(5); // 同毫秒插入会让 updated_at 排序不稳定，这里刻意错开
  const idB = await documentsRepo.insertDocument({
    title: '契约文档B',
    sourceType: 'paste',
    rawContent: 'raw-B',
    rawFormat: 'json',
    normalized: { title: 'B', servers: [], groups: [], operationCount: 0 },
  });
  const list = await documentsRepo.listDocuments();
  R.check(
    'M05 列表按 updated_at 倒序且计数一致',
    list[0]?.id === idB && list.find((d) => d.id === idA)?.operationCount === 1,
    `first=${list[0]?.id} len=${list.length}`,
  );

  const replaced = await documentsRepo.replaceDocumentContent(idA, {
    rawContent: 'raw-A2',
    rawFormat: 'json',
    normalized: { ...normA, operationCount: 2 },
  });
  const detailA2 = await documentsRepo.getDocument(idA);
  R.check(
    'M06 覆盖内容生效且未传 title 时保持原值（COALESCE 语义）',
    replaced === true && detailA2.rawContent === 'raw-A2' && detailA2.title === "契约文档A ✨含'引号\"" && detailA2.normalized.operationCount === 2,
    `raw=${detailA2.rawContent} op=${detailA2.normalized.operationCount}`,
  );

  R.check(
    'M07 删除存在的文档返回 true，不存在返回 false',
    (await documentsRepo.deleteDocument(idB)) === true && (await documentsRepo.deleteDocument('no-such-id')) === false,
  );

  // ---------- 3. environments ----------
  const envA = await environmentsRepo.createEnvironment('契约环境A', { token: 'a-token', base: 'http://a' });
  let dupOk = false;
  let dupErr = '';
  try {
    await environmentsRepo.createEnvironment('契约环境A', {});
  } catch (err) {
    dupErr = String(err?.message ?? err).slice(0, 120);
    dupOk = typeof dbMod.isUniqueViolation === 'function' && dbMod.isUniqueViolation(err);
  }
  R.check('M08 重名环境抛唯一约束且 isUniqueViolation 识别', dupOk === true, dupErr);

  const upd = await environmentsRepo.updateEnvironment(envA.id, { variables: { token: 'a2', g3: 'env值' } });
  R.check('M09 更新环境变量', upd?.variables?.token === 'a2', JSON.stringify(upd?.variables));

  const envB = await environmentsRepo.createEnvironment('契约环境B', {});
  const act = await environmentsRepo.activateEnvironment(envB.id);
  const envList = await environmentsRepo.listEnvironments();
  R.check(
    'M10 激活环境（事务）后全局恰好一个 active 且是它',
    act?.isActive === true && envList.filter((e) => e.isActive).length === 1 && envList.find((e) => e.isActive)?.id === envB.id,
    JSON.stringify(envList.map((e) => ({ id: e.id, active: e.isActive }))),
  );
  R.check('M11 激活不存在的环境返回 undefined', (await environmentsRepo.activateEnvironment('no-such-id')) === undefined);

  // ---------- 4. globals ----------
  await globalsRepo.replaceGlobals([
    { key: 'g1', value: 'v1', description: 'd1' },
    { key: 'g2', value: 'v2' },
  ]);
  const gList = await globalsRepo.listGlobals();
  R.check(
    'M13 全局变量全量写入且 key 排序（key 为 MySQL 保留字，方言引号必须生效）',
    gList.length === 2 && gList[0]?.key === 'g1' && gList[0]?.description === 'd1' && gList[1]?.description === undefined,
    JSON.stringify(gList),
  );
  await globalsRepo.replaceGlobals([{ key: 'g3', value: 'v3' }]);
  const gList2 = await globalsRepo.listGlobals();
  R.check('M14 再次 replace 旧数据被清除（事务替换语义）', gList2.length === 1 && gList2[0]?.key === 'g3', JSON.stringify(gList2));

  const act2 = await environmentsRepo.activateEnvironment(envA.id);
  R.check('M12 再次激活后回读 active', act2?.isActive === true && act2?.id === envA.id);

  const merged = await globalsRepo.getMergedVariables();
  R.check('M15 合并变量：激活环境覆盖同名全局', merged.g3 === 'env值' && merged.token === 'a2', JSON.stringify(merged));

  // ---------- 5. history ----------
  const ret = Number(process.env.HISTORY_RETENTION ?? 5);
  for (let i = 0; i < ret + 3; i++) {
    await historyRepo.insertHistory({
      method: 'GET',
      urlActual: `http://t/${i}`,
      requestHeaders: { authorization: 'secret-header', 'x-custom': String(i) },
      statusCode: 200,
      responsePreview: 'ok',
    });
    // 同毫秒插入会让 created_at 排序出现平局，断言"最新一条"会随机翻车，刻意错开
    await sleep(3);
  }
  const h = await historyRepo.listHistory(100, 0);
  R.check('M16 历史保留条数=retention 且 total 一致', h.total === ret && h.items.length === ret, `total=${h.total} items=${h.items.length}`);
  R.check('M17 最旧的一条被截掉（保留最新 N 条）', h.items[0]?.urlActual === `http://t/${ret + 2}`, String(h.items[0]?.urlActual));
  R.check('M18 敏感请求头脱敏', h.items[h.items.length - 1]?.requestHeaders.authorization === '******', JSON.stringify(h.items[h.items.length - 1]?.requestHeaders));

  const hid = h.items[0].id;
  R.check(
    'M19 单条读取与删除',
    (await historyRepo.getHistory(hid))?.id === hid && (await historyRepo.deleteHistory(hid)) === true && (await historyRepo.getHistory(hid)) === undefined,
  );
  await historyRepo.clearHistory();
  R.check('M20 清空历史', (await historyRepo.listHistory(10, 0)).total === 0);

  // ---------- 6. shares ----------
  const docId = await documentsRepo.insertDocument({
    title: '分享宿主文档',
    sourceType: 'paste',
    rawContent: 'raw',
    rawFormat: 'json',
    normalized: { title: '分享宿主文档', servers: [], groups: [], operationCount: 0 },
  });
  const sid = await sharesRepo.insertShare({
    token: 'tok_contract_1',
    targetType: 'document',
    documentId: docId,
    title: '分享A',
    passwordHash: 'hash:xyz',
    expiresAt: Date.now() + 86_400_000,
  });
  const byToken = await sharesRepo.getShareByToken('tok_contract_1');
  R.check(
    'M21 创建分享并按 token 读取',
    byToken?.id === sid && byToken.enabled === true && byToken.passwordHash === 'hash:xyz' && typeof byToken.expiresAt === 'number',
    JSON.stringify(byToken ?? null),
  );
  R.check('M22 按 id 读取分享', (await sharesRepo.getShareById(sid))?.token === 'tok_contract_1');

  R.check(
    'M23 更新分享标题与停用',
    (await sharesRepo.updateShare(sid, { title: '分享A改', enabled: false })) === true && (await sharesRepo.getShareById(sid))?.title === '分享A改',
  );
  const afterDisable = await sharesRepo.getShareById(sid);
  R.check('M24 停用后 enabled=false 且口令哈希保留', afterDisable.enabled === false && afterDisable.passwordHash === 'hash:xyz');
  R.check(
    'M25 null 清除口令与过期时间（永久化）',
    (await sharesRepo.updateShare(sid, { passwordHash: null, expiresAt: null })) === true &&
      (await sharesRepo.getShareById(sid))?.passwordHash === undefined &&
      (await sharesRepo.getShareById(sid))?.expiresAt === undefined,
  );
  R.check('M26 空补丁不报错且返回 true', (await sharesRepo.updateShare(sid, {})) === true);

  const sid2 = await sharesRepo.insertShare({ token: 'tok_contract_2', targetType: 'operation', documentId: docId, operationId: 'GET:/a', title: '分享B' });
  const otherDoc = await documentsRepo.insertDocument({
    title: '其他文档',
    sourceType: 'paste',
    rawContent: 'r',
    rawFormat: 'json',
    normalized: { title: '其他文档', servers: [], groups: [], operationCount: 0 },
  });
  const sid3 = await sharesRepo.insertShare({ token: 'tok_contract_3', targetType: 'document', documentId: otherDoc, title: '分享C' });
  const docShares = await sharesRepo.listShares(docId);
  R.check(
    'M27 按文档过滤分享且 JOIN 出文档标题',
    docShares.length === 2 && docShares.every((s) => s.documentId === docId) && docShares.every((s) => s.documentTitle === '分享宿主文档'),
    JSON.stringify(docShares),
  );
  const removed = await sharesRepo.deleteSharesByDocument(docId);
  R.check('M28 按文档级联删除返回条数', removed === 2 && (await sharesRepo.getShareById(sid2)) === undefined, `removed=${removed}`);
  R.check('M29 删除分享单条', (await sharesRepo.deleteShare(sid3)) === true);
  await documentsRepo.deleteDocument(docId);
  await documentsRepo.deleteDocument(otherDoc);
} finally {
  // close 在驱动实现里提供；老实现没有就跳过（进程退出时操作系统回收句柄）
  await dbMod.db.close?.();
}

process.exitCode = R.summary() > 0 ? 1 : 0;
