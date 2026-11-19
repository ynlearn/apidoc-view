<template>
  <div class="share-page">
    <!-- 加载中 -->
    <div v-if="state === 'loading'" class="share-center">
      <el-icon class="share-loading"><Loading /></el-icon>
      <p>正在加载分享内容…</p>
    </div>

    <!-- 链接失效 -->
    <div v-else-if="state === 'error'" class="share-center">
      <el-result icon="warning" :title="errorTitle" :sub-title="errorMsg">
        <template #extra>
          <el-button @click="boot">重新加载</el-button>
        </template>
      </el-result>
    </div>

    <!-- 口令门 -->
    <div v-else-if="state === 'gate'" class="share-center">
      <div class="share-gate-card">
        <div class="share-gate-icon"><el-icon><Lock /></el-icon></div>
        <h2 class="share-gate-title">{{ meta?.title }}</h2>
        <p class="share-gate-sub">{{ meta?.documentTitle }}</p>
        <el-input
          v-model="password"
          type="password"
          placeholder="请输入访问口令"
          show-password
          class="share-gate-input"
          @keyup.enter="unlock"
        />
        <el-button type="primary" class="share-gate-btn" :loading="unlocking" @click="unlock">进入查看</el-button>
        <p class="share-gate-tip">该分享已设置访问口令，请向分享者索取</p>
      </div>
    </div>

    <!-- 内容 -->
    <template v-else-if="content">
      <header class="share-header">
        <div class="share-header-left">
          <span class="share-logo">API</span>
          <div>
            <div class="share-title">{{ content.title }}</div>
            <div class="share-doc">{{ content.documentTitle }}</div>
          </div>
        </div>
        <el-tag size="small" effect="plain" type="info">只读分享</el-tag>
      </header>

      <div class="share-body">
        <!-- 整份文档：左侧接口导航 -->
        <aside v-if="showNav" class="share-nav">
          <div class="share-nav-title">接口目录</div>
          <div v-for="group in content.document?.groups ?? []" :key="group.name" class="share-nav-group">
            <div class="share-nav-group-name">{{ group.name }}</div>
            <div
              v-for="op in group.operations"
              :key="op.id"
              class="share-nav-item"
              :class="{ active: currentOperation?.id === op.id }"
              @click="selectedId = op.id"
            >
              <span class="method-tag" :class="`method-${op.method}`">{{ op.method }}</span>
              <span class="share-nav-path" :title="op.path">{{ op.path }}</span>
            </div>
          </div>
        </aside>

        <main class="share-content">
          <MarkdownView v-if="content.markdown !== undefined" :content="content.markdown" />
          <DocView
            v-else
            :operation="currentOperation"
            :doc-title="content.documentTitle"
            :group-name="currentGroupName"
            hide-debug
          />
        </main>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Loading, Lock } from '@element-plus/icons-vue';
import type { OperationView, ShareContent, ShareMeta } from '@openapi-view/shared';
import { getShareContent, getShareMeta, unlockShare } from '../api/shares';
import DocView from '../components/DocView.vue';
import MarkdownView from '../components/MarkdownView.vue';

const route = useRoute();
const token = computed(() => String(route.params.token ?? ''));

/** 访问凭据按分享单独存 sessionStorage：关掉标签页即失效，不污染其他分享 */
const storageKey = computed(() => `bb.share.${token.value}`);

const state = ref<'loading' | 'gate' | 'ready' | 'error'>('loading');
const meta = ref<ShareMeta | null>(null);
const content = ref<ShareContent | null>(null);
const password = ref('');
const unlocking = ref(false);
const errorMsg = ref('');
const errorTitle = ref('链接不可用');
const selectedId = ref<string | null>(null);

const showNav = computed(() => content.value?.targetType === 'document' && Boolean(content.value.document?.groups.length));

const currentOperation = computed<OperationView | null>(() => {
  if (!content.value) return null;
  if (content.value.operation) return content.value.operation;
  const all = content.value.document?.groups.flatMap((g) => g.operations) ?? [];
  return all.find((op) => op.id === selectedId.value) ?? all[0] ?? null;
});

const currentGroupName = computed(() => {
  if (content.value?.groupName) return content.value.groupName;
  if (!content.value || !currentOperation.value) return '';
  const group = content.value.document?.groups.find((g) =>
    g.operations.some((op) => op.id === currentOperation.value!.id),
  );
  return group?.name ?? '';
});

