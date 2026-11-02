import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const work = path.join(root, '.tmp', 'server-auth-test');
await fs.rm(work, { recursive: true, force: true });
await fs.mkdir(work, { recursive: true });

let deleteSessionCalled = false;
const mockPds = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (
    req.method === 'POST' &&
    url.pathname === '/xrpc/com.atproto.server.createSession'
  ) {
    let body = '';
    req.on('data', (chunk) => {
      body += String(chunk);
    });
    req.on('end', () => {
      const data = JSON.parse(body || '{}');
      if (data.identifier !== 'alice.test' || data.password !== 'app-password') {
        send(401, {
          error: 'AuthenticationRequired',
          message: 'Invalid identifier or password',
        });
        return;
      }
      send(200, {
        accessJwt: 'access-token',
        refreshJwt: 'refresh-token',
        did: 'did:plc:alice',
        handle: 'alice.test',
        didDoc: {
          service: [
            {
              id: '#atproto_pds',
              type: 'AtprotoPersonalDataServer',
              serviceEndpoint: 'http://127.0.0.1:5194',
            },
          ],
        },
      });
    });
    return;
  }
  if (
    req.method === 'POST' &&
    url.pathname === '/xrpc/com.atproto.server.deleteSession'
  ) {
    deleteSessionCalled = true;
    send(200, {});
    return;
  }
  if (url.pathname === '/xrpc/app.bsky.actor.getProfile') {
    send(200, {
      did: 'did:plc:alice',
      handle: 'alice.test',
      displayName: 'Alice',
      followersCount: 10,
      followsCount: 2,
      postsCount: 3,
    });
    return;
  }
  if (url.pathname === '/xrpc/app.bsky.feed.getAuthorFeed') {
    send(200, { feed: [], cursor: null });
    return;
  }
  if (url.pathname === '/image.png') {
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0kAAAAASUVORK5CYII=',
      'base64',
    );
    res.writeHead(200, {
      'content-type': 'image/png',
      'content-length': bytes.length,
    });
    res.end(bytes);
    return;
  }
  send(404, { error: 'NotFound', message: 'missing' });
});
await new Promise<void>((resolve) => mockPds.listen(5194, '127.0.0.1', resolve));

const child = spawn(process.execPath, ['dist/server/index.cjs'], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    BSKY_SPIDER_PORT: '5195',
    BSKY_SPIDER_HOST: '127.0.0.1',
    BSKY_SPIDER_PDS: 'http://127.0.0.1:5194',
    BSKY_SPIDER_APPVIEW: 'http://127.0.0.1:5194',
    BSKY_SPIDER_DATA_DIR: path.join(work, 'data'),
    BSKY_SPIDER_AUTO_PROXY: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', (chunk) => {
  logs += String(chunk);
});
child.stderr.on('data', (chunk) => {
  logs += String(chunk);
});

const base = 'http://127.0.0.1:5195';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let ready = false;
for (let i = 0; i < 50; i += 1) {
  await sleep(200);
  try {
    const response = await fetch(`${base}/api/health`);
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    // Server is still starting.
  }
}
if (!ready) {
  child.kill();
  mockPds.close();
  throw new Error(`server did not start: ${logs}`);
}

try {
  const badLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: 'alice.test', password: 'wrong' }),
  });
  if (badLogin.status !== 401) {
    throw new Error(`bad login expected 401, got ${badLogin.status}`);
  }

  const loginResponse = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identifier: 'alice.test',
      password: 'app-password',
    }),
  });
  if (!loginResponse.ok) {
    throw new Error(`login failed: ${loginResponse.status} ${await loginResponse.text()}`);
  }
  const login = await loginResponse.json();
  if (login.user.handle !== 'alice.test') throw new Error('login user mismatch');
  const setCookie = loginResponse.headers.get('set-cookie') || '';
  if (!/HttpOnly/i.test(setCookie) || !/SameSite=Lax/i.test(setCookie)) {
    throw new Error(`cookie flags missing: ${setCookie}`);
  }
  const cookie = setCookie.split(';')[0];

  const sessionResponse = await fetch(`${base}/api/auth/session`, {
    headers: { cookie },
  });
  const session = await sessionResponse.json();
  if (session.user?.handle !== 'alice.test') throw new Error('session cookie was not accepted');

  const profileResponse = await fetch(
    `${base}/api/bsky/profile?actor=alice.test`,
    { headers: { cookie } },
  );
  if (!profileResponse.ok) throw new Error('authenticated profile failed');
  const profile = await profileResponse.json();
  if (profile.displayName !== 'Alice') throw new Error('profile mismatch');

  const feedResponse = await fetch(`${base}/api/bsky/feed?actor=alice.test`, {
    headers: { cookie },
  });
  if (!feedResponse.ok) throw new Error('authenticated feed failed');

  const settingsResponse = await fetch(`${base}/api/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      saveDir: path.join(work, 'downloads'),
      folderTemplate: '',
      fileNameTemplate: 'api_%MEDIA_ID%%EXT%',
      skipExisting: false,
      concurrency: 2,
    }),
  });
  if (!settingsResponse.ok) throw new Error('settings update failed');

  const media = {
    id: 'api-img1',
    kind: 'image',
    url: 'http://127.0.0.1:5194/image.png',
    thumbUrl: 'http://127.0.0.1:5194/image.png',
    index: 1,
    postUri: 'at://did:plc:alice/app.bsky.feed.post/api',
    postUrl: 'https://bsky.app/profile/alice.test/post/api',
    postText: 'api test',
    createdAt: new Date().toISOString(),
    author: {
      did: 'did:plc:alice',
      handle: 'alice.test',
      displayName: 'Alice',
    },
  };
  const batchResponse = await fetch(`${base}/api/download/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ actor: 'alice.test', mediaTypes: ['image'], items: [media] }),
  });
  if (!batchResponse.ok) {
    throw new Error(`batch download failed: ${await batchResponse.text()}`);
  }
  const batch = await batchResponse.json();
  if (batch.added !== 1) throw new Error('batch did not add a task');

  let completed = null;
  for (let i = 0; i < 60; i += 1) {
    await sleep(150);
    const tasksResponse = await fetch(`${base}/api/tasks`, {
      headers: { cookie },
    });
    const data = await tasksResponse.json();
    const task = data.tasks.find((item: { id: string }) => item.id === batch.tasks[0].id);
    if (task?.status === 'completed') {
      completed = task;
      break;
    }
    if (task?.status === 'error') {
      throw new Error(`download task failed: ${task.error}`);
    }
  }
  if (!completed) throw new Error('download task did not complete');
  const downloaded = await fs.stat(completed.filePath);
  if (downloaded.size === 0) throw new Error('downloaded file is empty');

  const unauthResponse = await fetch(`${base}/api/bsky/profile?actor=alice.test`);
  if (unauthResponse.status !== 401) {
    throw new Error(`unauthenticated profile expected 401, got ${unauthResponse.status}`);
  }

  const logoutResponse = await fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: { cookie },
  });
  if (!logoutResponse.ok) throw new Error('logout failed');
  if (!deleteSessionCalled) throw new Error('remote deleteSession was not called');

  const afterLogout = await fetch(`${base}/api/auth/session`, {
    headers: { cookie },
  });
  const after = await afterLogout.json();
  if (after.user !== null) throw new Error('session still active after logout');

  const tasksResponse = await fetch(`${base}/api/tasks`);
  if (!tasksResponse.ok) throw new Error('tasks endpoint failed');

  console.log('PASS: HTTP login cookie, session, profile, feed, batch download, auth guard and logout');
} finally {
  child.kill();
  mockPds.close();
}
