import type { MergedVariables } from '@openapi-view/shared';

const VAR_PATTERN = /\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}/g;

/** 前端预览用插值（不修改原始值） */
export function interpolate(input: string, variables: MergedVariables): { value: string; unresolved: string[] } {
  const unresolved = new Set<string>();
  const value = (input ?? '').replace(VAR_PATTERN, (match, key: string) => {
    if (variables[key] === undefined) {
      unresolved.add(key);
      return match;
    }
    return String(variables[key]);
  });
  return { value, unresolved: Array.from(unresolved) };
}
