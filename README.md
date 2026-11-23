# API接口文档与调试工作台（apidoc-view）

一个类似 Apifox 的轻量内部工具，聚焦两件事：**OpenAPI 3.0 接口文档管理** 与 **在线请求调试**。

查看端（浏览文档）与管理端（增删改）是两个独立入口，互不跳转、独立鉴权；生产模式下后端单进程同时托管 API 与前端静态资源，**单容器即可跑通全部功能**（前端 + 后端 + SQLite）。

## 功能特性

**查看端 `/`**（Apifox 风格三栏文档页，专注"查"）：
- 左侧分组接口树 + 中间文档正文（请求参数 / 请求体 Schema / 响应示例）+ 右侧本页目录
- 按接口名 / 路径 / 中文摘要 / 标签搜索；OpenAPI 3.0 生成接口树，Markdown 文档渲染正文与标题目录
- 「调试」Tab 在线调试，或点「调试此接口」一键带入 method / URL / 参数 / 示例 Body

**管理端 `/admin`**（专注"增删改"）：
- 文档管理：粘贴 JSON/YAML/Markdown、上传文件、URL 三种方式导入；预览（抽屉内原地查看）、导出 JSON/YAML/.md、删除
- 环境管理：dev/test/prod 增删改 / 激活；全局变量管理
- 请求历史：自动记录每次请求，敏感头（X-Api-Key / Authorization / Cookie 等）脱敏存储，可回看 / 清空

**通用能力**：
- 任意 URL / 方法 / Query / Header / Body（json / form-data / raw）调试；`{{变量名}}` 插值作用于 URL / Query / Header / Body，环境变量覆盖全局变量
- 安全：管理端账号密码登录（HMAC 签名 token、恒定时间比较、登录失败限流）+ 可选浏览口令；内置代理与 SSRF 防护

## 技术栈

- 前端：Vue 3 + TypeScript + Vite + Element Plus + Pinia + CodeMirror 6
- 后端：Node + Express + TypeScript，数据库默认 SQLite（Node 22 内置 `node:sqlite`，零原生依赖），可选 MySQL / PostgreSQL
- 工程：pnpm workspace monorepo（shared / server / web）

## 快速开始（开发）

要求 Node ≥ 22.5（需要 `node:sqlite`），pnpm ≥ 10。

```bash
pnpm install
cp .env.example .env                       # 首次：填 ADMIN_PASSWORD（管理端密码）等
pnpm --filter @openapi-view/shared build   # 首次需构建共享类型
pnpm dev                                   # 同时启动前端(5173)与后端(3000)
```

浏览器打开 http://localhost:5173 。开发模式下 Vite 把 `/api` 代理到后端 3000，同源无跨域问题。

> 不建 `.env` 也能跑：未设 `ADMIN_PASSWORD` 时会在首次启动生成随机密码，打印在启动日志里并写入 `data/.admin-password`。

## 部署

### 方式一：Docker Compose（推荐，单容器）

```bash
docker compose up -d --build
```

单容器 = 前端静态资源 + API + SQLite，监听 3000 端口；`/api/health` 自带健康检查。数据（SQLite 文件 + 运行时密钥）持久化在命名卷 `apidoc-data`，重建容器不丢。

资源限制：容器上限 **2 核 / 1G 内存**（`deploy.resources.limits`），并给 Node 设了 `--max-old-space-size=768` 给原生内存留余量——内存超限会被内核直接 OOM 杀掉，调大机器规格时记得同步改这两处。

管理密码等敏感配置通过项目根 `.env` 文件注入（compose 自动读取，详见 `.env.example`）：

```bash
# .env 里设置
ADMIN_PASSWORD=your-strong-password
VIEW_PASSWORD=view-pass          # 可选，不设则浏览端开放
```

### 方式二：Node 直跑

```bash
pnpm build
NODE_NO_WARNINGS=1 node packages/server/dist/index.js   # 单进程同时托管 API 与前端静态资源
```

