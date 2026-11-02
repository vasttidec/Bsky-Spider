import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AppSettings,
  LanguageSetting,
  ThemeName,
} from '../shared/types';
import {
  DATA_DIR,
  DEFAULT_SETTINGS,
  MAX_POSTS_LIMIT,
  SETTINGS_FILE,
} from './config';

let current: AppSettings = { ...DEFAULT_SETTINGS };
let initialized = false;
const writeQueues = new Map<string, Promise<void>>();

export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJsonFile<T>(
  filePath: string,
  fallback: T,
): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.warn(`[storage] 无法读取 ${filePath}，使用默认值。`);
    }
    return fallback;
  }
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
): Promise<void> {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
      await fs.rm(filePath, { force: true });
      await fs.rename(temporary, filePath);
    });
  writeQueues.set(filePath, next);
  try {
    await next;
  } finally {
    if (writeQueues.get(filePath) === next) writeQueues.delete(filePath);
  }
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeTheme(value: unknown): ThemeName {
  return value === 'default' ||
    value === 'dark' ||
    value === 'cyberpunk' ||
    value === 'system'
    ? value
    : 'system';
}

function normalizeLanguage(value: unknown): LanguageSetting {
  return value === 'zh-CN' ||
    value === 'zh-TW' ||
    value === 'en' ||
    value === 'ru'
    ? value
    : 'system';
}

function normalizeProxyUrl(value: string): string {
  let trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    if (!url.hostname) return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function normalizeSettings(raw: Partial<AppSettings>): AppSettings {
  const saveDir = asString(raw.saveDir, DEFAULT_SETTINGS.saveDir).trim();
  return {
    theme: normalizeTheme(raw.theme),
    language: normalizeLanguage(raw.language),
    saveDir: saveDir
      ? path.resolve(saveDir)
      : DEFAULT_SETTINGS.saveDir,
    folderTemplate: asString(
      raw.folderTemplate,
      DEFAULT_SETTINGS.folderTemplate,
    ).slice(0, 240),
    fileNameTemplate: asString(
      raw.fileNameTemplate,
      DEFAULT_SETTINGS.fileNameTemplate,
    ).slice(0, 240),
    skipExisting: asBoolean(
      raw.skipExisting,
      DEFAULT_SETTINGS.skipExisting,
    ),
    concurrency: clamp(
      asNumber(raw.concurrency, DEFAULT_SETTINGS.concurrency),
      1,
      6,
    ),
    proxyEnabled: asBoolean(
      raw.proxyEnabled,
      DEFAULT_SETTINGS.proxyEnabled,
    ),
    proxyChoiceMade: asBoolean(
      raw.proxyChoiceMade,
      DEFAULT_SETTINGS.proxyChoiceMade,
    ),
    proxyUseSystem: asBoolean(
      raw.proxyUseSystem,
      DEFAULT_SETTINGS.proxyUseSystem,
    ),
    proxyUrl: normalizeProxyUrl(
      asString(raw.proxyUrl, DEFAULT_SETTINGS.proxyUrl),
    ),
    requestTimeout: clamp(
      asNumber(raw.requestTimeout, DEFAULT_SETTINGS.requestTimeout),
      10,
      120,
    ),
    desktopNotifications: asBoolean(
      raw.desktopNotifications,
      DEFAULT_SETTINGS.desktopNotifications,
    ),
  };
}

export async function initSettings(options: {
  systemProxyDetected?: boolean;
} = {}): Promise<AppSettings> {
  if (initialized) return current;
  await ensureDataDir();
  const raw = await readJsonFile<Partial<AppSettings>>(SETTINGS_FILE, {});
  current = normalizeSettings({ ...DEFAULT_SETTINGS, ...raw });
  if (
    !raw.proxyChoiceMade &&
    typeof options.systemProxyDetected === 'boolean' &&
    current.proxyUseSystem
  ) {
    current.proxyEnabled = options.systemProxyDetected;
  }
  initialized = true;
  await writeJsonFile(SETTINGS_FILE, current);
  return current;
}

export function getSettings(): AppSettings {
  return current;
}

export function getMaxPosts(value: unknown, fallback = 300): number {
  const requested = asNumber(value, fallback);
  if (requested === 0) return 0;
  return clamp(requested, 1, MAX_POSTS_LIMIT);
}

export function getMediaTypes(value: unknown): Array<'image' | 'video'> {
  if (!Array.isArray(value)) return ['image', 'video'];
  const types = value.filter(
    (item): item is 'image' | 'video' => item === 'image' || item === 'video',
  );
  return types.length > 0 ? Array.from(new Set(types)) : ['image', 'video'];
}

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const proxyChanged =
    (typeof patch.proxyEnabled === 'boolean' &&
      patch.proxyEnabled !== current.proxyEnabled) ||
    (typeof patch.proxyUseSystem === 'boolean' &&
      patch.proxyUseSystem !== current.proxyUseSystem) ||
    (typeof patch.proxyUrl === 'string' &&
      patch.proxyUrl !== current.proxyUrl);
  const merged = normalizeSettings({
    ...current,
    ...patch,
    ...(proxyChanged ? { proxyChoiceMade: true } : {}),
  });
  await fs.mkdir(merged.saveDir, { recursive: true }).catch((error) => {
    throw new Error(
      `无法创建保存目录：${(error as Error).message || '未知错误'}`,
    );
  });
  current = merged;
  await writeJsonFile(SETTINGS_FILE, current);
  return current;
}

/** Restores every setting to its documented default value. */
export async function resetSettings(): Promise<AppSettings> {
  current = normalizeSettings({ ...DEFAULT_SETTINGS });
  await fs.mkdir(current.saveDir, { recursive: true }).catch((error) => {
    throw new Error(
      `无法创建保存目录：${(error as Error).message || '未知错误'}`,
    );
  });
  await writeJsonFile(SETTINGS_FILE, current);
  return current;
}