function reasonText(reason?: string): string {
  if (reason === 'expired') return '该分享链接已过期，请联系分享者重新生成';
  if (reason === 'disabled') return '该分享链接已被停用';
  return '分享链接不存在或已被删除';
}

async function boot() {
  state.value = 'loading';
  errorMsg.value = '';
  try {
    meta.value = await getShareMeta(token.value);
    if (meta.value.unavailable) {
      errorTitle.value = meta.value.unavailableReason === 'not_found' ? '链接无效' : '链接不可用';
      errorMsg.value = reasonText(meta.value.unavailableReason);
      state.value = 'error';
      return;
    }
    if (meta.value.needPassword) {
      const saved = sessionStorage.getItem(storageKey.value);
      if (saved) {
        try {
          content.value = await getShareContent(token.value, saved);
          state.value = 'ready';
          return;
        } catch {
          sessionStorage.removeItem(storageKey.value);
        }
      }
      state.value = 'gate';
      return;
    }
    content.value = await getShareContent(token.value);
    state.value = 'ready';
  } catch (err) {
    const status = (err as { response?: { status?: number; data?: { message?: string } } }).response;
    errorTitle.value = '链接不可用';
    errorMsg.value = status?.data?.message ?? '加载失败，请稍后重试';
    state.value = 'error';
  }
}

async function unlock() {
  if (!password.value.trim()) {
    ElMessage.warning('请输入访问口令');
    return;
  }
  unlocking.value = true;
  try {
    const result = await unlockShare(token.value, password.value);
    sessionStorage.setItem(storageKey.value, result.accessToken);
    content.value = await getShareContent(token.value, result.accessToken);
    password.value = '';
    state.value = 'ready';
  } catch (err) {
    const status = (err as { response?: { data?: { message?: string } } }).response;
    ElMessage.error(status?.data?.message ?? '口令错误');
  } finally {
    unlocking.value = false;
  }
}

onMounted(boot);
watch(token, boot);
</script>

<style scoped>
.share-page { min-height: 100vh; background: var(--af-bg-subtle); }
.share-center {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--af-text-tertiary);
}
.share-loading { font-size: 26px; animation: spin 1s linear infinite; color: var(--af-primary); }
@keyframes spin { to { transform: rotate(360deg); } }

.share-gate-card {
  width: 360px;
  background: #fff;
  border: 1px solid var(--af-border-light);
  border-radius: var(--af-radius-lg);
  box-shadow: 0 6px 24px rgba(31, 35, 41, 0.06);
  padding: 32px 28px;
  text-align: center;
}
.share-gate-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 14px;
  border-radius: 50%;
  background: var(--af-primary-light);
  color: var(--af-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}
.share-gate-title { font-size: 17px; margin: 0 0 6px; color: var(--af-text); font-weight: 600; }
.share-gate-sub { font-size: 12px; color: var(--af-text-placeholder); margin: 0 0 18px; }
.share-gate-input { margin-bottom: 14px; }
.share-gate-btn { width: 100%; }
.share-gate-tip { font-size: 11.5px; color: var(--af-text-placeholder); margin: 14px 0 0; }

.share-header {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid var(--af-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  position: sticky;
  top: 0;
  z-index: 10;
}
.share-header-left { display: flex; align-items: center; gap: 10px; }
.share-logo {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--af-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.share-title { font-size: 14px; font-weight: 600; color: var(--af-text); }
.share-doc { font-size: 11.5px; color: var(--af-text-placeholder); }

.share-body { display: flex; align-items: flex-start; }
.share-nav {
  width: 260px;
  flex: 0 0 260px;
  background: #fff;
  border-right: 1px solid var(--af-border-light);
  padding: 14px 10px;
  height: calc(100vh - 56px);
  overflow-y: auto;
  position: sticky;
  top: 56px;
}
.share-nav-title { font-size: 12px; font-weight: 600; color: var(--af-text-tertiary); padding: 0 6px 10px; }
.share-nav-group { margin-bottom: 10px; }
.share-nav-group-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--af-text-secondary);
  padding: 4px 6px;
}
.share-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
}
.share-nav-item:hover { background: var(--af-primary-lighter); }
.share-nav-item.active { background: var(--af-primary-light); }
.share-nav-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--af-mono);
  color: var(--af-text-secondary);
  font-size: 11.5px;
}
.share-content { flex: 1; min-width: 0; background: #fff; min-height: calc(100vh - 56px); }

@media (max-width: 860px) {
  .share-nav { display: none; }
  .share-gate-card { width: auto; margin: 0 16px; }
}
</style>
