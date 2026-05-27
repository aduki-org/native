# @aduki/native

> Native-first web platform library. Pure browser ESM — no build step, no bundler, no framework lock-in.

[![npm](https://img.shields.io/npm/v/@aduki/native)](https://www.npmjs.com/package/@aduki/native)
[![license](https://img.shields.io/npm/l/@aduki/native)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-70%20passing-brightgreen)](#testing)

---

## What is this?

`@aduki/native` is a modular, zero-dependency platform library built entirely on top of browser-native APIs:

| Module | What it wraps |
|---|---|
| `/api` | `fetch`, Streams API, `scheduler.postTask` |
| `/state` | ES Proxy, `queueMicrotask`, `BroadcastChannel` |
| `/events` | Custom pub/sub with AbortSignal cleanup |
| `/router` | Navigation API, History API |
| `/storage` | IndexedDB, Cache API, OPFS, LRU memory |
| `/offline` | IDB-backed operation queue, `navigator.onLine` |
| `/animations` | WAAPI (`element.animate`), stagger groups |
| `/workers` | Web Locks API, Web Workers pool |
| `/security` | Web Crypto API, `DOMParser` XSS sanitizer |
| `/platform` | Feature detection for 30+ browser APIs |
| `/ui` | Shadow DOM base element, design token cascade |
| `/elements` | Custom element library |

No virtual DOM. No transpilation. Ships as plain `.js` files — `src/` is the distributable. There is no `dist/` folder because there is nothing to compile.

---

## Installation

```bash
npm install @aduki/native
```

---

## Import Map (no bundler)

The package ships an `importmap.json`. Reference it with a single `src` attribute — no copying, no maintaining a list:

```html
<script type="importmap" src="https://cdn.jsdelivr.net/npm/@aduki/native@0.1.0/importmap.json"></script>
<script type="module" src="app.js"></script>
```

That's it. Then in `app.js`:

```js
import { ReactiveStore }    from '@aduki/native/state';
import { api }              from '@aduki/native/api';
import { animate, stagger } from '@aduki/native/animations';
import { Database }         from '@aduki/native/storage';
import { queue }            from '@aduki/native/offline';
```

> **Pinning** — swap `@0.1.0` for `@latest` to always track the newest release, or pin for reproducible deploys.

> **Inline fallback** — if you need to override individual entries, copy the full map from `importmap.json` into a `<script type="importmap">` block and edit just the entries you need.

---

## Using in your project

### Path 1 — No build step (native ESM)

The simplest setup. One import map line, then plain ESM modules. Serve with any static file server.

```html
<!-- index.html -->
<script type="importmap" src="https://cdn.jsdelivr.net/npm/@aduki/native@0.1.0/dist/importmap.json"></script>
<script type="module" src="app.js"></script>
```

```js
// app.js
import { ReactiveStore } from '@aduki/native/state';
import { animate }       from '@aduki/native/animations';
import { Database }      from '@aduki/native/storage';

const store = new ReactiveStore({ count: 0 });
```

No bundler. No config. No build command.

---

### Path 2 — Bundle your own app

If you are bundling your own project, `@aduki/native` resolves automatically through its `package.json` exports map. Install it and import — your bundler handles the rest.

```bash
npm install @aduki/native
```

**esbuild:**
```js
// your build script
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/app.js'],
  bundle:  true,
  format:  'esm',
  outfile: 'public/app.js',
  // @aduki/native tree-shakes automatically from node_modules
});
```

**Bun:**
```js
await Bun.build({
  entrypoints: ['src/app.js'],
  outdir:  'public',
  format:  'esm',
  target:  'browser',
  minify:  true,
});
```

Your bundler pulls only the `@aduki/native` modules you actually import. No import map needed in the output.

---

### Path 3 — Self-host the dist files

Download `dist/` from the CDN or copy it from `node_modules/@aduki/native/dist/` and serve from your own origin. Then adjust the import map to your server path:

```html
<script type="importmap">
  {
    "imports": {
      "@aduki/native/state": "/vendor/native/state.js",
      "@aduki/native/api":   "/vendor/native/api.js"
    }
  }
</script>
```

---


## Quick Examples

### Reactive State

```js
import { ReactiveStore } from '@aduki/native/state';

const store = new ReactiveStore({ count: 0, theme: 'dark' });

store.subscribe('count', () => {
  console.log('count changed to', store.get('count'));
});

store.set('count', 1);  // fires after microtask flush
store.set('count', 2);  // batched — only one notification fires
```

### Network Requests

```js
import { api, PlatformError } from '@aduki/native/api';

try {
  const data = await api.get('https://api.example.com/posts');
  console.log(data);
} catch (err) {
  if (err instanceof PlatformError) {
    console.error(err.code, err.message); // 'NETWORK_TIMEOUT', 'HTTP_ERROR', etc.
  }
}
```

### IndexedDB Storage

```js
import { Database } from '@aduki/native/storage';

const db = new Database('myapp', 1, [
  (db) => db.createObjectStore('posts')
]);

await db.open();
await db.set('posts', 'post-1', { title: 'Hello', content: '...' });
const post = await db.get('posts', 'post-1');
```

### Animations

```js
import { animate, stagger } from '@aduki/native/animations';

// Single element
animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });

// Staggered group
const cards = document.querySelectorAll('.card');
stagger(Array.from(cards), [
  { transform: 'translateY(20px)', opacity: 0 },
  { transform: 'translateY(0)',    opacity: 1 }
], { duration: 250, staggerDelay: 60 });
```

### Offline Queue

```js
import { queue }   from '@aduki/native/offline';
import { check }   from '@aduki/native/offline';

if (!check()) {
  // Not online — enqueue for later
  queue.push({ id: 'op-1', action: 'CREATE_POST', payload: post });
}

// When back online — drain queue
for (const task of queue.list()) {
  await syncToServer(task);
  queue.remove(task.id);
}
```

### Client-Side Router

```js
import { register, navigate } from '@aduki/native/router';

register('/posts/:id', async ({ params }) => {
  const post = await fetchPost(params.id);
  renderPost(post);
});

navigate('/posts/42');
```

### Web Crypto

```js
import { uuid, hash, encrypt, decrypt } from '@aduki/native/security';

const id  = uuid();                         // crypto.randomUUID()
const sig = await hash('Hello', 'SHA-256'); // hex string
const key = await generateKey();
const { ciphertext, iv } = await encrypt(key, 'secret data');
const plain = await decrypt(key, ciphertext, iv);
```

---

## Project Layout

```
src/
├── index.js              ← root barrel (re-exports all modules)
├── core/
│   ├── api/              ← fetch, retry, stream, pipeline, upload
│   ├── state/            ← ReactiveStore, derived, sync
│   ├── events/           ← EventBus
│   ├── router/           ← register, match, guards, history, outlet
│   ├── storage/          ← Database (IDB), LRUCache, storage facade
│   ├── offline/          ← queue, connectivity
│   ├── animations/       ← animate, stagger
│   ├── workers/          ← lock, WorkerPool
│   ├── security/         ← sanitize, uuid, hash, encrypt/decrypt
│   ├── platform/         ← supports (feature detection)
│   └── ui/               ← BaseElement, design tokens
├── elements/             ← custom element library
├── styles/               ← design token CSS
├── tokens/               ← primitive & semantic token definitions
└── sw/                   ← service worker helpers

tests/                    ← 26 suites, 70 assertions (real Chromium)
blog/                     ← sample SPA demo
usages/                   ← integration guides
docs/                     ← architecture research docs
```

---

## Testing

Tests run in **real Chromium** via `@web/test-runner` — no jsdom, no mocks for Shadow DOM, IndexedDB, Web Locks, or WAAPI.

```bash
npm test
```

```
Chrome: 26/26 test files | 70 passed, 0 failed
Finished in 1.1s, all tests passed! 🎉
```

---

## Dev Server

Serves the project root with native ESM at `http://localhost:8080`:

```bash
npm run serve
# then open: http://localhost:8080/blog/index.html
```

---

## Publishing

```bash
# Authenticate with the @aduki npm scope
npm login

# Dry run to verify what ships
npm pack --dry-run

# Publish
npm publish --access public
```

Only `src/` is included in the published package (see `"files"` in `package.json`).

---

## Browser Support

Requires a modern evergreen browser. No polyfills are included or needed:

- Chrome / Edge 105+
- Firefox 115+
- Safari 16.4+

---

## License

[MIT](./LICENSE) © 2026 Aduki
