import { Agent, Headers, ProxyAgent, fetch as undiciFetch } from 'undici';
import { resolveProxyUrl } from './proxy';
import { getSettings } from './storage';

type FetchInit = Parameters<typeof undiciFetch>[1];
type FetchResponse = Awaited<ReturnType<typeof undiciFetch>>;

/** Fallback when the settings cannot be read yet. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

let proxyAgent: ProxyAgent | undefined;
let proxyAgentUrl = '';
let directAgent: Agent | undefined;

/**
 * Keeps stalled connections from hanging a download forever. `bodyTimeout`
 * only fires when no data arrives, so long transfers are unaffected.
 */
const DISPATCHER_OPTIONS = {
  connectTimeout: 20_000,
  headersTimeout: 45_000,
  bodyTimeout: 90_000,
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    status = 500,
    code = 'unknown_error',
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function assertHttpUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ApiError('媒体地址无效', 400, 'invalid_url');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ApiError('媒体地址协议无效', 400, 'invalid_url');
  }
  return parsed.toString();
}

async function getDispatcher(): Promise<ProxyAgent | Agent | undefined> {
  let proxyUrl: string | undefined;
  try {
    proxyUrl = await resolveProxyUrl();
  } catch (error) {
    throw new ApiError(
      (error as Error).message || '系统代理不可用',
      502,
      'proxy_unavailable',
    );
  }

  if (!proxyUrl) {
    if (proxyAgent) {
      proxyAgent.close().catch(() => undefined);
      proxyAgent = undefined;
      proxyAgentUrl = '';
    }
    directAgent ??= new Agent(DISPATCHER_OPTIONS);
    return directAgent;
  }
  if (proxyAgent && proxyAgentUrl === proxyUrl) {
    return proxyAgent;
  }
  proxyAgent?.close().catch(() => undefined);
  try {
    proxyAgent = new ProxyAgent({ uri: proxyUrl, ...DISPATCHER_OPTIONS });
  } catch (error) {
    throw new ApiError(
      `代理地址无效：${(error as Error).message}`,
      400,
      'invalid_proxy',
    );
  }
  proxyAgentUrl = proxyUrl;
  return proxyAgent;
}

/**
 * Resolves the effective timeout: an explicit value wins (`0` disables the
 * timeout for long media streams), otherwise the value from Settings is used.
 */
function resolveRequestTimeout(timeoutMs?: number): number {
  if (typeof timeoutMs === 'number') return timeoutMs;
  try {
    const seconds = getSettings().requestTimeout;
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.round(seconds * 1000);
    }
  } catch {
    // Settings may not be initialised yet (very early boot).
  }
  return DEFAULT_REQUEST_TIMEOUT_MS;
}

/**
 * Fetch with the user's proxy settings and request timeout. Passing `0` as
 * `timeoutMs` disables the timeout (used for long media streams).
 */
export async function httpFetch(
  url: string,
  init: FetchInit = {},
  timeoutMs?: number,
): Promise<FetchResponse> {
  const dispatcher = await getDispatcher();
  const headers = new Headers(init.headers);
  if (!headers.has('user-agent')) {
    headers.set('user-agent', 'Bsky-Spider/1.0 (+local media downloader)');
  }
  const timeout = resolveRequestTimeout(timeoutMs);
  const signals = [
    init?.signal ?? undefined,
    timeout > 0 ? AbortSignal.timeout(timeout) : undefined,
  ].filter((value): value is AbortSignal => Boolean(value));
  const signal =
    signals.length === 0
      ? undefined
      : signals.length === 1
        ? signals[0]
        : AbortSignal.any(signals);

  try {
    return await undiciFetch(url, {
      ...init,
      ...(dispatcher ? { dispatcher } : {}),
      headers,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if ((error as Error)?.name === 'TimeoutError') {
      throw new ApiError('请求超时，请检查网络或代理设置', 504, 'timeout');
    }
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(
      `网络请求失败：${(error as Error)?.message || '未知错误'}`,
      502,
      'network_error',
    );
  }
}

export async function fetchJson<T>(
  url: string,
  init: FetchInit = {},
  timeoutMs?: number,
): Promise<T> {
  const response = await httpFetch(url, init, timeoutMs);
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const body = (data ?? {}) as {
      error?: string;
      message?: string;
    };
    throw new ApiError(
      body.message || body.error || `请求失败（HTTP ${response.status}）`,
      response.status,
      body.error || 'http_error',
      data,
    );
  }

  if (data === null) {
    throw new ApiError('服务器返回了无法解析的数据', 502, 'invalid_response');
  }
  return data as T;
}

export function isAbortError(error: unknown): boolean {
  return (
    (error as Error)?.name === 'AbortError' ||
    (error as Error)?.name === 'TimeoutError'
  );
}
