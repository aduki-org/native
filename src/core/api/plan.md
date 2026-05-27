# API Client & Cache Enhancement Plan

This document outlines the blueprint for enhancing the `core.api` networking client with localized, fine-grained caching, prefix registration, namespace-level invalidation, and custom network/status-code events.

---

## 1. Architectural Architecture & Requirements

We will extend `core.api` to provide:

1. **Default Zero-Cache Policy:** All calls default to no cache, running directly against the network.
2. **TTL/Expiry-based API Caching:** Active caching when `expiry` or `ttl` (Time-To-Live) options are provided. Hits cache first, falls back to the network on a miss, and caches successful responses.
3. **Namespace-level Glob Invalidation:** Support for clearing the entire cache, a single URL, or a glob namespace pattern (e.g. `/user/*`).
4. **Outbound Prefix Resolution:** Initializing base prefixes once (optionally) to cleanly rewrite and resolve endpoint URLs.
5. **Network Event Hub:** An integrated event listener system firing on generic network failures (errors, timeouts) or specific responses (status codes like `401`, `500`, or content types like `json`, `text`).

---

## 2. Structural & Folder Layout

In accordance with our naming and folder conventions (`RULE[user_global]`), we will group caching and events into highly structured subfolders under `src/core/api/`:

```
src/core/api/
├── caches/               # Subfolder for caching adapters & glob matching
│   ├── glob.js           # Glob/Namespace pattern matching helper
│   └── index.js          # Unified local API cache client
├── events/               # Subfolder for network telemetry events
│   └── index.js          # API event emitter implementation
├── prefixes/             # Subfolder for prefix/base URL resolving
│   └── index.js          # Prefix store and path normalization
├── index.js              # Core API client entry point
├── fetch.js              # Network request executor
├── pipeline.js           # Inbound/Outbound pipeline coordinator
├── retry.js              # Exponential backoff retry handler
├── stream.js             # Streams and NDJSON transform pipeline
└── upload.js             # XMLHttpRequest-based upload gateway
```

---

## 3. Technical Blueprint & Interface Design

### Caches & Glob Purging (`src/core/api/caches/`)

The API cache uses the native browser Cache API with custom header tags to track record creation times and TTL.

```javascript
// src/core/api/caches/index.js
export class ApiCache {
  constructor(name = 'platform-api-cache') {
    this.name = name;
  }

  async get(url) {
    if (typeof caches === 'undefined') return null;
    const store = await caches.open(this.name);
    const cached = await store.match(url);
    if (!cached) return null;

    const expiresAt = cached.headers.get('x-expires-at');
    if (expiresAt && Date.now() > Number(expiresAt)) {
      await store.delete(url);
      return null;
    }
    return cached.clone();
  }

  async set(url, response, ttlMs) {
    if (typeof caches === 'undefined') return;
    const store = await caches.open(this.name);
    const headers = new Headers(response.headers);
    headers.set('x-expires-at', String(Date.now() + ttlMs));

    const cloned = new Response(response.body ? response.clone().body : null, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
    await store.put(url, cloned);
  }

  async delete(pattern) {
    if (typeof caches === 'undefined') return;
    const store = await caches.open(this.name);

    if (pattern.includes('*')) {
      const regex = globToRegex(pattern);
      const keys = await store.keys();
      for (const req of keys) {
        if (regex.test(req.url) || regex.test(new URL(req.url).pathname)) {
          await store.delete(req);
        }
      }
    } else {
      await store.delete(pattern);
    }
  }

  async clear() {
    if (typeof caches === 'undefined') return;
    await caches.delete(this.name);
  }
}
```

Glob to Regex conversion helper:

```javascript
// src/core/api/caches/glob.js
export function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const wildcarded = escaped.replace(/\*/g, '.*');
  return new RegExp(`^${wildcarded}$`);
}
```

### Prefix Resolver (`src/core/api/prefixes/`)

```javascript
// src/core/api/prefixes/index.js
export class PrefixRegistry {
  #prefixes = new Map();

  add(name, value) {
    this.#prefixes.set(name, value);
  }

  resolve(url) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    for (const [prefix, base] of this.#prefixes.entries()) {
      if (url.startsWith(`/${prefix}/`)) {
        return base + url.slice(prefix.length + 1);
      }
      if (url.startsWith(`${prefix}/`)) {
        return base + '/' + url.slice(prefix.length);
      }
    }
    // Default fallback to registered root or baseline domain
    const root = this.#prefixes.get('root') || this.#prefixes.get('default');
    if (root) {
      return root + (url.startsWith('/') ? url : '/' + url);
    }
    return url;
  }
}
```

### Telemetry Events (`src/core/api/events/`)

```javascript
// src/core/api/events/index.js
export class ApiEventEmitter {
  #listeners = new Map();

  on(event, handler, signal) {
    if (signal?.aborted) return () => {};
    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }
    const listener = { handler };
    this.#listeners.get(event).add(listener);

    const dispose = () => {
      const set = this.#listeners.get(event);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.#listeners.delete(event);
      }
    };

    if (signal) {
      signal.addEventListener('abort', dispose);
    }
    return dispose;
  }

  emit(event, detail) {
    const set = this.#listeners.get(event);
    if (!set) return;
    const customEvent = { type: event, detail };
    for (const listener of [...set]) {
      try {
        listener.handler(customEvent);
      } catch (err) {
        console.error(`Error in API event listener for "${event}":`, err);
      }
    }
  }
}
```

---

## 4. Verification Plan

### Automated Verification

- Write comprehensive test coverage validating:
  - Cache hits on active TTL/Expiry options.
  - Glob namespace clearing matches (e.g. `/user/*` successfully purges `/user/profile` and `/user/settings`).
  - Outbound path prefix expansion.
  - Correct event dispatching for generic `'error'`, `'timeout'`, specific codes (`status:401`), and content types (`type:json`).

### Integration Check

- Assert network trace outputs and test page lifecycle triggers inside the browser environment.
