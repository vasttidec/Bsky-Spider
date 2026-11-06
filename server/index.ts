import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  AppSettings,
  BatchDownloadRequest,
  BatchDownloadResult,
  LoginRequest,
} from '../shared/types';
import {
  checkLoginRateLimit,
  login,
  logout,
  requireSession,
  resetLoginRateLimit,
  sessionUser,
  setSessionCookie,
} from './auth';
import { collectMedia, getAuthorFeed, getFollows, getProfile } from './bsky';
import {
  API_HOST,
  API_PORT,
  APP_NAME,
  APP_VERSION,
  DATA_DIR,
  IS_PRODUCTION,
  WEB_DIR,
} from './config';
import { detectSystemProxy } from './proxy';
import { isRemoteTarget } from './remote';
import { downloads } from './downloads';
import {
  assertDirectoryWritable,
  getSystemInfo,
  listDirectories,
  openInShell,
} from './fs';
import {
  addSearchHistory,
  clearSearchHistory,
  getSearchHistory,
  initHistory,
} from './history';
import { ApiError } from './http';
import { checkForUpdates } from './updates';
import {
  getMaxPosts,
  getMediaTypes,
  getSettings,
  initSettings,
  resetSettings,
  updateSettings,
} from './storage';

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

function wrap(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function validateDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : value;
}

function isMediaItems(value: unknown): boolean {
  return Array.isArray(value);
}

interface AutoLoginCredentials {
  identifier: string;
  password: string;
  pds?: string;
}

function readAutoLoginCredentials(): AutoLoginCredentials | null {
  const raw = process.env.BSKY_SPIDER_AUTO_LOGIN;
  // Remove the credential from the process environment as soon as it is read.
  delete process.env.BSKY_SPIDER_AUTO_LOGIN;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AutoLoginCredentials>;
    if (
      typeof parsed.identifier !== 'string' ||
      !parsed.identifier.trim() ||
      typeof parsed.password !== 'string' ||
      !parsed.password
    ) {
      return null;
    }
    return {
      identifier: parsed.identifier.trim().slice(0, 512),
      password: parsed.password.slice(0, 512),
      pds:
        typeof parsed.pds === 'string' && parsed.pds.trim()
          ? parsed.pds.trim().slice(0, 512)
          : undefined,
    };
  } catch {
    return null;
  }
}

let pendingAutoLogin = readAutoLoginCredentials();
let autoLoginAttempted = false;

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: APP_NAME, version: APP_VERSION });
});

app.get(
  '/api/system',
  wrap(async (_req, res) => {
    res.json(await getSystemInfo());
  }),
);

app.get(
  '/api/settings',
  wrap(async (_req, res) => {
    res.json(getSettings());
  }),
);

app.get(
  '/api/history',
  wrap(async (req, res) => {
    // Search history is scoped to the signed-in account.
    res.json({ history: await getSearchHistory(sessionUser(req)?.did) });
  }),
);

app.post(
  '/api/history',
  wrap(async (req, res) => {
    const handle = asString((req.body || {}).handle);
    res.json({
      history: await addSearchHistory(sessionUser(req)?.did, handle),
    });
  }),
);

app.delete(
  '/api/history',
  wrap(async (req, res) => {
    res.json({ history: await clearSearchHistory(sessionUser(req)?.did) });
  }),
);

app.put(
  '/api/settings',
  wrap(async (req, res) => {
    const body = (req.body || {}) as Partial<AppSettings>;
    if (typeof body.saveDir === 'string' && body.saveDir.trim()) {
      const target = body.saveDir.trim();
      // Network targets (WebDAV URLs) are validated by the download engine;
      // local folders and Windows UNC shares are checked for writability.
      if (!isRemoteTarget(target)) {
        await assertDirectoryWritable(path.resolve(target));
      }
    }
    const updated = await updateSettings(body);
    downloads.refreshScheduler();
    res.json(updated);
  }),
);

app.post(
  '/api/settings/reset',
  wrap(async (_req, res) => {
    const settings = await resetSettings();
    downloads.refreshScheduler();
    res.json(settings);
  }),
);

app.get(
  '/api/update/check',
  wrap(async (_req, res) => {
    res.json(await checkForUpdates());
  }),
);

app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const body = (req.body || {}) as LoginRequest;
    checkLoginRateLimit(req.ip || 'local');
    const { user, cookie } = await login(
      asString(body.identifier),
      asString(body.password),
      typeof body.pds === 'string' ? body.pds : undefined,
    );
    setSessionCookie(res, cookie);
    resetLoginRateLimit(req.ip || 'local');
    res.json({ user });
  }),
);

