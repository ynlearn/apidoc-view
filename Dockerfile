# =====================================================================
# apidoc-view 生产镜像：单容器 = 前端静态资源 + API + SQLite
# server 构建产物是单进程，生产模式同时托管 API 与 packages/web/dist 静态资源，
# SQLite 落 /app/data（compose 里挂命名卷持久化）。
# =====================================================================

# ---------- 构建阶段：装依赖 + 出三个包的产物 ----------
FROM node:22-alpine AS build
WORKDIR /app

# 按项目 packageManager 字段钉死 pnpm 版本，避免 corepack 解析漂移
RUN corepack enable && corepack prepare pnpm@11.2.2 --activate

# 先只拷包清单与 lockfile 再 install：源码改动不打掉依赖安装层缓存
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

# 源码 + 构建（shared 的 dist 是 server 的运行时依赖，必须先建）
COPY tsconfig.base.json ./
COPY packages ./packages
RUN pnpm --filter @openapi-view/shared build && \
    pnpm --filter @openapi-view/server build && \
    pnpm --filter @openapi-view/web build

# ---------- 运行阶段 ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# node_modules 全量拷贝（含 devDependencies）：pnpm workspace 的 prune/deploy 对
# symlink 布局有行为风险，内部工具可靠性优先于镜像体积；后续要瘦身可改 pnpm deploy 方案
COPY --from=build /app/node_modules ./node_modules
# 目录布局必须保持 <root>/packages/{server,shared,web/dist}：
# config.ts 以 dist/config.js 上溯三层定位 projectRoot 与 webDistPath
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/server ./packages/server
COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY package.json pnpm-workspace.yaml ./

# SQLite 文件与运行时密钥（.admin-password/.auth-secret）都落这里；
# docker run 不挂卷时也保证目录存在
RUN mkdir -p /app/data

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
