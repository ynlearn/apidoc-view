import type { SchemaView } from '@openapi-view/shared';

/** 前端示例生成（与后端 openapiService.generateExample 保持一致） */
export function generateExample(schema: SchemaView | undefined): unknown {
  if (!schema) return '';
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];

  if (schema.allOf?.length || schema.oneOf?.length || schema.anyOf?.length) {
    const parts = schema.allOf ?? schema.oneOf ?? schema.anyOf ?? [];
    if (schema.allOf?.length) {
      const obj: Record<string, unknown> = {};
      for (const p of parts) {
        if (p.properties) {
          for (const [k, v] of Object.entries(p.properties)) obj[k] = generateExample(v);
        }
      }
      return obj;
    }
    return generateExample(parts[0]);
  }

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
