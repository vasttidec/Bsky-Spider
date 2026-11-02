import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BSKY_SPIDER_URL || 'http://127.0.0.1:5189';
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.resolve('screenshots');
const THEME = process.env.BSKY_SPIDER_THEME || 'system';
const SUFFIX = process.env.BSKY_SPIDER_SHOT_SUFFIX || '';
const shot = (name) => path.join(OUT, `${name}${SUFFIX}.png`);
await fs.mkdir(OUT, { recursive: true });

const now = Date.now();
const author = {
  did: 'did:plc:skystudio',
  handle: 'sky.studio',
  displayName: 'Sky Studio',
  avatar: 'https://cdn.bsky.app/img/avatar/plain/demo/aurora@jpeg?seed=2',
};

const profile = {
  did: author.did,
  handle: author.handle,
  displayName: author.displayName,
  description:
    '收集云、光与远处的山。A small studio chasing the open sky. 摄影 / 设计 / 偶尔写字。',
  avatar: author.avatar,
  banner: 'https://cdn.bsky.app/img/banner/plain/demo/banner@jpeg?seed=banner',
  followersCount: 12840,
  followsCount: 321,
  postsCount: 487,
  createdAt: '2024-03-18T08:00:00.000Z',
};

const palette = [
  ['#0b3d70', '#3fa9f5', '#f9d976'],
  ['#12263f', '#5b8fb9', '#d9e4f5'],
  ['#231942', '#9f86c0', '#e0b1cb'],
  ['#053b3f', '#2a9d8f', '#e9c46a'],
  ['#3d1f1a', '#e76f51', '#f4a261'],
  ['#102a43', '#627d98', '#d9e2ec'],
  ['#1b263b', '#778da9', '#e0e1dd'],
  ['#2d1e2f', '#b56576', '#eaac8b'],
];

function artSvg(seed, label, w = 900, h = 700) {
  const [a, b, c] = palette[seed % palette.length];
  const sunX = 160 + ((seed * 73) % 500);
  const sunY = 120 + ((seed * 41) % 180);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop stop-color="${c}" stop-opacity="1"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  <circle cx="${sunX}" cy="${sunY}" r="120" fill="url(#sun)"/>
  <circle cx="${sunX}" cy="${sunY}" r="52" fill="${c}" opacity=".9"/>
  <path d="M0 ${h * 0.68} L${w * 0.22} ${h * 0.42} L${w * 0.42} ${h * 0.66} L${w * 0.62} ${h * 0.48} L${w} ${h * 0.72} L${w} ${h} L0 ${h}Z" fill="${a}" opacity=".62"/>
  <path d="M0 ${h * 0.82} L${w * 0.3} ${h * 0.58} L${w * 0.58} ${h * 0.82} L${w * 0.8} ${h * 0.68} L${w} ${h * 0.84} L${w} ${h} L0 ${h}Z" fill="#071a2b" opacity=".56"/>
  <g fill="#fff" opacity=".72">
    <ellipse cx="${w * 0.28}" cy="${h * 0.25}" rx="100" ry="20"/>
    <ellipse cx="${w * 0.38}" cy="${h * 0.2}" rx="70" ry="16"/>
    <ellipse cx="${w * 0.75}" cy="${h * 0.34}" rx="120" ry="18" opacity=".55"/>
  </g>
  <text x="${w - 32}" y="${h - 28}" fill="#fff" opacity=".7" font-family="Arial, sans-serif" font-size="18" text-anchor="end">${label}</text>
</svg>`;
}

function avatarSvg(seed) {
  const [a, b, c] = palette[seed % palette.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="145" cy="50" r="34" fill="${c}" opacity=".8"/><path d="M0 160 Q60 110 120 150 T200 140 V200 H0Z" fill="${a}" opacity=".65"/><text x="100" y="120" fill="#fff" font-family="Arial, sans-serif" font-size="58" font-weight="700" text-anchor="middle">蓝</text></svg>`;
}

function bannerSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="360"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0759d8"/><stop offset=".55" stop-color="#2c9dff"/><stop offset="1" stop-color="#8fe3ff"/></linearGradient></defs><rect width="1200" height="360" fill="url(#s)"/><circle cx="960" cy="110" r="60" fill="#fff" opacity=".72"/><circle cx="960" cy="110" r="108" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width="2"/><g fill="#fff" opacity=".45"><ellipse cx="290" cy="250" rx="170" ry="30"/><ellipse cx="420" cy="270" rx="120" ry="24"/><ellipse cx="760" cy="210" rx="150" ry="26"/></g></svg>`;
}

const feed = Array.from({ length: 12 }).map((_, i) => {
  const kind = i === 2 || i === 7 || i === 10 ? 'video' : 'image';
  const id = `3l5demo${100 + i}`;
  return {
    id: `${id}-${kind === 'video' ? 'video' : `img1`}`,
    kind,
    url:
      kind === 'video'
        ? 'https://video.bsky.app/watch/did:plc:demo/bafyvideo/playlist.m3u8?seed=' + i
        : `https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:demo/bafy${i}@jpeg?seed=${i}`,
    thumbUrl:
      kind === 'video'
        ? `https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:demo/video${i}@jpeg?seed=${i}`
        : `https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:demo/bafy${i}@jpeg?seed=${i}`,
    alt: ['傍晚的云层', '山脊上的光', '风从海面吹来'][i % 3],
    index: 1,
    postUri: `at://${author.did}/app.bsky.feed.post/${id}`,
    postUrl: `https://bsky.app/profile/${author.handle}/post/${id}`,
    postText:
      i % 4 === 0
        ? '今天的云跑得很快，像一群要去远方的鸟。'
        : i % 4 === 1
          ? '把傍晚最后一束光留在这里。'
          : i % 4 === 2
            ? '一些关于蓝色和山的练习。'
            : '周末的光线总是更慢一点。',
    createdAt: new Date(now - i * 36e5 * 11).toISOString(),
    author,
  };
});

function task(overrides) {
  return {
    id: crypto.randomUUID(),
    media: feed[0],
    status: 'waiting',
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speed: 0,
    eta: null,
    fileName: '2026-10-27_18-30-12_sky.studio_3l5demo100.jpg',
    relativePath: 'sky.studio\\2026-10-27_18-30-12_sky.studio_3l5demo100.jpg',
    filePath:
      'C:\\Users\\Aurora\\Pictures\\Bsky-Spider\\sky.studio\\2026-10-27_18-30-12_sky.studio_3l5demo100.jpg',
    skipped: false,
    createdAt: new Date(now - 90000).toISOString(),
    completedAt: new Date(now - 30000).toISOString(),
    ...overrides,
  };
}

const tasks = [
  task({
    media: feed[2],
    status: 'downloading',
    progress: 42.6,
    downloadedBytes: 5_662_310,
    totalBytes: 13_287_000,
    speed: 1_860_000,
    eta: 4,
    detail: '视频分段 18/43',
    fileName: '2026-10-27_21-12-08_sky.studio_3l5demo102.mp4',
    relativePath: 'sky.studio\\2026-10-27_21-12-08_sky.studio_3l5demo102.mp4',
  }),
  task({
    media: feed[1],
    status: 'completed',
    progress: 100,
    downloadedBytes: 2_402_000,
    totalBytes: 2_402_000,
    fileName: '2026-10-27_18-30-12_sky.studio_3l5demo101.jpg',
    relativePath: 'sky.studio\\2026-10-27_18-30-12_sky.studio_3l5demo101.jpg',
  }),
  task({
    media: feed[3],
    status: 'paused',
    progress: 63,
    downloadedBytes: 1_300_000,
    totalBytes: 2_060_000,
    fileName: '2026-10-27_09-20-44_sky.studio_3l5demo103.jpg',
    relativePath: 'sky.studio\\2026-10-27_09-20-44_sky.studio_3l5demo103.jpg',
  }),
  task({
    media: feed[5],
    status: 'waiting',
    fileName: '2026-10-26_23-58-10_sky.studio_3l5demo105.jpg',
    relativePath: 'sky.studio\\2026-10-26_23-58-10_sky.studio_3l5demo105.jpg',
  }),
  task({
    media: feed[6],
    status: 'completed',
    progress: 100,
    downloadedBytes: 3_170_000,
    totalBytes: 3_170_000,
    fileName: '2026-10-26_18-14-02_sky.studio_3l5demo106.jpg',
    relativePath: 'sky.studio\\2026-10-26_18-14-02_sky.studio_3l5demo106.jpg',
  }),
  task({
    media: feed[8],
    status: 'error',
    error: '下载失败（HTTP 404），媒体可能已过期',
    fileName: '2026-10-25_12-09-33_sky.studio_3l5demo108.jpg',
    relativePath: 'sky.studio\\2026-10-25_12-09-33_sky.studio_3l5demo108.jpg',
  }),
];