app.get(
  '/api/auth/session',
  wrap(async (req, res) => {
    let user = sessionUser(req);
    let autoLoginFailed = false;

    if (!user && pendingAutoLogin && !autoLoginAttempted) {
      autoLoginAttempted = true;
      const credentials = pendingAutoLogin;
      pendingAutoLogin = null;
      try {
        const result = await login(
          credentials.identifier,
          credentials.password,
          credentials.pds,
        );
        setSessionCookie(res, result.cookie);
        user = result.user;
        console.log(`[auth] 已自动登录：@${result.user.handle}`);
      } catch (error) {
        autoLoginFailed = true;
        console.warn(
          `[auth] 自动登录失败：${(error as Error)?.message || '未知错误'}`,
        );
      }
    }

    res.json({ user, ...(autoLoginFailed ? { autoLoginFailed: true } : {}) });
  }),
);

app.post(
  '/api/auth/logout',
  wrap(async (req, res) => {
    await logout(req, res);
    res.json({ ok: true });
  }),
);

app.get(
  '/api/bsky/profile',
  wrap(async (req, res) => {
    const session = requireSession(req);
    const actor = asString(req.query.actor);
    if (!actor) throw new ApiError('请输入用户 Handle', 400, 'invalid_actor');
    res.json(await getProfile(session, actor));
  }),
);

app.get(
  '/api/bsky/follows',
  wrap(async (req, res) => {
    const session = requireSession(req);
    const actor = asString(req.query.actor) || session.did;
    const cursor = asString(req.query.cursor) || undefined;
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 50, 1),
      100,
    );
    res.json(await getFollows(session, actor, cursor, limit));
  }),
);

app.get(
  '/api/bsky/feed',
  wrap(async (req, res) => {
    const session = requireSession(req);
    const actor = asString(req.query.actor);
    if (!actor) throw new ApiError('请输入用户 Handle', 400, 'invalid_actor');
    const cursor = asString(req.query.cursor) || undefined;
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 30, 1),
      100,
    );
    const media = asString(req.query.media);
    const mediaTypes =
      media === 'video'
        ? (['video'] as const)
        : media === 'image'
          ? (['image'] as const)
          : undefined;
    res.json(
      await getAuthorFeed(session, {
        actor,
        cursor,
        limit,
        mediaTypes: mediaTypes ? [...mediaTypes] : undefined,
      }),
    );
  }),
);

app.get('/api/tasks', (_req, res) => {
  res.json({
    tasks: downloads.getTasks(),
    counts: downloads.getCounts(),
    concurrency: getSettings().concurrency,
  });
});

app.post(
  '/api/download/batch',
  wrap(async (req, res) => {
    const session = requireSession(req);
    const body = (req.body || {}) as BatchDownloadRequest;
    const mediaTypes = getMediaTypes(body.mediaTypes);
    let items;
    let scannedPosts = 0;

    if (isMediaItems(body.items)) {
      items = body.items || [];
      const uniquePosts = new Set(items.map((item) => item?.postUri));
      scannedPosts = uniquePosts.size;
      if (items.length > 500) items = items.slice(0, 500);
    } else {
      const actor = asString(body.actor);
      if (!actor) throw new ApiError('请输入用户 Handle', 400, 'invalid_actor');
      const result = await collectMedia(session, {
        actor,
        mediaTypes,
        from: validateDate(body.from),
        to: validateDate(body.to),
        maxPosts: getMaxPosts(body.maxPosts, 300),
      });
      items = result.items;
      scannedPosts = result.scannedPosts;
    }

    const created = await downloads.createTasks(items);
    const payload: BatchDownloadResult = {
      added: created.added,
      skipped: created.skipped,
      scannedPosts,
      tasks: created.tasks,
    };
    res.json(payload);
  }),
);

app.post(
  '/api/tasks/batch',
  wrap(async (req, res) => {
    requireSession(req);
    const action = asString((req.body || {}).action);
    const allowed = [
      'pauseAll',
      'resumeAll',
      'retryErrors',
      'removeActive',
      'removeErrors',
      'removeCompleted',
      'removeFinished',
      'removeAll',
    ];
    if (!allowed.includes(action)) {
      throw new ApiError('未知的批量操作', 400, 'invalid_action');
    }
    await downloads.batch(action as never);
    res.json({
      tasks: downloads.getTasks(),
      counts: downloads.getCounts(),
    });
  }),
);

