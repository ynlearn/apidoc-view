export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GlobalVariable {
  key: string;
  value: string;
  description?: string;
  updatedAt: number;
}

/** 合并后的变量（全局 + 激活环境，环境优先） */
export type MergedVariables = Record<string, string>;
