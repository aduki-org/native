# @adukiorg/native — Server Usage Guide

How to use Node.js or Deno as a dev server while keeping your browser code 100% native ESM.
No node_modules ever reach the browser. The import map handles everything on the client side.

---

## The Mental Model

```
┌──────────────────────────────────────────────────────────┐
│  Node / Deno                                             │
│  Serves static files over HTTP. That's it.               │
│  Never processes, transforms, or bundles your JS.        │
└────────────────────────────┬─────────────────────────────┘
                             │  HTTP (static files)
                             ▼
┌──────────────────────────────────────────────────────────┐
│  Browser                                                 │
│  Loads index.html → reads import map → resolves modules  │
│  @adukiorg/native  ─── CDN (jsDelivr)                       │
│  /src/app.js    ─── your server                          │
└──────────────────────────────────────────────────────────┘
```

`node_modules` lives only on disk. The browser never references it.

---

## Recommended Project Structure

```
myapp/
├── src/                    ← your browser modules (served as static .js)
│   ├── app.js              ← entry point
│   ├── pages/
│   │   ├── home.js
│   │   └── about.js
│   └── components/
│       └── nav.js
├── public/                 ← static assets
│   ├── styles/
│   │   └── main.css
│   └── assets/
├── server/                 ← server-side only, never sent to browser
│   └── index.js
├── index.html              ← import map + module entry
└── package.json
```

---

## `index.html`

The import map bridges the CDN library with your local `src/` modules:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My App</title>

  <!-- @adukiorg/native from CDN — browser resolves this, not Node -->
  <script type="importmap" src="https://cdn.jsdelivr.net/npm/@adukiorg/native@0.1.0/dist/importmap.json"></script>

  <link rel="stylesheet" href="/public/styles/main.css">
</head>
<body>
  <div id="app"></div>
  <!-- Your app modules — served by the local server -->
  <script type="module" src="/src/app.js"></script>
</body>
</html>
```

---

## `src/app.js`

Pure browser ESM — zero Node awareness:

```js
import { ReactiveStore } from '@adukiorg/native/state';
import { router }        from '@adukiorg/native/router';
import { animate }       from '@adukiorg/native/animations';

// Lazy-load pages — the browser fetches these from your server
router.on('/',       () => import('./pages/home.js'));
router.on('/about',  () => import('./pages/about.js'));
router.on('/posts',  () => import('./pages/posts.js'));

const store = new ReactiveStore({ theme: 'dark', user: null });

store.subscribe('theme', () => {
  document.documentElement.dataset.theme = store.get('theme');
});
```

---

## Node.js Server

### Option A — Zero dependency (built-in `http` module)

```js
// server/index.js
import { createServer }           from 'http';
import { readFile, stat }         from 'fs/promises';
import { join, extname, resolve } from 'path';

const port = Number(process.env.PORT) || 3000;
const root = resolve('.');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
};

async function serve(req, res) {
  const url  = new URL(req.url, `http://localhost:${port}`);
  let   path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';

  const file = join(root, path);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }

  try {
    const info   = await stat(file);
    const target = info.isDirectory() ? join(file, 'index.html') : file;
    const data   = await readFile(target);
    const ext    = extname(target);
    res.writeHead(200, { 'Content-Type': types[ext] ?? 'text/plain' });
    res.end(data);
  } catch {
    // SPA fallback
    const html = await readFile(join(root, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }
}

createServer(serve).listen(port, () => {
  console.log(`http://localhost:${port}`);
});
```

**`package.json`:**
```json
{
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "dev":   "PORT=3000 node server/index.js"
  }
}
```

---

### Option B — Using `@web/dev-server` (HMR, watch mode)

```bash
npm install -D @web/dev-server
```

```json
{
  "scripts": {
    "dev": "npx @web/dev-server --port 3000 --node-resolve false"
  }
}
```

`--node-resolve false` ensures Node never intercepts browser module resolution — import map stays fully in charge.

---

## Deno Server

No install. No `package.json`. Just run:

```ts
// server/index.ts
const root = Deno.cwd();
const port = Number(Deno.env.get('PORT')) || 3000;

const types: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js:   'application/javascript; charset=utf-8',
  css:  'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg:  'image/svg+xml',
  png:  'image/png',
};

async function serve(req: Request): Promise<Response> {
  const url  = new URL(req.url);
  let   path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/index.html';

  try {
    const file = await Deno.readFile(root + path);
    const ext  = path.split('.').pop() ?? '';
    return new Response(file, {
      headers: { 'Content-Type': types[ext] ?? 'text/plain' }
    });
  } catch {
    const html = await Deno.readFile(root + '/index.html');
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

Deno.serve({ port }, serve);
console.log(`http://localhost:${port}`);
```

```bash
deno run --allow-net --allow-read --allow-env server/index.ts
```

---

## What the browser sees

With either server running, here is the full chain for a page load:

```
Browser loads index.html
  └── reads <script type="importmap" src="CDN/importmap.json">
        └── fetches importmap.json from jsDelivr
              └── maps @adukiorg/native/* → CDN files
  └── reads <script type="module" src="/src/app.js">
        └── fetches /src/app.js from your local server
              └── browser sees: import { ReactiveStore } from '@adukiorg/native/state'
                    └── resolved via import map → CDN → dist/state.js
```

`node_modules` is never in this chain.

---

## Summary

| | Node (zero-dep) | Node (@web/dev-server) | Deno |
|---|---|---|---|
| Install | Nothing | `npm i -D @web/dev-server` | Nothing |
| Command | `node server/index.js` | `npx @web/dev-server` | `deno run ...` |
| HMR | No | Yes | No |
| `node_modules` in browser | Never | Never | Never |
| Import map in charge | Yes | Yes | Yes |
