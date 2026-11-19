<template>
  <AuthGate v-if="needLogin" mode="admin" />

  <div v-else-if="authStore.ready" class="ope-page">
    <AppHeader :show-env="false" :show-logout="true" home-to="/admin" subtitle="接口管理" />

    <!-- 顶部：面包屑 + 检索 + 新增 -->
    <div class="ope-bar">
      <div class="ope-bar-left">
        <el-button link class="ope-back" @click="goBack">
          <el-icon><ArrowLeft /></el-icon> 文档管理
        </el-button>
        <span class="ope-bar-sep">/</span>
        <span class="ope-doc-title" :title="detail?.title">{{ detail?.title || '加载中…' }}</span>
        <el-tag v-if="detail && !isMarkdown" size="small" effect="plain" type="info" class="ope-meta">
          {{ groups.length }} 分组 · {{ operationTotal }} 接口
        </el-tag>
      </div>

      <div class="ope-bar-right">
        <el-input
          v-model="search"
          placeholder="搜索路径 / 摘要 / 方法"
          clearable
          :prefix-icon="Search"
          class="ope-search"
        />
        <el-button type="primary" :icon="Plus" :disabled="isMarkdown" @click="startCreate">新增接口</el-button>
      </div>
    </div>

    <div v-loading="loading" class="ope-body">
      <template v-if="isMarkdown">
        <div class="ope-blank">
          <el-empty description="Markdown 文档没有接口概念，无法进行接口维护" :image-size="110" />
          <el-button @click="goBack">返回文档列表</el-button>
        </div>
      </template>

      <template v-else>
        <!-- 左：分组与接口 -->
        <aside class="ope-side">
          <div class="ope-side-hint">
            <span>接口列表</span>
            <span class="ope-side-count">{{ operationTotal }}</span>
          </div>

          <el-scrollbar class="ope-scroll">
            <div v-for="group in visibleGroups" :key="group.name" class="ope-group">
              <div class="ope-group-head" @click="toggleGroup(group.name)">
                <el-icon class="ope-group-arrow" :class="{ collapsed: collapsed.has(group.name) }">
                  <ArrowDown />
                </el-icon>
                <span class="ope-group-name" :title="group.name">{{ group.name }}</span>
                <span class="ope-group-count">{{ group.operations.length }}</span>
              </div>

              <div v-show="!collapsed.has(group.name)" class="ope-group-body">
                <div
                  v-for="op in group.operations"
                  :key="op.id"
                  class="ope-op"
                  :class="{ active: selectedId === op.id }"
                  @click="startEdit(group.name, op)"
                >
                  <div class="ope-op-main">
                    <span class="method-tag" :class="`method-${op.method}`">{{ op.method }}</span>
                    <span class="ope-op-path" :title="op.path">{{ op.path }}</span>
                  </div>
                  <div v-if="op.summary" class="ope-op-summary">{{ op.summary }}</div>
                </div>
              </div>
            </div>

            <el-empty
              v-if="!visibleGroups.length"
              :description="search ? '没有匹配的接口' : '还没有接口'"
              :image-size="70"
            />
          </el-scrollbar>
        </aside>

        <!-- 右：编辑区 -->
        <section class="ope-main">
          <div v-if="!editing" class="ope-blank">
            <el-empty description="从左侧选择一个接口进行编辑，或新增一个接口" :image-size="110" />
          </div>

          <div v-else class="ope-editor">
            <el-scrollbar class="ope-editor-scroll">
              <div class="ope-editor-inner">
                <div class="ope-editor-head">
                  <h2 class="ope-editor-title">{{ isNew ? '新增接口' : '编辑接口' }}</h2>
                  <p class="ope-editor-id">
                    {{ isNew ? '填写后保存，接口 ID 将按「方法:路径」自动生成' : editingOriginalId }}
                  </p>
                </div>

                <el-form label-position="top" class="ope-form">
                  <!-- 方法与路径：一级信息，给足宽度 -->
                  <el-form-item required>
                    <template #label><span class="ope-label-strong">方法与路径</span></template>
                    <div class="ope-path-row">
                      <el-select v-model="form.method" class="ope-method">
                        <el-option v-for="m in METHODS" :key="m" :label="m" :value="m" />
                      </el-select>
                      <el-input v-model="form.path" placeholder="/users/{id}" class="ope-path-input" />
                    </div>
                  </el-form-item>

                  <div class="ope-grid-2">
                    <el-form-item label="归属分组">
                      <el-select
                        v-model="form.group"
                        filterable
                        allow-create
                        default-first-option
                        placeholder="选择或输入新分组名"
                      >
                        <el-option v-for="name in groupOptions" :key="name" :label="name" :value="name" />
                      </el-select>
                    </el-form-item>
                    <el-form-item label="摘要">
                      <el-input v-model="form.summary" placeholder="一句话说明接口用途" />
                    </el-form-item>
                  </div>

                  <el-form-item label="描述">
                    <el-input
                      v-model="form.description"
                      type="textarea"
                      :rows="2"
                      placeholder="详细说明，可选；支持换行"
                    />
                  </el-form-item>

                  <el-form-item>
                    <template #label>
                      <span class="ope-label-row">
                        参数
                        <el-button link type="primary" size="small" :icon="Plus" @click="addParam">添加参数</el-button>
                      </span>
                    </template>
                    <el-table :data="form.parameters" size="default" border class="ope-param-table" empty-text="暂无参数">
                      <el-table-column label="名称" min-width="180">
                        <template #default="{ row }"><el-input v-model="row.name" placeholder="paramName" /></template>
                      </el-table-column>
                      <el-table-column label="位置" width="124">
                        <template #default="{ row }">
                          <el-select v-model="row.in">
                            <el-option v-for="loc in PARAM_LOCATIONS" :key="loc" :label="loc" :value="loc" />
                          </el-select>
                        </template>
                      </el-table-column>
                      <el-table-column label="类型" width="140">
                        <template #default="{ row }">
                          <el-select v-model="row.type" filterable allow-create>
                            <el-option v-for="t in TYPES" :key="t" :label="t" :value="t" />
                          </el-select>
                        </template>
                      </el-table-column>
                      <el-table-column label="必填" width="70" align="center">
                        <template #default="{ row }"><el-checkbox v-model="row.required" /></template>
                      </el-table-column>
                      <el-table-column label="说明" min-width="200">
                        <template #default="{ row }"><el-input v-model="row.description" /></template>
                      </el-table-column>
                      <el-table-column width="64" align="center">
                        <template #default="{ $index }">
                          <el-button link type="danger" :icon="Delete" @click="form.parameters.splice($index, 1)" />
                        </template>
                      </el-table-column>
                    </el-table>
                  </el-form-item>

                  <!-- 请求体与响应并排：宽屏下省一半纵向滚动 -->
                  <div class="ope-grid-2 ope-json-grid">
                    <el-form-item>
                      <template #label>
                        <span class="ope-label-row">
                          请求体
                          <el-button v-if="!form.requestBodyText" link type="primary" size="small" @click="fillRequestBody">
                            填入模板
                          </el-button>
                        </span>
                      </template>
                      <el-input
                        v-model="form.requestBodyText"
                        type="textarea"
                        :rows="14"
                        class="ope-code"
                        placeholder="留空表示无请求体；结构见 RequestBodyView"
                      />
                    </el-form-item>
                    <el-form-item>
                      <template #label>
                        <span class="ope-label-row">
                          响应（数组）
                          <el-button link type="primary" size="small" @click="fillResponses">填入模板</el-button>
                        </span>
                      </template>
                      <el-input v-model="form.responsesText" type="textarea" :rows="14" class="ope-code" />
                    </el-form-item>
                  </div>

                  <el-alert
                    type="warning"
                    :closable="false"
                    show-icon
                    class="ope-tip"
                    title="保存会同步重写文档源码为标准 JSON，原始 YAML 的注释与排版不再保留"
                  />
                </el-form>
              </div>
            </el-scrollbar>

            <!-- 底部操作条常驻，长表单不用滚到底才能保存 -->
            <div class="ope-actions">
              <div class="ope-actions-inner">
                <el-button v-if="!isNew" type="danger" plain :icon="Delete" @click="removeCurrent">删除接口</el-button>
                <div class="ope-actions-right">
                  <span class="ope-shortcut">Ctrl / ⌘ + S</span>
                  <el-button @click="cancelEdit">取消</el-button>
                  <el-button type="primary" :loading="saving" @click="save">
                    {{ isNew ? '创建接口' : '保存修改' }}
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>

  <div v-else class="ope-loading">加载中…</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowDown, ArrowLeft, Delete, Plus, Search } from '@element-plus/icons-vue';
