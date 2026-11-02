import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.tmp/builder-binaries');
const port = Number(process.env.PORT || 5197);
const server = http.createServer((req, res) => {
  const parts = decodeURIComponent((req.url || '/').replace(/^\/+/, ''))
    .split('/')
    .filter(Boolean);
  if (
    parts.length !== 2 ||
    !/^[A-Za-z0-9._-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9._-]+\.7z$/.test(parts[1])
  ) {
    res.writeHead(404).end('not found');
    return;
  }
  const file = path.join(root, parts[0], parts[1]);
  if (!fs.existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  const stat = fs.statSync(file);
  res.writeHead(200, {
    'content-type': 'application/x-7z-compressed',
    'content-length': stat.size,
  });
  fs.createReadStream(file).pipe(res);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`builder binaries mirror http://127.0.0.1:${port}/`);
});
