<template>
  <div class="response-viewer">
    <div v-if="!response && !error" class="response-empty">
      <el-empty description="发送请求后查看响应" :image-size="60" />
    </div>

    <template v-else-if="response">
      <div class="resp-summary">
        <el-tag :type="statusTagType" effect="dark">{{ response.status }} {{ response.statusText }}</el-tag>
        <span class="resp-meta"><el-icon><Timer /></el-icon> {{ response.durationMs }} ms</span>
        <span class="resp-meta"><el-icon><Coin /></el-icon> {{ formatSize(response.size) }}</span>
        <el-tag v-if="response.truncated" type="warning" size="small">响应已截断</el-tag>
        <el-button link type="primary" size="small" @click="downloadResponse">下载响应</el-button>
      </div>
      <el-tabs v-model="viewTab" class="resp-tabs">
        <el-tab-pane label="Pretty" name="pretty">
          <template v-if="isJson">
            <!-- 大响应默认不渲染格式化视图（VueJsonPretty 会产生数千 DOM 节点导致卡顿），用户点击后再渲染 -->
            <div v-if="heavy && !prettyReady" class="heavy-placeholder">
              <el-icon><WarningFilled /></el-icon>
              <span>响应体较大（{{ formatSize(response.size) }}），格式化渲染可能卡顿，默认展示原文视图</span>
              <el-button type="primary" size="small" @click="prettyReady = true">仍要格式化</el-button>
            </div>
            <div v-else class="json-pretty-wrap">
              <VueJsonPretty :data="parsedBody" :deep="heavy ? 3 : 5" :show-length="true" />
            </div>
          </template>
          <pre v-else class="code-block resp-body">{{ response.body || '(空响应体)' }}</pre>
        </el-tab-pane>
        <el-tab-pane label="Raw" name="raw">
          <pre class="code-block resp-body">{{ response.body || '(空响应体)' }}</pre>
        </el-tab-pane>
        <el-tab-pane label="Headers" name="headers">
          <div class="header-list">
            <div v-for="(value, key) in response.headers" :key="key" class="header-row">
              <span class="header-key">{{ key }}:</span> <span class="header-value">{{ value }}</span>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>

    <div v-else-if="error" class="resp-error">
      <el-alert type="error" :title="error" show-icon :closable="false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import { Timer, Coin, WarningFilled } from '@element-plus/icons-vue';
import type { ProxyResponseDto } from '@bluebull/shared';

const props = defineProps<{ response: ProxyResponseDto | null; error?: string | null }>();

const viewTab = ref('pretty');
// 超过 100KB 的 JSON 响应视为「重响应」：默认 Raw 视图，格式化按需渲染
const HEAVY_THRESHOLD = 100_000;
const heavy = computed(() => (props.response?.body?.length ?? 0) > HEAVY_THRESHOLD);
const prettyReady = ref(false);

watch(() => props.response, (resp) => {
  prettyReady.value = false;
  viewTab.value = resp && (resp.body?.length ?? 0) > HEAVY_THRESHOLD ? 'raw' : 'pretty';
});

const parsedBody = computed(() => {
  if (!props.response) return null;
  try {
    return JSON.parse(props.response.body);
  } catch {
    return null;
  }
});

const isJson = computed(() => {
  if (!props.response) return false;
  const ct = Object.entries(props.response.headers).find(
    ([k]) => k.toLowerCase() === 'content-type',
  )?.[1] ?? '';
  return String(ct).includes('json') || parsedBody.value !== null;
});

const statusTagType = computed(() => {
  const s = props.response?.status ?? 0;
  if (s >= 200 && s < 300) return 'success';
  if (s >= 400 && s < 500) return 'warning';
  if (s >= 500) return 'danger';
  return 'info';
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function downloadResponse() {
  if (!props.response) return;
  const blob = new Blob([props.response.body], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'response.txt';
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
.response-viewer {
  height: 100%;
  overflow: auto;
  padding: 10px 14px;
}
.response-empty {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
}
.resp-summary {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.resp-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--af-text-secondary);
  font-size: 12px;
}
.resp-body {
  max-height: 320px;
  overflow: auto;
}
.heavy-placeholder {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: var(--af-bg-subtle, #fafbfc);
  border: 1px dashed var(--af-border, #e5e6eb);
  border-radius: 6px;
  color: var(--af-text-secondary, #4e5969);
  font-size: 13px;
}
.heavy-placeholder .el-icon { color: var(--af-orange, #ff7d00); }
.json-pretty-wrap {
  background: var(--af-bg-subtle);
  border: 1px solid var(--bb-border);
  border-radius: 6px;
  padding: 10px;
  max-height: 320px;
  overflow: auto;
  font-size: 12px;
}
.header-row {
  padding: 3px 0;
  font-size: 12px;
  border-bottom: 1px dashed var(--af-border-light);
}
.header-key {
  font-weight: 600;
  color: var(--af-primary);
}
.header-value {
  color: var(--af-text-secondary);
  word-break: break-all;
}
.resp-error {
  padding-top: 20px;
}
</style>
