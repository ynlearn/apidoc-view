# =====================================================================
# apidoc-view 生产镜像：单容器 = 前端静态资源 + API + SQLite
# 运行层只带 server 生产依赖闭包（pnpm deploy --legacy），不含 web 构建工具链，
# 镜像约 200MB（全量 node_modules 方案约 477MB）。
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

# legacy deploy（pnpm v10+ 要求 injected workspace 或 --legacy）：
# 产出 server 包 + 自包含生产 node_modules（shared 以 file: 依赖复制进 .pnpm，
# 目录内自洽）；src/tsconfig/data 对运行无用，顺手清掉
RUN pnpm --filter @openapi-view/server deploy --prod --legacy /out && \
    rm -rf /out/src /out/tsconfig.json /out/data

# ---------- 运行阶段 ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# 布局约束：config.ts 以 dist/config.js 上溯三层定位 projectRoot，
# server 包必须位于 <root>/packages/server，前端产物位于 <root>/packages/web/dist
COPY --from=build /out ./packages/server
COPY --from=build /app/packages/web/dist ./packages/web/dist

# SQLite 文件与运行时密钥（.admin-password/.auth-secret）都落这里；
# docker run 不挂卷时也保证目录存在
RUN mkdir -p /app/data

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "packages/server/dist/index.js"]