const counts = {
  downloading: tasks.filter((t) => t.status === 'downloading').length,
  waiting: tasks.filter((t) => t.status === 'waiting').length,
  paused: tasks.filter((t) => t.status === 'paused').length,
  error: tasks.filter((t) => t.status === 'error').length,
  completed: tasks.filter((t) => t.status === 'completed').length,
};

const settings = {
  theme: THEME,
  language: process.env.BSKY_SPIDER_LANGUAGE || 'system',
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

const user = {
  ...profile,
  pds: 'https://bsky.social',
};

const system = {
  version: '1.1.5',
  platform: 'win32 x64',
  nodeVersion: 'v24.21.0',
  homeDir: 'C:\\Users\\Aurora',
  downloadsDir: 'C:\\Users\\Aurora\\Downloads',
  dataDir: 'D:\\Bsky-Spider\\data',
  dataDirSource: 'exe',
  defaultSaveDir: 'C:\\Users\\Aurora\\Downloads\\Bsky-Spider',
  videoEngineName: '内置 MP4 合并引擎',
  videoEngineReady: true,
  appView: 'https://public.api.bsky.app',
  systemProxyUrl: 'http://127.0.0.1:7890',
  systemProxySource: 'windows',
  systemProxyNote: '',
};

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
});

// Pretend to be the desktop build so the account manager is rendered.
const aliceProfile = {
  did: 'did:plc:alicedemo',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  description: 'Night skies and long exposures.',
  avatar: 'https://cdn.bsky.app/img/avatar/plain/demo/alice@jpeg?seed=5',
  banner: 'https://cdn.bsky.app/img/banner/plain/demo/alice-banner@jpeg?seed=banner',
  followersCount: 812,
  followsCount: 96,
  postsCount: 143,
  createdAt: '2023-11-02T08:00:00.000Z',
};

const savedAccounts = [
  {
    identifier: 'sky.studio',
    did: author.did,
    avatar: author.avatar,
    handle: 'sky.studio',
    displayName: 'Sky Studio',
    addedAt: '2026-10-20T08:00:00.000Z',
    lastUsedAt: '2026-10-31T09:30:00.000Z',
  },
  {
    identifier: 'alice@example.com',
    saved: false,
    did: aliceProfile.did,
    avatar: aliceProfile.avatar,
    handle: aliceProfile.handle,
    displayName: 'Alice',
    addedAt: '2026-10-18T12:00:00.000Z',
    lastUsedAt: '2026-10-29T18:10:00.000Z',
  },
];
const desktopMock = ({ accounts }) => {
  window.bskyDesktop = {
    isDesktop: true,
    loadCredentials: async () => ({ ok: false, error: 'none' }),
    saveCredentials: async () => ({ ok: true }),
    clearCredentials: async () => ({ ok: true }),
    signOutAccounts: async () => ({ ok: true, active: null, accounts }),
    listAccounts: async () => ({ ok: true, active: 'sky.studio', accounts }),
    setAccountSaved: async ({ identifier, saved: enabled }) => ({
      ok: true,
      active: enabled ? identifier : null,
      accounts,
    }),
    removeAccount: async () => ({ ok: true, active: 'sky.studio', accounts }),
    activateAccount: async () => ({
      ok: true,
      credentials: { identifier: 'sky.studio', password: 'x' },
    }),
  };
};
await context.addInitScript(desktopMock, { accounts: savedAccounts });

let searchHistory = ['sky.studio'];

