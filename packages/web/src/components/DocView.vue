<template>
  <article class="doc-view" v-if="operation">
    <!-- 面包屑 -->
    <div class="doc-breadcrumb">
      <span>{{ docTitle }}</span>
      <el-icon><ArrowRight /></el-icon>
      <span>{{ groupName }}</span>
    </div>

    <!-- 标题区 -->
    <h1 class="doc-title" id="doc-top">{{ operation.summary || operation.operationId || operation.path }}</h1>
    <div class="doc-path-bar">
      <span class="method-tag" :class="`method-${operation.method}`">{{ operation.method }}</span>
      <code class="doc-path">{{ operation.path }}</code>
      <el-tag v-if="operation.deprecated" type="danger" size="small" effect="light">已废弃</el-tag>
      <el-button class="doc-debug-btn" type="primary" size="small" @click="$emit('debug')">
        <el-icon><Promotion /></el-icon> 调试此接口
      </el-button>
    </div>

    <!-- 描述 -->
    <section v-if="operation.description" id="doc-description" class="doc-section">
      <div class="af-quote">{{ operation.description }}</div>
    </section>

    <!-- 请求参数 -->
    <section id="doc-params" class="doc-section">
      <h2 class="af-section-title">请求参数</h2>
      <template v-if="operation.parameters.length">
        <div class="param-tabs" v-for="group in paramGroups" :key="group.in">
          <div class="param-group-title">{{ group.label }} <span class="param-count">{{ group.items.length }}</span></div>
          <div class="table-wrap">
            <table class="doc-table">
              <thead>
                <tr>
                  <th>参数名</th><th>类型</th><th>必填</th><th>说明</th><th>示例</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in group.items" :key="p.in + p.name">
                  <td><code class="cell-name">{{ p.name }}</code></td>
                  <td><span class="cell-type">{{ typeLabel(p.schema) }}</span></td>
                  <td><span v-if="p.required" class="cell-required">是</span><span v-else class="cell-muted">否</span></td>
                  <td class="cell-desc">{{ p.description || '—' }}</td>
                  <td><code class="cell-example">{{ exampleText(p.example ?? generateExample(p.schema)) }}</code></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
      <el-empty v-else description="该接口无请求参数" :image-size="54" />
    </section>

    <!-- 请求体 -->
    <section v-if="operation.requestBody" id="doc-request-body" class="doc-section">
      <h2 class="af-section-title">
        请求体
        <el-tag v-if="operation.requestBody.required" type="danger" size="small" effect="light" class="title-tag">必填</el-tag>
      </h2>
      <div v-for="media in operation.requestBody.contentTypes" :key="media.contentType" class="media-block">
        <div class="media-head">
          <code class="media-type">{{ media.contentType }}</code>
        </div>
        <SchemaViewer v-if="media.schema" :schema="media.schema" class="media-schema" />
        <div class="example-head">
          <span>示例</span>
          <el-button link type="primary" size="small" @click="copy(exampleText(media.example ?? generateExample(media.schema)))">复制</el-button>
        </div>
        <pre class="code-block">{{ exampleText(media.example ?? generateExample(media.schema)) }}</pre>
      </div>
    </section>

    <!-- 响应 -->
    <section id="doc-responses" class="doc-section">
      <h2 class="af-section-title">响应</h2>
      <div v-for="resp in operation.responses" :key="resp.status" class="response-block" :id="`resp-${resp.status}`">
        <div class="response-head">
          <span class="status-badge" :class="statusClass(resp.status)">{{ resp.status }}</span>
          <span class="response-desc">{{ resp.description }}</span>
        </div>
        <template v-for="media in resp.contentTypes" :key="media.contentType">
          <code class="media-type">{{ media.contentType }}</code>
          <SchemaViewer v-if="media.schema" :schema="media.schema" class="media-schema" />
          <div class="example-head">
            <span>示例</span>
            <el-button link type="primary" size="small" @click="copy(exampleText(media.example ?? generateExample(media.schema)))">复制</el-button>
          </div>
          <pre class="code-block">{{ exampleText(media.example ?? generateExample(media.schema)) }}</pre>
        </template>
        <div v-if="!resp.contentTypes.length" class="cell-muted response-empty">该响应无内容定义</div>
      </div>
      <el-empty v-if="!operation.responses.length" description="无响应定义" :image-size="54" />
    </section>
  </article>

  <div class="doc-placeholder" v-else>
    <el-empty description="从左侧目录选择一个接口查看文档" :image-size="110" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, Promotion } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { OperationView, ParameterView, SchemaView } from '@bluebull/shared';
import SchemaViewer from './SchemaViewer.vue';
import { generateExample } from '../utils/example';

const props = defineProps<{ operation: OperationView | null; docTitle?: string; groupName?: string }>();
defineEmits<{ debug: [] }>();

