import SwaggerParser from '@apidevtools/swagger-parser';
import YAML from 'yaml';
import type {
  MediaTypeView,
  NormalizedDocument,
  OperationView,
  ParameterView,
  ResponseView,
  SchemaView,
} from '@bluebull/shared';
import { AppError } from '../middleware/AppError.js';

type AnyObj = Record<string, any>;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
const MAX_SCHEMA_DEPTH = 12;

/** 解析原始 JSON/YAML 文本为 OpenAPI 对象（不解析 $ref） */
export async function parseDocument(content: string, format: 'json' | 'yaml'): Promise<AnyObj> {
  let doc: unknown;
  try {
    if (format === 'yaml') {
      // maxAliasCount 缓解 YAML 别名炸弹
      doc = YAML.parse(content, { maxAliasCount: 100 });
    } else {
      doc = JSON.parse(content);
    }
  } catch (err) {
    throw new AppError(400, 'PARSE_ERROR', `文档解析失败：${(err as Error).message}`);
  }

  if (!doc || typeof doc !== 'object') {
    throw new AppError(400, 'PARSE_ERROR', '文档内容不是有效的对象');
  }
  const obj = doc as AnyObj;
  if (typeof obj.openapi !== 'string' || !obj.openapi.startsWith('3.0.')) {
    throw new AppError(
      400,
      'UNSUPPORTED_VERSION',
      `仅支持 OpenAPI 3.0.x，当前文档声明为：${obj.openapi ?? '未声明'}`,
    );
  }
  return obj;
}

/**
 * 把原始文档 bundle 成结构完整、可被遍历的对象。
 * bundle 会内联外部 $ref 但保留内部 $ref（表现为 $ref 字段），便于我们做循环保护。
 */
export async function bundleDocument(doc: AnyObj): Promise<AnyObj> {
  try {
    const cloned = structuredClone(doc);
    const bundled = await SwaggerParser.bundle(cloned as any);
    return bundled as AnyObj;
  } catch (err) {
    throw new AppError(400, 'BUNDLE_ERROR', `文档引用解析失败：${(err as Error).message}`);
  }
}

/** 归一化：把 bundle 后的文档转成前端展示模型 */
export function normalizeDocument(doc: AnyObj): NormalizedDocument {
  const info = (doc.info ?? {}) as AnyObj;
  const servers: Array<{ url: string; description?: string }> = Array.isArray(doc.servers)
    ? doc.servers
        .filter((s: AnyObj) => s && typeof s.url === 'string')
        .map((s: AnyObj) => ({ url: s.url, description: s.description }))
    : [];

  const groupMap = new Map<string, OperationView[]>();
  const paths = (doc.paths ?? {}) as AnyObj;

  for (const [pathKey, pathItemRaw] of Object.entries(paths)) {
    const pathItem = pathItemRaw as AnyObj;
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const method of HTTP_METHODS) {
      const opRaw = pathItem[method];
      if (!opRaw || typeof opRaw !== 'object') continue;
      const op = opRaw as AnyObj;

      const parameters: ParameterView[] = [];
      // path 级参数先入，operation 级同名覆盖
      const mergeParams = (list: unknown) => {
        if (!Array.isArray(list)) return;
        for (const pRaw of list) {
          const p = pRaw as AnyObj;
          if (!p || typeof p.name !== 'string') continue;
          const idx = parameters.findIndex(
            (existing) => existing.name === p.name && existing.in === p.in,
          );
          const view = toParameter(p, doc);
          if (idx >= 0) parameters[idx] = view;
          else parameters.push(view);
        }
      };
      mergeParams(pathItem.parameters);
      mergeParams(op.parameters);

      const requestBody = op.requestBody ? toRequestBody(op.requestBody as AnyObj, doc) : undefined;
      const responses: ResponseView[] = [];
      for (const [status, respRaw] of Object.entries((op.responses ?? {}) as AnyObj)) {
        responses.push(toResponse(status, respRaw as AnyObj, doc));
      }

      const tags = Array.isArray(op.tags) && op.tags.length ? (op.tags as string[]) : ['默认分组'];
      const groupName = tags[0] || '默认分组';

      const operation: OperationView = {
        id: `${method.toUpperCase()}:${pathKey}`,
        method: method.toUpperCase(),
        path: pathKey,
        summary: op.summary,
        description: op.description,
        tags,
        operationId: op.operationId,
        deprecated: Boolean(op.deprecated),
        parameters,
        requestBody,
        responses,
        security: Array.isArray(op.security) ? op.security : undefined,
      };

      if (!groupMap.has(groupName)) groupMap.set(groupName, []);
      groupMap.get(groupName)!.push(operation);
    }
  }

  const groups = Array.from(groupMap.entries()).map(([name, operations]) => ({ name, operations }));
  const operationCount = groups.reduce((sum, g) => sum + g.operations.length, 0);

  return {
    title: info.title ?? '未命名文档',
    version: info.version,
    description: info.description,
    servers,
    groups,
    operationCount,
  };
}

/** 一站式：解析 + bundle + 归一化 */
export async function parseAndNormalize(
  content: string,
  format: 'json' | 'yaml',
): Promise<NormalizedDocument> {
  const doc = await parseDocument(content, format);
  const bundled = await bundleDocument(doc);
  return normalizeDocument(bundled);
}

// ---------- 转换辅助 ----------

