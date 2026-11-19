import { Agent, buildConnector, request, type Dispatcher } from 'undici';
import type { BodyType, ProxyRequestDto, ProxyResponseDto } from '@openapi-view/shared';
import { config } from '../config.js';
import { AppError } from '../middleware/AppError.js';
import { assertSafeTarget, resolveLocation, SsrfError, type SafeTarget } from './ssrf.js';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

/** 连接层错误：目标 IP 未建立连接（可安全换下一个候选 IP 重试，不会重复提交） */
const RETRYABLE_CONN_CODES = new Set([
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EADDRNOTAVAIL',
  'EHOSTDOWN',
  'UND_ERR_CONNECT_TIMEOUT',
]);

function extractCodes(err: any): string[] {
  const codes: string[] = [];
  let cur = err;
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur.code === 'string') codes.push(cur.code);
    cur = cur.cause;
  }
  return codes;
}

function isRetryableConnectionError(err: any): boolean {
  return extractCodes(err).some((c) => RETRYABLE_CONN_CODES.has(c));
}

function cleanHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    if (value == null) continue;
    out[key] = String(value);
  }
  return out;
}

/** 创建一个把连接锁定到指定 IP 的 dispatcher（防 DNS rebinding / TOCTOU） */
function createPinnedDispatcher(pinnedIp: string, hostname: string): Agent {
  const baseConnect = buildConnector({});
  const connect: (opts: any, cb: any) => void = (opts, cb) => {
    // SNI/证书校验仍使用原 hostname，仅 TCP 目标替换为已校验 IP
    return baseConnect(
      { ...opts, hostname: pinnedIp, servername: opts.servername ?? hostname },
      cb,
    );
  };
  return new Agent({
    connect,
    connectTimeout: config.connectTimeoutMs,
    headersTimeout: config.headersTimeoutMs,
    bodyTimeout: config.bodyTimeoutMs,
  });
}

function buildFetchOptions(
  dto: ProxyRequestDto,
  target: SafeTarget,
  pinnedIp: string,
): { headers: Record<string, string>; body?: string | FormData; dispatcher: Agent } {
  const headers = cleanHeaders(dto.headers);
  const bodyType: BodyType = dto.bodyType ?? 'none';
  let body: string | FormData | undefined;

  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(dto.method.toUpperCase()) && dto.body != null;
  if (hasBody) {
    if (bodyType === 'form-data') {
      const form = new FormData();
      try {
        const parsed = JSON.parse(dto.body!);
        for (const [k, v] of Object.entries(parsed)) {
          form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
        }
      } catch {
        form.append('data', dto.body!);
      }
      body = form;
      // 不手动设置 Content-Type，让 undici 生成 boundary
    } else {
      body = dto.body!;
      if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
        headers['content-type'] = bodyType === 'json' ? 'application/json' : 'text/plain';
      }
    }
  }

  // 保证 Host 为原始 hostname（而非锁定 IP）
  headers['host'] = target.url.host;

  return { headers, body, dispatcher: createPinnedDispatcher(pinnedIp, target.hostname) };
}

/** 流式读取响应体，超过上限立即中止 */
async function readBodyLimited(
  body: Dispatcher.ResponseData['body'],
  limit: number,
): Promise<{ text: string; size: number; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > limit) {
      truncated = true;
      body.destroy();
      break;
    }
    chunks.push(buf);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), size, truncated };
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

/** 单次尝试：锁定到一个候选 IP 发起请求（每次重建 body，避免 form-data 流被重复消费） */
async function attemptRequest(
  dto: ProxyRequestDto,
  target: SafeTarget,
  pinnedIp: string,
  timeoutMs: number,
): Promise<ProxyResponseDto> {
  const { headers, body, dispatcher } = buildFetchOptions(dto, target, pinnedIp);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await request(target.url, {
      method: dto.method as any,
      headers,
      body: body as any,
      dispatcher,
      signal: controller.signal,
      maxRedirections: 0, // 重定向手动处理，逐跳校验
    });

    // 消费响应体（重定向响应也要消费，释放连接）
    const { text, size, truncated } = await readBodyLimited(res.body, config.maxResponseBytes);

    const responseHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers)) {
      if (v === undefined) continue;
      responseHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
    }

    return {
      status: res.statusCode,
      statusText: '',
      headers: responseHeaders,
      body: truncated ? text + '\n…[响应体超过上限，已截断]' : text,
      durationMs: 0, // 由调用方按总耗时填充
      size,
      finalUrl: target.url.toString(),
      truncated,
    };
  } finally {
    clearTimeout(timer);
    dispatcher.close();
  }
}

/** 把底层异常映射为业务错误；localhost/IPv6 场景给出可操作提示 */
function mapProxyError(err: any, timeoutMs: number, hostname: string): AppError {
  if (err?.name === 'AbortError' || err?.code === 'UND_ERR_ABORTED' || extractCodes(err).includes('UND_ERR_CONNECT_TIMEOUT')) {
    return new AppError(408, 'REQUEST_TIMEOUT', `请求超时（${timeoutMs}ms）`);
  }
  if (err instanceof SsrfError || err instanceof AppError) return err;

  const raw = err?.message ?? String(err);
  const hint = hostname === 'localhost'
    ? '；提示：host 为 localhost 时请改用 127.0.0.1（避免 IPv6 ::1 与 IPv4 监听不一致）'
    : '';
  return new AppError(502, 'UPSTREAM_ERROR', `请求目标失败：${raw}${hint}`);
}

/**
 * 发起代理请求：SSRF 校验 → 逐个候选 IP 尝试 → 逐跳重定向校验 → 流式读取 → 统一响应。
 */
export async function proxyRequest(dto: ProxyRequestDto): Promise<ProxyResponseDto> {
  const started = performance.now();
  let currentUrl = dto.url;
  const maxRedirects = config.maxRedirects;
  const followRedirects = dto.followRedirects !== false;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // 每一跳都做完整 SSRF 校验
    const target: SafeTarget = await assertSafeTarget(currentUrl);

    // 追加 query
    if (dto.query && Object.keys(dto.query).length) {
      for (const [k, v] of Object.entries(dto.query)) {
        if (v !== undefined) target.url.searchParams.set(k, String(v));
      }
    }

    const timeoutMs = Math.min(Math.max(dto.timeoutMs ?? config.requestTimeoutMs, 1000), config.maxTimeoutMs);
    const candidates = target.candidateIps?.length ? target.candidateIps : [target.pinnedIp];
    let result: ProxyResponseDto | undefined;
    let lastError: any;

    for (let i = 0; i < candidates.length; i++) {
      try {
        result = await attemptRequest(dto, target, candidates[i], timeoutMs);
        break;
      } catch (err: any) {
        lastError = err;
        const canRetry = isRetryableConnectionError(err) && i < candidates.length - 1;
        if (canRetry) continue; // 目标 IP 未建立连接，安全换下一个候选 IP
        throw mapProxyError(err, timeoutMs, target.hostname);
      }
    }

    if (!result) throw mapProxyError(lastError, timeoutMs, target.hostname);

    // 重定向：逐跳重新校验
    if (isRedirect(result.status) && followRedirects && hop < maxRedirects) {
      const location = result.headers['location'];
      if (location) {
        currentUrl = resolveLocation(target.url, location);
        continue;
      }
    }

    result.durationMs = Math.round((performance.now() - started) * 100) / 100;
    return result;
  }

  throw new AppError(400, 'TOO_MANY_REDIRECTS', `重定向次数超过 ${maxRedirects} 次`);
}
