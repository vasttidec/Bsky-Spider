/**
 * End-to-end test for saving to a WebDAV network location. Starts a tiny
 * WebDAV server plus a media server, downloads one image, and verifies the
 * uploaded file, the skip-existing behaviour and the temporary cache cleanup.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const work = path.join(root, '.tmp', 'webdav-test');
await fs.rm(work, { recursive: true, force: true });
await fs.mkdir(path.join(work, 'data'), { recursive: true });
process.env.BSKY_SPIDER_DATA_DIR = path.join(work, 'data');

const jpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

// --- WebDAV mock -----------------------------------------------------------
const dirs = new Set<string>(['/remote']);
const files = new Map<string, Buffer>();
let putCount = 0;
const normalize = (pathname: string): string => {
  const clean = pathname.replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
};
const davServer = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const target = normalize(decodeURIComponent(url.pathname));
  if (req.method === 'MKCOL') {
    if (dirs.has(target)) {
      res.statusCode = 405;
      res.end();
      return;
    }
    dirs.add(target);
    res.statusCode = 201;
    res.end();
    return;
  }
  if (req.method === 'HEAD') {
    if (files.has(target)) {
      res.statusCode = 200;
      res.setHeader('content-length', String(files.get(target)!.length));
    } else {
      res.statusCode = 404;
    }
    res.end();
    return;
  }
  if (req.method === 'PUT') {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk as Buffer));
    req.on('end', () => {
      files.set(target, Buffer.concat(chunks));
      putCount += 1;
      res.statusCode = 201;
      res.end();
    });
    return;
  }
  res.statusCode = 405;
  res.end();
});
await new Promise<void>((resolve) => davServer.listen(0, '127.0.0.1', resolve));
const davPort = (davServer.address() as { port: number }).port;

// --- Media server ----------------------------------------------------------
let mediaHits = 0;
const mediaServer = http.createServer((req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    mediaHits += 1;
    res.setHeader('content-type', 'image/jpeg');
    res.setHeader('content-length', String(jpeg.length));
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(jpeg);
    return;
  }
  res.statusCode = 405;
  res.end();
});
await new Promise<void>((resolve) => mediaServer.listen(0, '127.0.0.1', resolve));
const mediaPort = (mediaServer.address() as { port: number }).port;

// --- Settings --------------------------------------------------------------
const settingsFile = path.join(process.env.BSKY_SPIDER_DATA_DIR!, 'settings.json');
await fs.writeFile(
  settingsFile,
  JSON.stringify({
    saveDir: `dav://127.0.0.1:${davPort}/remote`,
    folderTemplate: '%USER_HANDLE%',
    fileNameTemplate: 'test-image%EXT%',
    skipExisting: false,
    proxyEnabled: false,
    proxyUseSystem: false,
    proxyChoiceMade: true,
  }),
  'utf8',
);

const { initSettings, updateSettings } = await import('../server/storage');
const { downloads } = await import('../server/downloads');
await initSettings();
await downloads.init();

const mediaItem = (suffix: string) => ({
  id: `media-${suffix}`,
  kind: 'image' as const,
  url: `http://127.0.0.1:${mediaPort}/pic-${suffix}.jpg`,
  thumbUrl: '',
  index: 1,
  postUri: `at://did:plc:test/app.bsky.feed.post/${suffix}`,
  postUrl: `https://bsky.app/profile/test.user/post/${suffix}`,
  postText: 'test',
  createdAt: new Date().toISOString(),
  author: { did: 'did:plc:test', handle: 'test.user' },
});

const waitForTask = async (id: string, timeoutMs = 30_000) => {
  const started = Date.now();
  for (;;) {
    const task = downloads.getTask(id);
    if (task && (task.status === 'completed' || task.status === 'error')) return task;
    if (Date.now() - started > timeoutMs) throw new Error(`task ${id} timed out`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
};

const created = await downloads.createTasks([mediaItem('a')]);
if (created.added !== 1) throw new Error(`expected 1 task, got ${created.added}`);
const first = await waitForTask(created.tasks[0].id);
if (first.status !== 'completed') throw new Error(`download failed: ${first.error}`);
const expectedPath = `/remote/test.user/test-image.jpg`;
const expectedUrl = `http://127.0.0.1:${davPort}${expectedPath}`;
if (first.filePath !== expectedUrl) {
  throw new Error(`unexpected remote path: ${first.filePath}`);
}
const uploaded = files.get(expectedPath);
if (!uploaded || !uploaded.equals(jpeg)) {
  throw new Error('uploaded file content mismatch');
}
if (putCount !== 1) throw new Error(`expected 1 PUT, got ${putCount}`);

// The staging cache must not keep the uploaded file.
const cacheDir = path.join(process.env.BSKY_SPIDER_DATA_DIR!, 'webdav-cache', 'test.user');
const cached = await fs.readdir(cacheDir).catch(() => []);
if (cached.length > 0) {
  throw new Error(`staging cache not cleaned: ${cached.join(', ')}`);
}

// --- skipExisting ----------------------------------------------------------
await updateSettings({ skipExisting: true });
const second = await downloads.createTasks([mediaItem('b')]);
if (second.added !== 1) throw new Error(`expected second task, got ${second.added}`);
const skipped = await waitForTask(second.tasks[0].id);
if (skipped.status !== 'completed' || !skipped.skipped) {
  throw new Error(`skipExisting did not skip: status=${skipped.status} skipped=${skipped.skipped}`);
}
if (putCount !== 1) throw new Error('skipExisting uploaded the file again');

// --- bad address -----------------------------------------------------------
await updateSettings({ saveDir: 'dav://127.0.0.1:1/remote' });
const third = await downloads.createTasks([mediaItem('c')]);
const failed = await waitForTask(third.tasks[0].id);
if (failed.status !== 'error') {
  throw new Error(`bad address should fail, got ${failed.status}`);
}

davServer.close();
mediaServer.close();
console.log(
  `PASS: WebDAV save location (uploaded=${putCount}, skipped=true, local cache cleaned, media hits=${mediaHits})`,
);
