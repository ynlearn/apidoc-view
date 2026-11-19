import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { DocumentSummary, DocumentDetail, NormalizedDocument, OperationView } from '@bluebull/shared';
import * as api from '../api/documents';

export const useDocumentsStore = defineStore('documents', () => {
  const list = ref<DocumentSummary[]>([]);
  const current = ref<DocumentDetail | null>(null);
  const selectedOperationId = ref<string | null>(null);
  const loading = ref(false);

  const normalized = computed<NormalizedDocument | null>(() => current.value?.normalized ?? null);

  const selectedOperation = computed<OperationView | null>(() => {
    if (!normalized.value || !selectedOperationId.value) return null;
    for (const group of normalized.value.groups) {
      const found = group.operations.find((op) => op.id === selectedOperationId.value);
      if (found) return found;
    }
    return null;
  });

  async function loadList() {
    list.value = await api.listDocuments();
  }

  async function openDocument(id: string) {
    loading.value = true;
    try {
      current.value = await api.getDocument(id);
      const first = current.value.normalized.groups[0]?.operations[0];
      selectedOperationId.value = first?.id ?? null;
    } finally {
      loading.value = false;
    }
  }

  async function addDocument(data: Parameters<typeof api.createDocument>[0]) {
    const { id } = await api.createDocument(data);
    await loadList();
    await openDocument(id);
    return id;
  }

  async function importFromUrl(url: string) {
    const { id } = await api.importDocumentFromUrl(url);
    await loadList();
    await openDocument(id);
    return id;
  }

  async function removeDocument(id: string) {
    await api.deleteDocument(id);
    if (current.value?.id === id) {
      current.value = null;
      selectedOperationId.value = null;
    }
    await loadList();
  }

  function selectOperation(id: string) {
    selectedOperationId.value = id;
  }

  return {
    list,
    current,
    normalized,
    selectedOperationId,
    selectedOperation,
    loading,
    loadList,
    openDocument,
    addDocument,
    importFromUrl,
    removeDocument,
    selectOperation,
  };
});
