<template>
  <header class="af-header">
    <div class="af-header-left">
      <div class="af-logo" @click="router.push(homeTo)">
        <span class="af-logo-mark">A</span>
        <span class="af-logo-text">API接口文档</span>
      </div>
      <span class="af-header-divider"></span>
      <span class="af-header-sub">{{ subtitle }}</span>
    </div>

    <div class="af-header-right">
      <EnvSwitcher v-if="showEnv" />
      <template v-if="showLogout">
        <span class="af-user">{{ roleLabel }}</span>
        <el-button text size="small" class="af-logout" @click="onLogout">
          <el-icon><SwitchButton /></el-icon> 退出登录
        </el-button>
      </template>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { SwitchButton } from '@element-plus/icons-vue';
import EnvSwitcher from './EnvSwitcher.vue';
import { useAuthStore } from '../stores/auth';

// 浏览端与管理端是两个独立入口：顶栏不再提供互跳，logo 只回本端首页
withDefaults(
  defineProps<{
    showEnv?: boolean;
    showLogout?: boolean;
    homeTo?: string;
    subtitle?: string;
  }>(),
  { showEnv: true, showLogout: false, homeTo: '/', subtitle: 'API 文档与调试' },
);

const router = useRouter();
const authStore = useAuthStore();

const roleLabel = computed(() => (authStore.role === 'admin' ? '管理员' : ''));

async function onLogout() {
  await authStore.logout();
}
</script>

<style scoped>
.af-header {
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 24px;
  background: var(--af-bg);
  border-bottom: 1px solid var(--af-border);
  position: relative;
  z-index: 10;
}
.af-header-left,
.af-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.af-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.af-logo-mark {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #6a5cf5, #8b7bff);
  color: #fff;
  font-weight: 700;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgba(106, 92, 245, .3);
}
.af-logo-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--af-text);
}
.af-header-divider {
  width: 1px;
  height: 18px;
  background: var(--af-border);
}
.af-header-sub {
  font-size: 13px;
  color: var(--af-text-tertiary);
  white-space: nowrap;
}
.af-user {
  font-size: 12.5px;
  color: var(--af-text-tertiary);
  padding-left: 12px;
  border-left: 1px solid var(--af-border);
}
.af-logout { color: var(--af-text-secondary); }

@media (max-width: 900px) {
  .af-header-sub, .af-header-divider, .af-user { display: none; }
}
</style>