import type {
  DocumentDetail,
  OperationDraft,
  OperationView,
  RequestBodyView,
  ResponseView,
} from '@openapi-view/shared';
import AppHeader from '../components/AppHeader.vue';
import AuthGate from '../components/AuthGate.vue';
import { useAuthStore } from '../stores/auth';
import { createOperation, deleteOperation, getDocument, updateOperation } from '../api/documents';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const PARAM_LOCATIONS = ['query', 'path', 'header', 'cookie'];
const TYPES = ['string', 'integer', 'number', 'boolean', 'array', 'object'];
const DEFAULT_GROUP = '默认分组';

const docId = computed(() => String(route.params.docId ?? ''));
const needLogin = computed(() => authStore.ready && authStore.role !== 'admin');

const loading = ref(false);
const saving = ref(false);
const detail = ref<DocumentDetail | null>(null);
const search = ref('');
const collapsed = ref(new Set<string>());

const editing = ref(false);
const isNew = ref(false);
const selectedId = ref<string | null>(null);
const editingOriginalId = ref<string | null>(null);

interface ParamRow {
  name: string;
  in: string;
  type: string;
  required: boolean;
  description: string;
}

const form = reactive({
  group: DEFAULT_GROUP,
  method: 'GET',
  path: '',
  summary: '',
  description: '',
  parameters: [] as ParamRow[],
  requestBodyText: '',
  responsesText: '',
});

