import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  DownloadTask,
  MediaItem,
  TaskBatchAction,
  TaskCounts,
  TaskStatus,
} from '../shared/types';
import {
  guessExtension,
  renderFileTemplate,
  renderFolderTemplate,
} from '../shared/templates';
import { DATA_DIR, MAX_TASKS_PER_BATCH, TASKS_FILE } from './config';
import { downloadFile } from './download-engine';
import { ApiError, assertHttpUrl, httpFetch, isAbortError } from './http';
import {
  chooseBestVariant,
  isMasterPlaylist,
  parseMasterPlaylist,
  parseMediaPlaylist,
  type HlsMediaPlaylist,
} from './hls';
import { remuxTsToMp4 } from './remux';
import {
  joinRemoteUrl,
  parseRemoteTarget,
  remoteDirUrl,
  type RemoteTarget,
} from './remote';
import { ensureRemoteDirectory, remoteFileExists, uploadToRemote } from './webdav';
import {
  ensureDataDir,
  getSettings,
  readJsonFile,
  writeJsonFile,
} from './storage';
import { getOriginalBlobUrl } from './pds';

/** Parallel segment downloads for HLS fallback streams. */
const HLS_SEGMENT_WORKERS = 4;
/** How many connections a single (non-HLS) file download may use. */
const FILE_CONNECTIONS = 6;

interface InternalTask extends DownloadTask {
  controller?: AbortController;
  tempPath?: string;
  /** Directory holding partially downloaded HLS segments. */
  tempDir?: string;
  lastSampleAt?: number;
  lastSampleBytes?: number;
  force?: boolean;
  removed?: boolean;
  pauseRequested?: boolean;
  running?: boolean;
  runToken?: string;
}

interface PathPlan {
  root: string;
  dir: string;
  fileName: string;
  filePath: string;
  /** Set when the save location is a network (WebDAV) target. */
  remote?: RemoteTarget;
  /** Final URL on the WebDAV server. */
  remoteUrl?: string;
  /** Path relative to the save root; also valid for remote targets. */
  relativePath?: string;
}

interface DownloadResult {
  fileName: string;
  relativePath: string;
  filePath: string;
  skipped: boolean;
  note?: string;
}

type CandidateKind = 'original' | 'fallback';

interface MediaCandidate {
  kind: CandidateKind;
  /** Human readable origin used in task notes. */
  label: string;
  download: () => Promise<DownloadResult>;
}

function extensionFromContentType(
  contentType: string,
  kind: 'image' | 'video',
): string | undefined {
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (kind === 'image') {
    if (type === 'image/jpeg' || type === 'image/jpg') return '.jpg';
    if (type === 'image/png') return '.png';
    if (type === 'image/webp') return '.webp';
    if (type === 'image/gif') return '.gif';
    if (type === 'image/avif') return '.avif';
    return undefined;
  }
  if (type === 'video/mp4') return '.mp4';
  if (type === 'video/webm') return '.webm';
  if (type === 'video/quicktime') return '.mov';
  if (type === 'video/x-matroska') return '.mkv';
  return undefined;
}

function isMediaContentType(
  contentType: string,
  kind: 'image' | 'video',
): boolean {
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (!type) return true; // Unknown: let the download decide.
  return kind === 'image' ? type.startsWith('image/') : type.startsWith('video/');
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileSizeOf(filePath: string): Promise<number> {
  try {
    return (await fsp.stat(filePath)).size;
  } catch {
    return 0;
  }
}

/**
 * True when the original blob is gone for good (deleted, private, or not a
 * media file). Only then may the download fall back to a transcoded version;
 * temporary network problems must not silently reduce quality.
 */
function isOriginalPermanentlyUnavailable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (
    error.status === 403 ||
    error.status === 404 ||
    error.status === 410 ||
    error.status === 451
  ) {
    return true;
  }
  return (
    error.code === 'invalid_media' ||
    error.code === 'invalid_url' ||
    error.code === 'empty_response'
  );
}

async function replaceFile(source: string, target: string): Promise<void> {
  try {
    await fsp.rename(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    await fsp.copyFile(source, target);
    await fsp.unlink(source).catch(() => undefined);
  }
}

function friendlyDownloadError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (isAbortError(error)) return '下载已中止';
  const message = (error as Error)?.message || '未知错误';
  if (message.includes('ENOSPC')) return '磁盘空间不足';
  if (message.includes('EACCES') || message.includes('EPERM')) {
    return '没有写入保存目录的权限';
  }
  if (message.includes('ENOENT')) return '保存目录不存在或已被移动';
  return message;
}

function segmentFileName(index: number): string {
  return `seg-${String(index).padStart(5, '0')}.bin`;
}

