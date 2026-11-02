import path from 'node:path';

const root = process.cwd();
process.env.BSKY_SPIDER_DATA_DIR = path.join(root, '.tmp', 'proxy-test-data');

const { initSettings, updateSettings } = await import('../server/storage');
const { detectSystemProxy, resolveProxyUrl } = await import('../server/proxy');
const { httpFetch } = await import('../server/http');

await initSettings();
await updateSettings({
  proxyEnabled: true,
  proxyUseSystem: true,
  proxyUrl: '',
});

const detected = await detectSystemProxy(true);
if (!detected.url) {
  console.log(`SKIP: no system proxy detected (${detected.note || 'none'})`);
  process.exit(0);
}
const resolved = await resolveProxyUrl();
if (resolved !== detected.url) {
  throw new Error(`resolved proxy mismatch: ${resolved} vs ${detected.url}`);
}
console.log(`system proxy: ${detected.url} (${detected.source})`);

const response = await httpFetch(
  'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=bsky.app',
  {},
  30_000,
);
if (!response.ok) {
  throw new Error(`Bluesky request through system proxy failed: HTTP ${response.status}`);
}
const profile = await response.json();
if (!profile.handle) throw new Error('profile response was not valid');

const feedResponse = await httpFetch(
  'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=20',
  {},
  30_000,
);
if (!feedResponse.ok) {
  throw new Error(`Bluesky feed through proxy failed: HTTP ${feedResponse.status}`);
}
const feed = await feedResponse.json();
const imageUrl = (feed.feed || [])
  .flatMap((entry: any) => entry.post?.embed?.images || [])
  .map((image: any) => image.fullsize)
  .find(Boolean);
if (imageUrl) {
  const imageResponse = await httpFetch(imageUrl, {}, 60_000);
  if (!imageResponse.ok || !/^image\//i.test(imageResponse.headers.get('content-type') || '')) {
    throw new Error(`Bluesky media through proxy failed: HTTP ${imageResponse.status}`);
  }
  await imageResponse.body?.cancel();
  console.log(`PASS: Bluesky media reachable through system proxy (${imageUrl.slice(0, 70)}…)`);
}

console.log(`PASS: Bluesky API reachable through system proxy (${profile.handle})`);
