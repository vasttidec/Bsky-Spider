import path from 'node:path';

const root = process.cwd();
process.env.BSKY_SPIDER_DATA_DIR = path.join(root, '.tmp', 'inspect-media');
const { initSettings, updateSettings } = await import('../server/storage');
const { httpFetch } = await import('../server/http');
await initSettings();
await updateSettings({ proxyEnabled: true, proxyUseSystem: true });

const api = 'https://public.api.bsky.app/xrpc';
async function getJson(url: string) {
  const res = await httpFetch(url, {}, 30000);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const feed = await getJson(`${api}/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=50`);
const images: any[] = [];
const videos: any[] = [];
for (const entry of feed.feed || []) {
  const embed = entry.post?.embed;
  if (!embed) continue;
  const media = embed.$type === 'app.bsky.embed.recordWithMedia#view' ? embed.media : embed;
  for (const image of media?.images || []) images.push({ ...image, post: entry.post });
  if (media?.playlist) videos.push({ ...media, post: entry.post });
}
console.log(`images=${images.length} videos=${videos.length}`);
if (images[0]) {
  const image = images[0];
  console.log('image url:', image.fullsize);
  for (const accept of [undefined, 'image/jpeg,image/png,image/*;q=0.8']) {
    const res = await httpFetch(image.fullsize, {
      headers: accept ? { accept } : {},
    }, 30000);
    const buf = Buffer.from(await res.arrayBuffer());
    console.log('accept=', accept || '(default)', 'status=', res.status, 'type=', res.headers.get('content-type'), 'len=', buf.length, 'magic=', buf.subarray(0, 12).toString('hex'));
  }
}
if (videos[0]) {
  const video = videos[0];
  console.log('video playlist:', video.playlist);
  console.log('video cid:', video.cid, 'did:', video.post.author.did);
  const res = await httpFetch(video.playlist, {}, 30000);
  console.log('playlist status', res.status, 'type', res.headers.get('content-type'));
  console.log((await res.text()).slice(0, 3000));
  const blob = await httpFetch(`https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(video.post.author.did)}&cid=${encodeURIComponent(video.cid)}`, {}, 60000);
  console.log('blob from bsky.social:', blob.status, blob.headers.get('content-type'), blob.headers.get('content-length'));
  if (blob.ok) {
    const b = Buffer.from(await blob.arrayBuffer());
    console.log('blob magic', b.subarray(0, 12).toString('hex'), 'len', b.length);
  }
}
