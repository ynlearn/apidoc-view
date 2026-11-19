import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AuthStatus } from '@openapi-view/shared';
import * as api from '../api/auth';
import { ADMIN_TOKEN_KEY, UNAUTHORIZED_EVENT, VIEW_TOKEN_KEY } from '../api/http';

export const useAuthStore = defineStore('auth', () => {
  const status = ref<AuthStatus | null>(null);
  /** status 拉取完成前的加载态，避免页面先闪登录框再闪内容 */
  const ready = ref(false);
  const role = computed(() => status.value?.role ?? null);
  const viewGate = computed(() => Boolean(status.value?.viewGate));

  let listening = false;
  function listenUnauthorized() {
    if (listening) return;
    listening = true;
    window.addEventListener(UNAUTHORIZED_EVENT, () => { void refresh(); });
  }

  /** 只刷新登录态，不清 token（token 由请求层在 401 时清） */
  async function refresh() {
    try {
      status.value = await api.getAuthStatus();
    } finally {
      ready.value = true;
    }
  }

  async function init() {
    listenUnauthorized();
    await refresh();
  }

  async function loginAdmin(username: string, password: string) {
    const res = await api.login({ mode: 'admin', username, password });
    localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
    await refresh();
  }

  async function loginView(password: string) {
    const res = await api.login({ mode: 'view', password });
    localStorage.setItem(VIEW_TOKEN_KEY, res.token);
    await refresh();
  }

  async function logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(VIEW_TOKEN_KEY);
    await refresh();
  }

  return { status, ready, role, viewGate, init, refresh, loginAdmin, loginView, logout };
});