const groups = computed(() => detail.value?.normalized.groups ?? []);
const groupOptions = computed(() => groups.value.map((g) => g.name));
const operationTotal = computed(() =>
  groups.value.reduce((sum, g) => sum + g.operations.length, 0),
);
const isMarkdown = computed(() => detail.value?.rawFormat === 'markdown');

/** 搜索只过滤展示，不改动数据；空分组不渲染 */
const visibleGroups = computed(() => {
  const keyword = search.value.trim().toLowerCase();
  if (!keyword) return groups.value;
  return groups.value
    .map((g) => ({
      ...g,
      operations: g.operations.filter(
        (op) =>
          op.path.toLowerCase().includes(keyword) ||
          op.method.toLowerCase().includes(keyword) ||
          (op.summary ?? '').toLowerCase().includes(keyword),
      ),
    }))
    .filter((g) => g.operations.length > 0);
});

async function loadDocument() {
  if (!docId.value) {
    router.replace('/admin');
    return;
  }
  loading.value = true;
  try {
    detail.value = await getDocument(docId.value);
  } catch {
    // 错误已由请求层提示；文档不存在时回列表，避免停在空白页
    router.replace('/admin');
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await authStore.init();
  if (!needLogin.value) await loadDocument();
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

/** 登录态由门禁决定，登录成功后补加载（组件在 await 期间已卸载，不能依赖子组件事件） */
watch(needLogin, (need) => {
  if (!need) void loadDocument();
});

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (editing.value && !saving.value) void save();
  }
}

