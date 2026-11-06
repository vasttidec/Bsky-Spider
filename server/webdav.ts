import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import { ApiError, httpFetch } from './http';

function authHeaders(auth?: string): Record<string, string> {
  return auth ? { authorization: auth } : {};
}

function statusError(status: number, action: string): ApiError {
  if (status === 401 || status === 403) {
    return new ApiError(
      `${action}被拒绝（HTTP ${status}），请检查网络位置的账号或权限`,
      400,
      'remote_denied',
    );
  }
  if (status === 404) {
    return new ApiError(`${action}失败：网络位置不存在（HTTP 404）`, 404, 'remote_not_found');
  }
  if (status === 507) {
    return new ApiError(`${action}失败：网络位置空间不足`, 502, 'remote_no_space');
  }
  return new ApiError(`${action}失败（HTTP ${status}）`, 502, 'remote_failed');
}

/** Creates every missing collection of the directory URL (MKCOL). */
export async function ensureRemoteDirectory(
  dirUrl: string,
  auth?: string,
): Promise<void> {
  const url = new URL(dirUrl);
  const segments = url.pathname.split('/').filter(Boolean);
  let current = `${url.origin}/`;
  for (const segment of segments) {
    current = `${current}${segment}/`;
    let response;
    try {
      response = await httpFetch(
        current,
        { method: 'MKCOL', headers: authHeaders(auth) },
        15_000,
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'timeout') {
        throw new ApiError('连接网络位置超时，请检查地址与网络', 504, 'remote_timeout');
      }
      throw error;
    }
    const status = response.status;
    if (status === 200 || status === 201 || status === 204 || status === 405) {
      continue;
    }
    if (status === 409) {
      throw new ApiError(
        '无法创建网络位置目录，请确认地址指向一个可写的 WebDAV 目录',
        400,
        'remote_mkcol_failed',
      );
    }
    throw statusError(status, '创建网络位置目录');
  }
}

/** HEAD probe used by the "skip existing" option. */
export async function remoteFileExists(
  fileUrl: string,
  auth?: string,
): Promise<boolean> {
  try {
    const response = await httpFetch(
      fileUrl,
      { method: 'HEAD', headers: authHeaders(auth) },
      15_000,
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** Uploads a local file to a WebDAV URL with a streaming PUT request. */
export async function uploadToRemote(
  fileUrl: string,
  localPath: string,
  auth?: string,
  signal?: AbortSignal,
): Promise<void> {
  const stat = await fsp.stat(localPath);
  const stream = Readable.toWeb(
    fs.createReadStream(localPath),
  ) as unknown as ReadableStream<Uint8Array>;
  let response;
  try {
    response = await httpFetch(
      fileUrl,
      {
        method: 'PUT',
        headers: {
          ...authHeaders(auth),
          'content-type': 'application/octet-stream',
          'content-length': String(stat.size),
        },
        body: stream,
        duplex: 'half',
        signal,
      } as never,
      0,
    );
  } catch (error) {
    if (error instanceof ApiError && error.code === 'timeout') {
      throw new ApiError('上传到网络位置超时，请检查地址与网络', 504, 'remote_timeout');
    }
    throw error;
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw statusError(response.status, '上传到网络位置');
  }
  await response.body?.cancel().catch(() => undefined);
}
