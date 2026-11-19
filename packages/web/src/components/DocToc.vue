<template>
  <aside class="doc-toc">
    <div class="toc-head">
      <el-icon><List /></el-icon>
      <span>{{ headings ? '文档目录' : '本页目录' }}</span>
    </div>
    <nav class="toc-nav">
      <a
        v-for="item in items"
        :key="item.id"
        class="toc-item"
        :class="{ active: activeId === item.id, indent: item.level > 1 }"
        :href="`#${item.id}`"
        @click.prevent="scrollTo(item.id)"
      >{{ item.label }}</a>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { List } from '@element-plus/icons-vue';
import type { OperationView } from '@openapi-view/shared';
import type { MarkdownHeading } from '../utils/markdown';

interface TocItem { id: string; label: string; level: number }

// headings 传了就走 Markdown 标题目录，否则按接口结构生成
const props = defineProps<{ operation: OperationView | null; headings?: MarkdownHeading[] }>();
const activeId = ref('');

const items = computed<TocItem[]>(() => {
  if (props.headings) {
    return props.headings.map((h) => ({ id: h.id, label: h.label, level: h.level }));
  }
  const op = props.operation;
  if (!op) return [];

  const list: TocItem[] = [{ id: 'doc-top', label: '接口概览', level: 1 }];
  if (op.description) list.push({ id: 'doc-description', label: '接口说明', level: 1 });
  list.push({ id: 'doc-params', label: '请求参数', level: 1 });
  if (op.requestBody) list.push({ id: 'doc-request-body', label: '请求体', level: 1 });
  list.push({ id: 'doc-responses', label: '响应', level: 1 });
  for (const resp of op.responses) {
    list.push({ id: `resp-${resp.status}`, label: `${resp.status} ${resp.description || ''}`.trim(), level: 2 });
  }
  return list;
});

watch(items, (list) => { activeId.value = list[0]?.id ?? ''; }, { immediate: true });

function scrollTo(id: string) {
  activeId.value = id;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>

<style scoped>
.doc-toc {
  width: 208px;
  flex-shrink: 0;
  border-left: 1px solid var(--af-border-light);
  padding: 26px 16px;
  overflow-y: auto;
  background: var(--af-bg);
}
.toc-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--af-text-secondary);
  margin-bottom: 12px;
  padding-left: 8px;
}
.toc-nav {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--af-border);
  margin-left: 8px;
}
.toc-item {
  display: block;
  font-size: 12px;
  line-height: 1.5;
  color: var(--af-text-tertiary);
  padding: 5px 8px 5px 12px;
  margin-left: -1px;
  border-left: 2px solid transparent;
  text-decoration: none;
  transition: all .15s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toc-item:hover { color: var(--af-primary); }
.toc-item.active {
  color: var(--af-primary);
  border-left-color: var(--af-primary);
  font-weight: 600;
  background: var(--af-primary-lighter);
}
.toc-item.indent { padding-left: 22px; font-size: 11.5px; }

@media (max-width: 1100px) {
  .doc-toc { display: none; }
}
</style>
