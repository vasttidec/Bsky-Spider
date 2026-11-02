/**
 * End-to-end check against the real Bluesky network.
 *
 * Verifies that
 *  - images and videos are downloaded as the original PDS blob (JPEG / MP4),
 *  - the HLS fallback is muxed into a playable MP4 by the built-in TypeScript
 *    muxer (no ffmpeg binary is involved anywhere in the pipeline).
 *
 * Requires working network access (a system proxy is used automatically).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const work = path.join(root, '.tmp', 'original-quality-test');
await fs.rm(work, { recursive: true, force: true });
await fs.mkdir(work, { recursive: true });
process.env.BSKY_SPIDER_DATA_DIR = path.join(work, 'data');

const { initSettings, updateSettings } = await import('../server/storage');
const { downloads } = await import('../server/downloads');
const { httpFetch } = await import('../server/http');
const { blobCidFromCdnUrl } = await import('../server/bsky');
const { demuxTransportStream } = await import('../server/remux/ts-demux');

await initSettings();
await updateSettings({
  saveDir: path.join(work, 'downloads'),
  folderTemplate: '',
  fileNameTemplate: 'original_%MEDIA_ID%%EXT%',
  skipExisting: false,
  concurrency: 2,
  proxyEnabled: true,
  proxyUseSystem: true,
});
await downloads.init();

interface PlaylistInfo {
  playlist: string;
  cid: string;
  author: { did: string; handle: string; displayName?: string };
  variantUrl: string;
  segments: string[];
}

async function fetchText(url: string): Promise<string> {
  const response = await httpFetch(url, {}, 30_000);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.text();
}

async function resolvePlaylist(
  playlist: string,
): Promise<{ variantUrl: string; segments: string[] }> {
  const master = await fetchText(playlist);
  const childUrl = master.includes('#EXT-X-STREAM-INF')
    ? new URL(
        master
          .split('\n')
          .filter((line) => line && !line.startsWith('#'))
          .pop() as string,
        playlist,
      ).href
    : playlist;
  const child = await fetchText(childUrl);
  const segments = child
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => new URL(line, childUrl).href);
  return { variantUrl: childUrl, segments };
}

/** Finds a video post whose HLS stream has between min and max segments. */
async function findVideo(
  actor: string,
  minSegments: number,
  maxSegments: number,
  skip: Set<string>,
): Promise<PlaylistInfo | null> {
  const feed = await (
    await httpFetch(
      `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${actor}&limit=50&filter=posts_with_video`,
      {},
      30_000,
    )
  ).json();
  for (const entry of feed.feed || []) {
    const raw = entry.post?.embed;
    const embed =
      raw?.$type === 'app.bsky.embed.recordWithMedia#view' ? raw.media : raw;
    if (!embed?.playlist || !embed?.cid) continue;
    if (skip.has(embed.cid)) continue;
    const { variantUrl, segments } = await resolvePlaylist(embed.playlist);
    if (segments.length < minSegments || segments.length > maxSegments) continue;
    return {
      playlist: embed.playlist,
      cid: embed.cid,
      author: entry.post.author,
      variantUrl,
      segments,
    };
  }
  return null;
}

/** Parses the top-level MP4 boxes plus the movie duration. */
async function inspectMp4(
  filePath: string,
): Promise<{ types: string[]; durationMs: number; hasAvcC: boolean; hasMp4a: boolean }> {
  const data = await fs.readFile(filePath);
  const types: string[] = [];
  let offset = 0;
  while (offset + 8 <= data.length) {
    const size = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString('latin1');
    if (!/^[\x20-\x7e]{4}$/.test(type)) break;
    types.push(type);
    if (size < 8) break;
    offset += size;
  }
  let durationMs = 0;
  const mvhdIndex = data.indexOf(Buffer.from('mvhd', 'latin1'));
  if (mvhdIndex > 0 && mvhdIndex + 20 <= data.length) {
    const version = data[mvhdIndex + 4];
    if (version === 0) {
      const timescale = data.readUInt32BE(mvhdIndex + 16);
      const duration = data.readUInt32BE(mvhdIndex + 20);
      if (timescale > 0) durationMs = (duration / timescale) * 1000;
    }
  }
  return {
    types,
    durationMs,
    hasAvcC: data.includes(Buffer.from('avcC', 'latin1')),
    hasMp4a: data.includes(Buffer.from('mp4a', 'latin1')),
  };
}

