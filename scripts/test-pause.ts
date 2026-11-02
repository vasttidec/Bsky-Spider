import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const work = path.join(root, '.tmp', 'pause-test');
await fs.rm(work, { recursive: true, force: true });
await fs.mkdir(work, { recursive: true });
process.env.BSKY_SPIDER_DATA_DIR = path.join(work, 'data');

const totalSize = 1024 * 1024;
const chunkSize = 64 * 1024;
const totalChunks = totalSize / chunkSize;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname !== '/slow.png') {
    res.writeHead(404).end('not found');
    return;
  }
  const range = req.headers.range;
  let start = 0;
  if (range) {
    const match = range.match(/bytes=(\d+)-/);
    if (match) start = Number(match[1]);
  }
  if (start >= totalSize) {
    res.writeHead(416, { 'content-range': `bytes */${totalSize}` });
    res.end();
    return;
  }
  const headers: Record<string, string | number> = {
    'content-type': 'image/png',
    'content-length': totalSize - start,
    'accept-ranges': 'bytes',
  };
  if (start > 0) {
    headers['content-range'] = `bytes ${start}-${totalSize - 1}/${totalSize}`;
  }
  res.writeHead(start > 0 ? 206 : 200, headers);

  let chunk = Math.floor(start / chunkSize);
  const timer = setInterval(() => {
    if (chunk >= totalChunks) {
      clearInterval(timer);
      res.end();
      return;
    }
    const data = Buffer.alloc(chunkSize, chunk % 251);
    res.write(data);
    chunk += 1;
  }, 35);
  req.on('close', () => clearInterval(timer));
});

await new Promise<void>((resolve) => server.listen(5193, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:5193';

const { initSettings, updateSettings } = await import('../server/storage');
const { downloads } = await import('../server/downloads');
await initSettings();
await updateSettings({
  saveDir: path.join(work, 'downloads'),
  folderTemplate: '',
  fileNameTemplate: 'slow_%MEDIA_ID%%EXT%',
  skipExisting: false,
  concurrency: 1,
});
await downloads.init();

const item = {
  id: 'slow-img1',
  kind: 'image' as const,
  url: `${base}/slow.png`,
  thumbUrl: `${base}/slow.png`,
  index: 1,
  postUri: 'at://did:plc:test/app.bsky.feed.post/slow',
  postUrl: 'https://bsky.app/profile/test.user/post/slow',
  postText: 'pause resume test',
  createdAt: new Date().toISOString(),
  author: { did: 'did:plc:test', handle: 'test.user', displayName: 'Test' },
};
const created = await downloads.createTasks([item]);
const id = created.tasks[0].id;

const waitFor = async (predicate: () => boolean, timeout = 15000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('timeout waiting for condition');
};

await waitFor(() => {
  const task = downloads.getTask(id);
  return Boolean(task && task.status === 'downloading' && task.downloadedBytes > 0);
});
await downloads.pause(id);
const paused = downloads.getTask(id);
if (paused?.status !== 'paused') throw new Error('task did not pause');

await new Promise((resolve) => setTimeout(resolve, 120));
await downloads.resume(id);
await waitFor(() => {
  const task = downloads.getTask(id);
  return Boolean(
    task &&
      (task.status === 'completed' || task.status === 'error'),
  );
});

const final = downloads.getTask(id);
console.log(JSON.stringify({
  status: final?.status,
  progress: final?.progress,
  downloadedBytes: final?.downloadedBytes,
  error: final?.error,
}, null, 2));
if (final?.status !== 'completed') {
  throw new Error(`pause/resume failed: ${final?.error}`);
}
const bytes = await fs.readFile(final.filePath!);
if (bytes.length !== totalSize) {
  throw new Error(`expected ${totalSize} bytes, got ${bytes.length}`);
}
console.log('PASS: pause, immediate resume and ranged continuation');
await downloads.shutdown();
server.close();
