<template>
  <div class="kv-editor">
    <div class="kv-table-wrap">
      <el-table :data="rows" size="small" border class="kv-table">
        <el-table-column width="40">
          <template #header>
            <el-tooltip content="启用/禁用"><span>✓</span></el-tooltip>
          </template>
          <template #default="{ row }">
            <el-checkbox v-model="row.enabled" />
          </template>
        </el-table-column>
        <el-table-column label="Key" min-width="180">
          <template #default="{ row }">
            <el-input v-model="row.key" size="small" placeholder="名称" />
          </template>
        </el-table-column>
        <el-table-column label="Value" min-width="260">
          <template #default="{ row }">
            <el-input v-model="row.value" size="small" placeholder="值，支持 {{变量}}" />
          </template>
        </el-table-column>
        <el-table-column label="说明" min-width="150">
          <template #default="{ row }">
            <el-input v-model="row.description" size="small" placeholder="可选" />
          </template>
        </el-table-column>
        <el-table-column width="44" align="center">
          <template #default="{ $index }">
            <el-button link type="danger" @click="removeRow($index)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-button size="small" class="add-row" @click="addRow">
      <el-icon><Plus /></el-icon> 添加一行
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { Delete, Plus } from '@element-plus/icons-vue';
import type { KeyValueRow } from '../stores/debugger';

const props = defineProps<{ rows: KeyValueRow[] }>();
const emit = defineEmits<{ 'update:rows': [rows: KeyValueRow[]] }>();

function addRow() {
  emit('update:rows', [...props.rows, { key: '', value: '', enabled: true }]);
}

function removeRow(index: number) {
  emit('update:rows', props.rows.filter((_, i) => i !== index));
}
</script>

<style scoped>
.kv-editor {
  padding-top: 4px;
  min-width: 0;
}
.kv-table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.kv-table-wrap :deep(.el-table) {
  min-width: 640px;
}
/* 紧凑密度：覆盖全局 11px 单元格内边距 */
.kv-table-wrap :deep(.el-table .el-table__cell) {
  padding: 5px 6px;
}
.add-row {
  margin-top: 6px;
}
</style>
