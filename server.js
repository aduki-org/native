/**
 * server.js
 *
 * Zero-dependency Node.js dev server for the project.
 * Serves the project root as static files — no node_modules reach the browser.
 *
 * Run: node server.js
 *      PORT=4000 node server.js
 */

import { createServer }        from 'http';
import { readFile, stat }      from 'fs/promises';
import { join, extname, resolve } from 'path';

const port = Number(process.env.PORT) || 3000;
const root = resolve('.');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
};

async function serve(req, res) {
  const url  = new URL(req.url, `http://localhost:${port}`);
  let   path = decodeURIComponent(url.pathname);

  // Default to blog entry when hitting root
  if (path === '/') path = '/blog/index.html';

  const file = join(root, path);

  // Safety: disallow path traversal outside root
  if (!file.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    // If path points at a directory, try index.html inside it
    const info = await stat(file);
    const target = info.isDirectory() ? join(file, 'index.html') : file;
    const data = await readFile(target);
    const ext  = extname(target);
    res.writeHead(200, { 'Content-Type': types[ext] ?? 'text/plain' });
    res.end(data);
  } catch {
    // SPA fallback — return blog shell for unknown paths
    try {
      const html = await readFile(join(root, 'blog', 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }
}

createServer(serve).listen(port, () => {
  console.log(`\n  @aduki/native dev server`);
  console.log(`  Local:  http://localhost:${port}/`);
  console.log(`  Blog:   http://localhost:${port}/blog/\n`);
});
