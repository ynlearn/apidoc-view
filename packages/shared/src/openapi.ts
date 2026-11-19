// 归一化后的 OpenAPI 展示模型（前后端共享）

export interface ServerView {
  url: string;
  description?: string;
}

export interface SchemaView {
  type?: string;
  format?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  example?: unknown;
  required?: string[];
  items?: SchemaView;
  properties?: Record<string, SchemaView>;
  allOf?: SchemaView[];
  oneOf?: SchemaView[];
  anyOf?: SchemaView[];
  /** 命中循环引用时的占位标记 */
  circular?: boolean;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface MediaTypeView {
  contentType: string;
  schema?: SchemaView;
  example?: unknown;
  examples?: Record<string, { value?: unknown; summary?: string }>;
}

export interface ParameterView {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: SchemaView;
  example?: unknown;
  deprecated?: boolean;
}

export interface RequestBodyView {
  required?: boolean;
  description?: string;
  contentTypes: MediaTypeView[];
}

export interface ResponseView {
  status: string;
  description?: string;
  contentTypes: MediaTypeView[];
}

export interface OperationView {
  /** 稳定唯一 id，格式 method:path */
  id: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  deprecated?: boolean;
  parameters: ParameterView[];
  requestBody?: RequestBodyView;
  responses: ResponseView[];
  security?: Record<string, string[]>[];
}

export interface OperationGroupView {
  name: string;
  operations: OperationView[];
}

export interface NormalizedDocument {
  title: string;
  version?: string;
  description?: string;
  servers: ServerView[];
  groups: OperationGroupView[];
  /** 接口总数 */
  operationCount: number;
}
