import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { createApp } from './app.js';
import { getAdminPassword, isViewGateEnabled } from './services/authService.js';

migrate();

/**
 * 启动即解析管理密码：未配置 ADMIN_PASSWORD 时在这里生成随机密码并落盘 data/.admin-password。
 * 不预热的话密码会拖到第一次登录校验才生成——首次部署的人既登不进去、也不知道文件在哪。
 */
getAdminPassword();

const app = createApp();

app.listen(config.port, config.host, () => {
  console.log(`[apidoc-view] server listening on http://${config.host}:${config.port}`);
  console.log(`[apidoc-view] db: ${config.dbPath}`);
  console.log(`[apidoc-view] 管理端账号: ${config.adminUsername}（密码见 ADMIN_PASSWORD 或 data/.admin-password）`);
  console.log(
    `[apidoc-view] 浏览端: ${isViewGateEnabled() ? '已开启访问口令（VIEW_PASSWORD）' : '开放访问（未设置 VIEW_PASSWORD）'}`,
  );
  if (config.ssrfInternalAllowlist.length) {
    console.log(`[apidoc-view] SSRF internal allowlist: ${config.ssrfInternalAllowlist.join(', ')}`);
  }
});