function toggleGroup(name: string) {
  const next = new Set(collapsed.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  collapsed.value = next;
}

function goBack() {
  router.push('/admin');
}

function toParamRows(operation: OperationView): ParamRow[] {
  return operation.parameters.map((p) => ({
    name: p.name,
    in: p.in,
    type: p.schema?.type ?? 'string',
    required: Boolean(p.required),
    description: p.description ?? '',
  }));
}

function startCreate() {
  isNew.value = true;
  editing.value = true;
  selectedId.value = null;
  editingOriginalId.value = null;
  form.group = groupOptions.value[0] ?? DEFAULT_GROUP;
  form.method = 'GET';
  form.path = '';
  form.summary = '';
  form.description = '';
  form.parameters = [];
  form.requestBodyText = '';
  form.responsesText = JSON.stringify(
    [{ status: '200', description: 'OK', contentTypes: [{ contentType: 'application/json', schema: { type: 'object' } }] }],
    null,
    2,
  );
}

function startEdit(groupName: string, operation: OperationView) {
  isNew.value = false;
  editing.value = true;
  selectedId.value = operation.id;
  editingOriginalId.value = operation.id;
  form.group = groupName;
  form.method = operation.method;
  form.path = operation.path;
  form.summary = operation.summary ?? '';
  form.description = operation.description ?? '';
  form.parameters = toParamRows(operation);
  form.requestBodyText = operation.requestBody ? JSON.stringify(operation.requestBody, null, 2) : '';
  form.responsesText = JSON.stringify(operation.responses ?? [], null, 2);
}

function cancelEdit() {
  editing.value = false;
  isNew.value = false;
  selectedId.value = null;
  editingOriginalId.value = null;
}

function addParam() {
  form.parameters.push({ name: '', in: 'query', type: 'string', required: false, description: '' });
}

function fillRequestBody() {
  form.requestBodyText = JSON.stringify(
    {
      required: true,
      contentTypes: [
        { contentType: 'application/json', schema: { type: 'object', properties: {} }, example: {} },
      ],
    },
    null,
    2,
  );
}

function fillResponses() {
  form.responsesText = JSON.stringify(
    [{ status: '200', description: 'OK', contentTypes: [{ contentType: 'application/json', schema: { type: 'object' } }] }],
    null,
    2,
  );
}

function buildDraft(): OperationDraft {
  const path = form.path.trim();
  if (!path) throw new Error('请填写接口路径');
  if (!path.startsWith('/')) throw new Error('接口路径必须以 / 开头');

  const validParams = form.parameters.filter((p) => p.name.trim());

  let requestBody: RequestBodyView | undefined;
  if (form.requestBodyText.trim()) {
    try {
      requestBody = JSON.parse(form.requestBodyText) as RequestBodyView;
    } catch {
      throw new Error('请求体 JSON 格式不正确');
    }
  }

  let responses: ResponseView[];
  try {
    const parsed = JSON.parse(form.responsesText || '[]');
    if (!Array.isArray(parsed)) throw new Error('响应必须是数组');
    responses = parsed as ResponseView[];
  } catch {
    throw new Error('响应 JSON 格式不正确（应为数组）');
  }

  return {
    method: form.method,
    path,
    summary: form.summary.trim() || undefined,
    description: form.description.trim() || undefined,
    group: form.group.trim() || DEFAULT_GROUP,
    parameters: validParams.map((p) => ({
      name: p.name.trim(),
      in: p.in as 'query' | 'path' | 'header' | 'cookie',
      required: p.required,
      description: p.description.trim() || undefined,
      schema: { type: p.type },
    })),
    requestBody,
    responses,
  };
}

async function save() {
  let draft: OperationDraft;
  try {
    draft = buildDraft();
  } catch (err) {
    ElMessage.warning((err as Error).message);
    return;
  }

  saving.value = true;
  try {
    detail.value = isNew.value
      ? await createOperation(docId.value, draft)
      : await updateOperation(docId.value, editingOriginalId.value!, draft);
    ElMessage.success(isNew.value ? '接口已新增' : '接口已更新');
    // 保存后按新 id 重新定位，路径/方法改过也能选中正确项
    const targetId = `${draft.method.toUpperCase()}:${draft.path}`;
    const group = detail.value.normalized.groups.find((g) => g.name === (draft.group ?? DEFAULT_GROUP));
    const operation = group?.operations.find((o) => o.id === targetId);
    if (operation && group) startEdit(group.name, operation);
    else cancelEdit();
  } catch {
    // 错误已由请求层提示，保留编辑态让用户改
  } finally {
    saving.value = false;
  }
}

async function removeCurrent() {
  if (!editingOriginalId.value) return;
  try {
    await ElMessageBox.confirm(
      `确认删除接口 ${editingOriginalId.value}？删除会同步改写文档源码。`,
      '删除接口',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  detail.value = await deleteOperation(docId.value, editingOriginalId.value);
  ElMessage.success('接口已删除');
  cancelEdit();
}

/** 编辑中离开要拦一下，接口表单填错一次就是重来 */
onBeforeRouteLeave(async () => {
  if (!editing.value) return true;
  try {
    await ElMessageBox.confirm('当前接口改动尚未保存，确定离开？', '未保存的改动', {
      type: 'warning',
      confirmButtonText: '离开',
      cancelButtonText: '继续编辑',
    });
    return true;
  } catch {
    return false;
  }
});
</script>

<style scoped>
.ope-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--af-bg);
}
.ope-loading {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--af-text-tertiary);
  font-size: 13px;
}

/* 顶部条 */
.ope-bar {
  height: 64px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 24px;
  background: var(--af-bg);
  border-bottom: 1px solid var(--af-border);
}
.ope-bar-left,
.ope-bar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.ope-bar-left { flex: 1; }
.ope-back { color: var(--af-text-secondary); font-size: 13px; }
.ope-back:hover { color: var(--af-primary); }
.ope-bar-sep { color: var(--af-text-placeholder); }
.ope-doc-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--af-text);
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ope-meta { flex-shrink: 0; }
.ope-search { width: 260px; }

