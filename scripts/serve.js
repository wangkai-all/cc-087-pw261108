// 零依赖静态服务器：仅用于本地预览，生产环境可由任意静态托管替代
import { createServer } from 'node:http';
import { readFile, stat as statFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PORT = Number(process.env.PORT) || 8123;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let filePath = normalize(join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await statFile(filePath).catch(() => null);
    if (info?.isDirectory()) filePath = join(filePath, 'index.html');
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`多语言目录整理台已启动：http://localhost:${PORT}/`);
});
