const VAR_PATTERN = /\{\{\s*([A-Za-z0-9_.\-]+)\s*\}\}/g;
const MAX_ROUNDS = 3;
/**
 * 把字符串中的 {{var}} 替换为变量值。
 * 未命中的变量保留原样并收集到 unresolved，避免静默置空。
 */
export function interpolate(input, variables) {
    const unresolved = new Set();
    let value = input ?? '';
    for (let round = 0; round < MAX_ROUNDS; round++) {
        let replaced = false;
        value = value.replace(VAR_PATTERN, (match, key) => {
            const actual = variables[key];
            if (actual === undefined) {
                unresolved.add(key);
                return match;
            }
            replaced = true;
            return String(actual);
        });
        if (!replaced)
            break;
    }
    return { value, unresolved: Array.from(unresolved) };
}
/** 对一条请求的所有部分插值（URL/query/header/body） */
export function interpolateRequest(dto, variables) {
    const unresolved = new Set();
    const apply = (value) => {
        if (value === undefined)
            return undefined;
        const r = interpolate(value, variables);
        r.unresolved.forEach((u) => unresolved.add(u));
        return r.value;
    };
    const result = { ...dto };
    result.url = apply(dto.url);
    if (dto.urlTemplate !== undefined)
        result.urlTemplate = apply(dto.urlTemplate);
    if (dto.body !== undefined)
        result.body = apply(dto.body);
    if (dto.query && typeof dto.query === 'object') {
        result.query = Object.fromEntries(Object.entries(dto.query).map(([k, v]) => [k, apply(v)]));
    }
    if (dto.headers && typeof dto.headers === 'object') {
        result.headers = Object.fromEntries(Object.entries(dto.headers).map(([k, v]) => [k, apply(v)]));
    }
    return { dto: result, unresolved: Array.from(unresolved) };
}
//# sourceMappingURL=interpolate.js.map