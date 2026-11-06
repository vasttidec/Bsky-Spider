import os from 'node:os';
import path from 'node:path';
import type { AppSettings } from '../shared/types';
import { DEFAULT_FILE_TEMPLATE, DEFAULT_FOLDER_TEMPLATE } from '../shared/templates';

export const APP_NAME = 'Bsky-Spider';
export const APP_VERSION = '1.2.5';
export const GITHUB_REPO = 'vasttidec/Bsky-Spider';
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;
export const APPVIEW_URL = (
  process.env.BSKY_SPIDER_APPVIEW || 'https://public.api.bsky.app'
).replace(/\/+$/, '');
export const DEFAULT_PDS = (
  process.env.BSKY_SPIDER_PDS || 'https://bsky.social'
).replace(/\/+$/, '');

export const API_PORT = Number(process.env.BSKY_SPIDER_PORT || 5179);
export const API_HOST = process.env.BSKY_SPIDER_HOST || '127.0.0.1';
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const DATA_DIR = process.env.BSKY_SPIDER_DATA_DIR
  ? path.resolve(process.env.BSKY_SPIDER_DATA_DIR)
  : path.resolve(process.cwd(), 'data');

/** `exe` when the desktop app keeps data next to the executable. */
export const DATA_DIR_SOURCE: 'exe' | 'user' | undefined =
  process.env.BSKY_SPIDER_DATA_DIR_SOURCE === 'exe'
    ? 'exe'
    : process.env.BSKY_SPIDER_DATA_DIR_SOURCE === 'user'
      ? 'user'
      : undefined;

export const WEB_DIR = process.env.BSKY_SPIDER_WEB_DIR
  ? path.resolve(process.env.BSKY_SPIDER_WEB_DIR)
  : path.resolve(process.cwd(), 'dist', 'web');

export const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

/**
 * The real Downloads folder. The desktop app passes the location reported by
 * Windows (it can be moved to another disk), and the fallback keeps the known
 * folder of the current user for browser/dev runs.
 */
export const DOWNLOADS_DIR = (() => {
  const fromEnv = (process.env.BSKY_SPIDER_DOWNLOADS_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  const profile = (process.env.USERPROFILE || '').trim();
  if (process.platform === 'win32' && profile) {
    return path.join(profile, 'Downloads');
  }
  return path.join(os.homedir(), 'Downloads');
})();
export const DEFAULT_SAVE_DIR = path.join(DOWNLOADS_DIR, 'Bsky-Spider');

/** Name of the in-process HLS → MP4 muxer (no external binary involved). */
export const VIDEO_ENGINE_NAME = '内置 MP4 合并引擎';
export const VIDEO_ENGINE_READY = true;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'system',
  saveDir: DEFAULT_SAVE_DIR,
  folderTemplate: DEFAULT_FOLDER_TEMPLATE,
  fileNameTemplate: DEFAULT_FILE_TEMPLATE,
  skipExisting: true,
  concurrency: 3,
  proxyEnabled: false,
  proxyChoiceMade: false,
  proxyUseSystem: true,
  proxyUrl: '',
  requestTimeout: 30,
  desktopNotifications: true,
  smoothMode: false,
};

export const MAX_POSTS_LIMIT = 1000;
export const MAX_TASKS_PER_BATCH = 500;
