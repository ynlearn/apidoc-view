<template>
  <div class="debug-console">
    <!-- 接口头（紧凑单行：方法 + 标题 + 路径，面包屑靠右） -->
    <template v-if="operation">
      <div class="debug-head">
        <span class="method-tag" :class="`method-${operation.method}`">{{ operation.method }}</span>
        <h1 class="debug-title">{{ operation.summary || operation.operationId || operation.path }}</h1>
        <code class="debug-path">{{ operation.path }}</code>
        <el-tag v-if="operation.deprecated" type="danger" size="small" effect="light">已废弃</el-tag>
        <span class="debug-crumb">{{ docTitle }} / {{ groupName }}</span>
      </div>
    </template>

    <!-- 请求行 -->
    <div class="req-line">
      <el-select v-model="debuggerStore.method" class="req-method">
        <el-option v-for="m in methods" :key="m" :label="m" :value="m" />
      </el-select>
      <el-input
        v-model="debuggerStore.url"
        class="req-url"
        placeholder="输入请求 URL，支持 {{变量}}"
        @keyup.enter="send"
      />
      <el-button type="primary" :loading="debuggerStore.sending" class="req-send" @click="send">
        <el-icon v-if="!debuggerStore.sending"><Promotion /></el-icon>
        发送
      </el-button>
    </div>

    <div v-if="missingVars.length" class="var-warning">
      <el-alert
        type="warning" :closable="false" show-icon
        :title="`变量未定义：${missingVars.join('、')}（请到管理后台「环境变量」或「全局变量」配置）`"
      />
    </div>
    <div v-if="debuggerStore.url !== debuggerStore.interpolatedUrl" class="url-preview">
      <span>实际请求：</span><code>{{ debuggerStore.interpolatedUrl }}</code>
    </div>

    <!-- 请求配置 / 响应 -->
    <div class="console-split">
      <section class="console-request">
        <el-tabs v-model="reqTab" class="console-tabs">
          <el-tab-pane label="Query 参数" name="params">
            <KeyValueEditor v-model:rows="debuggerStore.query" />
          </el-tab-pane>
          <el-tab-pane label="Headers" name="headers">
            <KeyValueEditor v-model:rows="debuggerStore.headers" />
          </el-tab-pane>
          <el-tab-pane label="Body" name="body" lazy>
            <div class="body-config">
              <el-radio-group v-model="debuggerStore.bodyType" size="small">
                <el-radio-button value="none">none</el-radio-button>
                <el-radio-button value="json">json</el-radio-button>
                <el-radio-button value="form-data">form-data</el-radio-button>
                <el-radio-button value="raw">raw</el-radio-button>
              </el-radio-group>
            </div>
            <CodeEditor v-if="debuggerStore.bodyType !== 'none'" v-model="debuggerStore.body" height="220px" />
            <div v-else class="body-none">该请求不发送 Body</div>
          </el-tab-pane>
        </el-tabs>
      </section>

      <section class="console-response">
        <div class="response-label">响应</div>
        <ResponseViewer :response="debuggerStore.response" :error="debuggerStore.error" />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue';
import { Promotion } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { HttpMethod } from '@openapi-view/shared';
import { useDebuggerStore } from '../stores/debugger';
import { useDocumentsStore } from '../stores/documents';
import KeyValueEditor from './KeyValueEditor.vue';
// CodeMirror 体积大：动态加载，只在 Body 编辑器真正渲染时才拉取 chunk
const CodeEditor = defineAsyncComponent(() => import('./CodeEditor.vue'));
import ResponseViewer from './ResponseViewer.vue';

defineProps<{ docTitle?: string; groupName?: string }>();

const debuggerStore = useDebuggerStore();
const docsStore = useDocumentsStore();
const operation = computed(() => docsStore.selectedOperation);
const reqTab = ref('params');
const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/** 合并「输入时检测到的」与「发送时收集到的」未定义变量，去重后统一提示 */
const missingVars = computed(() =>
  Array.from(new Set([...debuggerStore.urlUnresolved, ...debuggerStore.unresolvedVars])),
);

async function send() {
  if (!debuggerStore.url.trim()) { ElMessage.warning('请输入请求 URL'); return; }
  await debuggerStore.send();
}
</script>

<style scoped>
.debug-console {
  max-width: 1200px;
  margin: 0 auto;
  padding: 22px 32px 48px;
}
.debug-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.debug-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--af-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.debug-path {
  font-family: var(--af-mono);
  font-size: 12px;
  color: var(--af-text-secondary);
  background: var(--af-bg-subtle);
  border: 1px solid var(--af-border-light);
  border-radius: 4px;
  padding: 2px 8px;
  white-space: nowrap;
}
.debug-crumb {
  margin-left: auto;
  font-size: 12px;
  color: var(--af-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.req-line { display: flex; gap: 10px; margin-bottom: 16px; }
.req-method { width: 110px; flex-shrink: 0; }
.req-url { flex: 1; min-width: 0; }
.req-send { min-width: 96px; }
.var-warning, .url-preview { margin-bottom: 14px; }
.url-preview {
  font-size: 12px;
  color: var(--af-text-secondary);
  background: var(--af-bg-subtle);
  border: 1px solid var(--af-border-light);
  border-radius: var(--af-radius);
  padding: 7px 11px;
}
.url-preview span { color: var(--af-text-tertiary); }
.url-preview code { font-family: var(--af-mono); color: var(--af-primary); }
/* 上下全宽堆叠：请求配置通栏在上，响应通栏在下（Apifox 调试台版式） */
.console-split {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 18px;
}
.console-request, .console-response {
  border: 1px solid var(--af-border-light);
  border-radius: var(--af-radius-lg);
  padding: 14px 18px;
  min-width: 0;
  background: var(--af-bg);
}
.console-response { min-height: 400px; display: flex; flex-direction: column; }
.console-response :deep(.response-viewer) { flex: 1; }
.console-tabs :deep(.el-tabs__header) { margin-bottom: 8px; }
.body-config { margin-bottom: 8px; }
.body-none { color: var(--af-text-tertiary); font-size: 12px; padding: 24px 0; text-align: center; }
.response-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--af-text);
  margin-bottom: 10px;
}
@media (max-width: 768px) {
  .debug-console { padding: 16px 12px 40px; }
  .console-request, .console-response { padding: 14px; }
  .console-response { min-height: 320px; }
  .req-line { flex-wrap: wrap; }
  .req-method { width: 90px; }
  .req-url { flex: 1 1 60%; }
}
</style>
