import dns from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { config } from '../config.js';
import { AppError } from '../middleware/AppError.js';

export class SsrfError extends AppError {
  constructor(reason: string) {
    super(400, 'SSRF_BLOCKED', `目标地址不被允许：${reason}`);
    this.name = 'SsrfError';
  }
}

export interface SafeTarget {
  url: URL;
  hostname: string;
  /** 已通过安全校验、可锁定连接的首选 IP（兼容旧调用方） */
  pinnedIp: string;
  /** 全部已校验的候选 IP，按优先级排序（IPv4 优先），供连接失败时回退 */
  candidateIps: string[];
  isAllowlistedInternal: boolean;
}

const METADATA_HOSTS = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
]);

function matchHostPattern(host: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    if (p.startsWith('*.')) return host.endsWith(p.slice(1)) && host !== p.slice(2);
    return host === p;
  });
}

/** 判断某个 host 是否在「内网例外白名单」中（精确匹配） */
function isInternalAllowlisted(hostname: string): boolean {
  return config.ssrfInternalAllowlist.includes(hostname);
}

/** 校验 IP 是否属于被禁止的网段 */
function isForbiddenIp(ip: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return true; // 无法解析视作不安全
  }

  // IPv4 映射的 IPv6（::ffff:x.x.x.x）转成 IPv4 判断
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }

  const range = addr.range();
  if (
    [
      'private',
      'loopback',
      'linkLocal',
      'uniqueLocal',
      'multicast',
      'reserved',
      'unspecified',
      'carrierGradeNat',
      'broadcast',
    ].includes(range)
  ) {
    return true;
  }
  // 额外兜底：169.254/16（link-local 已覆盖）、100.64/10（CGNAT）
  if (addr.kind() === 'ipv4') {
    const octets = (addr as ipaddr.IPv4).octets;
    if (octets[0] === 169 && octets[1] === 254) return true;
    if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;
  }
  return false;
}

/** 主机名的字符串层黑名单 */
function assertHostnameAllowed(hostname: string, allowlisted: boolean): void {
  if (!allowlisted) {
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new SsrfError('禁止访问 localhost');
    }
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      throw new SsrfError('禁止访问本地/内网域名');
    }
  }
  // 元数据地址：即使在内网白名单中也禁止（除非显式列入，极特殊）
  if (METADATA_HOSTS.has(hostname)) {
    throw new SsrfError('禁止访问云元数据服务');
  }
  if (config.allowedHosts.length && !matchHostPattern(hostname, config.allowedHosts)) {
    throw new SsrfError('目标 host 不在 ALLOWED_HOSTS 白名单中');
  }
}

/**
 * 对目标 URL 做完整 SSRF 校验。
 * 校验通过后返回可锁定连接的 IP，供 proxyService 使用以避免 DNS rebinding。
 */
export async function assertSafeTarget(rawUrl: string): Promise<SafeTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError('URL 格式无效');
  }

  // 1. 协议白名单
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError(`禁止的协议：${url.protocol}`);
  }

  // 2. 格式：禁止内嵌凭据
  if (url.username || url.password) {
    throw new SsrfError('URL 不允许包含用户名/密码');
  }

  // 端口黑名单
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (config.blockedPorts.includes(port)) {
    throw new SsrfError(`禁止访问端口 ${port}`);
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // 去 IPv6 方括号
  const allowlisted = isInternalAllowlisted(hostname);

  // 3. 主机名黑名单
  assertHostnameAllowed(hostname, allowlisted);

  // 4. DNS 解析后校验
  let addresses: LookupAddress[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfError('目标 host 无法解析');
  }
  if (!addresses.length) {
    throw new SsrfError('目标 host 无解析记录');
  }

  const unsafe = addresses.filter((a) => isForbiddenIp(a.address));
  if (unsafe.length) {
    // 内网例外白名单：允许其内网 IP
    if (!allowlisted) {
      throw new SsrfError(`目标解析到被禁止的地址段（${unsafe[0].address}）`);
    }
  }

  // 选一个 IP 锁定；优先选「允许列表判定下安全」的，白名单场景取全部通过校验的地址
  const safeAddresses = unsafe.length === 0 ? addresses : addresses.filter((a) => !isForbiddenIp(a.address));
  const candidates = safeAddresses.length ? safeAddresses : addresses;
  if (!candidates.length) {
    throw new SsrfError('无法确定目标 IP');
  }

  // IPv4 优先排序：避免 dns.lookup 返回 ::1 在前时，锁定到仅 IPv6 地址而目标服务只监听 IPv4
  // （典型场景：host 填 localhost，服务监听 0.0.0.0，锁定 ::1 会 ECONNREFUSED）
  const sorted = [...candidates].sort((a, b) => {
    const av = ipaddr.parse(a.address).kind() === 'ipv4' ? 0 : 1;
    const bv = ipaddr.parse(b.address).kind() === 'ipv4' ? 0 : 1;
    return av - bv;
  });

  return {
    url,
    hostname,
    pinnedIp: sorted[0].address,
    candidateIps: sorted.map((a) => a.address),
    isAllowlistedInternal: allowlisted,
  };
}

/** 供重定向使用：把相对 Location 解析为绝对 URL */
export function resolveLocation(base: URL, location: string): string {
  return new URL(location, base).toString();
}
