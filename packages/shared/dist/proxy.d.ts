export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type BodyType = 'none' | 'json' | 'form-data' | 'raw';
export interface ProxyRequestDto {
    method: HttpMethod;
    url: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: string;
    bodyType?: BodyType;
    timeoutMs?: number;
    followRedirects?: boolean;
    /** 供历史记录使用：插值前的 URL 模板 */
    urlTemplate?: string;
}
export interface ProxyResponseDto {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    durationMs: number;
    size: number;
    finalUrl: string;
    /** 响应体是否被截断 */
    truncated?: boolean;
}
/** 代理返回的业务错误（用 data.error 承载，HTTP 状态码表达类别） */
export interface ProxyErrorDto {
    code: string;
    message: string;
    error: string;
    status?: number;
    durationMs?: number;
}
//# sourceMappingURL=proxy.d.ts.map