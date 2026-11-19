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
  const interpolatedUrl = computed(
    () => interpolate(url.value, envStore.mergedVariables).value,
  );

  /** URL 里尚未定义的变量，用于输入时即时提示 */
  const urlUnresolved = computed(
    () => interpolate(url.value, envStore.mergedVariables).unresolved,
  );

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
      const variables = envStore.mergedVariables;
      const unresolved = new Set<string>();
      // 插值必须发生在发送前：此前只在界面做了预览，实际发出的是带 {{}} 的原始模板，
      // 表现为「URL 格式无效」或请求头里收到字面量 {{apikey}}
      const apply = (input: string | undefined): string | undefined => {
        if (input === undefined) return undefined;
        const result = interpolate(input, variables);
        result.unresolved.forEach((name) => unresolved.add(name));
        return result.value;
      };
      const applyRecord = (record: Record<string, string>): Record<string, string> =>
        Object.fromEntries(Object.entries(record).map(([k, v]) => [k, apply(v) ?? '']));

      const dto = {
        method: method.value,
        url: apply(url.value) ?? '',
        // 模板保持原样写入历史，才能看出这条请求原本引用的是哪个模板
        urlTemplate: urlTemplate.value,
        query: applyRecord(rowsToRecord(query.value)),
        headers: applyRecord(rowsToRecord(headers.value)),
        body: bodyType.value === 'none' ? undefined : apply(body.value),
        bodyType: bodyType.value,
      };

      unresolvedVars.value = Array.from(unresolved);
      // 未定义变量不发送：发出去只会得到一个莫名其妙的结果，不如就地报清楚
      if (unresolved.size > 0) {
        response.value = null;
        error.value = `变量未定义：${[...unresolved].join('、')}。请到管理后台「环境变量」或「全局变量」中补上。`;
        return;
      }

      const result = await sendRequest(dto);
      response.value = result;
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
    urlUnresolved,
    panelOpen,
    currentOperationId,
    loadFromOperation,
    send,
    clearResponse,
    recordToRows,
  };
});