async function waitFor(
  ids: string[],
  timeoutMs = 180_000,
): Promise<Array<{ id: string; [key: string]: any }>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tasks = ids.map((id) => downloads.getTask(id)).filter(Boolean) as any[];
    if (tasks.every((task) => task.status === 'completed' || task.status === 'error')) {
      return tasks;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`timed out waiting for ${ids.join(', ')}`);
}

// --- Fixtures -----------------------------------------------------------
const feed = await (
  await httpFetch(
    'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=bsky.app&limit=50',
    {},
    30_000,
  )
).json();

let image: any;
let shortVideo: any;
for (const entry of feed.feed || []) {
  const raw = entry.post?.embed;
  const embed =
    raw?.$type === 'app.bsky.embed.recordWithMedia#view' ? raw.media : raw;
  if (!image && embed?.images?.[0]?.fullsize) image = embed.images[0];
  if (!shortVideo && embed?.playlist && embed?.cid) {
    shortVideo = { ...embed, post: entry.post };
  }
  if (image && shortVideo) break;
}
if (!image || !shortVideo) throw new Error('no image/video fixture found');

const longVideo = await findVideo('nytimes.com', 3, 18, new Set([shortVideo.cid]));
if (!longVideo) throw new Error('no multi-segment video fixture found');

const now = new Date().toISOString();
const imageAuthorDid = (() => {
  const parts = new URL(image.fullsize).pathname.split('/').filter(Boolean);
  return parts[parts.indexOf('plain') + 1];
})();
const imageCid = blobCidFromCdnUrl(image.fullsize);
const makeItem = (
  overrides: Record<string, unknown>,
): Record<string, unknown> => ({
  id: 'fixture',
  kind: 'image',
  url: image.fullsize,
  thumbUrl: image.thumb,
  index: 1,
  postUri: 'at://did:plc:test/app.bsky.feed.post/fixture',
  postUrl: 'https://bsky.app/profile/bsky.app/post/fixture',
  postText: 'fixture',
  createdAt: now,
  author: { did: imageAuthorDid, handle: 'bsky.app', displayName: 'Bluesky' },
  ...overrides,
});

const originalItems = [
  makeItem({
    id: 'real-img1',
    url: image.fullsize,
    blobCid: imageCid,
  }),
  makeItem({
    id: 'real-video',
    kind: 'video',
    url: shortVideo.playlist,
    blobCid: shortVideo.cid,
    thumbUrl: shortVideo.thumbnail || image.thumb,
    postUri: `${shortVideo.post.uri}-video`,
    postUrl: 'https://bsky.app/profile/bsky.app/post/video',
    author: {
      did: shortVideo.post.author.did,
      handle: shortVideo.post.author.handle,
      displayName: shortVideo.post.author.displayName,
    },
  }),
];

const created = await downloads.createTasks(originalItems as any);
if (created.added !== 2) throw new Error(`expected 2 tasks, got ${created.added}`);
const [imageTask, videoTask] = await waitFor(created.tasks.map((task) => task.id));
console.log(
  JSON.stringify(
    [imageTask, videoTask].map((task) => ({
      kind: task.media.kind,
      status: task.status,
      fileName: task.fileName,
      note: task.note,
      error: task.error,
      bytes: task.downloadedBytes,
    })),
    null,
    2,
  ),
);
for (const task of [imageTask, videoTask]) {
  if (task.status !== 'completed') throw new Error(`${task.fileName}: ${task.error}`);
}
if (!imageTask.fileName.toLowerCase().endsWith('.jpg')) {
  throw new Error(`image was not saved as JPEG: ${imageTask.fileName}`);
}
if (!videoTask.fileName.toLowerCase().endsWith('.mp4')) {
  throw new Error(`video was not saved as MP4: ${videoTask.fileName}`);
}
const imageBytes = await fs.readFile(imageTask.filePath);
if (imageBytes[0] !== 0xff || imageBytes[1] !== 0xd8) {
  throw new Error('downloaded image is not a JPEG');
}
const originalVideo = await inspectMp4(videoTask.filePath);
if (!originalVideo.types.includes('ftyp') || !originalVideo.types.includes('moov')) {
  throw new Error('downloaded original video is not a valid MP4');
}
console.log(
  `PASS: original JPEG (${imageBytes.length} B) and original MP4 (${originalVideo.types.join(',')}) downloaded from the PDS`,
);

