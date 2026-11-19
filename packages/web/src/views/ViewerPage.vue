<template>
  <AuthGate v-if="gateLocked" mode="view" />

  <div v-else-if="authStore.ready" class="viewer-page">
    <AppHeader :subtitle="isMarkdown ? 'Markdown 文档预览' : 'API 文档与调试'" />

    <div class="viewer-body">
      <!-- 左侧目录（移动端为抽屉） -->
      <aside class="viewer-sidebar" :class="{ 'mobile-open': treeOpen }">
        <ApiTree :normalized="docsStore.normalized" />
      </aside>
      <div v-if="treeOpen" class="tree-mask" @click="treeOpen = false"></div>

      <!-- 中间主区 -->
      <main class="viewer-main">
        <!-- 顶部操作条 + Tab -->
        <div class="viewer-toolbar">
          <el-button text class="tree-toggle" aria-label="切换接口目录" @click="treeOpen = !treeOpen">
            <el-icon><Menu /></el-icon>
          </el-button>

          <!-- Markdown 文档没有可调试接口，用标题占位代替 Tab -->
          <span v-if="isMarkdown" class="viewer-md-title">{{ docsStore.current?.title }}</span>
          <el-tabs v-else v-model="activeTab" class="viewer-tabs">
            <el-tab-pane label="文档" name="doc" />
            <el-tab-pane label="调试" name="debug" />
          </el-tabs>

          <div class="toolbar-right">
            <el-button
              v-if="!isMarkdown && docsStore.selectedOperation"
              text
              size="small"
              class="toolbar-action"
              @click="onOpenDebug"
            >
              <el-icon><Promotion /></el-icon> 带入调试
            </el-button>
          </div>
        </div>

        <div class="viewer-content">
          <MarkdownView
            v-if="isMarkdown"
            :key="docsStore.current?.id"
            :content="docsStore.current?.rawContent ?? ''"
            @headings="mdHeadings = $event"
          />
          <template v-else-if="activeTab === 'doc'">
            <DocView
              :operation="docsStore.selectedOperation"
              :doc-title="docsStore.current?.title"
              :group-name="currentGroupName"
              @debug="onOpenDebug"
            />
          </template>
          <template v-else>
            <DebugConsole :doc-title="docsStore.current?.title" :group-name="currentGroupName" />
          </template>
        </div>
      </main>

      <!-- 右侧本页目录 -->
      <aside v-if="showToc" class="viewer-toc">
        <DocToc
          :operation="isMarkdown ? null : docsStore.selectedOperation"
          :headings="isMarkdown ? mdHeadings : undefined"
        />
      </aside>
    </div>
  </div>

  <div v-else class="viewer-loading">加载中…</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Promotion, Menu } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import AppHeader from '../components/AppHeader.vue';
import ApiTree from '../components/ApiTree.vue';
import DocView from '../components/DocView.vue';
import DocToc from '../components/DocToc.vue';
import DebugConsole from '../components/DebugConsole.vue';
import MarkdownView from '../components/MarkdownView.vue';
import AuthGate from '../components/AuthGate.vue';
import { useDocumentsStore } from '../stores/documents';
import { useEnvironmentStore } from '../stores/environment';
import { useDebuggerStore } from '../stores/debugger';
import { useAuthStore } from '../stores/auth';
import type { MarkdownHeading } from '../utils/markdown';

const docsStore = useDocumentsStore();
const envStore = useEnvironmentStore();
const debuggerStore = useDebuggerStore();
const authStore = useAuthStore();

const activeTab = ref<'doc' | 'debug'>('doc');
const treeOpen = ref(false);
const mdHeadings = ref<MarkdownHeading[]>([]);

const isMarkdown = computed(() => docsStore.current?.rawFormat === 'markdown');
/** 浏览端只有配置了访问口令、且当前无有效登录态时才拦 */
const gateLocked = computed(() => authStore.ready && authStore.viewGate && !authStore.role);
const showToc = computed(() => (isMarkdown.value ? mdHeadings.value.length > 0 : activeTab.value === 'doc'));

