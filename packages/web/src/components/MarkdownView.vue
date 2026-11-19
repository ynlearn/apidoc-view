<template>
  <article ref="root" class="md-body" v-html="html"></article>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { renderMarkdown, type MarkdownHeading } from '../utils/markdown';

const props = defineProps<{ content: string }>();
const emit = defineEmits<{ headings: [items: MarkdownHeading[]] }>();

const root = ref<HTMLElement>();
const html = computed(() => renderMarkdown(props.content || ''));

/** 渲染完再打锚点：markdown-it 默认不生成 id，这里补上并回传目录 */
function collectHeadings() {
  const el = root.value;
  if (!el) {
    emit('headings', []);
    return;
  }
  const items: MarkdownHeading[] = [];
  el.querySelectorAll<HTMLElement>('h1, h2, h3, h4').forEach((node, index) => {
    if (!node.id) node.id = `md-h-${index + 1}`;
    const label = node.textContent?.trim() ?? '';
    if (label) items.push({ id: node.id, label, level: Number(node.tagName.slice(1)) });
  });
  emit('headings', items);
}

watch(html, () => { nextTick(collectHeadings); }, { immediate: true });
</script>

<style scoped>
.md-body {
  max-width: 860px;
  padding: 34px 40px 90px;
  font-size: 14.5px;
  line-height: 1.85;
  color: var(--af-text);
  word-wrap: break-word;
}
.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3),
.md-body :deep(h4) {
  margin: 1.6em 0 .6em;
  font-weight: 600;
  line-height: 1.4;
  scroll-margin-top: 16px;
}
.md-body :deep(h1) { font-size: 26px; margin-top: 0; }
.md-body :deep(h2) {
  font-size: 20px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--af-border-light);
}
.md-body :deep(h3) { font-size: 16.5px; }
.md-body :deep(h4) { font-size: 15px; color: var(--af-text-secondary); }
.md-body :deep(p) { margin: .8em 0; }
.md-body :deep(a) { color: var(--af-primary); }
.md-body :deep(a:hover) { text-decoration: underline; }
.md-body :deep(ul),
.md-body :deep(ol) { padding-left: 1.6em; margin: .7em 0; }
.md-body :deep(li) { margin: .3em 0; }
.md-body :deep(blockquote) {
  margin: 1em 0;
  padding: 8px 16px;
  background: var(--af-quote-bg);
  border-left: 3px solid var(--af-primary);
  border-radius: 0 var(--af-radius) var(--af-radius) 0;
  color: var(--af-text-secondary);
}
.md-body :deep(blockquote p) { margin: .3em 0; }
.md-body :deep(code) {
  font-family: var(--af-mono);
  font-size: 12.8px;
  background: var(--af-primary-lighter);
  color: var(--af-primary-active);
  padding: 2px 5px;
  border-radius: 3px;
}
.md-body :deep(pre) {
  margin: 1em 0;
  padding: 14px 16px;
  background: #f7f8fa;
  border: 1px solid var(--af-border-light);
  border-radius: var(--af-radius);
  overflow-x: auto;
  line-height: 1.6;
}
.md-body :deep(pre code) {
  background: none;
  color: var(--af-text);
  padding: 0;
  font-size: 12.5px;
}
.md-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 13px;
  display: block;
  overflow-x: auto;
}
.md-body :deep(th),
.md-body :deep(td) {
  border: 1px solid var(--af-border);
  padding: 7px 12px;
  text-align: left;
}
.md-body :deep(th) { background: var(--af-bg-subtle); font-weight: 600; }
.md-body :deep(img) { max-width: 100%; border-radius: var(--af-radius); }
.md-body :deep(hr) { border: none; border-top: 1px solid var(--af-border); margin: 1.6em 0; }
</style>
