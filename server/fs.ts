import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { DirectoryEntry, DirectoryListing, SystemInfo } from '../shared/types';
import { ApiError } from './http';
import { detectSystemProxy } from './proxy';
import {
  APP_VERSION,
  APPVIEW_URL,
  DATA_DIR,
  DATA_DIR_SOURCE,
  DEFAULT_SAVE_DIR,
  DOWNLOADS_DIR,
  VIDEO_ENGINE_NAME,
  VIDEO_ENGINE_READY,
} from './config';
import os from 'node:os';

async function listWindowsDrives(): Promise<DirectoryEntry[]> {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const results = await Promise.all(
    letters.map(async (letter) => {
      const drive = `${letter}:\\`;
      try {
        await fs.access(drive);
        return { name: `${letter}:`, path: drive };
      } catch {
        return null;
      }
    }),
  );
  return results.filter((item): item is DirectoryEntry => item !== null);
}

export async function listDirectories(
  inputPath: string,
): Promise<DirectoryListing> {
  if (inputPath.includes('\0')) {
    throw new ApiError('路径无效', 400, 'invalid_path');
  }
  let target = path.resolve(inputPath || os.homedir());
  try {
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) target = path.dirname(target);
  } catch {
    // If the configured save directory does not exist yet, open the nearest
    // existing parent instead of showing an empty picker.
    let parent = path.dirname(target);
    while (parent !== target) {
      try {
        const stat = await fs.stat(parent);
        if (stat.isDirectory()) {
          target = parent;
          break;
        }
      } catch {
        // Keep walking up.
      }
      target = parent;
      parent = path.dirname(parent);
    }
  }

  let entries;
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      throw new ApiError('没有读取该文件夹的权限', 403, 'access_denied');
    }
    if (code === 'ENOENT') {
      throw new ApiError('文件夹不存在', 404, 'folder_not_found');
    }
    throw new ApiError('无法读取文件夹', 500, 'folder_read_failed');
  }

  const directories: DirectoryEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    directories.push({
      name: entry.name,
      path: path.join(target, entry.name),
    });
    if (directories.length >= 2000) break;
  }
  directories.sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-CN', { numeric: true }),
  );

  const parentCandidate = path.dirname(target);
  const parent =
    parentCandidate === target ? null : parentCandidate;

  return {
    path: target,
    parent,
    directories,
    drives:
      process.platform === 'win32'
        ? await listWindowsDrives()
        : [{ name: '/', path: '/' }],
  };
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const proxy = await detectSystemProxy(true);
  return {
    version: APP_VERSION,
    platform: `${process.platform} ${process.arch}`,
    nodeVersion: process.version,
    homeDir: os.homedir(),
    downloadsDir: DOWNLOADS_DIR,
    dataDir: DATA_DIR,
    ...(DATA_DIR_SOURCE ? { dataDirSource: DATA_DIR_SOURCE } : {}),
    defaultSaveDir: DEFAULT_SAVE_DIR,
    videoEngineName: VIDEO_ENGINE_NAME,
    videoEngineReady: VIDEO_ENGINE_READY,
    appView: APPVIEW_URL,
    systemProxyUrl: proxy.url,
    systemProxySource: proxy.source,
    systemProxyNote: proxy.note,
  };
}

export function openInShell(target: string, reveal = false): void {
  if (process.platform === 'win32') {
    const args =
      reveal && path.extname(target)
        ? [`/select,${target}`]
        : [reveal ? path.dirname(target) : target];
    spawn('explorer.exe', args, {
      detached: true,
      stdio: 'ignore',
    }).unref();
    return;
  }
  if (process.platform === 'darwin') {
    const args = reveal ? ['-R', target] : [target];
    spawn('open', args, { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [target], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

export async function assertDirectoryWritable(
  directory: string,
): Promise<void> {
  try {
    await fs.mkdir(directory, { recursive: true });
    const probe = path.join(
      directory,
      `.bsky-spider-write-test-${Date.now()}.tmp`,
    );
    await fs.writeFile(probe, 'ok');
    await fs.unlink(probe);
  } catch {
    throw new ApiError(
      '该文件夹不可写，请选择其他保存位置',
      400,
      'folder_not_writable',
    );
  }
}