// --- HLS fallback (no blob CID) ---------------------------------------
const fallbackItems = [
  makeItem({
    id: 'hls-short',
    kind: 'video',
    url: shortVideo.playlist,
    postUri: `${shortVideo.post.uri}-hls-short`,
    author: {
      did: shortVideo.post.author.did,
      handle: shortVideo.post.author.handle,
    },
  }),
  makeItem({
    id: 'hls-long',
    kind: 'video',
    url: longVideo.playlist,
    postUri: `${longVideo.author.handle}-${longVideo.cid}-hls`,
    author: {
      did: longVideo.author.did,
      handle: longVideo.author.handle,
    },
  }),
];
const hlsCreated = await downloads.createTasks(fallbackItems as any);
if (hlsCreated.added !== 2) throw new Error(`expected 2 HLS tasks, got ${hlsCreated.added}`);
const hlsTasks = await waitFor(hlsCreated.tasks.map((task) => task.id));
console.log(
  JSON.stringify(
    hlsTasks.map((task) => ({
      id: task.media.id,
      status: task.status,
      fileName: task.fileName,
      note: task.note,
      error: task.error,
      segments: task.media.id === 'hls-long' ? longVideo.segments.length : 1,
    })),
    null,
    2,
  ),
);
for (const task of hlsTasks) {
  if (task.status !== 'completed') throw new Error(`HLS fallback failed: ${task.error}`);
  if (!task.fileName.toLowerCase().endsWith('.mp4')) {
    throw new Error(`HLS fallback was not muxed to MP4: ${task.fileName}`);
  }
  const info = await inspectMp4(task.filePath);
  if (!info.types.includes('moov') || !info.types.includes('mdat') || !info.hasAvcC) {
    throw new Error(`HLS fallback MP4 is incomplete: ${JSON.stringify(info)}`);
  }
  if (info.durationMs < 1000) {
    throw new Error(`HLS fallback MP4 has no usable duration: ${info.durationMs}`);
  }
  console.log(
    `PASS: HLS fallback muxed to MP4 (${task.media.id}, ${info.types.join(',')}, ` +
      `${Math.round(info.durationMs)} ms, audio=${info.hasMp4a})`,
  );
}

// The long fixture is expected to carry audio; make sure the audio track made
// it into the MP4 and that Playwright-free decoding metadata is sane.
const longTask = hlsTasks.find((task) => task.media.id === 'hls-long')!;
const longInfo = await inspectMp4(longTask.filePath);
const probeFile = path.join(work, 'probe-segment.ts');
const probeUrl = longVideo.segments[0];
const probeResponse = await httpFetch(probeUrl, {}, 60_000);
await fs.writeFile(probeFile, Buffer.from(await probeResponse.arrayBuffer()));
const probeSummary = await demuxTransportStream(probeFile, {
  video: () => undefined,
  audio: () => undefined,
});
await fs.unlink(probeFile).catch(() => undefined);
if (probeSummary.audioPid !== undefined && !longInfo.hasMp4a) {
  throw new Error('source has audio but the muxed MP4 has no audio track');
}
console.log(
  `PASS: long HLS video has ${longVideo.segments.length} segments, source audio=${probeSummary.audioPid !== undefined}, mp4 audio=${longInfo.hasMp4a}`,
);

await downloads.shutdown();
console.log('ALL ORIGINAL-QUALITY CHECKS PASSED');
