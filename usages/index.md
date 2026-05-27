# @aduki/native — Usage Guide

A practical reference for integrating `@aduki/native` into any browser-native app.  
No build step. No bundler. Just an import map and native ESM.

**Guides:** [Core modules](#modules) · [Server setup](./server.md) · [Elements](./elements.md)

---

## Setup

### 1. Install

```bash
npm install @aduki/native
```

### 2. Declare an Import Map

The package ships an `importmap.json`. One line — no copying, no list to maintain:

```html
<script type="importmap" src="https://cdn.jsdelivr.net/npm/@aduki/native@0.1.0/importmap.json"></script>
```

> Swap `@0.1.0` for `@latest` to always track the newest release, or pin the version for reproducible deploys.

> **Need to override a single module?** Copy the full map from [`importmap.json`](https://cdn.jsdelivr.net/npm/@aduki/native@0.1.0/importmap.json) into a `<script type="importmap">` inline block and edit just the entries you need.

### 3. Import in your modules

```js
// app.js
import { ReactiveStore }    from '@aduki/native/state';
import { api }              from '@aduki/native/api';
import { Database }         from '@aduki/native/storage';
import { animate }          from '@aduki/native/animations';
```

---

## Modules

---

### `@aduki/native/state`

Reactive, proxy-based state with microtask-batched change notifications.

```js
import { ReactiveStore, derived, sync } from '@aduki/native/state';

// Basic store
const store = new ReactiveStore({ user: null, theme: 'dark' });

store.subscribe('theme', () => {
  document.body.dataset.theme = store.get('theme');
});

store.set('theme', 'light');

// Snapshot / hydrate
const snap = store.snapshot();   // deep clone of raw state
store.reset({ theme: 'dark' });  // wipe and reinitialize
store.hydrate(snap);             // restore from snapshot

// Batch multiple mutations — single notification
store.batch(() => {
  store.set('user', { name: 'Ada' });
  store.set('theme', 'dark');
});

// Cross-tab sync via BroadcastChannel
const synced = sync(store, 'app-channel');

// Derived computed value
const greeting = derived(() => {
  const user = store.get('user');
  return user ? `Hello, ${user.name}` : 'Hello, guest';
});
greeting.subscribe(() => console.log(greeting.value));
```

---

### `@aduki/native/api`

Fetch wrapper with retries, caching, timeouts, and streaming.

```js
import { api, PlatformError, retry, stream } from '@aduki/native/api';

// Simple GET — auto-parses JSON
const posts = await api.get('/api/posts');

// POST with body
const post = await api.post('/api/posts', { title: 'Hello', content: '...' });

// Request options
const data = await api.get('/api/feed', {
  timeout: 5000,
  retries: 2,
  cache: 'network-first',
  signal: controller.signal
});

// Error handling
try {
  await api.get('/api/missing');
} catch (err) {
  if (err instanceof PlatformError) {
    console.log(err.code);       // 'HTTP_ERROR' | 'NETWORK_TIMEOUT' | 'NETWORK_ERROR'
    console.log(err.recoverable); // true for 5xx, false for 4xx
  }
}

// NDJSON streaming
for await (const chunk of stream('/api/events')) {
  console.log(chunk); // parsed JSON object per line
}
```

---

### `@aduki/native/storage`

Tiered storage: LRU memory → IndexedDB → Cache API → OPFS.

```js
import { storage, Database, LRUCache } from '@aduki/native/storage';

// Unified facade (picks the right tier automatically)
await storage.set('user', { name: 'Ada' });
const user = await storage.get('user');     // IDB + LRU
await storage.delete('user');
await storage.clear();

// Specific tiers
await storage.set('token', 'abc', 'memory');   // LRU only
await storage.set('blob', data,  'cache');      // Cache API
await storage.set('file', buf,   'opfs');       // OPFS

// Direct IndexedDB adapter
const db = new Database('myapp', 1, [
  (db) => {
    db.createObjectStore('posts');
    db.createObjectStore('drafts');
  }
]);
await db.open();
await db.set('posts', 'post-1', { title: 'Hello' });
const post   = await db.get('posts', 'post-1');
const keys   = await db.keys('posts');
const all    = await db.getAll('posts');
await db.delete('posts', 'post-1');
await db.clear('posts');
db.close();

// LRU cache
const lru = new LRUCache(500);  // max 500 entries
lru.set('key', value, 30000);   // optional TTL in ms
lru.get('key');
lru.delete('key');
lru.clear();
```

---

### `@aduki/native/offline`

Offline queue and connectivity detection.

```js
import { queue, check, subscribe } from '@aduki/native/offline';

// Connectivity
const online = check();                    // true | false right now
subscribe((isOnline) => {
  console.log('Network changed:', isOnline);
});

// Queue operations when offline
if (!check()) {
  queue.push({ id: 'op-1', action: 'CREATE', payload: post });
}

// Drain queue when back online
subscribe(async (online) => {
  if (!online) return;
  for (const task of queue.list()) {
    await sendToServer(task);
    queue.remove(task.id);
  }
});
```

---

### `@aduki/native/animations`

WAAPI wrappers with AbortSignal and stagger support.

```js
import { animate, stagger } from '@aduki/native/animations';

// Single element
const anim = animate(el, [
  { opacity: 0, transform: 'translateY(10px)' },
  { opacity: 1, transform: 'translateY(0)' }
], { duration: 300, easing: 'ease-out' });

// Cancel via AbortSignal
const ctrl = new AbortController();
animate(el, keyframes, { duration: 500, signal: ctrl.signal });
ctrl.abort(); // instantly cancels

// Stagger a list of elements
const cards = document.querySelectorAll('.card');
const group = stagger(Array.from(cards), [
  { opacity: 0, transform: 'scale(0.95)' },
  { opacity: 1, transform: 'scale(1)' }
], { duration: 250, staggerDelay: 50 });

await group.finished;   // resolves when last animation completes
group.cancel();         // cancel all at once
group.finish();         // fast-forward all to end
```

---

### `@aduki/native/router`

Client-side routing over the Navigation API and History API.

```js
import { register, navigate, addGuard, setNotFound } from '@aduki/native/router';

// Register routes
register('/',          () => render(HomePage));
register('/posts/:id', ({ params }) => render(PostPage, params));
register('/settings',  () => render(SettingsPage));

// Navigation guard (async — can redirect or abort)
addGuard(async ({ url, next }) => {
  if (!isLoggedIn() && url.pathname.startsWith('/settings')) {
    navigate('/login');
    return; // abort this navigation
  }
  next();
});

// 404 handler
setNotFound(() => render(NotFoundPage));

// Programmatic navigation
navigate('/posts/42');
navigate('/posts/42', { state: { scroll: 0 } });
```

---

### `@aduki/native/events`

Typed pub/sub with wildcard patterns and AbortSignal cleanup.

```js
import { events, EventBus } from '@aduki/native/events';

// Global singleton bus
events.on('auth:login',  (user) => console.log('Logged in:', user));
events.emit('auth:login', { id: 1, name: 'Ada' });
events.off('auth:login', handler);

// AbortSignal auto-cleanup (no manual .off needed)
const ctrl = new AbortController();
events.on('theme:change', handler, { signal: ctrl.signal });
ctrl.abort(); // listener removed automatically

// Scoped bus for a feature
const bus = new EventBus();
bus.on('*', (event, data) => console.log(event, data)); // wildcard
```

---

### `@aduki/native/workers`

Web Locks and Worker pool coordination.

```js
import { lock, WorkerPool } from '@aduki/native/workers';

// Exclusive lock — safe concurrent access to shared resources
const result = await lock('db-write', async () => {
  await db.set('posts', id, post);
  return id;
});

// Lock with timeout
await lock('sync', async () => { /* ... */ }, { timeout: 3000 });

// Worker pool
const pool = new WorkerPool('/workers/compute.js', { size: 4 });
const result = await pool.run({ action: 'compress', data: blob });
pool.terminate();
```

---

### `@aduki/native/security`

Web Crypto and XSS sanitization.

```js
import { uuid, hash, generateKey, encrypt, decrypt, sanitize } from '@aduki/native/security';

// Identifiers
const id = uuid();   // crypto.randomUUID()

// Hashing
const digest = await hash('password', 'SHA-256');  // hex string
const sha512 = await hash('data',     'SHA-512');

// AES-GCM encryption
const key = await generateKey();
const { ciphertext, iv } = await encrypt(key, 'secret payload');
const plain = await decrypt(key, ciphertext, iv);

// PBKDF2 key derivation
const derived = await deriveKey('user-password', salt);

// XSS-safe HTML
const safe = sanitize('<img src=x onerror=alert(1)>Hello<b>world</b>');
// → 'Hello<b>world</b>'
```

---

### `@aduki/native/platform`

Feature detection — check before using any API.

```js
import { supports } from '@aduki/native/platform';

if (supports('indexedDB'))    { /* use IDB */ }
if (supports('locks'))        { /* use Web Locks */ }
if (supports('opfs'))         { /* use Origin Private File System */ }
if (supports('navigation'))   { /* use Navigation API */ }
if (supports('scheduler'))    { /* use scheduler.postTask */ }
if (supports('broadcastChannel')) { /* use BroadcastChannel */ }
```

---

## Full SPA Example

See `blog/` in the repository — a complete offline-capable blog SPA using:

- `ReactiveStore` for all UI state
- `Database` for IndexedDB post persistence  
- `queue` for offline enqueuing
- `stagger` for card entry animations
- Import map matching the published `@aduki/native/*` exports exactly

```bash
npm run serve
# Open http://localhost:8080/blog/index.html
```
