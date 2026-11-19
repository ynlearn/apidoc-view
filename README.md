# API 调试工作台（bluebull-cu）

一个类似 Apifox 的轻量内部工具，聚焦两件事：**OpenAPI 3.0 接口文档管理** 与 **在线请求调试**。

## 页面结构（查看端 / 管理端分离）

- **查看端 `/`**（Apifox 风格三栏文档页）：顶栏 + 左侧分组接口树 + 中间文档正文（请求参数 / 请求体 Schema / 响应示例）+ 右侧「本页目录」；「调试」Tab 内完成在线调试。专注"查"。
- **管理端 `/admin`**：文档管理（导入 / 查看 / 导出 / 删除）、环境管理（增删改 / 激活）、全局变量、请求历史。专注"增删改"。两端通过顶栏互相切换。

## 功能

- **文档管理**：粘贴 JSON/YAML、上传文件、URL 三种方式导入 OpenAPI 3.0；接口树支持按接口名 / 路径 / 中文摘要 / 标签搜索；支持导出 JSON/YAML。
- **在线调试**：任意 URL / 方法 / Query / Header / Body（json / form-data / raw）；响应格式化查看、状态、耗时、大小、下载。
- **一键带入**：接口文档页点击「调试此接口」或顶栏「带入调试」，自动填充 method / URL / 参数 / 示例 Body。
- **环境变量**：dev/test/prod 环境切换，`{{变量名}}` 插值（作用于 URL / Query / Header / Body），环境变量覆盖全局变量。
- **请求历史**：自动记录每次请求，敏感头（X-Api-Key / Authorization / Cookie 等）脱敏存储，可回看 / 清空。
- **安全**：内置通用代理与 SSRF 防护。

## 技术栈

- 前端：Vue 3 + TypeScript + Vite + Element Plus + Pinia + CodeMirror 6
- 后端：Node + Express + TypeScript，SQLite 使用 Node 22 内置 `node:sqlite`（零原生依赖）
- 工程：pnpm workspace monorepo（shared / server / web）

## 快速开始

要求 Node ≥ 22.5（需要 `node:sqlite`），pnpm ≥ 10。

```bash
pnpm install
pnpm --filter @bluebull/shared build   # 首次需构建共享类型
pnpm dev                                # 同时启动前端(5173)与后端(3000)
```

浏览器打开 http://localhost:5173 。开发模式下 Vite 把 `/api` 代理到后端 3000，同源无跨域问题。

生产部署：

```bash
pnpm build
NODE_NO_WARNINGS=1 node packages/server/dist/index.js   # 单进程同时托管 API 与前端静态资源
```

访问 http://localhost:3000 。

## 调试内网服务（如 bluebull-openapi）

SSRF 防护默认拦截所有内网地址。若要调试内网服务，通过环境变量配置**内网例外白名单**（精确 host，不支持网段通配）：

```bash
SSRF_INTERNAL_ALLOWLIST=bluebull-openapi.internal pnpm dev
# 多个用逗号分隔
SSRF_INTERNAL_ALLOWLIST=bluebull-openapi.internal,10.0.0.5 pnpm dev
```

白名单仅豁免内网网段拦截；协议白名单（仅 http/https）、端口黑名单、云元数据地址校验仍然生效。也可不配白名单，直接把目标服务通过 nginx 反向代理到一个公网可解析的地址再调试。

> 环境变量的 `baseUrl` 若指向本机，建议使用 `127.0.0.1` 而非 `localhost`。`localhost` 在部分系统优先解析为 IPv6 `::1`，若目标服务仅监听 IPv4 会导致连接失败（工具已做 IPv4 优先与失败回退，但仍推荐显式用 `127.0.0.1`）。

## 配置项

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

## 数据与安全说明

- 数据库文件在 `data/app.db`，已加入 `.gitignore`。环境密钥（如 X-Api-Key）以明文存储，请仅在内网使用，勿存生产高敏密钥。
- 请求历史中的敏感头已脱敏，响应仅存截断预览。
- SSRF 校验在「DNS 解析后」进行并把连接锁定到已验证 IP，重定向逐跳重新校验，防止 DNS rebinding 与跳转到内网。

## 当前不支持

可视化编辑接口定义、多项目 / 版本管理、用户与权限、Mock 服务、测试脚本 —— 这些属于完整 Apifox 形态，不在前期范围。