app.post(
  '/api/tasks/:id/pause',
  wrap(async (req, res) => {
    requireSession(req);
    res.json(await downloads.pause(req.params.id));
  }),
);

app.post(
  '/api/tasks/:id/resume',
  wrap(async (req, res) => {
    requireSession(req);
    res.json(await downloads.resume(req.params.id));
  }),
);

app.post(
  '/api/tasks/:id/retry',
  wrap(async (req, res) => {
    requireSession(req);
    res.json(await downloads.retry(req.params.id));
  }),
);

app.delete(
  '/api/tasks/:id',
  wrap(async (req, res) => {
    requireSession(req);
    await downloads.remove(req.params.id);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/tasks/:id/reveal',
  wrap(async (req, res) => {
    requireSession(req);
    await downloads.reveal(req.params.id);
    res.json({ ok: true });
  }),
);

app.post(
  '/api/tasks/:id/open',
  wrap(async (req, res) => {
    requireSession(req);
    await downloads.openFile(req.params.id);
    res.json({ ok: true });
  }),
);

app.get(
  '/api/fs/list',
  wrap(async (req, res) => {
    const target = asString(req.query.path);
    res.json(await listDirectories(target));
  }),
);

app.post(
  '/api/fs/open',
  wrap(async (req, res) => {
    const target = asString((req.body || {}).path);
    if (!target) throw new ApiError('路径不能为空', 400, 'invalid_path');
    try {
      await fs.promises.access(target);
    } catch {
      throw new ApiError('文件夹不存在', 404, 'folder_not_found');
    }
    openInShell(target, false);
    res.json({ ok: true });
  }),
);

app.post('/api/fs/open-data-dir', (_req, res) => {
  openInShell(DATA_DIR, false);
  res.json({ ok: true });
});

app.use('/api', (_req, res) => {
  res.status(404).json({
    error: { code: 'not_found', message: '接口不存在' },
  });
});

if (IS_PRODUCTION || fs.existsSync(path.join(WEB_DIR, 'index.html'))) {
  app.use(express.static(WEB_DIR, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(WEB_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('text/plain')
      .send('Bsky-Spider API is running. Start the Vite dev server on port 5178.');
  });
}

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    if (res.headersSent) return;
    if (error instanceof ApiError) {
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
      return;
    }
    if (
      (error as { type?: string })?.type === 'entity.parse.failed'
    ) {
      res.status(400).json({
        error: { code: 'invalid_json', message: '请求内容不是有效的 JSON' },
      });
      return;
    }
    console.error('[server] 未处理的错误：', error);
    res.status(500).json({
      error: { code: 'internal_error', message: '服务器内部错误' },
    });
  },
);

async function bootstrap(): Promise<void> {
  const autoDetectProxy = process.env.BSKY_SPIDER_AUTO_PROXY !== '0';
  const detectedProxy = autoDetectProxy
    ? await detectSystemProxy(true)
    : null;
  await initSettings({
    systemProxyDetected: detectedProxy
      ? Boolean(detectedProxy.url)
      : undefined,
  });
  await initHistory();
  await downloads.init();
  const server = app.listen(API_PORT, API_HOST, () => {
    const host = API_HOST === '0.0.0.0' ? '127.0.0.1' : API_HOST;
    const url = `http://${host}:${API_PORT}`;
    console.log('');
    console.log(`  ${APP_NAME} v${APP_VERSION}`);
    console.log(`  API:       ${url}`);
    console.log(
      `  Web UI:    ${
        IS_PRODUCTION ? url : 'http://127.0.0.1:5178'
      }`,
    );
    console.log('  本地下载 · App Password 登录 · 数据不会上传到第三方');
    console.log('');
    if (process.env.BSKY_SPIDER_OPEN === '1') {
      openBrowser(url);
    }
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `端口 ${API_PORT} 已被占用，请关闭占用该端口的程序，或设置 BSKY_SPIDER_PORT 使用其他端口。`,
      );
    } else {
      console.error('服务器启动失败：', error);
    }
    process.exitCode = 1;
  });

  const shutdown = async () => {
    await downloads.shutdown().catch(() => undefined);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

function openBrowser(url: string): void {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }
  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

bootstrap().catch((error) => {
  console.error('Bsky-Spider 启动失败：', error);
  process.exitCode = 1;
});