// 选中接口后，移动端自动收起目录；调试 Tab 下点树即联动带入
watch(() => docsStore.selectedOperationId, () => {
  treeOpen.value = false;
  if (activeTab.value === 'debug' && docsStore.selectedOperation) {
    onOpenDebug();
  }
});
// 切到调试 Tab 时，若当前接口尚未带入则自动带入
watch(activeTab, (tab) => {
  if (
    tab === 'debug' &&
    docsStore.selectedOperation &&
    debuggerStore.currentOperationId !== docsStore.selectedOperation.id
  ) {
    onOpenDebug();
  }
});
// Markdown 文档没有接口，切过去时把调试 Tab 收回到文档
watch(isMarkdown, (md) => {
  if (md) activeTab.value = 'doc';
});

const currentGroupName = computed(() => {
  const op = docsStore.selectedOperation;
  if (!op) return '';
  for (const g of docsStore.normalized?.groups ?? []) {
    if (g.operations.some((o) => o.id === op.id)) return g.name;
  }
  return '';
});

async function bootstrap() {
  await Promise.all([docsStore.loadList(), envStore.load()]);
  const keepCurrent =
    docsStore.current && docsStore.list.some((d) => d.id === docsStore.current!.id);
  if (!keepCurrent && docsStore.list.length) {
    await docsStore.openDocument(docsStore.list[0].id);
  }
}

onMounted(async () => {
  await authStore.init();
  if (!gateLocked.value) await bootstrap();
});

// 口令验证通过后 gateLocked 变 false：这里监听状态而不是依赖子组件事件，
// 因为子组件在登录成功的 await 之后已被卸载，事件发不出来
watch(gateLocked, (locked) => {
  if (!locked) void bootstrap();
});

function onOpenDebug() {
  const op = docsStore.selectedOperation;
  if (!op) { ElMessage.warning('请先选择一个接口'); return; }
  const vars = envStore.mergedVariables;
  const baseUrl = vars.baseUrl ?? vars.host ?? '';
  debuggerStore.loadFromOperation(op, baseUrl);
  activeTab.value = 'debug';
}
</script>

<style scoped>
.viewer-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.viewer-loading {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--af-text-tertiary);
  font-size: 13px;
}
.viewer-body { flex: 1; display: flex; min-height: 0; overflow: hidden; position: relative; }
.viewer-sidebar {
  width: 264px;
  flex-shrink: 0;
  border-right: 1px solid var(--af-border);
  overflow: hidden;
}
.viewer-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--af-bg);
}
.viewer-toolbar {
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid var(--af-border-light);
}
.viewer-md-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--af-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.viewer-tabs { height: 100%; }
.viewer-tabs :deep(.el-tabs__header) { margin: 0; height: 100%; }
.viewer-tabs :deep(.el-tabs__nav-wrap::after) { display: none; }
.viewer-tabs :deep(.el-tabs__item) { height: 52px; font-size: 14px; }
.toolbar-right { display: flex; align-items: center; gap: 8px; }
.toolbar-action { color: var(--af-primary); }
.tree-toggle { display: none; }
.tree-mask { display: none; }
.viewer-content { flex: 1; overflow-y: auto; min-height: 0; }
.viewer-toc { flex-shrink: 0; overflow: hidden; }

@media (max-width: 768px) {
  .tree-toggle { display: inline-flex; margin-right: 2px; }
  .viewer-sidebar {
    position: absolute;
    top: 56px;
    bottom: 0;
    left: 0;
    width: 280px;
    max-width: 82vw;
    transform: translateX(-100%);
    transition: transform .22s ease;
    z-index: 40;
    box-shadow: var(--af-shadow);
  }
  .viewer-sidebar.mobile-open { transform: translateX(0); }
  .tree-mask {
    display: block;
    position: absolute;
    inset: 56px 0 0 0;
    background: rgba(29, 33, 41, .35);
    z-index: 35;
  }
  .viewer-toolbar { padding: 0 10px; }
  .toolbar-action span { display: none; }
}
</style>
