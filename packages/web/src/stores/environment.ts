import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Environment, GlobalVariable, MergedVariables } from '@openapi-view/shared';
import * as api from '../api/environments';

export const useEnvironmentStore = defineStore('environment', () => {
  const environments = ref<Environment[]>([]);
  const activeId = ref<string | null>(null);
  const globals = ref<GlobalVariable[]>([]);

  const SELECTED_ENV_KEY = 'bb.selectedEnvId';

  const activeEnvironment = computed(
    () => environments.value.find((e) => e.id === activeId.value) ?? null,
  );

  const mergedVariables = computed<MergedVariables>(() => {
    const merged: MergedVariables = {};
    for (const g of globals.value) merged[g.key] = g.value;
    if (activeEnvironment.value) Object.assign(merged, activeEnvironment.value.variables);
    return merged;
  });

  async function load() {
    const [envRes, globalsRes] = await Promise.all([api.listEnvironments(), api.listGlobals()]);
    environments.value = envRes.items;
    // 选择优先取本地持久化的值（刷新/重开浏览器后保持），其次服务端记录
    const saved = localStorage.getItem(SELECTED_ENV_KEY);
    const savedExists = saved && envRes.items.some((e) => e.id === saved);
    activeId.value = savedExists ? saved : envRes.items.some((e) => e.id === envRes.activeId) ? envRes.activeId : envRes.items[0]?.id ?? null;
    if (activeId.value) localStorage.setItem(SELECTED_ENV_KEY, activeId.value);
    globals.value = globalsRes;
  }

  async function addEnvironment(name: string, variables: Record<string, string>) {
    const env = await api.createEnvironment(name, variables);
    await load();
    return env;
  }

  async function updateEnv(id: string, patch: { name?: string; variables?: Record<string, string> }) {
    await api.updateEnvironment(id, patch);
    await load();
  }

  async function removeEnvironment(id: string) {
    await api.deleteEnvironment(id);
    if (activeId.value === id) select(null);
    await load();
  }

  /** 切换使用中的环境：纯前端选择，落 localStorage，无需激活 */
  function select(id: string | null) {
    activeId.value = id;
    if (id) localStorage.setItem(SELECTED_ENV_KEY, id);
    else localStorage.removeItem(SELECTED_ENV_KEY);
  }

  async function saveGlobals(variables: Array<{ key: string; value: string; description?: string }>) {
    globals.value = await api.replaceGlobals(variables);
  }

  return {
    environments,
    activeId,
    activeEnvironment,
    globals,
    mergedVariables,
    load,
    addEnvironment,
    updateEnv,
    removeEnvironment,
    select,
    saveGlobals,
  };
});