/** 解析 $ref 指向的节点（bundle 后为内部引用 #/...）
 *  注意：Swagger 生成的 $ref 会对 schema 名中的非 ASCII 字符做百分号编码
 *  （如 Result%C2%AB... → Result«...），必须先解码再查找。
 */
function resolveRef(ref: string, root: AnyObj): AnyObj | undefined {
  if (!ref.startsWith('#/')) return undefined;
  const parts = ref
    .slice(2)
    .split('/')
    .map((s) => {
      let token = s;
      try { token = decodeURIComponent(s); } catch { /* 保留原值 */ }
      return token.replace(/~1/g, '/').replace(/~0/g, '~');
    });
  let cur: any = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur && typeof cur === 'object' ? (cur as AnyObj) : undefined;
}

function toParameter(p: AnyObj, root: AnyObj): ParameterView {
  const schemaRaw = p.schema as AnyObj | undefined;
  return {
    name: p.name,
    in: p.in,
    required: Boolean(p.required),
    description: p.description,
    schema: schemaRaw ? toSchema(schemaRaw, root) : undefined,
    example: p.example ?? schemaRaw?.example,
    deprecated: Boolean(p.deprecated),
  };
}

function toRequestBody(rb: AnyObj, root: AnyObj) {
  const content = (rb.content ?? {}) as AnyObj;
  return {
    required: Boolean(rb.required),
    description: rb.description,
    contentTypes: Object.entries(content).map(([contentType, mediaRaw]) =>
      toMediaType(contentType, mediaRaw as AnyObj, root),
    ),
  };
}

function toResponse(status: string, respRaw: AnyObj, root: AnyObj): ResponseView {
  const content = (respRaw?.content ?? {}) as AnyObj;
  return {
    status,
    description: respRaw?.description,
    contentTypes: Object.entries(content).map(([contentType, mediaRaw]) =>
      toMediaType(contentType, mediaRaw as AnyObj, root),
    ),
  };
}

function toMediaType(contentType: string, media: AnyObj, root: AnyObj): MediaTypeView {
  return {
    contentType,
    schema: media?.schema ? toSchema(media.schema as AnyObj, root) : undefined,
    example: media?.example,
    examples: media?.examples as MediaTypeView['examples'],
  };
}

/** Schema 转换，带循环引用与深度保护 */
function toSchema(schemaInput: AnyObj, root: AnyObj, visited = new WeakSet<object>(), depth = 0): SchemaView {
  let schema = schemaInput;
  // 跟随 $ref
  if (typeof schema.$ref === 'string') {
    if (visited.has(schema)) return { circular: true, type: 'object', description: '循环引用' };
    visited.add(schema);
    const target = resolveRef(schema.$ref, root);
    if (!target) return { type: 'object', description: `未解析引用：${schema.$ref}` };
    // 合并上层 description/example 等覆盖信息
    schema = { ...target, ...(schema.description ? { description: schema.description } : {}) };
  }

  if (depth >= MAX_SCHEMA_DEPTH) {
    return { type: schema.type, description: '层级过深，已截断', circular: true };
  }

  const result: SchemaView = {
    type: schema.type,
    format: schema.format,
    description: schema.description,
    enum: Array.isArray(schema.enum) ? schema.enum : undefined,
    default: schema.default,
    example: schema.example,
    required: Array.isArray(schema.required) ? schema.required : undefined,
    nullable: Boolean(schema.nullable),
    minimum: schema.minimum,
    maximum: schema.maximum,
    minLength: schema.minLength,
    maxLength: schema.maxLength,
    pattern: schema.pattern,
  };

  if (schema.items && typeof schema.items === 'object') {
    result.items = toSchema(schema.items as AnyObj, root, new WeakSet<object>(), depth + 1);
  }
  if (schema.properties && typeof schema.properties === 'object') {
    const props: Record<string, SchemaView> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      props[key] = toSchema(value as AnyObj, root, new WeakSet<object>(), depth + 1);
    }
    result.properties = props;
  }
  for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
    const arr = schema[key];
    if (Array.isArray(arr)) {
      result[key] = arr.map((s) => toSchema(s as AnyObj, root, new WeakSet<object>(), depth + 1));
    }
  }
  return result;
}

/** 按 schema 生成示例值（供一键带入调试） */
export function generateExample(schema: SchemaView | undefined): unknown {
  if (!schema) return '';
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];

  const combine = (parts: SchemaView[]): unknown => {
    const obj: Record<string, unknown> = {};
    for (const p of parts) {
      if (p.properties) {
        for (const [k, v] of Object.entries(p.properties)) obj[k] = generateExample(v);
      }
    }
    return obj;
  };
  if (schema.allOf?.length) return combine(schema.allOf);
  if (schema.oneOf?.length) return generateExample(schema.oneOf[0]);
  if (schema.anyOf?.length) return generateExample(schema.anyOf[0]);

  switch (schema.type) {
    case 'object':
      if (!schema.properties) return {};
      return Object.fromEntries(
        Object.entries(schema.properties).map(([k, v]) => [k, generateExample(v)]),
      );
    case 'array':
      return [schema.items ? generateExample(schema.items) : ''];
    case 'integer':
    case 'number':
      return schema.minimum ?? 0;
    case 'boolean':
      return false;
    case 'string':
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'date') return new Date().toISOString().slice(0, 10);
      return '';
    default:
      return '';
  }
}
