<template>
  <AuthGate v-if="needLogin" mode="admin" />

  <div v-else-if="authStore.ready" class="admin-page">
    <AppHeader :show-env="false" :show-logout="true" home-to="/admin" subtitle="文档管理后台" />

    <div class="admin-body">
      <!-- 管理端子菜单 -->
      <aside class="admin-menu">
        <div class="menu-title">管理后台</div>
        <div
          v-for="item in menu"
          :key="item.key"
          class="menu-item"
          :class="{ active: activePane === item.key }"
          @click="activePane = item.key"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </div>
      </aside>

      <!-- 管理内容 -->
      <main class="admin-main">
        <!-- 文档管理 -->
        <section v-if="activePane === 'documents'" class="admin-section">
          <div class="section-head">
            <div>
              <h2>文档管理</h2>
              <p class="section-desc">导入、预览与删除文档，支持 OpenAPI 3.0（JSON/YAML）与 Markdown</p>
            </div>
            <el-button type="primary" @click="importVisible = true">
              <el-icon><Upload /></el-icon> 导入文档
            </el-button>
          </div>

          <el-table :data="docsStore.list" v-loading="docsStore.loading" class="admin-table" border>
            <el-table-column label="文档标题" min-width="220">
              <template #default="{ row }">
                <div class="doc-title-cell">
                  <el-icon><Files /></el-icon>
                  <span>{{ row.title }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="来源" width="110">
              <template #default="{ row }">
                <el-tag size="small" effect="plain" :type="sourceType(row.sourceType)">{{ sourceLabel(row.sourceType) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="接口数" width="90" align="center">
              <template #default="{ row }">
                <span v-if="row.rawFormat === 'markdown'" class="muted">—</span>
                <span v-else>{{ row.operationCount }}</span>
              </template>
            </el-table-column>
            <el-table-column label="格式" width="90" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.rawFormat === 'markdown'" type="warning" size="small" effect="plain">MD</el-tag>
                <span v-else class="mono">{{ row.rawFormat.toUpperCase() }}</span>
              </template>
            </el-table-column>
            <el-table-column label="更新时间" width="170">
              <template #default="{ row }">{{ fmtTime(row.updatedAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="230" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openPreview(row)">预览</el-button>
                <el-button
                  v-if="row.rawFormat === 'markdown'"
                  link type="primary" size="small"
                  @click="exportDoc(row.id, 'markdown')"
                >导出 MD</el-button>
                <el-dropdown v-else @command="(cmd: string) => exportDoc(row.id, cmd)">
                  <el-button link type="primary" size="small">导出<el-icon><ArrowDown /></el-icon></el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="json">导出 JSON</el-dropdown-item>
                      <el-dropdown-item command="yaml">导出 YAML</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button link type="danger" size="small" @click="removeDoc(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!docsStore.list.length" description="暂无文档，点击右上角导入" :image-size="90" />
        </section>

        <!-- 环境管理 -->
        <section v-if="activePane === 'environments'" class="admin-section">
          <div class="section-head">
            <div>
              <h2>环境管理</h2>
              <p class="section-desc">配置 dev/test/prod 环境；变量用 <code>{{ varSyntax }}</code> 引用，环境同名变量覆盖全局</p>
            </div>
            <el-button type="primary" @click="openEnvDialog()">
              <el-icon><Plus /></el-icon> 新建环境
            </el-button>
          </div>
          <el-table :data="envStore.environments" class="admin-table" border>
            <el-table-column label="环境名" prop="name" width="150" />
            <el-table-column label="变量" min-width="360">
              <template #default="{ row }">
                <div class="var-chips">
                  <el-tag v-for="(value, key) in row.variables" :key="key" size="small" effect="plain" class="var-chip">
                    {{ key }} = {{ String(value).length > 34 ? String(value).slice(0, 34) + '…' : value }}
                  </el-tag>
                  <span v-if="!Object.keys(row.variables).length" class="muted">无变量</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag v-if="row.id === envStore.activeId" type="success" size="small">使用中</el-tag>
                <el-tag v-else type="info" size="small">备用</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="210" fixed="right">
              <template #default="{ row }">
                <el-button
                  link type="primary" size="small"
                  :disabled="row.id === envStore.activeId"
                  @click="onUseEnv(row)"
                >切换使用</el-button>
                <el-button link type="primary" size="small" @click="openEnvDialog(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="onDeleteEnv(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <!-- 全局变量 -->
        <section v-if="activePane === 'globals'" class="admin-section">
          <div class="section-head">
            <div>
              <h2>全局变量</h2>
              <p class="section-desc">所有环境共享的变量，可被环境同名变量覆盖</p>
            </div>
            <el-button type="primary" @click="globalRows.push({ key: '', value: '', description: '' })">
              <el-icon><Plus /></el-icon> 添加变量
            </el-button>
          </div>
          <el-table :data="globalRows" class="admin-table" border>
            <el-table-column label="变量名" min-width="180">
              <template #default="{ row }"><el-input v-model="row.key" size="small" placeholder="如 baseUrl" /></template>
            </el-table-column>
            <el-table-column label="值" min-width="280">
              <template #default="{ row }"><el-input v-model="row.value" size="small" /></template>
            </el-table-column>
            <el-table-column label="说明" min-width="180">
              <template #default="{ row }"><el-input v-model="row.description" size="small" /></template>
            </el-table-column>
            <el-table-column width="60" align="center">
              <template #default="{ $index }">
                <el-button link type="danger" @click="globalRows.splice($index, 1)"><el-icon><Delete /></el-icon></el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="save-row">
            <el-button type="primary" :loading="savingGlobals" @click="onSaveGlobals">保存全局变量</el-button>
          </div>
        </section>

        <!-- 请求历史 -->
        <section v-if="activePane === 'history'" class="admin-section">
          <div class="section-head">
            <div>
              <h2>请求历史</h2>
              <p class="section-desc">敏感请求头已自动脱敏</p>
            </div>
            <el-button type="danger" plain @click="onClearHistory">清空历史</el-button>
          </div>
          <el-table :data="historyItems" v-loading="historyLoading" class="admin-table" border>
            <el-table-column label="方法" width="80">
              <template #default="{ row }"><span class="method-tag" :class="`method-${row.method}`">{{ row.method }}</span></template>
            </el-table-column>
            <el-table-column label="URL" min-width="260">
              <template #default="{ row }"><span class="hist-url" :title="row.urlActual">{{ row.urlActual }}</span></template>
            </el-table-column>
            <el-table-column label="状态" width="80">
              <template #default="{ row }">
                <el-tag v-if="row.statusCode" :type="row.statusCode < 400 ? 'success' : 'warning'" size="small">{{ row.statusCode }}</el-tag>
                <el-tag v-else-if="row.error" type="danger" size="small">失败</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="90">
              <template #default="{ row }">{{ row.durationMs != null ? row.durationMs + ' ms' : '—' }}</template>
            </el-table-column>
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="70">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="onViewHistory(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination class="pager" background layout="total, prev, pager, next"
            :total="historyTotal" :page-size="50" @current-change="onHistoryPage" />
        </section>
      </main>
    </div>

    <!-- 文档预览（管理端原地预览，不跳到浏览端） -->
    <el-drawer v-model="previewVisible" :title="previewDoc?.title ?? '文档预览'" size="62%">
      <div v-loading="previewLoading" class="preview-wrap">
        <template v-if="previewDoc">
          <MarkdownView
            v-if="previewDoc.rawFormat === 'markdown'"
            :content="previewDoc.rawContent"
          />
          <div v-else class="preview-meta">
            <div class="preview-row">
              <span class="preview-label">版本</span>
              <span>{{ previewDoc.normalized.version || '未声明' }}</span>
            </div>
            <div class="preview-row">
              <span class="preview-label">接口数</span>
              <span>{{ previewDoc.normalized.operationCount }}</span>
            </div>
            <div class="preview-row">
              <span class="preview-label">服务器</span>
              <span class="preview-servers">
                <code v-for="s in previewDoc.normalized.servers" :key="s.url">{{ s.url }}</code>
                <span v-if="!previewDoc.normalized.servers.length" class="muted">未声明</span>
              </span>
            </div>
            <div v-for="group in previewDoc.normalized.groups" :key="group.name" class="preview-group">
              <div class="preview-group-title">
                {{ group.name }} <span class="preview-group-count">{{ group.operations.length }}</span>
              </div>
              <div v-for="op in group.operations" :key="op.id" class="preview-op">
                <span class="method-tag" :class="`method-${op.method}`">{{ op.method }}</span>
                <code class="preview-op-path">{{ op.path }}</code>
                <span class="preview-op-summary">{{ op.summary || '' }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </el-drawer>

    <!-- 导入弹窗 -->
    <ImportDialog v-model="importVisible" />

    <!-- 环境弹窗 -->
    <el-dialog v-model="envDialogVisible" :title="editingEnv ? '编辑环境' : '新建环境'" width="540px">
      <el-form label-position="top">
        <el-form-item label="环境名称">
          <el-input v-model="envForm.name" placeholder="如 dev / test / prod" />
        </el-form-item>
        <el-form-item label="环境变量">
          <div v-for="(row, i) in envForm.rows" :key="i" class="env-var-row">
            <el-input v-model="row.key" placeholder="变量名" class="ev-key" />
            <span class="ev-eq">=</span>
            <el-input v-model="row.value" placeholder="值" class="ev-value" />
            <el-button link type="danger" @click="envForm.rows.splice(i, 1)"><el-icon><Delete /></el-icon></el-button>
          </div>
          <el-button size="small" @click="envForm.rows.push({ key: '', value: '' })"><el-icon><Plus /></el-icon> 添加变量</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="envDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingEnv" @click="onSaveEnv">保存</el-button>
      </template>
    </el-dialog>

    <!-- 历史详情 -->
    <el-drawer v-model="historyDrawer" title="请求详情" size="46%">
      <template v-if="selectedHistory">
        <h4>请求</h4>
        <p class="mono hist-line"><b>{{ selectedHistory.method }}</b> {{ selectedHistory.urlActual }}</p>
        <h4>请求头（已脱敏）</h4>
        <pre class="code-block">{{ JSON.stringify(selectedHistory.requestHeaders, null, 2) }}</pre>
        <h4 v-if="selectedHistory.requestBody">请求体</h4>
        <pre v-if="selectedHistory.requestBody" class="code-block">{{ selectedHistory.requestBody }}</pre>
        <h4 v-if="selectedHistory.error">错误</h4>
        <pre v-if="selectedHistory.error" class="code-block">{{ selectedHistory.error }}</pre>
        <h4>响应预览</h4>
        <pre class="code-block">{{ selectedHistory.responsePreview || '(无)' }}</pre>
      </template>
    </el-drawer>
  </div>

  <div v-else class="admin-loading">加载中…</div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import {
  Files, Setting, Upload, Plus, Delete, ArrowDown,
  Document, Monitor, Clock,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { DocumentDetail, DocumentFormat, DocumentSummary, Environment, HistoryEntry } from '@openapi-view/shared';
import AppHeader from '../components/AppHeader.vue';
import ImportDialog from '../components/ImportDialog.vue';
import MarkdownView from '../components/MarkdownView.vue';
import AuthGate from '../components/AuthGate.vue';
import { useDocumentsStore } from '../stores/documents';
import { useEnvironmentStore } from '../stores/environment';
import { useAuthStore } from '../stores/auth';
import { getDocument, exportDocumentUrl } from '../api/documents';
import * as historyApi from '../api/proxy';

const authStore = useAuthStore();
const docsStore = useDocumentsStore();
const envStore = useEnvironmentStore();

/** 未登录管理员时整页显示登录框，其余内容不渲染，避免闪现空表 */
const needLogin = computed(() => authStore.ready && authStore.role !== 'admin');

const menu = [
  { key: 'documents', label: '文档管理', icon: Document },
  { key: 'environments', label: '环境管理', icon: Monitor },
  { key: 'globals', label: '全局变量', icon: Setting },
  { key: 'history', label: '请求历史', icon: Clock },
];
const activePane = ref('documents');
const varSyntax = '{{变量名}}';

async function bootstrap() {
  await Promise.all([docsStore.loadList(), envStore.load()]);
  globalRows.value = envStore.globals.map((g) => ({ key: g.key, value: g.value, description: g.description }));
  await loadHistory();
}

onMounted(async () => {
  await authStore.init();
  if (!needLogin.value) await bootstrap();
});

// 登录成功后 needLogin 变 false：监听状态而非子组件事件（组件在 await 后已卸载）
watch(needLogin, (need) => {
  if (!need) void bootstrap();
});

// 文档
const importVisible = ref(false);
const previewVisible = ref(false);
const previewLoading = ref(false);
const previewDoc = ref<DocumentDetail | null>(null);

function sourceLabel(t: string): string {
  return ({ url: 'URL', file: '文件', paste: '粘贴' } as Record<string, string>)[t] ?? t;
}
function sourceType(t: string): 'success' | 'info' | 'warning' {
  return ({ url: 'success', file: 'info', paste: 'warning' } as Record<string, any>)[t] ?? 'info';
}
function fmtTime(ts: number): string { return new Date(ts).toLocaleString('zh-CN'); }

async function openPreview(row: DocumentSummary) {
  previewVisible.value = true;
  previewDoc.value = null;
  previewLoading.value = true;
  try {
    previewDoc.value = await getDocument(row.id);
  } catch { /* 错误已由请求层提示 */ } finally {
    previewLoading.value = false;
  }
}

function exportDoc(id: string, format: string) {
  window.open(exportDocumentUrl(id, format as DocumentFormat), '_blank');
}

async function removeDoc(row: { id: string; title: string }) {
  try {
    await ElMessageBox.confirm(`确认删除文档「${row.title}」？`, '提示', { type: 'warning' });
    await docsStore.removeDocument(row.id);
    ElMessage.success('已删除');
  } catch { /* 取消 */ }
}

// 环境
const envDialogVisible = ref(false);
const editingEnv = ref<Environment | null>(null);
const savingEnv = ref(false);
const envForm = reactive({ name: '', rows: [{ key: '', value: '' }] as Array<{ key: string; value: string }> });
function openEnvDialog(env?: Environment) {
  editingEnv.value = env ?? null;
  envForm.name = env?.name ?? '';
  envForm.rows = env
    ? Object.entries(env.variables).map(([key, value]) => ({ key, value }))
    : [{ key: 'baseUrl', value: '' }];
  envDialogVisible.value = true;
}
async function onSaveEnv() {
  if (!envForm.name.trim()) { ElMessage.warning('请输入环境名称'); return; }
  savingEnv.value = true;
  try {
    const variables: Record<string, string> = {};
    for (const r of envForm.rows) if (r.key.trim()) variables[r.key.trim()] = r.value;
    if (editingEnv.value) await envStore.updateEnv(editingEnv.value.id, { name: envForm.name, variables });
    else await envStore.addEnvironment(envForm.name, variables);
    ElMessage.success('保存成功');
    envDialogVisible.value = false;
  } catch { /* 已提示 */ } finally { savingEnv.value = false; }
}
function onUseEnv(row: Environment) {
  envStore.select(row.id);
  ElMessage.success(`已切换为使用「${row.name}」环境`);
}
async function onDeleteEnv(row: Environment) {
  try {
    await ElMessageBox.confirm(`确认删除环境「${row.name}」？`, '提示', { type: 'warning' });
    await envStore.removeEnvironment(row.id);
  } catch { /* 取消 */ }
}

// 全局变量
const globalRows = ref<Array<{ key: string; value: string; description?: string }>>([]);
const savingGlobals = ref(false);
async function onSaveGlobals() {
  savingGlobals.value = true;
  try {
    await envStore.saveGlobals(globalRows.value.filter((r) => r.key.trim()));
    ElMessage.success('全局变量已保存');
  } finally { savingGlobals.value = false; }
}

// 历史
const historyItems = ref<HistoryEntry[]>([]);
const historyTotal = ref(0);
const historyLoading = ref(false);
const historyDrawer = ref(false);
const selectedHistory = ref<HistoryEntry | null>(null);
async function loadHistory(page = 1) {
  historyLoading.value = true;
  try {
    const res = await historyApi.listHistory(50, (page - 1) * 50);
    historyItems.value = res.items;
    historyTotal.value = res.total;
  } finally { historyLoading.value = false; }
}
function onHistoryPage(page: number) { loadHistory(page); }
async function onClearHistory() {
  try {
    await ElMessageBox.confirm('确认清空所有请求历史？', '提示', { type: 'warning' });
    await historyApi.clearHistory();
    ElMessage.success('已清空');
    loadHistory();
  } catch { /* 取消 */ }
}
function onViewHistory(row: HistoryEntry) {
  selectedHistory.value = row;
  historyDrawer.value = true;
}
</script>

<style scoped>
.admin-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.admin-loading {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--af-text-tertiary);
  font-size: 13px;
}
.admin-body { flex: 1; display: flex; min-height: 0; overflow: hidden; }
.admin-menu {
  width: 208px;
  flex-shrink: 0;
  border-right: 1px solid var(--af-border);
  background: var(--af-bg-subtle);
  padding: 18px 12px;
  display: flex;
  flex-direction: column;
}
.menu-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--af-text-tertiary);
  text-transform: uppercase;
  letter-spacing: .6px;
  padding: 0 10px 10px;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 11px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--af-text-secondary);
  cursor: pointer;
  margin-bottom: 3px;
}
.menu-item:hover { background: var(--af-bg-hover); color: var(--af-primary); }
.menu-item.active { background: var(--af-primary-light); color: var(--af-primary); font-weight: 600; }
.admin-main { flex: 1; min-width: 0; overflow-y: auto; background: var(--af-bg); }
.admin-section { max-width: 1120px; padding: 32px 40px 80px; }
.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.section-head h2 { margin: 0 0 5px; font-size: 20px; font-weight: 600; }
.section-desc { margin: 0; font-size: 12.5px; color: var(--af-text-tertiary); }
.section-desc code { color: var(--af-primary); background: var(--af-primary-lighter); padding: 1px 5px; border-radius: 3px; }
.admin-table { font-size: 12.5px; width: 100%; }
.doc-title-cell { display: flex; align-items: center; gap: 7px; }
.doc-title-cell .el-icon { color: var(--af-primary); }
.mono { font-family: var(--af-mono); }
.var-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.var-chip { max-width: 100%; }
.muted { color: var(--af-text-placeholder); }
.save-row { margin-top: 14px; }
.pager { margin-top: 16px; justify-content: flex-end; }
.hist-url { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--af-mono); font-size: 12px; }
.hist-line { word-break: break-all; }
.env-var-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ev-key { width: 150px; }
.ev-eq { color: var(--af-text-tertiary); }
.ev-value { flex: 1; }

/* 预览抽屉 */
.preview-wrap { min-height: 200px; }
.preview-meta { font-size: 13px; color: var(--af-text-secondary); }
.preview-row { display: flex; gap: 10px; padding: 6px 0; align-items: baseline; }
.preview-label { width: 56px; flex-shrink: 0; color: var(--af-text-tertiary); font-size: 12.5px; }
.preview-servers { display: flex; flex-wrap: wrap; gap: 6px; }
.preview-servers code {
  font-family: var(--af-mono);
  font-size: 12px;
  background: var(--af-bg-subtle);
  border: 1px solid var(--af-border-light);
  padding: 1px 6px;
  border-radius: 3px;
}
.preview-group { margin-top: 18px; }
.preview-group-title { font-weight: 600; font-size: 13.5px; margin-bottom: 8px; }
.preview-group-count { color: var(--af-text-tertiary); font-weight: 400; font-size: 12px; }
.preview-op { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px dashed var(--af-border-light); }
.preview-op-path { font-family: var(--af-mono); font-size: 12.5px; color: var(--af-text); }
.preview-op-summary { color: var(--af-text-tertiary); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 768px) {
  .admin-menu { width: 64px; padding: 14px 6px; }
  .menu-title, .menu-item span { display: none; }
  .menu-item { justify-content: center; }
  .admin-section { padding: 18px 12px 50px; }
}
</style>
