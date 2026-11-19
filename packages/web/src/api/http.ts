import axios from 'axios';
import { ElMessage } from 'element-plus';

export const ADMIN_TOKEN_KEY = 'bb.adminToken';
export const VIEW_TOKEN_KEY = 'bb.viewToken';
/** 登录态失效时广播，由 auth store 监听并刷新状态 */
export const UNAUTHORIZED_EVENT = 'af:unauthorized';

export const http = axios.create({
  baseURL: '/api',
  timeout: 60_000,
});

http.interceptors.request.use((cfg) => {
  // 管理员 token 的权限是浏览 token 的超集，有则优先
  const token = localStorage.getItem(ADMIN_TOKEN_KEY) ?? localStorage.getItem(VIEW_TOKEN_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    // 登录接口的 401 是"账号密码错"，交给调用方提示，不当成登录态失效
    const isLoginRequest = String(err?.config?.url ?? '').includes('/auth/login');

    if (status === 401 && !isLoginRequest) {
      const usedAdmin = Boolean(localStorage.getItem(ADMIN_TOKEN_KEY));
      localStorage.removeItem(usedAdmin ? ADMIN_TOKEN_KEY : VIEW_TOKEN_KEY);
      window.dispatchEvent(
        new CustomEvent(UNAUTHORIZED_EVENT, { detail: { scope: usedAdmin ? 'admin' : 'view' } }),
      );
      return Promise.reject(err);
    }

    const message = err?.response?.data?.message ?? err?.message ?? '请求失败';
    ElMessage.error(message);
    return Promise.reject(err);
  },
);
