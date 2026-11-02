import type {
  AppSettings,
  BatchDownloadRequest,
  BatchDownloadResult,
  DirectoryListing,
  DownloadTask,
  FeedPage,
  FollowsResponse,
  LoginRequest,
  SearchHistoryResponse,
  SessionResponse,
  SystemInfo,
  TaskBatchAction,
  TaskCounts,
  UpdateCheckResult,
} from '../shared/types';
import type { BskyProfile } from '../shared/types';
import { translate, translateError } from './i18n';

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 500, code = 'request_failed') {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new ApiRequestError(
      '无法连接到本地服务，请确认 Bsky-Spider 服务正在运行。',
      0,
      'network_error',
    );
  }

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
    const body = data as {
      error?: { message?: string; code?: string };
    } | null;
    if (response.status === 401 && !path.includes('/api/auth/login')) {
      window.dispatchEvent(new Event('bsky-spider:unauthorized'));
    }
    throw new ApiRequestError(
      body?.error?.message || `请求失败（HTTP ${response.status}）`,
      response.status,
      body?.error?.code || 'request_failed',
    );
  }

  return data as T;
}

function jsonBody(value: unknown): BodyInit {
  return JSON.stringify(value);
}

export const api = {
  session: () => request<SessionResponse>('/api/auth/session'),
  login: (payload: LoginRequest) =>
    request<{ user: SessionResponse['user'] }>('/api/auth/login', {
      method: 'POST',
      body: jsonBody(payload),
    }),
  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  getSearchHistory: () =>
    request<SearchHistoryResponse>('/api/history'),
  addSearchHistory: (handle: string) =>
    request<SearchHistoryResponse>('/api/history', {
      method: 'POST',
      body: jsonBody({ handle }),
    }),
  clearSearchHistory: () =>
    request<SearchHistoryResponse>('/api/history', {
      method: 'DELETE',
    }),

  getSettings: () => request<AppSettings>('/api/settings'),
  saveSettings: (patch: Partial<AppSettings>) =>
    request<AppSettings>('/api/settings', {
      method: 'PUT',
      body: jsonBody(patch),
    }),
  resetSettings: () =>
    request<AppSettings>('/api/settings/reset', { method: 'POST' }),

  getSystem: () => request<SystemInfo>('/api/system'),
  checkForUpdates: () => request<UpdateCheckResult>('/api/update/check'),

  getProfile: (actor: string) =>
    request<BskyProfile>(
      `/api/bsky/profile?actor=${encodeURIComponent(actor)}`,
    ),
  getFeed: (actor: string, cursor?: string | null, media?: string) => {
    const params = new URLSearchParams({ actor });
    if (cursor) params.set('cursor', cursor);
    if (media) params.set('media', media);
    return request<FeedPage>(`/api/bsky/feed?${params.toString()}`);
  },
  getFollows: (actor: string, cursor?: string | null, limit = 50) => {
    const params = new URLSearchParams({ actor, limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return request<FollowsResponse>(
      `/api/bsky/follows?${params.toString()}`,
    );
  },

  batchDownload: (payload: BatchDownloadRequest) =>
    request<BatchDownloadResult>('/api/download/batch', {
      method: 'POST',
      body: jsonBody(payload),
    }),

  getTasks: () =>
    request<{
      tasks: DownloadTask[];
      counts: TaskCounts;
      concurrency: number;
    }>('/api/tasks'),
  taskAction: (
    id: string,
    action: 'pause' | 'resume' | 'retry' | 'reveal' | 'open',
  ) =>
    request<DownloadTask | { ok: boolean }>(`/api/tasks/${id}/${action}`, {
      method: 'POST',
    }),
  removeTask: (id: string) =>
    request<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  batchTasks: (action: TaskBatchAction) =>
    request<{ tasks: DownloadTask[]; counts: TaskCounts }>(
      '/api/tasks/batch',
      {
        method: 'POST',
        body: jsonBody({ action }),
      },
    ),

  listDirectories: (target: string) =>
    request<DirectoryListing>(
      `/api/fs/list?path=${encodeURIComponent(target)}`,
    ),
  openFolder: (target: string) =>
    request<{ ok: boolean }>('/api/fs/open', {
      method: 'POST',
      body: jsonBody({ path: target }),
    }),
  openDataDir: () =>
    request<{ ok: boolean }>('/api/fs/open-data-dir', { method: 'POST' }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return translateError(error.message);
  return translate('发生未知错误');
}
