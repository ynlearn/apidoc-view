import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  BodyType,
  HttpMethod,
  OperationView,
  ProxyResponseDto,
} from '@openapi-view/shared';
import { sendRequest } from '../api/proxy';
import { interpolate } from '../utils/interpolate';
import { useEnvironmentStore } from './environment';
import { generateExample } from '../utils/example';

export interface KeyValueRow {
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export const useDebuggerStore = defineStore('debugger', () => {
  const method = ref<HttpMethod>('GET');
  const url = ref('');
  const urlTemplate = ref<string | undefined>(undefined);
  const query = ref<KeyValueRow[]>([]);
  const headers = ref<KeyValueRow[]>([]);
  const bodyType = ref<BodyType>('none');
  const body = ref('');
  const response = ref<ProxyResponseDto | null>(null);
  const sending = ref(false);
  const error = ref<string | null>(null);
  const unresolvedVars = ref<string[]>([]);
  const panelOpen = ref(false);
  const currentOperationId = ref<string | null>(null);

  const envStore = useEnvironmentStore();

  /** 插值后的 URL 预览 */
  const interpolatedUrl = computed(() => {
    const result = interpolate(url.value, envStore.mergedVariables);
    unresolvedVars.value = result.unresolved;
    return result.value;
  });

  function rowsToRecord(rows: KeyValueRow[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of rows) {
      if (row.enabled && row.key) out[row.key] = row.value;
    }
    return out;
  }

  function recordToRows(record: Record<string, string> | undefined): KeyValueRow[] {
    if (!record) return [];
    return Object.entries(record).map(([key, value]) => ({ key, value, enabled: true }));
  }

  /** 从接口定义一键带入调试 */
  function loadFromOperation(op: OperationView, baseUrl = '') {
    method.value = op.method as HttpMethod;
    currentOperationId.value = op.id;

    // URL：环境 baseUrl 变量 + path，path 参数用示例值替换
    let path = op.path;
    const queryRows: KeyValueRow[] = [];
    const headerRows: KeyValueRow[] = [];

    for (const p of op.parameters) {
      const example = String(generateExample(p.schema) ?? p.example ?? '');
      if (p.in === 'path') {
        path = path.replace(`{${p.name}}`, example);
      } else if (p.in === 'query') {
        queryRows.push({ key: p.name, value: example, enabled: true, description: p.description });
      } else if (p.in === 'header') {
        headerRows.push({ key: p.name, value: example, enabled: true, description: p.description });
      }
    }

    const templatePath = op.path;
    if (baseUrl) {
      const joined = baseUrl.replace(/\/+$/, '') + path;
      url.value = joined;
      urlTemplate.value = baseUrl.replace(/\/+$/, '') + templatePath;
    } else {
      url.value = path;
      urlTemplate.value = templatePath;
    }

    query.value = queryRows;
    headers.value = headerRows;

    // Body：取第一个 content type 的示例
    const media = op.requestBody?.contentTypes?.[0];
    if (media) {
      const example = media.example ?? (media.schema ? generateExample(media.schema) : undefined);
      body.value =
        example === undefined
          ? ''
          : typeof example === 'string'
            ? example
            : JSON.stringify(example, null, 2);
      bodyType.value = media.contentType.includes('form-data') ? 'form-data' : 'json';
      if (media.contentType.includes('form-data') && bodyType.value === 'form-data') {
        // form-data 用 JSON KV 表达
        bodyType.value = 'json';
      }
    } else {
      body.value = '';
      bodyType.value = 'none';
    }

    if (headers.value.length === 0) {
      headers.value = [{ key: '', value: '', enabled: true }];
    }
    if (query.value.length === 0) {
      query.value = [{ key: '', value: '', enabled: true }];
    }
    panelOpen.value = true;
    response.value = null;
    error.value = null;
  }

  async function send() {
    sending.value = true;
    error.value = null;
    try {
      const dto = {
        method: method.value,
        url: url.value,
        urlTemplate: urlTemplate.value,
        query: rowsToRecord(query.value),
        headers: rowsToRecord(headers.value),
        body: bodyType.value === 'none' ? undefined : body.value,
        bodyType: bodyType.value,
      };
      const result = await sendRequest(dto);
      response.value = result;
      unresolvedVars.value = result.unresolved ?? unresolvedVars.value;
    } catch (err: any) {
      error.value = err?.response?.data?.message ?? err?.message ?? '发送失败';
      response.value = null;
    } finally {
      sending.value = false;
    }
  }

  function clearResponse() {
    response.value = null;
    error.value = null;
  }

  return {
    method,
    url,
    urlTemplate,
    query,
    headers,
    bodyType,
    body,
    response,
    sending,
    error,
    unresolvedVars,
    interpolatedUrl,
    panelOpen,
    currentOperationId,
    loadFromOperation,
    send,
    clearResponse,
    recordToRows,
  };
});
