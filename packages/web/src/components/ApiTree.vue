<template>
  <div class="api-tree">
    <!-- 搜索框 -->
    <div class="tree-search-wrap">
      <el-input v-model="keyword" placeholder="搜索接口" clearable size="large" class="tree-search">
        <template #prefix><el-icon><Search /></el-icon></template>
        <template #suffix><span class="kbd">Ctrl K</span></template>
      </el-input>
    </div>

    <!-- 文档下拉 -->
    <div class="doc-picker" @click="pickerOpen = !pickerOpen">
      <div class="doc-picker-label">
        <el-icon><Files /></el-icon>
        <span class="doc-picker-name">{{ docsStore.current?.title || '选择文档' }}</span>
        <el-icon class="doc-picker-arrow" :class="{ open: pickerOpen }"><ArrowDown /></el-icon>
      </div>
      <div v-if="pickerOpen" class="doc-picker-menu">
        <div
          v-for="doc in docsStore.list"
          :key="doc.id"
          class="doc-picker-option"
          :class="{ active: doc.id === docsStore.current?.id }"
          @click.stop="onPickDoc(doc.id)"
        >
          <span>{{ doc.title }}</span>
          <span class="doc-option-count">{{ doc.operationCount }}</span>
        </div>
        <div v-if="!docsStore.list.length" class="doc-picker-empty">暂无文档，请到管理后台导入</div>
      </div>
    </div>

    <!-- 接口树 -->
    <el-tree
      v-if="normalized"
      :data="treeData"
      node-key="id"
      :default-expand-all="true"
      :filter-node-method="filterNode"
      :current-node-key="docsStore.selectedOperationId || undefined"
      :expand-on-click-node="false"
      highlight-current
      ref="treeRef"
      @node-click="onNodeClick"
    >
      <template #default="{ data }">
        <div class="tree-node" v-if="data.operation">
          <span class="method-tag" :class="`method-${data.operation.method}`">{{ data.operation.method }}</span>
          <span class="node-summary" :title="data.operation.summary || data.operation.path">
            {{ data.operation.summary || data.operation.path }}
          </span>
        </div>
        <div class="tree-group" v-else>
          <el-icon class="group-icon"><FolderOpened /></el-icon>
          <span>{{ data.label }}</span>
          <span class="group-count">{{ (data.children || []).length }}</span>
        </div>
      </template>
    </el-tree>

    <div v-else class="tree-empty">
      <el-empty description="暂无文档" :image-size="70" />
      <router-link to="/admin" class="tree-empty-link">前往管理后台导入 →</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { Search, Files, ArrowDown, FolderOpened } from '@element-plus/icons-vue';
import type { NormalizedDocument, OperationView } from '@openapi-view/shared';
import { useDocumentsStore } from '../stores/documents';
import type { ElTree } from 'element-plus';

const props = defineProps<{ normalized: NormalizedDocument | null }>();
const docsStore = useDocumentsStore();
const keyword = ref('');
const pickerOpen = ref(false);
const treeRef = ref<InstanceType<typeof ElTree>>();

interface TreeNode {
  id: string;
  label: string;
  operation?: OperationView;
  children?: TreeNode[];
}

const treeData = computed<TreeNode[]>(() => {
  if (!props.normalized) return [];
  return props.normalized.groups.map((group, gi) => ({
    id: `group-${gi}`,
    label: group.name,
    children: group.operations.map((op) => ({
      id: op.id,
      label: op.summary || op.path,
      operation: op,
    })),
  }));
});

watch(keyword, (val) => treeRef.value?.filter(val));
watch(() => docsStore.selectedOperationId, () => {
  nextTick(() => {
    if (docsStore.selectedOperationId) treeRef.value?.setCurrentKey(docsStore.selectedOperationId);
  });
}, { immediate: true });

function filterNode(value: string, data: TreeNode): boolean {
  if (!value) return true;
  const kw = value.toLowerCase().trim();
  if (!kw) return true;
  const op = data.operation;
  const fields = [data.label ?? '', op?.path ?? '', op?.summary ?? '', op?.operationId ?? '', ...(op?.tags ?? [])];
  return fields.some((f) => String(f).toLowerCase().includes(kw));
}

function onNodeClick(data: TreeNode) {
  if (data.operation) docsStore.selectOperation(data.operation.id);
}
async function onPickDoc(id: string) {
  pickerOpen.value = false;
  await docsStore.openDocument(id);
}
</script>

<style scoped>
.api-tree {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--af-sidebar-bg);
}
.tree-search-wrap { padding: 16px 14px 8px; flex-shrink: 0; }
.tree-search :deep(.el-input__wrapper) {
  background: var(--af-bg-subtle);
  box-shadow: none inset 0 0 0 1px var(--af-border);
  border: 1px solid var(--af-border);
}
.kbd {
  font-size: 10px;
  color: var(--af-text-placeholder);
  border: 1px solid var(--af-border);
  border-radius: 3px;
  padding: 0 4px;
  font-family: var(--af-mono);
}
.doc-picker {
  position: relative;
  margin: 4px 14px 10px;
  flex-shrink: 0;
  cursor: pointer;
}
.doc-picker-label {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border: 1px solid var(--af-border);
  border-radius: var(--af-radius);
  color: var(--af-text-secondary);
  font-size: 12.5px;
}
.doc-picker-label:hover { border-color: var(--af-primary); }
.doc-picker-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-picker-arrow { transition: transform .2s; }
.doc-picker-arrow.open { transform: rotate(180deg); }
.doc-picker-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--af-bg);
  border: 1px solid var(--af-border);
  border-radius: var(--af-radius);
  box-shadow: var(--af-shadow);
  z-index: 30;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
}
.doc-picker-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 9px;
  border-radius: 4px;
  font-size: 12.5px;
  cursor: pointer;
}
.doc-picker-option:hover { background: var(--af-bg-hover); }
.doc-picker-option.active { background: var(--af-primary-light); color: var(--af-primary); }
.doc-option-count { color: var(--af-text-tertiary); font-size: 11px; }
.doc-picker-empty { padding: 12px; font-size: 12px; color: var(--af-text-tertiary); text-align: center; }

.api-tree :deep(.el-tree) {
  flex: 1;
  overflow: auto;
  padding: 0 8px 16px;
}
.api-tree :deep(.el-tree-node__content) {
  height: 32px;
  border-radius: 5px;
  margin: 1px 0;
}
.api-tree :deep(.el-tree-node__content:hover) { background: var(--af-bg-hover); }
.api-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: var(--af-primary-light) !important;
}
.api-tree :deep(.el-tree-node__expand-icon) { color: var(--af-text-tertiary); }
.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  overflow: hidden;
}
.node-summary {
  font-size: 12.5px;
  color: var(--af-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.is-current .node-summary { color: var(--af-primary); font-weight: 600; }
.tree-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  color: var(--af-text);
}
.group-icon { color: var(--af-primary); }
.group-count {
  color: var(--af-text-tertiary);
  font-size: 11px;
  font-weight: 400;
  margin-left: auto;
  margin-right: 8px;
}
.tree-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.tree-empty-link { font-size: 12px; margin-top: -10px; }
</style>