访问 http://localhost:3000 。

## 配置

配置全部走环境变量，可直接写在项目根目录的 `.env` 文件里（模板见 `.env.example`，`cp .env.example .env` 后修改）。
**已存在的真实环境变量优先**，`.env` 只做兜底——容器 / K8s 用 `-e` 注入时不会被仓库里的文件顶掉。

### 鉴权怎么配（三句话）

1. **管理端必须登录**，账号由 `ADMIN_USERNAME`（默认 `admin`）+ `ADMIN_PASSWORD` 决定；`ADMIN_PASSWORD` 不设则启动时生成随机密码（见启动日志 / `data/.admin-password`）。
2. **浏览端是否要口令，就看 `VIEW_PASSWORD`**：留空 = 谁都能看；填了 = 进浏览页要先输这个口令。
3. **没有"一键关闭鉴权"的总开关**——管理端登录是硬性开启的，防止误配把后台裸奔在公网。

### 环境变量总表

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 3000 | 后端端口 |
| `DB_TYPE` | `sqlite` | 数据库方言：`sqlite` / `mysql` / `postgres`（别名 `pg`、`postgresql`、`mariadb`） |
| `DB_PATH` | `<项目>/data/app.db` | SQLite 数据库文件路径（仅 sqlite 模式） |
| `DB_URL` | 空 | mysql/pg 连接串（如 `mysql://user:pass@host:3306/db`），给出时优先于下面的零散参数 |
| `DB_HOST` | `127.0.0.1` | mysql/pg 主机 |
| `DB_PORT` | mysql 3306 / pg 5432 | mysql/pg 端口 |
| `DB_USER` | `apidoc` | mysql/pg 用户名 |
| `DB_PASSWORD` | 空 | mysql/pg 密码 |
| `DB_NAME` | `apidoc_view` | mysql/pg 数据库名（需预先建库） |
| `DB_POOL_SIZE` | 10 | mysql/pg 连接池大小（sqlite 模式不使用） |
| `SSRF_INTERNAL_ALLOWLIST` | 空 | 内网例外 host 白名单（逗号分隔） |
| `ALLOWED_HOSTS` | 空 | 设置后仅允许这些 host（支持 `*.example.com`） |
| `BLOCKED_PORTS` | 22,23,25,3306,6379,27017,11211 | 端口黑名单 |
| `MAX_RESPONSE_BYTES` | 10485760 | 响应体上限，超限截断 |
| `MAX_IMPORT_BYTES` | 5242880 | 导入文档大小上限 |
| `REQUEST_TIMEOUT_MS` | 30000 | 请求总超时（硬上限 60000） |
| `HISTORY_RETENTION` | 200 | 保留的历史条数 |
| `ADMIN_USERNAME` | `admin` | 管理端登录账号 |
| `ADMIN_PASSWORD` | 空（自动生成随机密码） | 管理端登录密码。未设置时生成随机密码并写入 `data/.admin-password`，同时打印在启动日志；生产环境请显式设置 |
| `VIEW_PASSWORD` | 空（不校验） | 查看端访问口令。设置后查看端需先输入口令，留空则完全开放 |
| `AUTH_SECRET` | 空（自动生成并落盘） | token 签名密钥。未设置时写入 `data/.auth-secret`，多实例部署请统一设置同一值 |
| `SESSION_TTL_HOURS` | 12 | 登录态有效期（小时） |

### 数据库

默认 SQLite（零依赖，文件在 `data/app.db`），首次启动自动建表。设置 `DB_TYPE=mysql` 或 `postgres` 后写入外部数据库：

1. **建库**：MySQL 必须 `utf8mb4`（文档含 emoji 时 utf8 会写坏数据），PG 默认 UTF8 即可
2. **建表**：服务启动自动建表（幂等）；应用账号无 DDL 权限或需 DBA 预审时，手动执行 `scripts/sql/schema.mysql.sql` / `scripts/sql/schema.postgres.sql`（与自动建表逐字同源）
3. **配置**：`DB_URL=mysql://apidoc:changeme@127.0.0.1:3306/apidoc_view`（或拆 `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` 零散填）

