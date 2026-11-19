<template>
  <el-dialog
    v-model="visible"
    title="导入文档"
    width="640px"
    :close-on-click-modal="false"
  >
    <el-tabs v-model="activeTab">
      <el-tab-pane label="URL 导入" name="url">
        <el-form label-position="top">
          <el-form-item label="文档 URL（将经服务端安全校验后拉取）">
            <el-input v-model="url" placeholder="https://example.com/openapi.json 或 .../guide.md" />
          </el-form-item>
          <p class="import-tip">支持 OpenAPI 3.0（.json / .yaml）与 Markdown（.md）。</p>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="粘贴内容" name="paste">
        <el-form label-position="top">
          <el-form-item label="格式">
            <el-radio-group v-model="pasteFormat">
              <el-radio-button value="json">JSON</el-radio-button>
              <el-radio-button value="yaml">YAML</el-radio-button>
              <el-radio-button value="markdown">Markdown</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="pasteFormat === 'markdown' ? 'Markdown 内容' : '文档内容'">
            <el-input
              v-if="pasteFormat === 'markdown'"
              v-model="pasteContent"
              type="textarea"
              :rows="12"
              resize="vertical"
              placeholder="# 文档标题&#10;&#10;支持标题、列表、表格、代码块等常用语法"
            />
            <CodeEditor v-else v-model="pasteContent" height="260px" />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="上传文件" name="file">
        <el-upload
          drag
          :auto-upload="false"
          :limit="1"
          accept=".json,.yaml,.yml,.md,.markdown"
          :on-change="onFileChange"
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">拖拽文件到此处，或 <em>点击选择</em></div>
          <template #tip>
            <div class="el-upload__tip">
              支持 .json / .yaml / .yml / .md / .markdown，最大 5MB
            </div>
          </template>
        </el-upload>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="loading" @click="onImport">导入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from 'vue';
import { UploadFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import type { UploadFile } from 'element-plus';
import type { DocumentFormat } from '@openapi-view/shared';
// CodeMirror 体积大：与其他使用处保持一致的动态加载策略
const CodeEditor = defineAsyncComponent(() => import('./CodeEditor.vue'));
import { useDocumentsStore } from '../stores/documents';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const docsStore = useDocumentsStore();
const activeTab = ref('url');
const url = ref('');
const pasteFormat = ref<DocumentFormat>('json');
const pasteContent = ref('');
const fileContent = ref('');
const fileFormat = ref<DocumentFormat>('json');
const loading = ref(false);

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

/** 按扩展名判断格式；认不出的按 YAML 交给服务端报错，比静默猜错强 */
function detectFileFormat(name: string): DocumentFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  return 'yaml';
}

function onFileChange(file: UploadFile) {
  const raw = file.raw;
  if (!raw) return;
  fileFormat.value = detectFileFormat(raw.name);
  const reader = new FileReader();
  reader.onload = () => {
    fileContent.value = String(reader.result ?? '');
  };
  reader.readAsText(raw);
}

async function onImport() {
  loading.value = true;
  try {
    if (activeTab.value === 'url') {
      if (!url.value.trim()) {
        ElMessage.warning('请输入文档 URL');
        return;
      }
      await docsStore.importFromUrl(url.value.trim());
    } else if (activeTab.value === 'paste') {
      if (!pasteContent.value.trim()) {
        ElMessage.warning('请粘贴文档内容');
        return;
      }
      await docsStore.addDocument({
        content: pasteContent.value,
        format: pasteFormat.value,
        sourceType: 'paste',
      });
    } else {
      if (!fileContent.value.trim()) {
        ElMessage.warning('请选择文件');
        return;
      }
      await docsStore.addDocument({
        content: fileContent.value,
        format: fileFormat.value,
        sourceType: 'file',
      });
    }
    ElMessage.success('导入成功');
    visible.value = false;
    // 重置
    url.value = '';
    pasteContent.value = '';
    fileContent.value = '';
  } catch {
    // 错误已由 axios 拦截器提示
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.import-tip {
  margin: 0;
  font-size: 12px;
  color: var(--af-text-tertiary);
}
</style>
