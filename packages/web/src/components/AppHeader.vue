<template>
  <header class="af-header">
    <div class="af-header-left">
      <div class="af-logo" @click="router.push('/')">
        <span class="af-logo-mark">C</span>
        <span class="af-logo-text">CU速运</span>
      </div>
      <span class="af-header-divider"></span>
      <span class="af-header-sub">API 文档与调试</span>
    </div>

    <nav class="af-header-nav">
      <router-link to="/" class="af-nav-item" :class="{ active: route.name === 'viewer' }">
        <el-icon><Document /></el-icon><span>文档浏览</span>
      </router-link>
      <router-link to="/admin" class="af-nav-item" :class="{ active: route.name === 'admin' }">
        <el-icon><Setting /></el-icon><span>管理后台</span>
      </router-link>
    </nav>

    <div class="af-header-right">
      <EnvSwitcher v-if="showEnv" />
      <el-tooltip content="接口文档" placement="bottom">
        <el-button text circle class="af-icon-btn" aria-label="文档浏览" @click="router.push('/')">
          <el-icon><Reading /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { Document, Setting, Reading } from '@element-plus/icons-vue';
import EnvSwitcher from './EnvSwitcher.vue';

withDefaults(defineProps<{ showEnv?: boolean }>(), { showEnv: true });
const route = useRoute();
const router = useRouter();
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
.af-header-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--af-bg-subtle);
  border: 1px solid var(--af-border-light);
  border-radius: 8px;
  padding: 3px;
}
.af-nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--af-text-secondary);
  transition: all .15s;
  white-space: nowrap;
}
.af-nav-item:hover { color: var(--af-primary); }
.af-nav-item.active {
  background: var(--af-bg);
  color: var(--af-primary);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(29, 33, 41, .08);
}
.af-icon-btn { color: var(--af-text-secondary); }

@media (max-width: 900px) {
  .af-header-sub, .af-header-divider { display: none; }
  .af-nav-item span { display: none; }
  .af-nav-item { padding: 6px 10px; }
}
</style>
