<template>
  <div class="gate-page">
    <div class="gate-card">
      <div class="gate-logo" aria-hidden="true">A</div>
      <h1 class="gate-title">{{ mode === 'admin' ? '管理后台登录' : '请输入访问口令' }}</h1>
      <p class="gate-desc">
        {{ mode === 'admin'
          ? '管理后台需要账号密码登录，浏览端与后台相互独立。'
          : '当前站点已开启访问保护，请向管理员获取访问口令。' }}
      </p>

      <el-form label-position="top" @submit.prevent="onSubmit">
        <el-form-item v-if="mode === 'admin'" label="账号">
          <el-input
            v-model="username"
            size="large"
            placeholder="请输入账号"
            autocomplete="username"
            clearable
          />
        </el-form-item>
        <el-form-item :label="mode === 'admin' ? '密码' : '访问口令'">
          <el-input
            v-model="password"
            type="password"
            size="large"
            :placeholder="mode === 'admin' ? '请输入密码' : '请输入访问口令'"
            :autocomplete="mode === 'admin' ? 'current-password' : 'off'"
            show-password
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-button type="primary" size="large" class="gate-submit" :loading="loading" @click="onSubmit">
          {{ mode === 'admin' ? '登录' : '进入' }}
        </el-button>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';

const props = defineProps<{ mode: 'admin' | 'view' }>();
const emit = defineEmits<{ success: [] }>();

const authStore = useAuthStore();
const username = ref('');
const password = ref('');
const loading = ref(false);

async function onSubmit() {
  if (loading.value) return;
  if (props.mode === 'admin' && !username.value.trim()) {
    ElMessage.warning('请输入账号');
    return;
  }
  if (!password.value) {
    ElMessage.warning(props.mode === 'admin' ? '请输入密码' : '请输入访问口令');
    return;
  }

  loading.value = true;
  try {
    if (props.mode === 'admin') await authStore.loginAdmin(username.value.trim(), password.value);
    else await authStore.loginView(password.value);
    password.value = '';
    emit('success');
  } catch (err: any) {
    // 登录接口的错误不走全局提示，这里单独提示
    ElMessage.error(err?.response?.data?.message ?? '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.gate-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--af-bg-subtle);
  padding: 24px;
}
.gate-card {
  width: 100%;
  max-width: 380px;
  background: var(--af-bg);
  border: 1px solid var(--af-border);
  border-radius: var(--af-radius-lg);
  box-shadow: var(--af-shadow);
  padding: 32px 28px 28px;
}
.gate-logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #6a5cf5, #8b7bff);
  color: #fff;
  font-weight: 700;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}
.gate-title { margin: 0 0 6px; font-size: 19px; font-weight: 600; }
.gate-desc { margin: 0 0 20px; font-size: 12.5px; color: var(--af-text-tertiary); line-height: 1.7; }
.gate-submit { width: 100%; margin-top: 4px; }
</style>
