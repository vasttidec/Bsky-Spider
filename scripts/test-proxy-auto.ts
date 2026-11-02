import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { detectSystemProxy } from '../server/proxy';

const root = process.cwd();
const work = path.join(root, '.tmp', 'proxy-auto-test');
await fs.rm(work, { recursive: true, force: true });
await fs.mkdir(work, { recursive: true });

const systemProxy = await detectSystemProxy(true);
if (!systemProxy.url) {
  console.log('SKIP: no system proxy detected');
  process.exit(0);
}

const dataDir = path.join(work, 'data');
const port = 5198;

function startApp() {
  const child = spawn(process.execPath, ['dist/server/index.cjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      BSKY_SPIDER_PORT: String(port),
      BSKY_SPIDER_HOST: '127.0.0.1',
      BSKY_SPIDER_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => (logs += String(chunk)));
  child.stderr.on('data', (chunk) => (logs += String(chunk)));
  return { child, getLogs: () => logs };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForHealth() {
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

const first = startApp();
try {
  await waitForHealth();
  const response = await fetch(`http://127.0.0.1:${port}/api/settings`);
  const settings = await response.json();
  if (settings.proxyEnabled !== true || settings.proxyChoiceMade !== false) {
    throw new Error(
      `system proxy was not enabled by default: ${JSON.stringify(settings)}`,
    );
  }
  const disabledResponse = await fetch(
    `http://127.0.0.1:${port}/api/settings`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proxyEnabled: false,
        proxyUseSystem: true,
        proxyUrl: '',
      }),
    },
  );
  if (!disabledResponse.ok) {
    throw new Error(`failed to disable proxy: ${await disabledResponse.text()}`);
  }
  console.log('PASS: system proxy detected and auto-enabled');
} finally {
  first.child.kill();
  await sleep(800);
}

const second = startApp();
try {
  await waitForHealth();
  const response = await fetch(`http://127.0.0.1:${port}/api/settings`);
  const settings = await response.json();
  if (settings.proxyEnabled !== false || settings.proxyChoiceMade !== true) {
    throw new Error(
      `explicit proxy disable was not preserved: ${JSON.stringify(settings)}`,
    );
  }
  console.log('PASS: explicit proxy choice persisted after restart');
} finally {
  second.child.kill();
}