/* 主体 */
.ope-body {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}
.ope-side {
  width: 336px;
  flex: 0 0 336px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--af-border);
  background: var(--af-bg-subtle);
  min-height: 0;
}
.ope-side-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 10px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--af-text-tertiary);
}
.ope-side-count { font-weight: 400; color: var(--af-text-placeholder); }
.ope-scroll { flex: 1; min-height: 0; padding: 0 10px 20px; }
.ope-group { margin-bottom: 6px; }
.ope-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px;
  border-radius: var(--af-radius);
  cursor: pointer;
  user-select: none;
}
.ope-group-head:hover { background: var(--af-bg-hover); }
.ope-group-arrow {
  font-size: 12px;
  color: var(--af-text-tertiary);
  transition: transform 0.15s;
}
.ope-group-arrow.collapsed { transform: rotate(-90deg); }
.ope-group-name {
  flex: 1;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--af-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ope-group-count { font-size: 11.5px; color: var(--af-text-placeholder); }
.ope-group-body { padding-left: 4px; }
.ope-op {
  padding: 7px 10px;
  border-radius: var(--af-radius);
  cursor: pointer;
  transition: background 0.12s;
  margin-bottom: 2px;
}
.ope-op:hover { background: var(--af-primary-lighter); }
.ope-op.active {
  background: var(--af-primary-light);
  box-shadow: inset 2px 0 0 var(--af-primary);
}
.ope-op-main { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ope-op-path {
  flex: 1;
  min-width: 0;
  font-family: var(--af-mono);
  font-size: 12.5px;
  color: var(--af-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ope-op-summary {
  margin-top: 3px;
  padding-left: 54px;
  font-size: 11.5px;
  color: var(--af-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 右侧编辑区 */
.ope-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--af-bg);
}
.ope-blank {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.ope-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.ope-editor-scroll { flex: 1; min-height: 0; }
/* 超宽屏下居中，避免表单贴着左栏、右侧一片空白 */
.ope-editor-inner {
  max-width: 1252px;
  margin: 0 auto;
  padding: 26px 36px 32px;
}
.ope-editor-head { margin-bottom: 20px; }
.ope-editor-title { margin: 0 0 6px; font-size: 19px; font-weight: 600; }
.ope-editor-id {
  margin: 0;
  font-family: var(--af-mono);
  font-size: 12px;
  color: var(--af-text-tertiary);
  word-break: break-all;
}
.ope-form :deep(.el-form-item__label) {
  font-size: 12.5px;
  color: var(--af-text-secondary);
  padding-bottom: 6px;
  line-height: 1.4;
}
.ope-label-strong { font-weight: 600; color: var(--af-text); }
.ope-label-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ope-path-row { display: flex; gap: 10px; width: 100%; }
.ope-method { width: 132px; flex: 0 0 132px; }
.ope-path-input { flex: 1; }
.ope-path-input :deep(input) {
  font-family: var(--af-mono);
  font-size: 13.5px;
}
.ope-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 20px;
}
.ope-param-table { width: 100%; }
.ope-json-grid { align-items: start; }
.ope-code :deep(textarea) {
  font-family: var(--af-mono);
  font-size: 12.5px;
  line-height: 1.65;
  resize: none;
}
/* 并排双栏靠等高对齐，任意拖拽会破坏版式 */
.ope-json-grid :deep(textarea) { resize: none; }
.ope-tip { margin-top: 4px; }

/* 底部操作条：内层与表单同宽居中，保证左右边缘对齐 */
.ope-actions {
  flex-shrink: 0;
  padding: 14px 0;
  border-top: 1px solid var(--af-border);
  background: var(--af-bg);
}
.ope-actions-inner {
  max-width: 1252px;
  margin: 0 auto;
  padding: 0 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ope-actions-right { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.ope-shortcut {
  font-size: 11.5px;
  color: var(--af-text-placeholder);
  margin-right: 4px;
}

@media (max-width: 1100px) {
  .ope-side { width: 260px; flex-basis: 260px; }
  .ope-grid-2 { grid-template-columns: 1fr; }
  .ope-editor-inner { padding: 22px 20px 26px; }
  .ope-actions-inner { padding: 0 20px; }
  .ope-search { width: 180px; }
}
</style>
