# API接口文档与调试工作台（apidoc-view）

一个类似 Apifox 的轻量内部工具，聚焦两件事：**OpenAPI 3.0 接口文档管理** 与 **在线请求调试**。

## 页面结构（查看端 / 管理端完全独立）

- **查看端 `/`**（Apifox 风格三栏文档页）：顶栏 + 左侧分组接口树 + 中间文档正文（请求参数 / 请求体 Schema / 响应示例）+ 右侧「本页目录」；「调试」Tab 内完成在线调试。专注"查"。
- **管理端 `/admin`**：文档管理（导入 / 预览 / 导出 / 删除）、环境管理（增删改 / 激活）、全局变量、请求历史。专注"增删改"。

两个入口**互不跳转**：顶栏不提供互相切换的入口，管理端「预览」在抽屉内原地查看，不再跳到查看端。各自独立访问、独立鉴权：

- 管理端：必须账号密码登录（`ADMIN_USERNAME` / `ADMIN_PASSWORD`）。
- 查看端：默认开放；只有设置了 `VIEW_PASSWORD` 时才要求输入访问口令。

## 功能

- **文档管理**：粘贴 JSON/YAML/Markdown、上传文件、URL 三种方式导入；OpenAPI 3.0 文档生成接口树并支持按接口名 / 路径 / 中文摘要 / 标签搜索，导出 JSON/YAML；Markdown 文档渲染正文与标题目录，原样导出 `.md`。
- **在线调试**：任意 URL / 方法 / Query / Header / Body（json / form-data / raw）；响应格式化查看、状态、耗时、大小、下载。
- **一键带入**：接口文档页点击「调试此接口」或顶栏「带入调试」，自动填充 method / URL / 参数 / 示例 Body。
- **环境变量**：dev/test/prod 环境切换，`{{变量名}}` 插值（作用于 URL / Query / Header / Body），环境变量覆盖全局变量。
- **请求历史**：自动记录每次请求，敏感头（X-Api-Key / Authorization / Cookie 等）脱敏存储，可回看 / 清空。
- **安全**：管理端账号密码登录 + 可选浏览口令（HMAC 签名 token、恒定时间比较、登录失败限流）；内置通用代理与 SSRF 防护。

## 技术栈

- 前端：Vue 3 + TypeScript + Vite + Element Plus + Pinia + CodeMirror 6
- 后端：Node + Express + TypeScript，SQLite 使用 Node 22 内置 `node:sqlite`（零原生依赖）
- 工程：pnpm workspace monorepo（shared / server / web）

## 快速开始

要求 Node ≥ 22.5（需要 `node:sqlite`），pnpm ≥ 10。

```bash
pnpm install
cp .env.example .env                       # 首次：填 ADMIN_PASSWORD（管理端密码）等
pnpm --filter @openapi-view/shared build   # 首次需构建共享类型
pnpm dev                                # 同时启动前端(5173)与后端(3000)
```

浏览器打开 http://localhost:5173 。开发模式下 Vite 把 `/api` 代理到后端 3000，同源无跨域问题。

> 不建 `.env` 也能跑：未设 `ADMIN_PASSWORD` 时会在首次启动生成随机密码，打印在启动日志里并写入 `data/.admin-password`。

生产部署：

```bash
pnpm build
NODE_NO_WARNINGS=1 node packages/server/dist/index.js   # 单进程同时托管 API 与前端静态资源
```

访问 http://localhost:3000 。

## 调试内网服务

SSRF 防护默认拦截所有内网地址。若要调试内网服务，通过环境变量配置**内网例外白名单**（精确 host，不支持网段通配）：

```bash
SSRF_INTERNAL_ALLOWLIST=my-api.internal pnpm dev
# 多个用逗号分隔
SSRF_INTERNAL_ALLOWLIST=my-api.internal,10.0.0.5 pnpm dev
```

白名单仅豁免内网网段拦截；协议白名单（仅 http/https）、端口黑名单、云元数据地址校验仍然生效。也可不配白名单，直接把目标服务通过 nginx 反向代理到一个公网可解析的地址再调试。

> 环境变量的 `baseUrl` 若指向本机，建议使用 `127.0.0.1` 而非 `localhost`。`localhost` 在部分系统优先解析为 IPv6 `::1`，若目标服务仅监听 IPv4 会导致连接失败（工具已做 IPv4 优先与失败回退，但仍推荐显式用 `127.0.0.1`）。

## 配置项

配置全部走环境变量，可直接写在项目根目录的 `.env` 文件里（模板见 `.env.example`，`cp .env.example .env` 后修改）。
**已存在的真实环境变量优先**，`.env` 只做兜底——容器 / K8s 用 `-e` 注入时不会被仓库里的文件顶掉。

### 鉴权怎么配（三句话）

1. **管理端必须登录**，账号由 `ADMIN_USERNAME`（默认 `admin`）+ `ADMIN_PASSWORD` 决定；`ADMIN_PASSWORD` 不设则启动时生成随机密码（见启动日志 / `data/.admin-password`）。
2. **浏览端是否要口令，就看 `VIEW_PASSWORD`**：留空 = 谁都能看；填了 = 进浏览页要先输这个口令。
3. **没有"一键关闭鉴权"的总开关**——管理端登录是硬性开启的，防止误配把后台裸奔在公网。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 3000 | 后端端口 |
| `DB_PATH` | `<项目>/data/app.db` | SQLite 数据库路径 |
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

## 数据与安全说明

- 数据库文件在 `data/app.db`，已加入 `.gitignore`。环境密钥（如 X-Api-Key）以明文存储，请仅在内网使用，勿存生产高敏密钥。
- 请求历史中的敏感头已脱敏，响应仅存截断预览。
- 鉴权接口分层：文档/环境/全局变量的写操作与请求历史仅管理员可访问；查看端的读接口与调试代理在开启访问口令时需携带浏览 token（管理员 token 视为超集）。
- Markdown 渲染关闭了原始 HTML（`html: false`），Markdown 文件无法注入脚本。
- SSRF 校验在「DNS 解析后」进行并把连接锁定到已验证 IP，重定向逐跳重新校验，防止 DNS rebinding 与跳转到内网。

## 当前不支持

可视化编辑接口定义、多项目 / 版本管理、多用户与细粒度权限（当前是单管理员账号 + 可选浏览口令）、Mock 服务、测试脚本 —— 这些属于完整 Apifox 形态，不在前期范围。
