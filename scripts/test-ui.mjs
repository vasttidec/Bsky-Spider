import { chromium } from 'playwright-core';

const BASE = process.env.BSKY_SPIDER_URL || 'http://127.0.0.1:5189';
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const author = {
  did: 'did:plc:demo',
  handle: 'sky.studio',
  displayName: 'Sky Studio',
  avatar: 'https://cdn.bsky.app/avatar/demo.jpg',
};
const profile = {
  did: author.did,
  handle: author.handle,
  displayName: author.displayName,
  description: '收集云与光。',
  avatar: author.avatar,
  banner: 'https://cdn.bsky.app/banner/demo.jpg',
  followersCount: 1200,
  followsCount: 20,
  postsCount: 42,
  createdAt: '2024-03-18T08:00:00.000Z',
};
const user = { ...profile, pds: 'https://bsky.social' };
const feed = Array.from({ length: 4 }).map((_, index) => ({
  id: `post${index}-${index === 2 ? 'video' : 'img1'}`,
  kind: index === 2 ? 'video' : 'image',
  url:
    index === 2
      ? 'https://video.bsky.app/watch/demo/playlist.m3u8'
      : `https://cdn.bsky.app/full${index}.jpg`,
  thumbUrl:
    index === 2
      ? 'https://cdn.bsky.app/thumb-video.jpg'
      : `https://cdn.bsky.app/thumb${index}.jpg`,
  index: 1,
  postUri: `at://${author.did}/app.bsky.feed.post/post${index}`,
  postUrl: `https://bsky.app/profile/${author.handle}/post/post${index}`,
  postText: `测试帖子 ${index}`,
  createdAt: new Date(Date.now() - index * 3600_000).toISOString(),
  author,
}));
const task = {
  id: 'task-1',
  media: feed[0],
  status: 'downloading',
  progress: 42,
  downloadedBytes: 4200,
  totalBytes: 10000,
  speed: 1200,
  eta: 5,
  fileName: 'demo.jpg',
  relativePath: 'sky.studio/demo.jpg',
  skipped: false,
  createdAt: new Date().toISOString(),
};
let settings = {
  theme: 'system',
  language: 'system',
  saveDir: 'C:\\Users\\Aurora\\Pictures\\Bsky-Spider',
  folderTemplate: '%USER_HANDLE%',
  fileNameTemplate: '%POST_TIME%_%USER_HANDLE%_%MEDIA_ID%%EXT%',
  skipExisting: true,
  concurrency: 3,
  proxyEnabled: false,
  proxyUseSystem: true,
  proxyUrl: '',
  requestTimeout: 30,
  desktopNotifications: true,
};
const system = {
  version: '1.1.1',
  platform: 'win32 x64',
  nodeVersion: 'v24.21.0',
  homeDir: 'C:\\Users\\Aurora',
  downloadsDir: 'C:\\Users\\Aurora\\Downloads',
  dataDir: 'D:\\Bsky-Spider\\data',
  defaultSaveDir: 'C:\\Users\\Aurora\\Downloads\\Bsky-Spider',
  videoEngineName: '内置 MP4 合并引擎',
  videoEngineReady: true,
  appView: 'https://public.api.bsky.app',
  systemProxyUrl: 'http://127.0.0.1:7890',
  systemProxySource: 'windows',
  systemProxyNote: '',
};
let loginCount = 0;
let loginUserOverride = null;
let settingsPuts = [];
let searchHistory = ['sky.studio'];

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
});

