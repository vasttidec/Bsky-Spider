import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSettings } from './storage';

const execFileAsync = promisify(execFile);

const REGISTRY_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';

export interface SystemProxyInfo {
  url: string | null;
  source: 'environment' | 'windows' | 'none';
  note?: string;
}

let cached: { value: SystemProxyInfo; at: number } | null = null;
const CACHE_MS = 5_000;

function normalizeProxyValue(value: string): string | null {
  let candidate = value.trim();
  if (!candidate) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
    candidate = `http://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function fromEnvironment(): string | null {
  const candidates = [
    process.env.HTTPS_PROXY,
    process.env.https_proxy,
    process.env.HTTP_PROXY,
    process.env.http_proxy,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const normalized = normalizeProxyValue(value);
    if (normalized) return normalized;
  }
  return null;
}

export function proxyFromServerValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.includes('=')) return normalizeProxyValue(trimmed);

  const entries = new Map<string, string>();
  for (const part of trimmed.split(';')) {
    const [scheme, ...rest] = part.split('=');
    const target = rest.join('=').trim();
    if (scheme && target) entries.set(scheme.trim().toLowerCase(), target);
  }
  for (const scheme of ['https', 'http']) {
    const target = entries.get(scheme);
    if (target) {
      const normalized = normalizeProxyValue(target);
      if (normalized) return normalized;
    }
  }
  return null;
}

function parseRegistryOutput(
  stdout: string,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^\s+(\S+)\s+REG_[A-Z_]+\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim();
  }
  return values;
}

async function detectWindowsProxy(): Promise<SystemProxyInfo> {
  if (process.platform !== 'win32') {
    return { url: null, source: 'none', note: '当前平台没有 Windows 系统代理设置' };
  }
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', REGISTRY_KEY], {
      windowsHide: true,
      timeout: 4_000,
      encoding: 'utf8',
    });
    const values = parseRegistryOutput(stdout);
    const enabled = /0x1$/i.test(values.ProxyEnable || '') || values.ProxyEnable === '1';
    const serverValue = values.ProxyServer || '';
    const autoConfig = values.AutoConfigURL || '';

    if (enabled && serverValue) {
      const proxy = proxyFromServerValue(serverValue);
      if (proxy) {
        return { url: proxy, source: 'windows' };
      }
      if (/socks\s*=/i.test(serverValue)) {
        return {
          url: null,
          source: 'none',
          note: '系统代理只配置了 SOCKS，Bsky-Spider 目前仅支持 HTTP/HTTPS 代理',
        };
      }
    }

    if (autoConfig) {
      return {
        url: null,
        source: 'none',
        note: '检测到 Windows PAC 自动配置脚本，但当前版本不支持 PAC，请改用手动代理地址',
      };
    }

    if (!enabled) {
      return {
        url: null,
        source: 'none',
        note: 'Windows 系统代理未启用',
      };
    }
    return {
      url: null,
      source: 'none',
      note: 'Windows 系统代理已启用，但未找到有效的 HTTP/HTTPS 代理地址',
    };
  } catch (error) {
    return {
      url: null,
      source: 'none',
      note: `无法读取 Windows 系统代理：${(error as Error).message}`,
    };
  }
}

/**
 * Detect the proxy used by Windows itself. Environment variables take
 * precedence, matching common CI/terminal setups; otherwise read the WinINET
 * settings that the Windows Settings app and system proxy tools write.
 */
export async function detectSystemProxy(
  force = false,
): Promise<SystemProxyInfo> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) {
    return cached.value;
  }
  const envProxy = fromEnvironment();
  let value: SystemProxyInfo;
  if (envProxy) {
    value = { url: envProxy, source: 'environment' };
  } else {
    value = await detectWindowsProxy();
  }
  cached = { value, at: Date.now() };
  return value;
}

export async function resolveProxyUrl(): Promise<string | undefined> {
  const settings = getSettings();
  if (!settings.proxyEnabled) return undefined;

  if (settings.proxyUseSystem) {
    const detected = await detectSystemProxy();
    if (!detected.url) {
      throw new Error(
        detected.note ||
          '未检测到可用的系统代理，请在设置中关闭“使用系统代理”并填写代理地址',
      );
    }
    return detected.url;
  }

  if (!settings.proxyUrl) {
    throw new Error('已启用代理，但未填写代理地址，请在设置中补充');
  }
  return settings.proxyUrl;
}
