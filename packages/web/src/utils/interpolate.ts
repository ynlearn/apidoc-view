import type { MergedVariables } from '@openapi-view/shared';

const VAR_PATTERN = /\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}/g;
/** 与后端 interpolate.ts 一致：变量值里再引用变量最多展开 3 层 */
const MAX_ROUNDS = 3;

/**
 * 把字符串中的 {{var}} 替换为变量值。
 * 未命中的变量保留原样并收集到 unresolved —— 调用方必须处理，
 * 静默置空会让请求打到错误地址，比直接失败更难查。
 */
export function interpolate(
  input: string,
  variables: MergedVariables,
): { value: string; unresolved: string[] } {
  const unresolved = new Set<string>();
  let value = input ?? '';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let replaced = false;
    value = value.replace(VAR_PATTERN, (match, key: string) => {
      const actual = variables[key];
      if (actual === undefined) {
        unresolved.add(key);
        return match;
      }
      replaced = true;
      return String(actual);
    });
    if (!replaced) break;
  }

  return { value, unresolved: Array.from(unresolved) };
}