async function mockContext({
  loggedIn,
  viewport,
  autoLoginFailed = false,
  locale = 'zh-CN',
}) {
  const context = await browser.newContext({
    viewport,
    locale,
    deviceScaleFactor: 1,
  });
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const p = url.pathname;
    let data;
    if (p === '/api/auth/session') {
      data = autoLoginFailed
        ? { user: null, autoLoginFailed: true }
        : { user: loggedIn ? user : null };
    }
    else if (p === '/api/auth/login') {
      loginCount += 1;
      data = { user: loginUserOverride || user };
    } else if (p === '/api/settings') {
      if (request.method() === 'PUT') {
        const patch = JSON.parse(request.postData() || '{}');
        settingsPuts.push(patch);
        settings = { ...settings, ...patch };
      }
      data = settings;
    } else if (p === '/api/history') {
      if (request.method() === 'POST') {
        const payload = JSON.parse(request.postData() || '{}');
        if (payload.handle) {
          searchHistory = [
            payload.handle,
            ...searchHistory.filter((item) => item !== payload.handle),
          ].slice(0, 12);
        }
      } else if (request.method() === 'DELETE') {
        searchHistory = [];
      }
      data = { history: searchHistory };
    } else if (p === '/api/system') data = system;
    else if (p === '/api/tasks') {
      data = {
        tasks: [task],
        counts: { downloading: 1, waiting: 0, paused: 0, error: 0, completed: 0 },
        concurrency: settings.concurrency,
      };
    } else if (p === '/api/bsky/profile') {
      const actor = url.searchParams.get('actor');
      data =
        actor === 'alice.test'
          ? { ...profile, handle: 'alice.test', displayName: 'Alice' }
          : profile;
    } else if (p === '/api/bsky/follows') {
      data = {
        follows: [
          {
            did: 'did:plc:alice',
            handle: 'alice.test',
            displayName: 'Alice',
            description: 'A follow from the test feed',
          },
        ],
        cursor: null,
      };
    } else if (p === '/api/bsky/feed') data = { items: feed, cursor: null };
    else if (p === '/api/tasks/task-1/pause') data = task;
    else data = { ok: true };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
  await context.route('**/cdn.bsky.app/**', async (route) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs><linearGradient id="g"><stop stop-color="#0b3d70"/><stop offset="1" stop-color="#3fa9f5"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="600" cy="150" r="70" fill="#ffe7a3"/><path d="M0 450 L200 280 L400 450 L600 340 L800 460 L800 600 L0 600Z" fill="#071a2b" opacity=".55"/></svg>`;
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  });
  return context;
}

const errors = [];
const context = await mockContext({
  loggedIn: false,
  viewport: { width: 1440, height: 960 },
});
await context.addInitScript(() => {
  window.__credentialSaves = [];
  window.__credentialClears = 0;
  window.__signOuts = 0;
  window.__activeAccount = 'sky.studio';
  window.__savedAccounts = [
    {
      identifier: 'sky.studio',
      handle: 'sky.studio',
      displayName: 'Sky Studio',
      saved: true,
    },
  ];
  window.bskyDesktop = {
    isDesktop: true,
    loadCredentials: async () => ({ ok: false }),
    saveCredentials: async (payload) => {
      window.__credentialSaves.push(payload);
      return { ok: true };
    },
    clearCredentials: async () => {
      window.__credentialClears += 1;
      return { ok: true };
    },
    signOutAccounts: async () => {
      window.__signOuts += 1;
      // Simulate a full sign-out: the current account is forgotten and no
      // other saved account is left.
      window.__savedAccounts = [];
      window.__activeAccount = null;
      return { ok: true, accounts: [], active: null };
    },
    listAccounts: async () => ({
      ok: true,
      active: window.__activeAccount,
      accounts: window.__savedAccounts,
    }),
  };
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

await page.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' });
await page.waitForSelector('.login-hero', { timeout: 10000 });
if ((await page.title()) !== 'Bsky-Spider') {
  throw new Error(`unexpected window title: ${await page.title()}`);
}
if ((await page.locator('.page-header p').count()) !== 0) {
  throw new Error('home page header descriptions were not removed');
}
await page.locator('.sidebar-login').click();
await page.waitForSelector('.ant-modal-content');
await page.locator('input#identifier').fill('sky.studio');
await page.locator('input#password').fill('abcd-efgh-ijkl-mnop');
await page.locator('.ant-modal-footer .ant-btn-primary').click();
await page.locator('.sidebar-logout').waitFor({ state: 'visible', timeout: 10000 });
if (loginCount !== 1) throw new Error('login API was not called');
const sidebarText = await page.locator('.sidebar-account').innerText();
if (!sidebarText.includes('sky.studio')) {
  throw new Error(`user not shown after login; sidebar=${JSON.stringify(sidebarText)}`);
}
await page.locator('.ant-modal-content').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
if (await page.locator('.ant-modal-content').isVisible().catch(() => false)) {
  throw new Error('login modal did not close');
}
await page.waitForTimeout(400);
const savedCredentials = await page.evaluate(() => window.__credentialSaves);
if (
  savedCredentials.length !== 1 ||
  savedCredentials[0].identifier !== 'sky.studio' ||
  savedCredentials[0].password !== 'abcd-efgh-ijkl-mnop'
) {
  throw new Error(`desktop credentials were not saved: ${JSON.stringify(savedCredentials)}`);
}
const messageNotice = page.locator('.ant-message-notice').first();
if ((await messageNotice.count()) > 0) {
  const messageBox = await messageNotice.boundingBox();
  if (
    !messageBox ||
    Math.abs(messageBox.x + messageBox.width / 2 - 720) > 4
  ) {
    throw new Error(`top message is not visually centered: ${JSON.stringify(messageBox)}`);
  }
}

// Signing in with the account that is already active must be rejected with a
// clear notice instead of a second login request.
await page.locator('.sidebar-accounts').click();
await page.waitForSelector('.ant-modal-content');
await page.getByRole('button', { name: '添加账号' }).click();
await page.waitForSelector('input#identifier', { timeout: 5000 });
await page.locator('input#identifier').fill('sky.studio');
await page.locator('input#password').fill('abcd-efgh-ijkl-mnop');
await page.locator('.ant-modal-footer .ant-btn-primary').click();
await page.waitForTimeout(600);
if (loginCount !== 1) {
  throw new Error(
    `already signed-in account triggered a new login: ${loginCount}`,
  );
}
const notices = await page.locator('.ant-message-notice').allInnerTexts();
if (!notices.some((entry) => entry.includes('当前账号已经登录'))) {
  throw new Error(`missing already-signed-in notice: ${JSON.stringify(notices)}`);
}
await page.locator('.ant-modal-close').last().click();
await page.waitForTimeout(400);

await page.locator('.search-bar button:has-text("我的关注")').click();
await page.waitForSelector('.follow-row', { timeout: 10000 });
await page.locator('.follow-row').first().click();
await page.waitForSelector('.media-card', { timeout: 10000 });
if ((await page.locator('.search-input-wrap input').inputValue()) !== 'alice.test') {
  throw new Error('selecting a follow did not search that user');
}
await page.getByText('搜索历史', { exact: true }).waitFor({ timeout: 5000 });
await page.setViewportSize({ width: 1000, height: 960 });
await page.waitForTimeout(250);
const historyLabelBox = await page
  .getByText('搜索历史', { exact: true })
  .boundingBox();
const clearButtonBox = await page
  .locator('.search-history > button:last-child')
  .boundingBox();
if (
  !historyLabelBox ||
  historyLabelBox.height > 22 ||
  !clearButtonBox ||
  clearButtonBox.height > 24
) {
  throw new Error(
    `search history labels wrapped: ${JSON.stringify({
      historyLabelBox,
      clearButtonBox,
    })}`,
  );
}
await page.setViewportSize({ width: 1440, height: 960 });
const cardCount = await page.locator('.media-card').count();
if (cardCount !== 4) throw new Error(`expected 4 media cards, got ${cardCount}`);

await page.locator('.media-card button[aria-label^="预览"]').first().click();
await page.waitForSelector('.preview-modal');
await page.locator('.preview-modal .ant-modal-close').click();
await page.waitForTimeout(300);

await page.locator('nav button', { hasText: '下载' }).first().click();
await page.waitForSelector('.download-item', { timeout: 10000 });
if ((await page.locator('.page-header p').count()) !== 0) {
  throw new Error('downloads page header description was not removed');
}
if ((await page.getByRole('button', { name: '打开文件夹' }).count()) !== 1) {
  throw new Error('downloads folder button was not renamed');
}
await page.getByRole('button', { name: /暂停/ }).first().click();
await page.waitForTimeout(300);

await page.getByRole('button', { name: '设置' }).click();
await page.waitForSelector('.settings-card', { timeout: 10000 });
if ((await page.locator('.page-header p').count()) !== 0) {
  throw new Error('settings page header descriptions were not removed');
}
const initialTheme = await page.evaluate(
  () => document.documentElement.dataset.theme,
);
if (initialTheme !== 'default') {
  throw new Error(`system theme should start light, got ${initialTheme}`);
}
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForFunction(
  () => document.documentElement.dataset.theme === 'dark',
  null,
  { timeout: 6000 },
);
await page.emulateMedia({ colorScheme: 'light' });
await page.waitForFunction(
  () => document.documentElement.dataset.theme === 'default',
  null,
  { timeout: 6000 },
);
const themeSelect = page.locator('.settings-card').first().locator('.ant-select').first();
await themeSelect.click();
const themeOptionTexts = await page
  .locator('.ant-select-item-option')
  .allInnerTexts();
if (
  themeOptionTexts[0] !== '跟随系统' ||
  themeOptionTexts[1] !== 'Bluesky'
) {
  throw new Error(`unexpected theme options: ${JSON.stringify(themeOptionTexts)}`);
}
await page.getByRole('option', { name: '赛博朋克' }).click();
await page.waitForFunction(
  () => document.documentElement.dataset.theme === 'cyberpunk',
  null,
  { timeout: 6000 },
);
if (!settingsPuts.some((put) => put.theme === 'cyberpunk')) {
  throw new Error('cyberpunk theme was not saved');
}
await themeSelect.click();
await page.getByRole('option', { name: 'Bluesky' }).click();
await page.waitForFunction(
  () => document.documentElement.dataset.theme === 'default',
  null,
  { timeout: 6000 },
);
const languageSelect = page
  .locator('.settings-card')
  .first()
  .locator('.ant-select')
  .nth(1);
await languageSelect.click();
const languageOptions = await page
  .locator('.ant-select-item-option')
  .allInnerTexts();
for (const label of [
  '简体中文 (zh-CN)',
  '繁体中文 (zh-TW)',
  '英语 (en-US)',
  '俄语 (ru-RU)',
]) {
  if (!languageOptions.includes(label)) {
    throw new Error(`missing language option: ${label}`);
  }
}
await page.getByRole('option', { name: '英语 (en-US)' }).click();
await page.waitForFunction(
  () => document.documentElement.lang === 'en',
  null,
  { timeout: 6000 },
);
if (!settingsPuts.some((put) => put.language === 'en')) {
  throw new Error('English language was not saved');
}
if ((await page.locator('.sidebar-label').first().innerText()) !== 'Home') {
  throw new Error('English UI labels were not applied');
}
if ((await page.title()) !== 'Bsky-Spider') {
  throw new Error('window title changed after language switch');
}
await languageSelect.click();
await page.getByRole('option', { name: 'Traditional Chinese (zh-TW)' }).click();
await page.waitForFunction(
  () => document.documentElement.lang === 'zh-TW',
  null,
  { timeout: 6000 },
);
if ((await page.locator('.sidebar-label').first().innerText()) !== '主頁') {
  throw new Error('Traditional Chinese UI labels were not applied');
}
await languageSelect.click();
await page.getByRole('option', { name: '俄文 (ru-RU)' }).click();
await page.waitForFunction(
  () => document.documentElement.lang === 'ru',
  null,
  { timeout: 6000 },
);
if (
  (await page.locator('.sidebar-label').first().innerText()) !== 'Главная'
) {
  throw new Error('Russian UI labels were not applied');
}
await languageSelect.click();
await page
  .getByRole('option', { name: 'Упрощённый китайский (zh-CN)' })
  .click();
await page.waitForFunction(
  () => document.documentElement.lang === 'zh-CN',
  null,
  { timeout: 6000 },
);
const concurrencyInput = page.locator('.settings-card .ant-input-number-input').first();
await concurrencyInput.fill('4');
await concurrencyInput.blur();
await page.waitForTimeout(1400);
if (!settingsPuts.some((put) => put.concurrency === 4)) {
  throw new Error(`settings PUT did not include concurrency 4: ${JSON.stringify(settingsPuts)}`);
}

const proxySwitch = page.getByRole('switch', { name: '启用代理' });
await proxySwitch.click();
await page.waitForTimeout(300);
if (!(await proxySwitch.isChecked())) {
  throw new Error('system proxy could not be enabled without a manual proxy URL');
}
const systemProxySwitch = page.getByRole('switch', { name: '使用系统代理' });
await systemProxySwitch.click();
await page.waitForTimeout(300);
const proxyInput = page.locator('input[aria-label="代理地址"]');
if (await proxyInput.isDisabled()) {
  throw new Error('manual proxy input remained disabled after turning off system proxy');
}
await proxyInput.fill('http://127.0.0.1:7890');
await page.waitForTimeout(1100);
if (!settingsPuts.some((put) => put.proxyUseSystem === false)) {
  throw new Error('proxy settings were not saved');
}

await page.getByRole('button', { name: '关于' }).click();
await page.waitForSelector('.about-hero', { timeout: 10000 });
if ((await page.locator('.page-header p').count()) !== 0) {
  throw new Error('about page header description was not removed');
}
const licenseHref = await page.locator('a[href="/LICENSE.txt"]').first().getAttribute('href');
if (licenseHref !== '/LICENSE.txt') throw new Error('license link missing');
const aboutText = await page.locator('body').innerText();
if (aboutText.includes('\u84dd\u5929')) {
  throw new Error('found legacy sky wording in the UI');
}
if (aboutText.includes('Bsky-Spider 保留 X-Spider')) {
  throw new Error('old About introduction was not replaced');
}
if (!aboutText.includes('一个在本地运行的开源 Bluesky 媒体下载器。')) {
  throw new Error('new About introduction is missing');
}
const aboutHeroText = await page.locator('.about-hero').innerText();
if (aboutHeroText.includes('一个在本地运行的开源 Bluesky 媒体下载器。')) {
  throw new Error('About hero introduction was not removed');
}
if (
  (await page
    .locator('a[href="https://github.com/vasttidec"]')
    .count()) !== 1
) {
  throw new Error('About author link is missing');
}

// Simulate a task finishing and verify the in-app toast is centered at the
// top of the window and disappears after ~2 seconds.
await page.waitForTimeout(1800);
task.status = 'completed';
task.progress = 100;
task.completedAt = new Date().toISOString();
await page.waitForSelector('.download-toast', { timeout: 6000 });
const toastBox = await page.locator('.download-toast').boundingBox();
if (
  !toastBox ||
  Math.abs(toastBox.x + toastBox.width / 2 - 720) > 4 ||
  toastBox.y > 40
) {
  throw new Error(`download toast is not at the top center: ${JSON.stringify(toastBox)}`);
}
const toastText = await page.locator('.download-toast').innerText();
if (!toastText.includes('下载完成')) {
  throw new Error(`unexpected download toast: ${toastText}`);
}
await page.waitForTimeout(2300);
if ((await page.locator('.download-toast').count()) !== 0) {
  throw new Error('download toast did not disappear after two seconds');
}

// The account manager is reachable from the sidebar while accounts exist.
const accountsButton = page.locator('.sidebar-accounts');
if ((await accountsButton.count()) !== 1) {
  throw new Error('account management entry is missing from the sidebar');
}
await accountsButton.click();
await page.waitForSelector('.ant-modal-content', { timeout: 5000 });
const accountsModalText = await page.locator('.ant-modal-content').innerText();
if (!accountsModalText.includes('账号管理')) {
  throw new Error(
    `unexpected account manager content: ${accountsModalText.slice(0, 80)}`,
  );
}
await page.locator('.ant-modal-close').last().click();
await page.waitForTimeout(300);

await page.locator('.sidebar-logout').click();
await page.waitForTimeout(500);
if ((await page.locator('.sidebar-accounts').count()) !== 0) {
  throw new Error('account manager must be hidden after a full sign-out');
}
if ((await page.locator('.sidebar-login').count()) !== 1) {
  throw new Error('login entry is missing after a full sign-out');
}
await page.waitForTimeout(400);
const clearCount = await page.evaluate(() => window.__credentialClears);
if (clearCount !== 0) {
  throw new Error(
    `logout must keep saved accounts for switching, cleared ${clearCount} times`,
  );
}
const signOutCount = await page.evaluate(() => window.__signOuts);
if (signOutCount !== 1) {
  throw new Error(`logout did not disable auto-login: ${signOutCount}`);
}


await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: '主页' }).click();
await page.waitForTimeout(500);
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth,
);
if (overflow > 2) throw new Error(`mobile horizontal overflow: ${overflow}px`);
await page.screenshot({ path: 'screenshots/mobile-home.png', fullPage: true });

await context.close();

// Logged-in mobile first-load screenshot.
const mobileContext = await mockContext({
  loggedIn: true,
  viewport: { width: 390, height: 844 },
});
const mobilePage = await mobileContext.newPage();
mobilePage.on('pageerror', (error) => errors.push(`mobile pageerror: ${error.message}`));
await mobilePage.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' });
const mobileSearch = mobilePage.locator('.search-input-wrap input');
await mobileSearch.fill('sky.studio');
await mobileSearch.press('Enter');
await mobilePage.waitForSelector('.media-card', { timeout: 10000 });
await mobilePage.screenshot({ path: 'screenshots/mobile-home.png', fullPage: true });

for (const [route, selector] of [
  ['downloads', '.download-panel'],
  ['settings', '.settings-card'],
  ['about', '.about-hero'],
]) {
  await mobilePage.goto(`${BASE}/#/${route}`, { waitUntil: 'networkidle' });
  await mobilePage.waitForSelector(selector, { timeout: 10000 });
  await mobilePage.waitForTimeout(300);
  const routeOverflow = await mobilePage.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (routeOverflow > 2) {
    throw new Error(`mobile ${route} horizontal overflow: ${routeOverflow}px`);
  }
  if (route === 'settings') {
    await mobilePage.screenshot({ path: 'screenshots/mobile-settings.png', fullPage: true });
  }
}
await mobileContext.close();
// Signing out with another saved account must switch to it automatically.
const switchContext = await mockContext({
  loggedIn: true,
  viewport: { width: 1440, height: 960 },
});
await switchContext.addInitScript(() => {
  window.__signOuts = 0;
  window.__activeAccount = 'sky.studio';
  window.__savedAccounts = [
    {
      identifier: 'sky.studio',
      handle: 'sky.studio',
      displayName: 'Sky Studio',
      saved: true,
    },
    {
      identifier: 'alice.bsky.social',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      saved: true,
    },
  ];
  window.bskyDesktop = {
    isDesktop: true,
    loadCredentials: async () => ({ ok: false }),
    saveCredentials: async () => ({ ok: true }),
    clearCredentials: async () => ({ ok: true }),
    signOutAccounts: async () => {
      window.__signOuts += 1;
      window.__savedAccounts = window.__savedAccounts.filter(
        (account) => account.identifier !== window.__activeAccount,
      );
      window.__activeAccount = window.__savedAccounts[0]?.identifier ?? null;
      return {
        ok: true,
        active: window.__activeAccount,
        accounts: window.__savedAccounts,
        credentials: window.__activeAccount
          ? { identifier: 'alice.bsky.social', password: 'alice-app-password' }
          : undefined,
      };
    },
    listAccounts: async () => ({
      ok: true,
      active: window.__activeAccount,
      accounts: window.__savedAccounts,
    }),
  };
});
loginUserOverride = { ...user, handle: 'alice.bsky.social', displayName: 'Alice' };
const switchPage = await switchContext.newPage();
await switchPage.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' });
await switchPage.locator('.sidebar-logout').click();
await switchPage.waitForTimeout(900);
const switchedSidebar = await switchPage.locator('.sidebar-account').innerText();
if (!switchedSidebar.includes('alice.bsky.social')) {
  throw new Error(
    `logout did not switch to the other saved account: ${switchedSidebar}`,
  );
}
const remainingAccounts = await switchPage.evaluate(
  () => window.__savedAccounts.length,
);
if (remainingAccounts !== 1) {
  throw new Error(`signing out kept the wrong accounts: ${remainingAccounts}`);
}
loginUserOverride = null;
await switchContext.close();


const failedAutoLoginContext = await mockContext({
  loggedIn: false,
  viewport: { width: 1440, height: 960 },
  autoLoginFailed: true,
});
await failedAutoLoginContext.addInitScript(() => {
  window.__credentialClears = 0;
  window.bskyDesktop = {
    isDesktop: true,
    loadCredentials: async () => ({
      ok: true,
      credentials: {
        identifier: 'remembered.test',
        password: 'remembered-app-password',
      },
    }),
    saveCredentials: async () => ({ ok: true }),
    clearCredentials: async () => {
      window.__credentialClears += 1;
      return { ok: true };
    },
  };
});
const failedPage = await failedAutoLoginContext.newPage();
await failedPage.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' });
await failedPage.waitForSelector('.ant-modal-content', { timeout: 10000 });
const failedText = await failedPage.locator('.ant-modal-content').innerText();
if (!failedText.includes('自动登录凭据已失效')) {
  throw new Error('auto-login failure did not open the login modal with an explanation');
}
const prefilledIdentifier = await failedPage.locator('#identifier').inputValue();
const prefilledPassword = await failedPage.locator('#password').inputValue();
if (
  prefilledIdentifier !== 'remembered.test' ||
  prefilledPassword !== 'remembered-app-password'
) {
  throw new Error(
    `saved credentials were not prefilled: ${JSON.stringify({
      prefilledIdentifier,
      prefilledPassword,
    })}`,
  );
}
const rememberCheckbox = failedPage.getByRole('checkbox', {
  name: '记住登录凭证',
});
if (!(await rememberCheckbox.isChecked())) {
  throw new Error('remember-credentials checkbox should be checked by default');
}
await failedPage.evaluate(() => {
  window.dispatchEvent(new Event('bsky-spider:credentials-cleared'));
});
await failedPage.waitForTimeout(150);
if (
  (await failedPage.locator('#identifier').inputValue()) !== '' ||
  (await failedPage.locator('#password').inputValue()) !== ''
) {
  throw new Error('clearing saved credentials did not reset the login fields');
}
if (await rememberCheckbox.isChecked()) {
  throw new Error('clearing saved credentials did not clear the remember option');
}
// With "remember" disabled, a successful login must remove saved credentials.
await failedPage.locator('#identifier').fill('remembered.test');
await failedPage.locator('#password').fill('remembered-app-password');
await failedPage.locator('.ant-modal-footer .ant-btn-primary').click();
await failedPage.waitForTimeout(800);
const clearsAfterLogin = await failedPage.evaluate(
  () => window.__credentialClears,
);
if (clearsAfterLogin !== 1) {
  throw new Error(
    `logging in without remember did not clear saved credentials: ${clearsAfterLogin}`,
  );
}
await failedAutoLoginContext.close();

settings.language = 'system';
for (const [locale, expectedLang, expectedNav] of [
  ['zh-TW', 'zh-TW', '主頁'],
  ['ru-RU', 'ru', 'Главная'],
]) {
  const localeContext = await mockContext({
    loggedIn: true,
    viewport: { width: 1440, height: 960 },
    locale,
  });
  const localePage = await localeContext.newPage();
  await localePage.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' });
  await localePage.waitForSelector('.search-zone', { timeout: 10000 });
  const detectedLang = await localePage.evaluate(
    () => document.documentElement.lang,
  );
  if (detectedLang !== expectedLang) {
    throw new Error(
      `system language ${locale} resolved to ${detectedLang}, expected ${expectedLang}`,
    );
  }
  const navText = await localePage.locator('.sidebar-label').first().innerText();
  if (navText !== expectedNav) {
    throw new Error(
      `system language ${locale} did not render localized navigation: ${navText}`,
    );
  }
  await localeContext.close();
}

const unsupportedLocaleContext = await mockContext({
  loggedIn: true,
  viewport: { width: 1440, height: 960 },
  locale: 'fr-FR',
});
const unsupportedLocalePage = await unsupportedLocaleContext.newPage();
await unsupportedLocalePage.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' });
await unsupportedLocalePage.waitForSelector('.search-zone', { timeout: 10000 });
const fallbackLanguage = await unsupportedLocalePage.evaluate(
  () => document.documentElement.lang,
);
if (fallbackLanguage !== 'en') {
  throw new Error(
    `unsupported system language should fall back to English, got ${fallbackLanguage}`,
  );
}
await unsupportedLocaleContext.close();

await browser.close();
if (errors.length > 0) {
  console.log('UI ERRORS:');
  for (const error of errors) console.log(' -', error);
  process.exitCode = 1;
} else {
  console.log('PASS: login flow, search, preview, downloads, settings save, about, mobile layout');
}
