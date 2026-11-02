/**
 * File download engine.
 *
 * Inspired by the aria2-based downloader X-Spider uses: a file is fetched with
 * as many parallel connections as the server allows, partial data is reused
 * when a transfer is interrupted, and every request is retried with a backoff.
 *
 * Bluesky's blob endpoint does not implement HTTP Range requests, so the
 * engine quietly falls back to a single stream there while still taking
 * advantage of multi-connection downloads on servers that support them.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { ApiError, httpFetch, isAbortError } from './http';

/** Files below this size are not worth splitting into several connections. */
const MIN_PARALLEL_BYTES = 2 * 1024 * 1024;
const DEFAULT_CONNECTIONS = 6;
const DEFAULT_RETRIES = 3;
const HEAD_TIMEOUT_MS = 20_000;

export interface DownloadProgress {
  downloaded: number;
  total: number;
}

export interface FileDownloadOptions {
  url: string;
  /** Destination file. Partial data is kept here between attempts. */
  destination: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Parallel connections for range-capable servers. */
  connections?: number;
  retries?: number;
  /** Skip the metadata probe for small, known files such as HLS segments. */
  skipProbe?: boolean;
  /**
   * Probe the server (HEAD / 1-byte range) before downloading. Worth one extra
   * request for large files, skipped for small images.
   */
  probe?: boolean;
  onProgress?: (progress: DownloadProgress) => void;
  /** Called once the response metadata is known. */
  onResponse?: (info: {
    contentType: string;
    totalBytes: number;
    finalUrl: string;
    rangeSupported: boolean;
    parallel: boolean;
  }) => void;
}

export interface FileDownloadResult {
  bytes: number;
  contentType: string;
  finalUrl: string;
  /** True when the transfer used multiple connections. */
  parallel: boolean;
}

interface ProbeResult {
  contentType: string;
  totalBytes: number;
  rangeSupported: boolean;
  finalUrl: string;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseContentRange(value: string | null): { start: number; total: number } | null {
  if (!value) return null;
  const match = /bytes\s+(\d+)-(\d+)\/(\d+)/i.exec(value);
  if (!match) return null;
  return { start: Number(match[1]), total: Number(match[3]) };
}

/** Issues a HEAD request (or a 1-byte range GET) to learn about the resource. */
async function probe(
  url: string,
  options: FileDownloadOptions,
): Promise<ProbeResult> {
  const headers = { ...(options.headers || {}) };
  try {
    const response = await httpFetch(
      url,
      { method: 'HEAD', headers, signal: options.signal },
      HEAD_TIMEOUT_MS,
    );
    const length = Number(response.headers.get('content-length')) || 0;
    const acceptRanges = (response.headers.get('accept-ranges') || '').toLowerCase();
    if (response.ok && length > 0) {
      return {
        contentType: response.headers.get('content-type') || '',
        totalBytes: length,
        rangeSupported: acceptRanges.includes('bytes'),
        finalUrl: response.url || url,
      };
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    // Fall through to the range probe.
  }

  // Some servers reject HEAD; a one byte range request is the next best probe.
  try {
    const response = await httpFetch(
      url,
      {
        headers: { ...headers, range: 'bytes=0-0' },
        signal: options.signal,
      },
      HEAD_TIMEOUT_MS,
    );
    const range = parseContentRange(response.headers.get('content-range'));
    const length = Number(response.headers.get('content-length')) || 0;
    const total = range?.total ?? (response.status === 206 ? length : length);
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok && response.status !== 206) {
      throw new ApiError(
        `下载失败（HTTP ${response.status}）`,
        502,
        'download_failed',
      );
    }
    return {
      contentType: response.headers.get('content-type') || '',
      totalBytes: total || 0,
      rangeSupported: response.status === 206 && Boolean(range),
      finalUrl: response.url || url,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    // Unknown metadata: stream the file without a Content-Length.
    return {
      contentType: '',
      totalBytes: 0,
      rangeSupported: false,
      finalUrl: url,
    };
  }
}

async function fileSize(filePath: string): Promise<number> {
  try {
    return (await fsp.stat(filePath)).size;
  } catch {
    return 0;
  }
}

/** Streams the whole file in a single connection, resuming when possible. */
async function downloadSingle(
  url: string,
  destination: string,
  options: FileDownloadOptions,
  probeInfo: ProbeResult,
  attempt: number,
): Promise<FileDownloadResult> {
  const resumeAt = probeInfo.rangeSupported ? await fileSize(destination) : 0;
  const resumable = resumeAt > 0 && resumeAt < probeInfo.totalBytes;
  const headers: Record<string, string> = { ...(options.headers || {}) };
  if (resumable) headers.range = `bytes=${resumeAt}-`;

  const response = await httpFetch(
    url,
    {
      headers,
      signal: options.signal,
    },
    0,
  );

  if (response.status === 416) {
    await fsp.rm(destination, { force: true });
    return downloadSingle(url, destination, options, probeInfo, attempt);
  }
  if (!response.ok) {
    throw new ApiError(
      `下载失败（HTTP ${response.status}）`,
      502,
      'download_failed',
    );
  }

  const contentType =
    response.headers.get('content-type') || probeInfo.contentType;
  const contentRange = parseContentRange(response.headers.get('content-range'));
  const totalBytes =
    contentRange?.total ||
    (Number(response.headers.get('content-length')) || 0) +
      (response.status === 206 ? resumeAt : 0) ||
    probeInfo.totalBytes;
  const startBytes = response.status === 206 ? resumeAt : 0;
  let downloaded = startBytes;

  options.onResponse?.({
    contentType,
    totalBytes,
    finalUrl: response.url || url,
    rangeSupported: probeInfo.rangeSupported,
    parallel: false,
  });
  options.onProgress?.({ downloaded, total: totalBytes });

  const body = response.body;
  if (!body) throw new ApiError('响应内容为空', 502, 'empty_response');

  if (startBytes === 0) {
    await fsp.rm(destination, { force: true }).catch(() => undefined);
  }

  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloaded += chunk.length;
      options.onProgress?.({ downloaded, total: totalBytes });
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
      meter,
      fs.createWriteStream(destination, { flags: startBytes > 0 ? 'a' : 'w' }),
    );
  } catch (error) {
    if (isAbortError(error)) throw new DOMException('aborted', 'AbortError');
    throw error;
  }

