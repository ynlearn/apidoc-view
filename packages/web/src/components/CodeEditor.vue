<template>
  <div ref="container" class="code-editor"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    readOnly?: boolean;
    height?: string;
  }>(),
  { readOnly: false, height: '220px' },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const container = ref<HTMLElement | null>(null);
let view: EditorView | null = null;

onMounted(() => {
  if (!container.value) return;
  view = new EditorView({
    parent: container.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        json(),
        oneDark,
        EditorView.lineWrapping,
        EditorView.editable.of(!props.readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            emit('update:modelValue', update.state.doc.toString());
          }
        }),
      ],
    }),
  });
  container.value.style.height = props.height;
});

watch(
  () => props.modelValue,
  (newVal) => {
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== newVal) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: newVal },
      });
    }
  },
);

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});
</script>

<style scoped>
.code-editor {
  width: 100%;
  border: 1px solid var(--bb-border);
  border-radius: 6px;
  overflow: hidden;
  font-size: 12px;
}
.code-editor :deep(.cm-editor) {
  height: 100%;
}
.code-editor :deep(.cm-scroller) {
  overflow: auto;
}
</style>
