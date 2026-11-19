<template>
  <div class="schema-viewer">
    <div v-if="!schema" class="schema-empty">无</div>
    <div v-else-if="schema.circular" class="schema-circular">↻ 循环引用</div>
    <div v-else>
      <template v-if="schema.properties">
        <div
          v-for="(prop, name) in schema.properties"
          :key="name"
          class="schema-row"
        >
          <span class="schema-name">{{ name }}</span>
          <span v-if="requiredList.includes(name)" class="required-mark">*</span>
          <span class="schema-type">{{ displayType(prop) }}</span>
          <span class="schema-desc">{{ prop.description }}</span>
          <div v-if="prop.properties || prop.items || prop.allOf || prop.oneOf" class="schema-nested">
            <SchemaViewer :schema="prop.properties ? prop : prop.items || prop.allOf?.[0] || prop.oneOf?.[0]" />
          </div>
        </div>
      </template>
      <template v-else-if="schema.items">
        <div class="schema-hint">数组元素：</div>
        <SchemaViewer :schema="schema.items" />
      </template>
      <template v-else-if="schema.enum">
        <div class="schema-hint">枚举：{{ schema.enum.join(' | ') }}</div>
      </template>
      <template v-else>
        <div class="schema-hint">{{ displayType(schema) }} {{ schema.format || '' }}</div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SchemaView } from '@bluebull/shared';
import SchemaViewer from './SchemaViewer.vue';

const props = defineProps<{ schema?: SchemaView }>();

const requiredList = computed(() => props.schema?.required ?? []);

function displayType(schema: SchemaView): string {
  if (schema.type === 'array') return `array<${schema.items?.type ?? 'any'}>`;
  return schema.type ?? 'object';
}
</script>

<style scoped>
.schema-viewer {
  font-size: 12.5px;
  line-height: 1.7;
}
.schema-empty,
.schema-circular,
.schema-hint {
  color: var(--af-text-tertiary);
}
.schema-circular {
  color: var(--af-orange);
}
.schema-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px dashed var(--af-border-light);
}
.schema-name {
  font-family: var(--af-mono);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--af-primary);
}
.required-mark {
  color: var(--af-red);
  font-weight: 600;
}
.schema-type {
  color: var(--af-text-tertiary);
  font-family: var(--af-mono);
  font-size: 12px;
}
.schema-desc {
  color: var(--af-text-secondary);
}
.schema-nested {
  width: 100%;
  padding-left: 16px;
  border-left: 2px solid var(--af-border);
  margin: 4px 0;
}
</style>
