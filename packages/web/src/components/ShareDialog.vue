<template>
  <el-dialog v-model="open" :title="`分享 · ${document?.title ?? ''}`" width="820px" top="8vh" destroy-on-close>
    <div class="share-create">
      <div class="share-section-title">新建分享链接</div>
      <el-form label-width="82px" label-position="left">
        <el-form-item label="分享范围">
          <el-radio-group v-model="targetType">
            <el-radio-button value="document">整份文档</el-radio-button>
            <el-radio-button value="operation" :disabled="!operations.length">单个接口</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="targetType === 'operation'" label="选择接口">
          <el-select v-model="operationId" filterable placeholder="搜索接口路径或摘要" class="share-full">
            <el-option
              v-for="item in operations"
              :key="item.id"
              :label="`${item.method} ${item.path}${item.summary ? ' · ' + item.summary : ''}`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="分享标题">
          <el-input v-model="form.title" placeholder="留空自动取文档/接口标题" />
        </el-form-item>

        <el-form-item label="访问口令">
          <el-input v-model="form.password" placeholder="留空表示凭链接即可访问" show-password clearable />
        </el-form-item>

        <el-form-item label="有效期">
          <el-select v-model="form.expiresInDays" class="share-expire">
            <el-option label="永久有效" :value="0" />
            <el-option label="1 天" :value="1" />
            <el-option label="7 天" :value="7" />
            <el-option label="30 天" :value="30" />
            <el-option label="90 天" :value="90" />
          </el-select>
          <el-button type="primary" :loading="creating" class="share-create-btn" @click="onCreate">生成链接</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div class="share-list">
      <div class="share-section-title">
        已有分享 <span class="share-count">{{ shares.length }}</span>
      </div>
      <el-table v-loading="loading" :data="shares" size="small" border empty-text="还没有分享链接">
        <el-table-column label="标题" min-width="180">
          <template #default="{ row }">
            <div class="share-title-cell">{{ row.title }}</div>
            <div class="share-sub">{{ row.targetType === 'operation' ? '单接口' : '整份文档' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="口令" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.hasPassword ? 'warning' : 'info'" size="small" effect="plain">
              {{ row.hasPassword ? '有' : '无' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="有效期" width="150">
          <template #default="{ row }">{{ expireLabel(row.expiresAt) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'danger'" size="small" effect="light">
              {{ row.enabled ? '生效' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="copyLink(row.token)">复制链接</el-button>
            <el-button link size="small" @click="toggleEnabled(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
            <el-button link type="danger" size="small" @click="removeShare(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { OperationView, ShareSummary } from '@openapi-view/shared';
import { getDocument } from '../api/documents';
import { createShare, deleteShare, listShares, shareUrl, updateShare } from '../api/shares';

const props = defineProps<{ visible: boolean; document: { id: string; title: string } | null }>();
const emit = defineEmits<{ 'update:visible': [value: boolean] }>();

const open = computed({
  get: () => props.visible,
  set: (value: boolean) => emit('update:visible', value),
});

const loading = ref(false);
const creating = ref(false);
const shares = ref<ShareSummary[]>([]);
const operations = ref<OperationView[]>([]);
const targetType = ref<'document' | 'operation'>('document');
const operationId = ref('');

const form = reactive({ title: '', password: '', expiresInDays: 0 });

async function loadAll() {
  if (!props.document) return;
  loading.value = true;
  try {
    const [list, detail] = await Promise.all([
      listShares(props.document.id),
      getDocument(props.document.id),
    ]);
    shares.value = list;
    // Markdown 文档没有接口概念，只能整体分享
    operations.value =
      detail.rawFormat === 'markdown' ? [] : detail.normalized.groups.flatMap((g) => g.operations);
    if (!operations.value.length) targetType.value = 'document';
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.visible,
  (value) => {
    if (!value) return;
    targetType.value = 'document';
    operationId.value = '';
    form.title = '';
    form.password = '';
    form.expiresInDays = 0;
    loadAll();
  },
  { immediate: true },
);

function expireLabel(expiresAt?: number): string {
  if (!expiresAt) return '永久';
  const left = expiresAt - Date.now();
  if (left <= 0) return '已过期';
  return new Date(expiresAt).toLocaleString('zh-CN');
}

async function onCreate() {
  if (!props.document) return;
  if (targetType.value === 'operation' && !operationId.value) {
    ElMessage.warning('请选择要分享的接口');
    return;
  }
  creating.value = true;
  try {
    const created = await createShare({
      targetType: targetType.value,
      documentId: props.document.id,
      operationId: targetType.value === 'operation' ? operationId.value : undefined,
      title: form.title.trim() || undefined,
      password: form.password.trim() || undefined,
      expiresInDays: form.expiresInDays || undefined,
    });
    shares.value = [created, ...shares.value];
    form.title = '';
    form.password = '';
    await copyLink(created.token);
  } finally {
    creating.value = false;
  }
}

async function copyLink(token: string) {
  const url = shareUrl(token);
  try {
    await navigator.clipboard.writeText(url);
    ElMessage.success(`链接已复制：${url}`);
  } catch {
    ElMessageBox.alert(url, '复制失败，请手动复制', { confirmButtonText: '知道了' });
  }
}

async function toggleEnabled(row: ShareSummary) {
  const updated = await updateShare(row.id, { enabled: !row.enabled });
  const index = shares.value.findIndex((s) => s.id === row.id);
  if (index >= 0) shares.value[index] = updated;
  ElMessage.success(updated.enabled ? '已启用' : '已停用');
}

async function removeShare(row: ShareSummary) {
  try {
    await ElMessageBox.confirm(`删除后该链接立即失效，确认删除「${row.title}」？`, '删除分享', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  await deleteShare(row.id);
  shares.value = shares.value.filter((s) => s.id !== row.id);
  ElMessage.success('已删除');
}
</script>

<style scoped>
.share-create { margin-bottom: 8px; }
.share-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--af-text-secondary);
  margin-bottom: 12px;
}
.share-count {
  color: var(--af-text-placeholder);
  font-weight: 400;
  font-size: 12px;
}
.share-full { width: 100%; }
.share-expire { width: 150px; }
.share-create-btn { margin-left: 12px; }
.share-list { margin-top: 6px; }
.share-title-cell { font-size: 13px; color: var(--af-text); }
.share-sub { font-size: 11.5px; color: var(--af-text-placeholder); margin-top: 2px; }
</style>