  const written = await fileSize(destination);
  return {
    bytes: written,
    contentType,
    finalUrl: response.url || url,
    parallel: false,
  };
}

/** Downloads a byte range into an already open file handle. */
async function downloadChunk(
  handle: fsp.FileHandle,
  url: string,
  start: number,
  end: number,
  options: FileDownloadOptions,
  tracker: { downloaded: number; total: number },
): Promise<void> {
  let position = start;
  let attempts = 0;
  const retries = options.retries ?? DEFAULT_RETRIES;

  while (position <= end) {
    attempts += 1;
    try {
      const response = await httpFetch(
        url,
        {
          headers: {
            ...(options.headers || {}),
            range: `bytes=${position}-${end}`,
          },
          signal: options.signal,
        },
        0,
      );
      if (response.status !== 206) {
        // The server stopped honouring ranges: fall back to a single stream.
        await response.body?.cancel().catch(() => undefined);
        throw new ApiError(
          '服务器不支持分段下载',
          502,
          'range_unsupported',
          { fallbackSingle: true },
        );
      }
      const body = response.body;
      if (!body) throw new ApiError('响应内容为空', 502, 'empty_response');
      for await (const chunk of Readable.fromWeb(
        body as Parameters<typeof Readable.fromWeb>[0],
      )) {
        const buffer = chunk as Buffer;
        await handle.write(buffer, 0, buffer.length, position);
        position += buffer.length;
        tracker.downloaded += buffer.length;
        options.onProgress?.({
          downloaded: tracker.downloaded,
          total: tracker.total,
        });
      }
    } catch (error) {
      if (isAbortError(error)) throw new DOMException('aborted', 'AbortError');
      if ((error as ApiError)?.details && (error as ApiError).code === 'range_unsupported') {
        throw error;
      }
      if (attempts > retries) throw error;
      await sleep(400 * attempts, options.signal);
    }
  }
}

async function downloadParallel(
  url: string,
  destination: string,
  options: FileDownloadOptions,
  probeInfo: ProbeResult,
): Promise<FileDownloadResult> {
  const connections = Math.min(
    Math.max(1, options.connections ?? DEFAULT_CONNECTIONS),
    16,
  );
  const total = probeInfo.totalBytes;
  const handle = await fsp.open(destination, 'w');
  const tracker = { downloaded: 0, total };
  try {
    options.onResponse?.({
      contentType: probeInfo.contentType,
      totalBytes: total,
      finalUrl: probeInfo.finalUrl,
      rangeSupported: true,
      parallel: true,
    });
    await handle.truncate(total);
    const chunkSize = Math.ceil(total / connections);
    const tasks: Array<Promise<void>> = [];
    for (let index = 0; index < connections; index += 1) {
      const start = index * chunkSize;
      const end = Math.min(total - 1, start + chunkSize - 1);
      if (start > end) break;
      tasks.push(downloadChunk(handle, url, start, end, options, tracker));
    }
    await Promise.all(tasks);
  } finally {
    await handle.close().catch(() => undefined);
  }

  const written = await fileSize(destination);
  return {
    bytes: written,
    contentType: probeInfo.contentType,
    finalUrl: probeInfo.finalUrl,
    parallel: true,
  };
}

/**
 * Downloads `url` into `destination`, retrying transient failures. Existing
 * partial data is kept when the server supports ranges so a pause/resume cycle
 * does not start over.
 */
export async function downloadFile(
  options: FileDownloadOptions,
): Promise<FileDownloadResult> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const probeInfo =
    options.skipProbe || options.probe === false
      ? {
          contentType: '',
          totalBytes: 0,
          rangeSupported: false,
          finalUrl: options.url,
        }
      : await probe(options.url, options);
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      if (
        probeInfo.rangeSupported &&
        probeInfo.totalBytes >= MIN_PARALLEL_BYTES &&
        (options.connections ?? DEFAULT_CONNECTIONS) > 1
      ) {
        return await downloadParallel(
          options.url,
          options.destination,
          options,
          probeInfo,
        );
      }
      return await downloadSingle(
        options.url,
        options.destination,
        options,
        probeInfo,
        attempt,
      );
    } catch (error) {
      if (isAbortError(error)) throw new DOMException('aborted', 'AbortError');
      // A server that silently ignores ranges must not retry in parallel mode.
      if ((error as ApiError)?.code === 'range_unsupported') {
        return downloadSingle(
          options.url,
          options.destination,
          { ...options, connections: 1 },
          { ...probeInfo, rangeSupported: false },
          attempt,
        );
      }
      lastError = error;
      // Only transient failures are worth another attempt; a 404 or an invalid
      // content type will not change on a retry.
      const apiError = error instanceof ApiError ? error : null;
      const transient =
        !apiError ||
        apiError.code === 'network_error' ||
        apiError.code === 'timeout' ||
        apiError.code === 'empty_response';
      if (!transient || attempt >= retries) break;
      await sleep(600 * attempt, options.signal);
    }
  }
  throw lastError ?? new ApiError('下载失败', 502, 'download_failed');
}