export class DownloadManager {
  private tasks: InternalTask[] = [];
  private initialized = false;
  private persistTimer: NodeJS.Timeout | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    await ensureDataDir();
    const saved = await readJsonFile<DownloadTask[]>(TASKS_FILE, []);
    const seen = new Set<string>();
    for (const raw of Array.isArray(saved) ? saved : []) {
      if (!raw || typeof raw.id !== 'string' || seen.has(raw.id)) continue;
      if (!raw.media || !raw.media.url) continue;
      seen.add(raw.id);
      const status: TaskStatus =
        raw.status === 'downloading' ? 'waiting' : raw.status || 'waiting';
      const task: InternalTask = {
        ...raw,
        status,
        speed: 0,
        eta: null,
        fileName: raw.fileName || 'media',
        relativePath: raw.relativePath || raw.fileName || 'media',
        skipped: Boolean(raw.skipped),
      };
      this.tasks.push(task);
    }
    this.initialized = true;
    this.persistNow().catch(() => undefined);
    this.pump();
  }

  getTasks(): DownloadTask[] {
    return this.tasks.map((task) => this.toPublic(task));
  }

  getTask(id: string): DownloadTask | null {
    const task = this.tasks.find((item) => item.id === id);
    return task ? this.toPublic(task) : null;
  }

  getCounts(): TaskCounts {
    const counts: TaskCounts = {
      downloading: 0,
      waiting: 0,
      paused: 0,
      error: 0,
      completed: 0,
    };
    for (const task of this.tasks) {
      if (task.status === 'downloading') counts.downloading += 1;
      else if (task.status === 'waiting') counts.waiting += 1;
      else if (task.status === 'paused') counts.paused += 1;
      else if (task.status === 'error') counts.error += 1;
      else if (task.status === 'completed') counts.completed += 1;
    }
    return counts;
  }

  async createTasks(
    items: MediaItem[],
  ): Promise<{ added: number; skipped: number; tasks: DownloadTask[] }> {
    const settings = getSettings();
    const existingByKey = new Map<string, InternalTask[]>();
    for (const task of this.tasks) {
      const key = `${task.media.postUri}|${task.media.url}`;
      const list = existingByKey.get(key);
      if (list) list.push(task);
      else existingByKey.set(key, [task]);
    }
    const batchKeys = new Set<string>();
    const addedTasks: InternalTask[] = [];
    const createdTasks: InternalTask[] = [];
    let skipped = 0;

    for (const item of items) {
      if (addedTasks.length >= MAX_TASKS_PER_BATCH) break;
      if (!item || !item.url || !item.postUri || !item.author) {
        skipped += 1;
        continue;
      }
      try {
        assertHttpUrl(item.url);
        if (item.thumbUrl) assertHttpUrl(item.thumbUrl);
      } catch {
        skipped += 1;
        continue;
      }
      const key = `${item.postUri}|${item.url}`;
      if (batchKeys.has(key)) {
        skipped += 1;
        continue;
      }

      const existing = existingByKey.get(key) ?? [];
      const active = existing.find((task) =>
        ['waiting', 'downloading', 'paused', 'error'].includes(task.status),
      );
      if (active) {
        skipped += 1;
        continue;
      }

      // A completed record only means the file is already handled if the file
      // is still on disk. If it was deleted, reuse that task's path/name and
      // download it again instead of treating the media as a duplicate.
      const completed = existing.filter(
        (task) => task.status === 'completed',
      );
      let reusable: InternalTask | undefined;
      let completedFileExists = false;
      for (const task of completed) {
        const target =
          task.filePath ??
          path.resolve(settings.saveDir, task.relativePath);
        if (await pathExists(target)) {
          completedFileExists = true;
          break;
        }
        reusable ??= task;
      }
      if (completedFileExists) {
        skipped += 1;
        continue;
      }
      if (reusable) {
        reusable.status = 'waiting';
        reusable.force = true;
        reusable.progress = 0;
        reusable.downloadedBytes = 0;
        reusable.totalBytes = 0;
        reusable.speed = 0;
        reusable.eta = null;
        reusable.error = undefined;
        reusable.note = undefined;
        reusable.detail = undefined;
        reusable.completedAt = undefined;
        reusable.skipped = false;
        reusable.tempPath = undefined;
        reusable.tempDir = undefined;
        reusable.pauseRequested = false;
        reusable.running = false;
        reusable.runToken = undefined;
        reusable.controller = undefined;
        batchKeys.add(key);
        addedTasks.push(reusable);
        continue;
      }

      batchKeys.add(key);
      const ext = guessExtension(item.url, item.kind);
      let plan: PathPlan;
      try {
        plan = this.planPaths(item, ext, settings.saveDir);
      } catch {
        skipped += 1;
        continue;
      }
      const id = crypto.randomUUID();
      const task: InternalTask = {
        id,
        media: { ...item, id: item.id || id },
        status: 'waiting',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        speed: 0,
        eta: null,
        fileName: plan.fileName,
        relativePath: plan.relativePath ?? path.relative(plan.root, plan.filePath),
        skipped: false,
        createdAt: new Date().toISOString(),
      };
      createdTasks.push(task);
      addedTasks.push(task);
    }

    this.tasks.push(...createdTasks);
    if (addedTasks.length > 0) {
      this.persistSoon();
      this.pump();
    }
    return {
      added: addedTasks.length,
      skipped,
      tasks: addedTasks.map((task) => this.toPublic(task)),
    };
  }

  async pause(id: string): Promise<DownloadTask> {
    const task = this.findById(id);
    if (task.status === 'waiting' || task.status === 'downloading') {
      task.status = 'paused';
      task.pauseRequested = true;
      task.speed = 0;
      task.eta = null;
      task.controller?.abort();
      this.persistSoon();
    }
    return this.toPublic(task);
  }

  async resume(id: string): Promise<DownloadTask> {
    const task = this.findById(id);
    if (task.status === 'paused') {
      task.status = 'waiting';
      task.error = undefined;
      task.pauseRequested = false;
      task.runToken = undefined;
      this.persistSoon();
      this.pump();
    }
    return this.toPublic(task);
  }

  async retry(id: string): Promise<DownloadTask> {
    const task = this.findById(id);
    if (task.status === 'completed') {
      task.force = true;
      task.filePath = undefined;
    }
    if (task.status === 'error' || task.status === 'completed') {
      task.status = 'waiting';
      task.error = undefined;
      task.note = undefined;
      task.progress = 0;
      task.downloadedBytes = 0;
      task.totalBytes = 0;
      task.speed = 0;
      task.eta = null;
      task.skipped = false;
      task.completedAt = undefined;
      task.pauseRequested = false;
      task.runToken = undefined;
      this.persistSoon();
      this.pump();
    }
    return this.toPublic(task);
  }

  async remove(id: string): Promise<void> {
    const index = this.tasks.findIndex((task) => task.id === id);
    if (index < 0) return;
    const [task] = this.tasks.splice(index, 1);
    task.removed = true;
    task.controller?.abort();
    if (task.status !== 'downloading') {
      await this.cleanupTemp(task);
    }
    this.persistSoon();
  }

  async batch(action: TaskBatchAction): Promise<void> {
    if (action === 'pauseAll') {
      for (const task of this.tasks) {
        if (task.status === 'waiting' || task.status === 'downloading') {
          task.status = 'paused';
          task.pauseRequested = true;
          task.speed = 0;
          task.eta = null;
          task.controller?.abort();
        }
      }
    } else if (action === 'resumeAll') {
      for (const task of this.tasks) {
        if (task.status === 'paused') {
          task.status = 'waiting';
          task.error = undefined;
          task.pauseRequested = false;
          task.runToken = undefined;
        }
      }
      this.pump();
    } else if (action === 'retryErrors') {
      for (const task of this.tasks) {
        if (task.status === 'error') {
          task.status = 'waiting';
          task.error = undefined;
          task.progress = 0;
          task.downloadedBytes = 0;
          task.totalBytes = 0;
          task.speed = 0;
          task.eta = null;
          task.skipped = false;
        }
      }
      this.pump();
    } else if (
      action === 'removeFinished' ||
      action === 'removeActive' ||
      action === 'removeErrors' ||
      action === 'removeCompleted' ||
      action === 'removeAll'
    ) {
      const shouldRemove = (task: InternalTask): boolean => {
        if (action === 'removeFinished') {
          return task.status === 'completed' || task.status === 'error';
        }
        if (action === 'removeActive') {
          return (
            task.status === 'waiting' ||
            task.status === 'downloading' ||
            task.status === 'paused'
          );
        }
        if (action === 'removeErrors') return task.status === 'error';
        if (action === 'removeCompleted') return task.status === 'completed';
        return true;
      };
      const removed = this.tasks.filter(shouldRemove);
      for (const task of removed) {
        task.removed = true;
        task.controller?.abort();
        if (task.status !== 'downloading') {
          await this.cleanupTemp(task);
        }
      }
      this.tasks = this.tasks.filter((task) => !shouldRemove(task));
    }
    this.persistSoon();
    this.pump();
  }

  async reveal(id: string): Promise<void> {
    const task = this.findById(id);
    const filePath = this.localFilePath(task);
    if (!(await pathExists(filePath))) {
      throw new ApiError('文件不存在或已被移动', 404, 'file_not_found');
    }
    this.openNative('reveal', filePath);
  }

  async openFile(id: string): Promise<void> {
    const task = this.findById(id);
    const filePath = this.localFilePath(task);
    if (!(await pathExists(filePath))) {
      throw new ApiError('文件不存在或已被移动', 404, 'file_not_found');
    }
    this.openNative('open', filePath);
  }

  /** Remote (WebDAV) files cannot be opened by the local shell. */
  private localFilePath(task: InternalTask): string {
    if (!task.filePath) {
      throw new ApiError('文件不存在或已被移动', 404, 'file_not_found');
    }
    if (/^(davs?|https?):\/\//i.test(task.filePath)) {
      throw new ApiError(
        '该文件保存在网络位置，无法在本地打开',
        400,
        'remote_file',
      );
    }
    return task.filePath;
  }

  refreshScheduler(): void {
    this.pump();
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.persistNow();
  }

  async shutdown(): Promise<void> {
    for (const task of this.tasks) {
      if (task.status === 'downloading' || task.status === 'waiting') {
        task.status = 'paused';
        task.pauseRequested = true;
      }
      task.controller?.abort();
    }
    await this.flush();
  }

  private findById(id: string): InternalTask {
    const task = this.tasks.find((item) => item.id === id);
    if (!task) throw new ApiError('下载任务不存在', 404, 'task_not_found');
    return task;
  }

  private toPublic(task: InternalTask): DownloadTask {
    return {
      id: task.id,
      media: task.media,
      status: task.status,
      progress: task.progress,
      downloadedBytes: task.downloadedBytes,
      totalBytes: task.totalBytes,
      speed: task.speed,
      eta: task.eta,
      fileName: task.fileName,
      relativePath: task.relativePath,
      filePath: task.filePath,
      error: task.error,
      note: task.note,
      detail: task.detail,
      skipped: task.skipped,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    };
  }

  private planPaths(
    media: MediaItem,
    ext: string,
    saveDir: string,
    preferredPath?: string,
  ): PathPlan {
    const settings = getSettings();
    const target = (saveDir || settings.saveDir || '').trim();
    const remote = parseRemoteTarget(target);
    const folderParts = renderFolderTemplate(
      settings.folderTemplate,
      media,
      ext,
    );
    const fileName = renderFileTemplate(
      settings.fileNameTemplate,
      media,
      ext,
    );

    if (remote) {
      const remoteUrl =
        preferredPath && /^(davs?|https?):\/\//i.test(preferredPath)
          ? preferredPath
          : joinRemoteUrl(remote.baseUrl, folderParts, fileName);
      const stageDir = path.join(DATA_DIR, 'webdav-cache', ...folderParts);
      const stagedFile = path.join(stageDir, fileName);
      return {
        root: remote.baseUrl,
        dir: stageDir,
        fileName,
        filePath: stagedFile,
        remote,
        remoteUrl,
        relativePath: [...folderParts, fileName].filter(Boolean).join('/'),
      };
    }

    const root = path.resolve(target || settings.saveDir);
    if (preferredPath) {
      const filePath = path.resolve(preferredPath);
      if (isInside(root, filePath)) {
        return {
          root,
          dir: path.dirname(filePath),
          fileName: path.basename(filePath),
          filePath,
          relativePath: path.relative(root, filePath),
        };
      }
    }
    const dir = path.resolve(root, ...folderParts);
    if (!isInside(root, dir)) {
      throw new ApiError('保存路径超出允许范围', 400, 'invalid_path');
    }
    const filePath = path.join(dir, fileName);
    if (!isInside(root, filePath)) {
      throw new ApiError('文件名超出允许范围', 400, 'invalid_path');
    }
    return {
      root,
      dir,
      fileName,
      filePath,
      relativePath: path.relative(root, filePath),
    };
  }

  private pump(): void {
    if (!this.initialized) return;
    const settings = getSettings();
    const active = this.tasks.filter(
      (task) => task.status === 'downloading',
    ).length;
    let slots = Math.max(0, settings.concurrency - active);
    if (slots === 0) return;
    for (const task of this.tasks) {
      if (slots <= 0) break;
      if (task.status !== 'waiting' || task.running) continue;
      slots -= 1;
      void this.runTask(task);
    }
  }

  private async runTask(task: InternalTask): Promise<void> {
    if (task.status !== 'waiting' || task.running) return;
    const runToken = crypto.randomUUID();
    task.runToken = runToken;
    task.running = true;
    task.status = 'downloading';
    task.pauseRequested = false;
    task.error = undefined;
    task.note = undefined;
    task.progress = 0;
    task.speed = 0;
    task.eta = null;
    task.controller = new AbortController();
    task.lastSampleAt = Date.now();
    task.lastSampleBytes = 0;
    this.persistSoon();

    try {
      const result = await this.download(task);
      if (
        task.removed ||
        task.runToken !== runToken ||
        !this.tasks.includes(task)
      ) {
        return;
      }
      task.status = 'completed';
      task.progress = 100;
      task.speed = 0;
      task.eta = null;
      task.fileName = result.fileName;
      task.relativePath = result.relativePath;
      task.filePath = result.filePath;
      task.skipped = result.skipped;
      task.note = result.note ?? task.note;
      task.detail = result.skipped ? '文件已存在，已跳过' : undefined;
      task.completedAt = new Date().toISOString();
    } catch (error) {
      if (
        task.removed ||
        task.runToken !== runToken ||
        !this.tasks.includes(task)
      ) {
        return;
      }
      if (task.pauseRequested) {
        task.status = 'paused';
        task.speed = 0;
        task.eta = null;
      } else if (isAbortError(error)) {
        task.status = 'error';
        task.error = '下载已中止';
        task.speed = 0;
        task.eta = null;
      } else {
        task.status = 'error';
        task.error = friendlyDownloadError(error);
        task.speed = 0;
        task.eta = null;
        console.warn(`[download] ${task.fileName} 失败：${task.error}`);
      }
    } finally {
      task.running = false;
      if (task.runToken === runToken) task.runToken = undefined;
      task.controller = undefined;
      if (task.removed || !this.tasks.includes(task)) {
        await this.cleanupTemp(task);
      }
      this.persistSoon();
      this.pump();
    }
  }

  /**
   * Resolves the media into an ordered list of download candidates. The
   * original blob on the author's PDS always comes first: it is the untouched
   * upload (MP4/JPEG/PNG), so "original quality" never needs a video remux.
   */
  private async candidates(
    task: InternalTask,
    predicted: PathPlan,
  ): Promise<MediaCandidate[]> {
    const media = task.media;
    const list: MediaCandidate[] = [];

    if (media.blobCid) {
      const originalUrl = await getOriginalBlobUrl(
        media.author.did,
        media.blobCid,
      );
      if (originalUrl) {
        try {
          assertHttpUrl(originalUrl);
          list.push({
            kind: 'original',
            label: 'PDS 原始文件',
            download: () =>
              this.downloadOriginal(task, media, predicted, originalUrl),
          });
        } catch {
          // Invalid blob URL: fall through to the public CDN.
        }
      }
    }

    if (media.kind === 'video' && /\.m3u8(\?|$)/i.test(media.url)) {
      list.push({
        kind: 'fallback',
        label: 'HLS 转码视频',
        download: () => this.downloadHls(task, media, predicted),
      });
    } else {
      list.push({
        kind: 'fallback',
        label: media.kind === 'image' ? 'CDN 图片' : 'CDN 视频',
        download: () => this.downloadDirect(task, media, predicted, media.url),
      });
    }
    return list;
  }

  private async download(task: InternalTask): Promise<DownloadResult> {
    const settings = getSettings();
    const media = task.media;
    const predictedExt = guessExtension(media.url, media.kind);
    const predicted = this.planPaths(
      media,
      predictedExt,
      settings.saveDir,
      task.filePath,
    );

    // A CDN-predicted extension (often .webp for images) must not make us skip
    // the original PDS blob, whose real extension may be .jpg/.png/.mp4.
    if (predicted.remote) {
      if (
        !task.force &&
        settings.skipExisting &&
        (await remoteFileExists(predicted.remoteUrl!, predicted.remote.auth))
      ) {
        return {
          fileName: predicted.fileName,
          relativePath: predicted.relativePath ?? predicted.fileName,
          filePath: predicted.remoteUrl!,
          skipped: true,
        };
      }
    } else if (
      !task.force &&
      !media.blobCid &&
      settings.skipExisting &&
      (await pathExists(predicted.filePath))
    ) {
      return {
        fileName: predicted.fileName,
        relativePath:
          predicted.relativePath ??
          path.relative(predicted.root, predicted.filePath),
        filePath: predicted.filePath,
        skipped: true,
      };
    }

    await fsp.mkdir(predicted.dir, { recursive: true });

    const candidates = await this.candidates(task, predicted);
    let lastError: unknown;

    if (candidates.every((candidate) => candidate.kind === 'fallback')) {
      task.note = media.blobCid
        ? '无法解析作者 PDS，已使用 Bluesky 转码版本'
        : '该帖子没有原始文件记录，已使用 Bluesky 转码版本';
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      try {
        if (candidate.kind === 'fallback' && index > 0) {
          task.note = '原始文件不可用，已回退到 Bluesky 转码版本';
        }
        const result = await candidate.download();
        if (!predicted.remote) return result;

        // Network save target: the file was downloaded into the local staging
        // cache, upload it and remove the local copy.
        task.detail = '正在上传到网络位置…';
        await ensureRemoteDirectory(
          remoteDirUrl(predicted.remoteUrl!),
          predicted.remote.auth,
        );
        await uploadToRemote(
          predicted.remoteUrl!,
          result.filePath,
          predicted.remote.auth,
          task.controller?.signal,
        );
        await fsp.rm(result.filePath, { force: true }).catch(() => undefined);
        return {
          ...result,
          filePath: predicted.remoteUrl!,
          relativePath: predicted.relativePath ?? result.relativePath,
          skipped: false,
        };
      } catch (error) {
        if (task.pauseRequested || isAbortError(error)) throw error;
        lastError = error;
        if (
          candidate.kind === 'original' &&
          !isOriginalPermanentlyUnavailable(error)
        ) {
          // Never trade quality for a transient failure: keep the task in the
          // error state so a retry downloads the original file again.
          task.note = '原始文件下载失败，已停止以避免降低画质';
          task.detail = undefined;
          throw error;
        }
        task.downloadedBytes = 0;
        task.totalBytes = 0;
        task.progress = 0;
        task.speed = 0;
        task.eta = null;
        if (index < candidates.length - 1) {
          task.note =
            candidate.kind === 'original'
              ? '原始文件不可用，正在尝试 Bluesky 转码版本…'
              : task.note;
          task.detail = '正在尝试备用地址…';
        }
      }
    }

    throw lastError ?? new ApiError('下载失败', 502, 'download_failed');
  }

  /** Downloads the original PDS blob without any re-encoding or remuxing. */
  private async downloadOriginal(
    task: InternalTask,
    media: MediaItem,
    predicted: PathPlan,
    sourceUrl: string,
  ): Promise<DownloadResult> {
    const tempPath = path.join(predicted.dir, `.bsky-${task.id}.part`);
    task.tempPath = tempPath;
    task.detail = '正在获取原始文件…';

    let contentType = '';
    let detectedTotal = 0;
    try {
      const result = await downloadFile({
        url: sourceUrl,
        destination: tempPath,
        signal: task.controller?.signal,
        connections: FILE_CONNECTIONS,
        probe: media.kind === 'video',
        onResponse: (info) => {
          contentType = info.contentType;
          detectedTotal = info.totalBytes;
          if (!isMediaContentType(info.contentType, media.kind)) {
            throw new ApiError(
              `服务器返回了非${
                media.kind === 'image' ? '图片' : '视频'
              }内容（${info.contentType || '未知类型'}）`,
              502,
              'invalid_media',
            );
          }
          task.totalBytes = info.totalBytes;
          this.updateProgress(task, task.downloadedBytes);
        },
        onProgress: (progress) => {
          if (progress.total > 0) task.totalBytes = progress.total;
          this.updateProgress(task, progress.downloaded);
        },
      });

      const ext =
        extensionFromContentType(contentType, media.kind) ||
        guessExtension(media.url, media.kind);
      const plan = this.planPaths(
        task.media,
        ext,
        getSettings().saveDir,
        task.filePath,
      );
      await fsp.mkdir(plan.dir, { recursive: true });

      if (
        !plan.remote &&
        !task.force &&
        getSettings().skipExisting &&
        (await pathExists(plan.filePath))
      ) {
        await fsp.unlink(tempPath).catch(() => undefined);
        task.tempPath = undefined;
        return {
          fileName: plan.fileName,
          relativePath: plan.relativePath ?? path.relative(plan.root, plan.filePath),
          filePath: plan.filePath,
          skipped: true,
        };
      }

      const finalPath = await this.resolveAvailablePath(
        plan,
        Boolean(task.force),
      );
      await replaceFile(tempPath, finalPath.filePath);
      task.tempPath = undefined;
      task.progress = 100;
      task.downloadedBytes = Math.max(result.bytes, detectedTotal);
      task.totalBytes = task.downloadedBytes;
      task.detail = undefined;
      return {
        fileName: finalPath.fileName,
        relativePath:
          plan.relativePath ?? path.relative(plan.root, finalPath.filePath),
        filePath: finalPath.filePath,
        skipped: false,
      };
    } catch (error) {
      if (isAbortError(error) || task.pauseRequested) {
        // Keep the partial file: "继续下载" can resume when the server
        // supports range requests.
        throw error;
      }
      await fsp.unlink(tempPath).catch(() => undefined);
      task.tempPath = undefined;
      throw error;
    }
  }

  /** Downloads a single public CDN file (image, or video that is not HLS). */
  private async downloadDirect(
    task: InternalTask,
    media: MediaItem,
    predicted: PathPlan,
    sourceUrl: string,
  ): Promise<DownloadResult> {
    const tempPath = path.join(predicted.dir, `.bsky-${task.id}.part`);
    task.tempPath = tempPath;
    task.detail = '连接成功，开始下载';

    let contentType = '';
    try {
      const result = await downloadFile({
        url: sourceUrl,
        destination: tempPath,
        signal: task.controller?.signal,
        connections: FILE_CONNECTIONS,
        probe: media.kind === 'video',
        onResponse: (info) => {
          contentType = info.contentType;
          if (!isMediaContentType(info.contentType, media.kind)) {
            throw new ApiError(
              `服务器返回了非${
                media.kind === 'image' ? '图片' : '视频'
              }内容（${info.contentType || '未知类型'}）`,
              502,
              'invalid_media',
            );
          }
          task.totalBytes = info.totalBytes;
          this.updateProgress(task, task.downloadedBytes);
        },
        onProgress: (progress) => {
          if (progress.total > 0) task.totalBytes = progress.total;
          this.updateProgress(task, progress.downloaded);
        },
      });

      const ext =
        extensionFromContentType(contentType, media.kind) ||
        guessExtension(sourceUrl, media.kind);
      const plan = this.planPaths(
        task.media,
        ext,
        getSettings().saveDir,
        task.filePath,
      );
      await fsp.mkdir(plan.dir, { recursive: true });

      if (
        !plan.remote &&
        !task.force &&
        getSettings().skipExisting &&
        (await pathExists(plan.filePath))
      ) {
        await fsp.unlink(tempPath).catch(() => undefined);
        task.tempPath = undefined;
        return {
          fileName: plan.fileName,
          relativePath: plan.relativePath ?? path.relative(plan.root, plan.filePath),
          filePath: plan.filePath,
          skipped: true,
        };
      }

      const finalPath = await this.resolveAvailablePath(
        plan,
        Boolean(task.force),
      );
      await replaceFile(tempPath, finalPath.filePath);
      task.tempPath = undefined;
      task.progress = 100;
      task.downloadedBytes = result.bytes;
      task.totalBytes = result.bytes;
      task.detail = undefined;
      return {
        fileName: finalPath.fileName,
        relativePath:
          plan.relativePath ?? path.relative(plan.root, finalPath.filePath),
        filePath: finalPath.filePath,
        skipped: false,
      };
    } catch (error) {
      if (isAbortError(error) || task.pauseRequested) {
        // Keep the partial file: "继续下载" can resume when the server
        // supports range requests.
        throw error;
      }
      await fsp.unlink(tempPath).catch(() => undefined);
      task.tempPath = undefined;
      throw error;
    }
  }

  /**
   * Downloads an HLS fallback stream: variants are probed, segments are fetched
   * with limited parallelism and the result is remuxed to MP4 by the built-in
   * TypeScript muxer (no ffmpeg required).
   */
  private async downloadHls(
    task: InternalTask,
    media: MediaItem,
    predicted: PathPlan,
  ): Promise<DownloadResult> {
    const partDir = path.join(predicted.dir, `.bsky-${task.id}.parts`);
    task.tempDir = partDir;
    await fsp.mkdir(partDir, { recursive: true });
    await fsp.rm(path.join(partDir, 'merged.ts'), { force: true });
    await fsp.rm(path.join(partDir, 'remuxed.mp4'), { force: true });

    const fetchPlaylist = async (
      url: string,
    ): Promise<{ text: string; url: string }> => {
      const response = await httpFetch(
        url,
        { signal: task.controller?.signal },
        undefined,
      );
      if (!response.ok) {
        throw new ApiError(
          `无法获取视频播放列表（HTTP ${response.status}）`,
          502,
          'playlist_failed',
        );
      }
      const text = await response.text();
      return { text, url: response.url || url };
    };

    task.detail = '正在读取视频播放列表…';
    let playlist = await fetchPlaylist(media.url);
    let variantWidth = 0;
    let variantHeight = 0;
    if (isMasterPlaylist(playlist.text)) {
      const variant = chooseBestVariant(
        parseMasterPlaylist(playlist.text, playlist.url),
      );
      if (!variant) {
        throw new ApiError('视频播放列表中没有可用的清晰度', 502, 'hls_empty');
      }
      variantWidth = variant.width ?? 0;
      variantHeight = variant.height ?? 0;
      playlist = await fetchPlaylist(variant.url);
    }

    const parsed: HlsMediaPlaylist = parseMediaPlaylist(
      playlist.text,
      playlist.url,
    );
    if (parsed.encrypted) {
      throw new ApiError(
        '该视频使用了受保护的 HLS 加密，暂不支持下载',
        400,
        'hls_encrypted',
      );
    }
    if (parsed.segments.length === 0) {
      throw new ApiError('视频播放列表为空', 502, 'hls_empty');
    }

    // Segments belong to one playlist; a changed playlist invalidates the
    // partial data from an earlier attempt. Query strings carry short-lived
    // session ids, so they are ignored when comparing.
    const markerPath = path.join(partDir, '.playlist');
    const markerValue = (() => {
      try {
        const url = new URL(playlist.url);
        url.search = '';
        return url.toString();
      } catch {
        return playlist.url;
      }
    })();
    const marker = await fsp
      .readFile(markerPath, 'utf8')
      .catch(() => '');
    if (marker && marker.trim() !== markerValue) {
      await fsp.rm(partDir, { recursive: true, force: true });
      await fsp.mkdir(partDir, { recursive: true });
    }
    await fsp.writeFile(markerPath, markerValue, 'utf8').catch(
      () => undefined,
    );

    if (parsed.isFmp4 && parsed.initSegment) {
      task.detail = '正在下载视频初始化段…';
      const initPath = path.join(partDir, 'init.bin');
      if (!(await pathExists(initPath))) {
        await downloadFile({
          url: parsed.initSegment,
          destination: `${initPath}.part`,
          signal: task.controller?.signal,
          skipProbe: true,
          connections: 1,
        });
        await fsp.rename(`${initPath}.part`, initPath);
      }
    }

    const totalSegments = parsed.segments.length;
    const files = await this.downloadSegments(
      task,
      parsed.segments,
      partDir,
      totalSegments,
    );

    task.detail = '正在合并视频分段…';
    const mergedPath = parsed.isFmp4 ? path.join(partDir, 'init.bin') : null;
    const targetPath = path.join(partDir, 'merged.ts');
    const sink = await fsp.open(targetPath, 'w');
    let mergedBytes = 0;
    try {
      const append = async (filePath: string): Promise<void> => {
        for await (const chunk of fs.createReadStream(filePath)) {
          const buffer = chunk as Buffer;
          await sink.write(buffer);
          mergedBytes += buffer.length;
        }
      };
      if (mergedPath && (await pathExists(mergedPath))) {
        await append(mergedPath);
      }
      for (const file of files) {
        await append(file);
      }
    } finally {
      await sink.close().catch(() => undefined);
    }

    for (const file of files) {
      await fsp.unlink(file).catch(() => undefined);
    }
    await fsp.unlink(path.join(partDir, 'init.bin')).catch(() => undefined);

    let outputPath = targetPath;
    let ext = parsed.isFmp4 ? '.mp4' : '.ts';
    let note: string | undefined;

    if (!parsed.isFmp4) {
      // The HLS fallback is always remuxed to MP4: a transport stream has no
      // seekable header, so players and Windows Explorer cannot show a cover
      // thumbnail for it. The built-in muxer copies the streams bit for bit.
      task.detail = '正在封装为 MP4…';
      const remuxed = path.join(partDir, 'remuxed.mp4');
      try {
        await remuxTsToMp4(targetPath, remuxed, {
          width: variantWidth || media.width,
          height: variantHeight || media.height,
        });
        outputPath = remuxed;
        ext = '.mp4';
        await fsp.unlink(targetPath).catch(() => undefined);
      } catch (error) {
        if (isAbortError(error) || task.pauseRequested) throw error;
        note = '内置封装失败，已保存为 .ts 文件';
        console.warn(
          `[download] ${task.fileName} 内置封装失败：${
            (error as Error)?.message || error
          }`,
        );
        await fsp.unlink(remuxed).catch(() => undefined);
      }
    }

    const plan = this.planPaths(
      media,
      ext,
      getSettings().saveDir,
      task.filePath,
    );
    await fsp.mkdir(plan.dir, { recursive: true });
    if (
      !plan.remote &&
      !task.force &&
      getSettings().skipExisting &&
      (await pathExists(plan.filePath))
    ) {
      await fsp.unlink(outputPath).catch(() => undefined);
      await fsp.rm(partDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
      task.tempPath = undefined;
      task.tempDir = undefined;
      return {
        fileName: plan.fileName,
        relativePath: plan.relativePath ?? path.relative(plan.root, plan.filePath),
        filePath: plan.filePath,
        skipped: true,
      };
    }

    const finalPath = await this.resolveAvailablePath(
      plan,
      Boolean(task.force),
    );
    await replaceFile(outputPath, finalPath.filePath);
    await fsp.rm(partDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
    const finalBytes = await fileSizeOf(finalPath.filePath);
    task.tempPath = undefined;
    task.tempDir = undefined;
    task.progress = 100;
    task.downloadedBytes = finalBytes || mergedBytes;
    task.totalBytes = finalBytes || mergedBytes;
    task.detail = undefined;
    return {
      fileName: finalPath.fileName,
      relativePath:
          plan.relativePath ?? path.relative(plan.root, finalPath.filePath),
      filePath: finalPath.filePath,
      skipped: false,
      note,
    };
  }

  /** Fetches HLS segments with a bounded worker pool, reusing partial data. */
  private async downloadSegments(
    task: InternalTask,
    urls: string[],
    partDir: string,
    total: number,
  ): Promise<string[]> {
    const files = new Array<string>(urls.length);
    let completed = 0;
    for (let index = 0; index < urls.length; index += 1) {
      const file = path.join(partDir, segmentFileName(index));
      if (await pathExists(file)) {
        files[index] = file;
        completed += 1;
      }
    }
    if (completed > 0) {
      task.detail = `视频分段 ${completed}/${total}（继续上次的进度）`;
      task.progress = Math.min(99, (completed / total) * 100);
    }

    if (completed === urls.length) return files;

    let cursor = 0;
    let failed = false;
    const signal = task.controller?.signal;

    const worker = async (): Promise<void> => {
      while (!failed) {
        if (task.status === 'paused') {
          throw new DOMException('aborted', 'AbortError');
        }
        const index = cursor;
        cursor += 1;
        if (index >= urls.length) return;
        if (files[index]) continue;

        const finalPath = path.join(partDir, segmentFileName(index));
        const tempPath = `${finalPath}.part`;
        try {
          await downloadFile({
            url: urls[index],
            destination: tempPath,
            signal,
            skipProbe: true,
            connections: 1,
            retries: 3,
          });
          await fsp.rename(tempPath, finalPath);
          files[index] = finalPath;
          completed += 1;
          task.progress = Math.min(99, (completed / total) * 100);
          task.detail = `视频分段 ${completed}/${total}`;
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    };

    try {
      await Promise.all(
        Array.from(
          { length: Math.min(HLS_SEGMENT_WORKERS, urls.length) },
          worker,
        ),
      );
    } catch (error) {
      failed = true;
      throw error;
    }

    return files;
  }

  private updateProgress(task: InternalTask, downloaded: number): void {
    task.downloadedBytes = Math.max(task.downloadedBytes, downloaded);
    if (task.totalBytes > 0) {
      task.progress = Math.min(
        99,
        Math.round((task.downloadedBytes / task.totalBytes) * 1000) / 10,
      );
    }
    const now = Date.now();
    if (!task.lastSampleAt) {
      task.lastSampleAt = now;
      task.lastSampleBytes = task.downloadedBytes;
      return;
    }
    const elapsed = (now - task.lastSampleAt) / 1000;
    if (elapsed >= 0.6) {
      const delta = Math.max(
        0,
        task.downloadedBytes - (task.lastSampleBytes || 0),
      );
      const instant = delta / elapsed;
      task.speed =
        task.speed > 0 ? task.speed * 0.35 + instant * 0.65 : instant;
      if (task.speed > 0 && task.totalBytes > task.downloadedBytes) {
        task.eta = Math.round(
          (task.totalBytes - task.downloadedBytes) / task.speed,
        );
      } else {
        task.eta = null;
      }
      task.lastSampleAt = now;
      task.lastSampleBytes = task.downloadedBytes;
      this.persistSoon();
    }
  }

  private async resolveAvailablePath(
    plan: PathPlan,
    force: boolean,
  ): Promise<{ fileName: string; filePath: string }> {
    const ext = path.extname(plan.fileName);
    const base = plan.fileName.slice(
      0,
      Math.max(0, plan.fileName.length - ext.length),
    );
    let candidate = plan.filePath;
    if (force) {
      await fsp.rm(candidate, { force: true });
      return { fileName: plan.fileName, filePath: candidate };
    }
    let suffix = 1;
    while (await pathExists(candidate)) {
      const nextName = `${base} (${suffix})${ext}`;
      candidate = path.join(plan.dir, nextName);
      suffix += 1;
      if (suffix > 999) {
        throw new ApiError('无法生成可用的文件名', 500, 'name_conflict');
      }
    }
    return {
      fileName: path.basename(candidate),
      filePath: candidate,
    };
  }

  private async cleanupTemp(task: InternalTask): Promise<void> {
    if (task.tempPath) {
      await fsp.unlink(task.tempPath).catch(() => undefined);
      task.tempPath = undefined;
    }
    if (task.tempDir) {
      await fsp.rm(task.tempDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
      task.tempDir = undefined;
    }
  }

  private persistSoon(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow().catch(() => undefined);
    }, 900);
  }

  private async persistNow(): Promise<void> {
    if (!this.initialized) return;
    const payload = this.tasks.map((task) => this.toPublic(task));
    await writeJsonFile(TASKS_FILE, payload);
  }

  private openNative(mode: 'open' | 'reveal', filePath: string): void {
    if (process.platform === 'win32') {
      if (mode === 'reveal') {
        spawn('explorer.exe', [`/select,${filePath}`], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      } else {
        spawn('explorer.exe', [filePath], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      }
      return;
    }
    if (process.platform === 'darwin') {
      spawn('open', mode === 'reveal' ? ['-R', filePath] : [filePath], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return;
    }
    spawn('xdg-open', [mode === 'reveal' ? path.dirname(filePath) : filePath], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  }
}

export const downloads = new DownloadManager();
