import { _electron as electron } from 'playwright-core';
import path from 'node:path';

const exe = path.resolve('release/win-unpacked/Bsky-Spider.exe');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: exe,
  args: ['--no-sandbox'],
  env,
  timeout: 60000,
});

const findAppPage = async () => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      const url = page.url();
      if (url.startsWith('http://127.0.0.1:')) return { page, url };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('desktop app window did not load');
};

const { page, url } = await findAppPage();
await page.waitForSelector('.login-hero', { timeout: 20000 });
const title = await page.title();
const health = await page.evaluate(async () => {
  const response = await fetch('/api/health');
  return response.json();
});
if (title !== 'Bsky-Spider · Bluesky 媒体下载器') {
  throw new Error(`unexpected title: ${title}`);
}
if (!health.ok || health.name !== 'Bsky-Spider') {
  throw new Error(`unexpected health: ${JSON.stringify(health)}`);
}
await page.screenshot({
  path: 'screenshots/desktop-exe.png',
  fullPage: false,
});
console.log(JSON.stringify({ title, url, health }, null, 2));

const port = new URL(url).port;
await app.close();
await new Promise((resolve) => setTimeout(resolve, 1200));
let serverAlive = false;
try {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  serverAlive = response.ok;
} catch {
  serverAlive = false;
}
if (serverAlive) {
  throw new Error('local server was not stopped with the desktop app');
}
console.log('PASS: packaged Electron app launched, served UI and shut down its local server');