const PARAM_LABELS: Record<string, string> = {
  path: '路径参数 (Path)', query: '查询参数 (Query)', header: '请求头 (Header)', cookie: 'Cookie',
};

const paramGroups = computed(() => {
  const groups: Array<{ in: string; label: string; items: ParameterView[] }> = [];
  for (const op of ['path', 'query', 'header', 'cookie']) {
    const items = props.operation?.parameters.filter((p) => p.in === op) ?? [];
    if (items.length) groups.push({ in: op, label: PARAM_LABELS[op], items });
  }
  return groups;
});

function typeLabel(schema?: SchemaView): string {
  if (!schema) return 'string';
  if (schema.type === 'array') return `array<${schema.items?.type ?? 'any'}>`;
  return schema.type ?? 'object';
}
function exampleText(value: unknown): string {
  if (value === undefined || value === '') return '—';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
function statusClass(status: string): string {
  if (status.startsWith('2')) return 'st-success';
  if (status.startsWith('4')) return 'st-warn';
  if (status.startsWith('5')) return 'st-error';
  return 'st-info';
}
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.warning('复制失败，请手动选择');
  }
}
</script>

<style scoped>
.doc-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 48px 96px;
}
.doc-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--af-text-tertiary);
  margin-bottom: 14px;
}
.doc-title {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.35;
  margin: 0 0 20px;
  color: var(--af-text);
}
.doc-path-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--af-border-light);
}
.doc-path {
  font-family: var(--af-mono);
  font-size: 12.5px;
  color: var(--af-text-secondary);
  background: var(--af-bg-subtle);
  border: 1px solid var(--af-border-light);
  border-radius: 4px;
  padding: 3px 10px;
}
.doc-debug-btn { margin-left: auto; }
.doc-section { scroll-margin-top: 24px; }
.param-tabs { margin-bottom: 18px; }
.param-group-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--af-text-secondary);
  margin-bottom: 8px;
}
.param-count {
  display: inline-block;
  min-width: 18px;
  text-align: center;
  background: var(--af-primary-light);
  color: var(--af-primary);
  border-radius: 9px;
  font-size: 11px;
  padding: 0 5px;
  margin-left: 4px;
}
.table-wrap { width: 100%; overflow-x: auto; }
.doc-table {
  width: 100%;
  min-width: 560px;
  border-collapse: collapse;
  font-size: 13px;
}
.doc-table th, .doc-table td {
  border: 1px solid var(--af-border);
  padding: 10px 14px;
  text-align: left;
  vertical-align: top;
  line-height: 1.6;
}
.doc-table th {
  background: var(--af-bg-subtle);
  font-weight: 600;
  color: var(--af-text-secondary);
  white-space: nowrap;
}
.doc-table tbody tr { transition: background .12s; }
.doc-table tbody tr:hover { background: var(--af-primary-lighter); }
.cell-name { color: var(--af-primary); font-family: var(--af-mono); font-size: 12px; }
.cell-type { color: #722ed1; font-family: var(--af-mono); font-size: 12px; }
.cell-required { color: var(--af-red); font-weight: 600; }
.cell-muted { color: var(--af-text-placeholder); }
.cell-desc { color: var(--af-text-secondary); }
.cell-example { color: var(--af-green); font-size: 11.5px; word-break: break-all; }
.title-tag { margin-left: 8px; vertical-align: middle; }
.media-block, .response-block {
  border: 1px solid var(--af-border-light);
  border-radius: var(--af-radius-lg);
  padding: 18px 20px;
  margin-bottom: 16px;
  background: var(--af-bg);
}
.media-head { margin-bottom: 10px; }
.media-type {
  display: inline-block;
  background: var(--af-bg-hover);
  color: var(--af-text-secondary);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: var(--af-mono);
  font-size: 11.5px;
  margin-bottom: 8px;
}
.media-schema { margin: 8px 0 12px; }
.example-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--af-text-tertiary);
  margin: 10px 0 6px;
}
.response-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.status-badge {
  font-family: var(--af-mono);
  font-size: 12px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 4px;
}
.st-success { background: #e8ffea; color: #00a20d; }
.st-warn { background: #fff7e8; color: #d46b08; }
.st-error { background: #ffece8; color: #d93026; }
.st-info { background: var(--af-bg-hover); color: var(--af-text-secondary); }
.response-desc { color: var(--af-text-secondary); font-size: 13px; }
.response-empty { padding: 8px 0; font-size: 12px; }
.doc-placeholder { height: 100%; display: flex; align-items: center; justify-content: center; }

@media (max-width: 768px) {
  .doc-view { padding: 18px 16px 50px; }
  .doc-title { font-size: 22px; }
  .doc-breadcrumb { font-size: 11px; }
}
</style>