> 多实例部署注意：`.admin-password` / `.auth-secret` 仍落各实例本地 `data/`，需共享卷或统一注入 `AUTH_SECRET`。

## 测试

```bash
pnpm test:smoke        # HTTP 冒烟回归：自建隔离实例 + 临时 SQLite，24 项断言，失败退出码 1
pnpm test:db           # 数据库契约测试（sqlite）：31 项，直连仓储层
```

冒烟只走 HTTP（健康检查、鉴权边界、文档导入、单接口增改删、导出、分享口令链路），跑完自动清理，不碰你本机的 `data/app.db`。要打已运行的实例：

```bash
TEST_PORT=3111 pnpm test:smoke     # 换端口
TEST_BASE=http://127.0.0.1:3000 ADMIN_PASSWORD=xxx node tests/smoke.mjs   # 打外部实例
```

契约测试同一套断言跑三种方言，覆盖迁移幂等、五表 CRUD、事务语义、历史保留截断、唯一约束识别与特殊字符往返。mysql/pg 打真实例（**注意会清空重建表数据，只对空库/测试库跑**）：

```bash
docker compose -f docker-compose.test.yml up -d                            # 起 mysql/pg 测试容器
DB_TYPE=mysql    DB_URL='mysql://root:contract-root@127.0.0.1:3307/apidoc_test'       pnpm test:db
DB_TYPE=postgres DB_URL='postgres://postgres:contract-pass@127.0.0.1:5433/apidoc_test' pnpm test:db
```

`tests/verify-perf.mjs`、`tests/shot-opensource.mjs` 是 UI 侧的临时脚本（需要本机 Chrome），通过 `tests/lib/api.mjs` 自动登录，不再裸奔 401。

## 调试内网服务（SSRF 白名单）

SSRF 防护默认拦截所有内网地址。若要调试内网服务，配置**内网例外白名单**（精确 host，不支持网段通配）：

```bash
SSRF_INTERNAL_ALLOWLIST=my-api.internal pnpm dev
# 多个用逗号分隔
SSRF_INTERNAL_ALLOWLIST=my-api.internal,10.0.0.5 pnpm dev
```

白名单仅豁免内网网段拦截；协议白名单（仅 http/https）、端口黑名单、云元数据地址校验仍然生效。也可不配白名单，直接把目标服务通过 nginx 反向代理到一个公网可解析的地址再调试。

> 环境变量的 `baseUrl` 若指向本机，建议使用 `127.0.0.1` 而非 `localhost`。`localhost` 在部分系统优先解析为 IPv6 `::1`，若目标服务仅监听 IPv4 会导致连接失败（工具已做 IPv4 优先与失败回退，但仍推荐显式用 `127.0.0.1`）。

## 数据与安全说明

- 请求历史中的敏感头已脱敏，响应仅存截断预览。
- 鉴权接口分层：文档/环境/全局变量的写操作与请求历史仅管理员可访问；查看端的读接口与调试代理在开启访问口令时需携带浏览 token（管理员 token 视为超集）。
- Markdown 渲染关闭了原始 HTML（`html: false`），Markdown 文件无法注入脚本。
- SSRF 校验在「DNS 解析后」进行并把连接锁定到已验证 IP，重定向逐跳重新校验，防止 DNS rebinding 与跳转到内网。
- 环境密钥（如 X-Api-Key）以明文存储，请仅在内网使用，勿存生产高敏密钥。

## 当前不支持

可视化编辑接口定义、多项目 / 版本管理、多用户与细粒度权限（当前是单管理员账号 + 可选浏览口令）、Mock 服务、测试脚本 —— 这些属于完整 Apifox 形态，不在前期范围。