await context.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const p = url.pathname;
  let data;
  if (p === '/api/auth/session') data = { user };
  else if (p === '/api/history') {
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
  } else if (p === '/api/settings') data = settings;
  else if (p === '/api/system') data = system;
  else if (p === '/api/tasks') data = { tasks, counts, concurrency: 3 };
  else if (p === '/api/bsky/profile') {
    const actor = (url.searchParams.get('actor') || '').toLowerCase();
    data = actor.includes('alice') ? aliceProfile : profile;
  }
  else if (p === '/api/bsky/feed') data = { items: feed, cursor: null };
  else if (p === '/api/fs/list')
    data = {
      path: settings.saveDir,
      parent: 'C:\\Users\\Aurora\\Pictures',
      directories: [
        { name: 'sky.studio', path: settings.saveDir + '\\sky.studio' },
        { name: 'Landscape', path: settings.saveDir + '\\Landscape' },
      ],
      drives: [
        { name: 'C:', path: 'C:\\' },
        { name: 'D:', path: 'D:\\' },
      ],
    };
  else data = { ok: true };
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
});

await context.route('**/cdn.bsky.app/**', async (route) => {
  const url = new URL(route.request().url());
  let svg;
  if (url.pathname.includes('/avatar/')) svg = avatarSvg(Number(url.searchParams.get('seed')) || 2);
  else if (url.pathname.includes('/banner/')) svg = bannerSvg();
  else {
    const seed = Number(url.searchParams.get('seed') || 0);
    svg = artSvg(seed, 'Bsky-Spider demo');
  }
  await route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: svg,
  });
});

const page = await context.newPage();
await page.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' });
await page.addStyleTag({
  content:
    '*{animation-duration:0s!important;transition-duration:0s!important} .ant-spin{opacity:0!important}',
});
await page.waitForSelector('.explore-empty', { timeout: 10000 });
await page.waitForTimeout(300);
await page.screenshot({ path: shot('home-empty'), fullPage: true });
const searchInput = page.locator('.search-input-wrap input');
await searchInput.fill('sky.studio');
await searchInput.press('Enter');
await page.waitForSelector('.media-card', { timeout: 15000 });
await page.addStyleTag({
  content:
    '*{animation-duration:0s!important;transition-duration:0s!important} .ant-spin{opacity:0!important}',
});
await page.waitForTimeout(800);
await page.screenshot({ path: shot('home'), fullPage: true });

await page.goto(`${BASE}/#/downloads`, { waitUntil: 'networkidle' });
await page.waitForSelector('.download-item', { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: shot('downloads'), fullPage: true });

await page.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' });
await page.waitForSelector('.settings-card', { timeout: 15000 });
await page.waitForTimeout(500);
await page.screenshot({ path: shot('settings'), fullPage: true });

await page.goto(`${BASE}/#/about`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: shot('about'), fullPage: true });

// Account manager modal (desktop mock with two saved accounts).
if (!SUFFIX) {
  await page.locator('.sidebar-accounts').click();
  await page.waitForSelector('.ant-modal-content', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('accounts'), fullPage: false });
  await page.locator('.ant-modal-close').click();
  await page.waitForTimeout(200);
}

// Login modal screenshot with a logged-out session.
const anonContext = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
});
await anonContext.addInitScript(desktopMock, { accounts: savedAccounts });
await anonContext.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  const p = url.pathname;
  let data;
  if (p === '/api/auth/session') data = { user: null };
  else if (p === '/api/settings') data = settings;
  else if (p === '/api/system') data = system;
  else if (p === '/api/tasks') data = { tasks: [], counts: { downloading: 0, waiting: 0, paused: 0, error: 0, completed: 0 }, concurrency: 3 };
  else data = { ok: true };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
});
const anonPage = await anonContext.newPage();
await anonPage.goto(`${BASE}/#/home`, { waitUntil: 'networkidle' });
await anonPage.waitForSelector('.login-hero', { timeout: 10000 });
await anonPage.screenshot({
  path: shot('landing'),
  fullPage: true,
});
await anonPage.locator('.sidebar-login').click();
await anonPage.waitForSelector('.ant-modal-content', { timeout: 10000 });
await anonPage.waitForTimeout(500);
await anonPage.screenshot({ path: shot('login'), fullPage: false });

await browser.close();
console.log('Screenshots written to', OUT);
