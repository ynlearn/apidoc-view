<template>
  <div class="env-switcher">
    <el-select
      :model-value="envStore.activeId"
      placeholder="选择环境"
      size="small"
      class="env-select"
      @change="onChange"
    >
      <el-option
        v-for="env in envStore.environments"
        :key="env.id"
        :label="env.name"
        :value="env.id"
      />
    </el-select>
    <el-tag v-if="envStore.activeEnvironment" type="success" size="small" effect="plain">
      {{ activeHost || '使用中' }}
    </el-tag>
    <el-tag v-else type="info" size="small" effect="plain">未选择环境</el-tag>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEnvironmentStore } from '../stores/environment';

const envStore = useEnvironmentStore();

const activeHost = computed(() => {
  const vars = envStore.activeEnvironment?.variables ?? {};
  return vars.baseUrl ?? vars.host ?? '';
});

async function onChange(id: string) {
  envStore.select(id);
}
</script>

<style scoped>
.env-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
}
.env-select {
  width: 140px;
}
</style>
