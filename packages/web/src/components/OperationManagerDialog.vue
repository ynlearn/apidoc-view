<template>
  <el-dialog
    v-model="open"
    :title="`接口管理 · ${docTitle || ''}`"
    width="1040px"
    top="6vh"
    class="ops-dialog"
    destroy-on-close
  >
    <div v-loading="loading" class="ops-layout">
      <!-- 左：分组与接口 -->
      <aside class="ops-side">
        <el-button class="ops-add" type="primary" size="small" :icon="Plus" @click="startCreate">新增接口</el-button>
        <el-scrollbar class="ops-scroll">
          <div v-for="group in groups" :key="group.name" class="ops-group">
            <div class="ops-group-name">{{ group.name }} <span class="ops-count">{{ group.operations.length }}</span></div>
            <div
              v-for="op in group.operations"
              :key="op.id"
              class="ops-op"
              :class="{ active: selectedId === op.id }"
              @click="startEdit(group.name, op)"
            >
              <span class="method-tag" :class="`method-${op.method}`">{{ op.method }}</span>
              <span class="ops-op-path" :title="op.path">{{ op.path }}</span>
            </div>
          </div>
          <el-empty v-if="!groups.length" description="还没有接口，点上方新增" :image-size="60" />
        </el-scrollbar>
      </aside>

      <!-- 右：表单 -->
      <section class="ops-main">
        <div v-if="!editing" class="ops-hint">
          <el-empty description="选择左侧接口进行编辑，或新增一个接口" :image-size="90" />
        </div>

        <el-form v-else label-width="88px" label-position="left" class="ops-form">
          <div class="ops-form-head">
            <span class="ops-form-title">{{ isNew ? '新增接口' : `编辑 ${editingOriginalId}` }}</span>
            <el-tag v-if="!isNew" size="small" type="info" effect="plain">{{ groupOptions.length }} 个分组可选</el-tag>
          </div>

          <el-form-item label="分组">
            <el-select v-model="form.group" filterable allow-create default-first-option placeholder="选择或输入新分组名">
              <el-option v-for="name in groupOptions" :key="name" :label="name" :value="name" />
            </el-select>
          </el-form-item>

          <el-form-item label="方法路径" required>
            <div class="ops-method-row">
              <el-select v-model="form.method" class="ops-method">
                <el-option v-for="m in METHODS" :key="m" :label="m" :value="m" />
              </el-select>
              <el-input v-model="form.path" placeholder="/users/{id}" />
            </div>
          </el-form-item>

          <el-form-item label="摘要">
            <el-input v-model="form.summary" placeholder="一句话说明接口用途" />
          </el-form-item>

          <el-form-item label="描述">
            <el-input v-model="form.description" type="textarea" :rows="2" placeholder="详细说明，可选" />
          </el-form-item>

          <el-form-item label="参数">
            <div class="ops-params">
              <el-table :data="form.parameters" size="small" border>
                <el-table-column label="名称" width="130">
                  <template #default="{ row }"><el-input v-model="row.name" size="small" /></template>
                </el-table-column>
                <el-table-column label="位置" width="92">
                  <template #default="{ row }">
                    <el-select v-model="row.in" size="small">
                      <el-option v-for="loc in PARAM_LOCATIONS" :key="loc" :label="loc" :value="loc" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="类型" width="98">
                  <template #default="{ row }">
                    <el-select v-model="row.type" size="small" filterable allow-create>
                      <el-option v-for="t in TYPES" :key="t" :label="t" :value="t" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="必填" width="56" align="center">
                  <template #default="{ row }"><el-checkbox v-model="row.required" /></template>
                </el-table-column>
                <el-table-column label="说明" min-width="110">
                  <template #default="{ row }"><el-input v-model="row.description" size="small" /></template>
                </el-table-column>
                <el-table-column width="56" align="center">
                  <template #default="{ $index }">
                    <el-button link type="danger" size="small" @click="form.parameters.splice($index, 1)">删</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <el-button class="ops-add-param" size="small" :icon="Plus" @click="addParam">添加参数</el-button>
            </div>
          </el-form-item>

          <el-form-item label="请求体">
            <div class="ops-json">
              <div class="ops-json-head">
                <span>JSON 结构（留空表示无请求体）</span>
                <el-button v-if="!form.requestBodyText" link type="primary" size="small" @click="fillRequestBody">填入模板</el-button>
              </div>
              <el-input v-model="form.requestBodyText" type="textarea" :rows="4" class="ops-code" placeholder="留空即可" />
            </div>
          </el-form-item>

          <el-form-item label="响应">
            <div class="ops-json">
              <div class="ops-json-head">
                <span>响应数组 JSON</span>
                <el-button link type="primary" size="small" @click="fillResponses">填入模板</el-button>
              </div>
              <el-input v-model="form.responsesText" type="textarea" :rows="5" class="ops-code" />
            </div>
          </el-form-item>

          <el-alert
            type="warning"
            :closable="false"
            show-icon
            class="ops-tip"
            title="接口改动会同步重写文档源码为标准 JSON，原始 YAML 的注释与排版不再保留"
          />

          <div class="ops-actions">
            <el-button v-if="!isNew" type="danger" plain @click="removeCurrent">删除接口</el-button>
            <div class="ops-actions-right">
              <el-button @click="cancelEdit">取消</el-button>
              <el-button type="primary" :loading="saving" @click="save">保存</el-button>
            </div>
          </div>
        </el-form>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import type { DocumentDetail, OperationDraft, OperationView, RequestBodyView, ResponseView } from '@openapi-view/shared';
