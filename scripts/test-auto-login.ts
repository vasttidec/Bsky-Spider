import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const work = path.join(root, '.tmp', 'auto-login-test');
await fs.rm(work, { recursive: true, force: true });
await fs.mkdir(work, { recursive: true });

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
      if (
        data.identifier !== 'remembered.test' ||
        data.password !== 'remembered-app-password'
      ) {
        send(401, {
          error: 'AuthenticationRequired',
          message: 'Invalid identifier or password',
        });
        return;
      }
      send(200, {
        accessJwt: 'auto-access',
        refreshJwt: 'auto-refresh',
        did: 'did:plc:remembered',
        handle: 'remembered.test',
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
  if (url.pathname === '/xrpc/app.bsky.actor.getProfile') {
    send(200, {
      did: 'did:plc:remembered',
      handle: 'remembered.test',
      displayName: 'Remembered User',
    });
    return;
  }
  send(404, { error: 'NotFound', message: 'missing' });
});
await new Promise<void>((resolve) => mockPds.listen(5194, '127.0.0.1', resolve));

const dataDir = path.join(work, 'data');
const saveDir = path.join(work, 'downloads');
const credentials = JSON.stringify({
  identifier: 'remembered.test',
  password: 'remembered-app-password',
  pds: 'http://127.0.0.1:5194',
});

function startApp(port: number, withAutoLogin: boolean) {
  const child = spawn(process.execPath, ['dist/server/index.cjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      BSKY_SPIDER_PORT: String(port),
      BSKY_SPIDER_HOST: '127.0.0.1',
      BSKY_SPIDER_DATA_DIR: dataDir,
      BSKY_SPIDER_APPVIEW: 'http://127.0.0.1:5194',
      BSKY_SPIDER_PDS: 'http://127.0.0.1:5194',
      BSKY_SPIDER_AUTO_PROXY: '0',
      ...(withAutoLogin
        ? { BSKY_SPIDER_AUTO_LOGIN: credentials }
        : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => (logs += String(chunk)));
  child.stderr.on('data', (chunk) => (logs += String(chunk)));
  return { child, getLogs: () => logs };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForHealth(port: number) {
  for (let i = 0; i < 60; i += 1) {
    await sleep(150);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Still starting.
    }
  }
  throw new Error('server did not become healthy');
}

const first = startApp(5196, true);
try {
  await waitForHealth(5196);
  const sessionResponse = await fetch('http://127.0.0.1:5196/api/auth/session');
  const setCookie = sessionResponse.headers.get('set-cookie') || '';
  const session = await sessionResponse.json();
  if (session.user?.handle !== 'remembered.test') {
    throw new Error(`auto login failed: ${JSON.stringify(session)}\n${first.getLogs()}`);
  }
  if (!/HttpOnly/i.test(setCookie)) {
    throw new Error('auto login did not set an HttpOnly session cookie');
  }
  const cookie = setCookie.split(';')[0];
  const profileResponse = await fetch(
    'http://127.0.0.1:5196/api/bsky/profile?actor=remembered.test',
    { headers: { cookie } },
  );
  if (!profileResponse.ok) throw new Error('auto-login session cookie was not accepted');

  const settingsResponse = await fetch('http://127.0.0.1:5196/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      saveDir,
      theme: 'cyberpunk',
      language: 'en',
      proxyEnabled: true,
      proxyUseSystem: true,
      proxyUrl: '',
    }),
  });
  if (!settingsResponse.ok) {
    throw new Error(`settings save failed: ${await settingsResponse.text()}`);
  }
  const savedSettings = await settingsResponse.json();
  if (savedSettings.proxyEnabled !== true) {
    throw new Error('proxyEnabled was not saved');
  }
  if (savedSettings.theme !== 'cyberpunk') {
    throw new Error('theme was not saved');
  }
  if (savedSettings.language !== 'en') {
    throw new Error('language was not saved');
  }

  const historyResponse = await fetch('http://127.0.0.1:5196/api/history', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ handle: 'remembered.test' }),
  });
  const history = await historyResponse.json();
  if (!history.history?.includes('remembered.test')) {
    throw new Error('search history was not saved');
  }
  console.log('PASS: saved credentials auto-logged in and created a session');
} finally {
  first.child.kill();
  await sleep(800);
}

const second = startApp(5197, false);
try {
  await waitForHealth(5197);
  const response = await fetch('http://127.0.0.1:5197/api/settings');
  const settings = await response.json();
  if (settings.proxyEnabled !== true) {
    throw new Error('proxyEnabled was reset after restart');
  }
  if (settings.proxyUseSystem !== true) {
    throw new Error('proxyUseSystem was reset after restart');
  }
  if (settings.theme !== 'cyberpunk') {
    throw new Error('theme was reset after restart');
  }
  if (settings.language !== 'en') {
    throw new Error('language was reset after restart');
  }
  const historyResponse = await fetch('http://127.0.0.1:5197/api/history');
  const history = await historyResponse.json();
  if (!history.history?.includes('remembered.test')) {
    throw new Error('search history was lost after restart');
  }
  console.log('PASS: proxy, theme, language and search history persisted across server restart');
} finally {
  second.child.kill();
  mockPds.close();
}
