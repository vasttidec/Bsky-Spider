import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const work = path.join(root, '.tmp', 'download-test');
await fs.rm(work, { recursive: true, force: true });
await fs.mkdir(work, { recursive: true });
process.env.BSKY_SPIDER_DATA_DIR = path.join(work, 'data');

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2n0kAAAAASUVORK5CYII=',
  'base64',
);
const tsSegment = (index: number) => {
  const buffer = Buffer.alloc(188 * 3, index + 1);
  for (let offset = 0; offset < buffer.length; offset += 188) {
    buffer[offset] = 0x47;
  }
  return buffer;
};
const segments = [tsSegment(1), tsSegment(2), tsSegment(3)];

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/image.png') {
    res.writeHead(200, {
      'content-type': 'image/png',
      'content-length': png.length,
    });
    res.end(png);
    return;
  }
  if (url.pathname === '/video/master.m3u8') {
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
    res.end(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nlow/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720\nhigh/index.m3u8\n',
    );
    return;
  }
  if (url.pathname === '/video/high/index.m3u8') {
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
    res.end(
      '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg0.ts\n#EXTINF:4,\nseg1.ts\n#EXTINF:4,\nseg2.ts\n#EXT-X-ENDLIST\n',
    );
    return;
  }
  const match = url.pathname.match(/^\/video\/high\/seg([0-2])\.ts$/);
  if (match) {
    const data = segments[Number(match[1])];
    res.writeHead(200, {
      'content-type': 'video/mp2t',
      'content-length': data.length,
    });
    res.end(data);
    return;
  }
  res.writeHead(404).end('not found');
});

await new Promise<void>((resolve) => server.listen(5191, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:5191';

const { initSettings, updateSettings } = await import('../server/storage');
const { downloads } = await import('../server/downloads');
await initSettings();
await updateSettings({
  saveDir: path.join(work, 'downloads'),
  folderTemplate: '%USER_HANDLE%',
  fileNameTemplate: '%POST_TIME%_%USER_HANDLE%_%MEDIA_ID%%EXT%',
  skipExisting: false,
  concurrency: 2,
});
await downloads.init();

const author = {
  did: 'did:plc:test',
  handle: 'test.user',
  displayName: 'Test User',
};
const now = new Date().toISOString();
const items = [
  {
    id: 'post1-img1',
    kind: 'image' as const,
    url: `${base}/image.png`,
    thumbUrl: `${base}/image.png`,
    alt: 'test',
    index: 1,
    postUri: 'at://did:plc:test/app.bsky.feed.post/post1',
    postUrl: 'https://bsky.app/profile/test.user/post/post1',
    postText: 'image test',
    createdAt: now,
    author,
  },
  {
    id: 'post2-video',
    kind: 'video' as const,
    url: `${base}/video/master.m3u8`,
    thumbUrl: `${base}/image.png`,
    index: 1,
    postUri: 'at://did:plc:test/app.bsky.feed.post/post2',
    postUrl: 'https://bsky.app/profile/test.user/post/post2',
    postText: 'video test',
    createdAt: now,
    author,
  },
];

const created = await downloads.createTasks(items);
if (created.added !== 2) throw new Error(`expected 2 tasks, got ${created.added}`);

let tasks = downloads.getTasks();
const deadline = Date.now() + 20_000;
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  tasks = downloads.getTasks();
  if (tasks.every((task) => task.status === 'completed' || task.status === 'error')) {
    break;
  }
}

console.log(JSON.stringify(tasks.map((task) => ({
  kind: task.media.kind,
  status: task.status,
  progress: task.progress,
  fileName: task.fileName,
  error: task.error,
  note: task.note,
})), null, 2));

const failed = tasks.filter((task) => task.status !== 'completed');
if (failed.length > 0) {
  throw new Error(`downloads failed: ${failed.map((task) => task.error).join('; ')}`);
}
const imageTask = tasks.find((task) => task.media.kind === 'image');
const videoTask = tasks.find((task) => task.media.kind === 'video');
if (!imageTask?.filePath || !videoTask?.filePath) {
  throw new Error('missing output file paths');
}
const imageBytes = await fs.readFile(imageTask.filePath);
const videoBytes = await fs.readFile(videoTask.filePath);
if (imageBytes.length !== png.length) throw new Error('image size mismatch');
const expectedVideo = Buffer.concat(segments);
if (!videoBytes.equals(expectedVideo)) {
  throw new Error('HLS concatenation mismatch');
}
if (!imageTask.filePath.endsWith('.png')) throw new Error('image extension mismatch');
if (!videoTask.filePath.endsWith('.ts')) throw new Error('video extension mismatch');

// A completed record whose file still exists must still be treated as a
// duplicate. Once the local file is gone, the same media must be downloaded
// again into the same file name instead of being skipped.
const duplicate = await downloads.createTasks([items[0]]);
if (duplicate.added !== 0 || duplicate.skipped !== 1) {
  throw new Error(
    `completed existing file was not skipped: ${JSON.stringify(duplicate)}`,
  );
}
await fs.unlink(imageTask.filePath);
const missing = await downloads.createTasks([items[0]]);
if (missing.added !== 1 || missing.tasks[0]?.id !== imageTask.id) {
  throw new Error(
    `missing completed file was not resumed: ${JSON.stringify(missing)}`,
  );
}
if (missing.tasks[0].fileName !== imageTask.fileName) {
  throw new Error('resumed task did not keep the original file name');
}
const resumeDeadline = Date.now() + 10_000;
let resumedTask = downloads.getTask(imageTask.id);
while (
  Date.now() < resumeDeadline &&
  resumedTask?.status !== 'completed' &&
  resumedTask?.status !== 'error'
) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  resumedTask = downloads.getTask(imageTask.id);
}
if (resumedTask?.status !== 'completed') {
  throw new Error(
    `resumed task did not complete: ${JSON.stringify(resumedTask)}`,
  );
}
if (resumedTask.fileName !== imageTask.fileName) {
  throw new Error('resumed task changed the file name');
}
const resumedBytes = await fs.readFile(resumedTask.filePath as string);
if (!resumedBytes.equals(png)) throw new Error('resumed image size mismatch');

console.log('PASS: image and HLS video downloaded to', path.dirname(imageTask.filePath));
await downloads.shutdown();
server.close();