import { createOperation, deleteOperation, getDocument, updateOperation } from '../api/documents';

const props = defineProps<{ visible: boolean; documentId: string | null; docTitle?: string }>();
const emit = defineEmits<{ 'update:visible': [value: boolean]; changed: [] }>();

const open = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const PARAM_LOCATIONS = ['query', 'path', 'header', 'cookie'];
const TYPES = ['string', 'integer', 'number', 'boolean', 'array', 'object'];
const DEFAULT_GROUP = '默认分组';

const loading = ref(false);
const saving = ref(false);
const detail = ref<DocumentDetail | null>(null);
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

async function load() {
  if (!props.documentId) return;
  loading.value = true;
  try {
    detail.value = await getDocument(props.documentId);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.visible,
  (value) => {
    if (!value) return;
    editing.value = false;
    isNew.value = false;
    selectedId.value = null;
    editingOriginalId.value = null;
    load();
  },
  { immediate: true },
);

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
  form.responsesText = JSON.stringify(operation.responses.length ? operation.responses : [], null, 2);
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
  if (!form.path.trim()) throw new Error('请填写接口路径');
  if (!form.path.trim().startsWith('/')) throw new Error('接口路径必须以 / 开头');
  const validParams = form.parameters.filter((p) => p.name.trim());
  for (const p of validParams) {
    if (!p.name.trim()) throw new Error('参数名不能为空');
  }

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
    path: form.path.trim(),
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
  if (!props.documentId) return;
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
      ? await createOperation(props.documentId, draft)
      : await updateOperation(props.documentId, editingOriginalId.value!, draft);
    ElMessage.success(isNew.value ? '接口已新增' : '接口已更新');
    const targetId = `${draft.method.toUpperCase()}:${draft.path}`;
    const group = detail.value.normalized.groups.find((g) => g.name === (draft.group ?? DEFAULT_GROUP));
    const operation = group?.operations.find((o) => o.id === targetId);
    if (operation && group) startEdit(group.name, operation);
    else cancelEdit();
    emit('changed');
  } finally {
    saving.value = false;
  }
}

async function removeCurrent() {
  if (!props.documentId || !editingOriginalId.value) return;
  try {
    await ElMessageBox.confirm(
      `确认删除接口 ${editingOriginalId.value}？删除会同步改写文档源码。`,
      '删除接口',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  detail.value = await deleteOperation(props.documentId, editingOriginalId.value);
  ElMessage.success('接口已删除');
  cancelEdit();
  emit('changed');
}
</script>

<style scoped>
.ops-layout {
  display: flex;
  gap: 16px;
  height: 64vh;
}
.ops-side {
  width: 280px;
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--af-border-light);
  padding-right: 12px;
}
.ops-add { width: 100%; margin-bottom: 10px; }
.ops-scroll { flex: 1; }
.ops-group { margin-bottom: 12px; }
.ops-group-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--af-text-tertiary);
  padding: 4px 6px;
  display: flex;
  justify-content: space-between;
}
.ops-count { color: var(--af-text-placeholder); font-weight: 400; }
.ops-op {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  transition: background 0.12s;
}
.ops-op:hover { background: var(--af-primary-lighter); }
.ops-op.active { background: var(--af-primary-light); }
.ops-op-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--af-mono);
  color: var(--af-text-secondary);
}
.ops-main { flex: 1; min-width: 0; overflow-y: auto; padding-right: 4px; }
.ops-hint { height: 100%; display: flex; align-items: center; justify-content: center; }
.ops-form-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.ops-form-title { font-weight: 600; font-size: 14px; color: var(--af-text); }
.ops-method-row { display: flex; gap: 8px; width: 100%; }
.ops-method { width: 120px; flex: 0 0 120px; }
.ops-params { width: 100%; }
.ops-add-param { margin-top: 8px; }
.ops-json { width: 100%; }
.ops-json-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--af-text-tertiary);
  margin-bottom: 4px;
}
.ops-code :deep(textarea) { font-family: var(--af-mono); font-size: 12px; }
.ops-tip { margin: 4px 0 14px; }
.ops-actions { display: flex; align-items: center; justify-content: space-between; }
.ops-actions-right { display: flex; gap: 8px; margin-left: auto; }
</style>
