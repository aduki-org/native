# Browser Capabilities Detection Module Documentation

## Purpose and Architectural Position
The `supports` module resides at the absolute foundation of the core library (`src/core/platform/supports.js`). It acts as a static, lazy-evaluated feature detection layer that detects the availability of standard modern web features. Downstream modules query this capability map before initializing browser-native strategies, dynamically selecting optimal execution paths or executing graceful fallbacks.

## Public API Surface with Examples

The module exports a read-only `supports` object:

```javascript
import { supports } from 'lib/core/platform/supports.js';

// Query browser-native feature support flags
if (supports.serviceWorker) {
  console.log('Registering service worker channel...');
}

if (supports.indexedDB) {
  console.log('IndexedDB is fully supported!');
}

if (!supports.webLocks) {
  console.warn('Web Locks API missing, falling back to local concurrent execution...');
}
```

### Supported Capability Flags
* `serviceWorker` — Native Service Worker capability (`'serviceWorker' in navigator`)
* `indexedDB` — Indexed Database support (`'indexedDB' in window`)
* `broadcastChannel` — Cross-tab messaging (`'BroadcastChannel' in window`)
* `webLocks` — Exclusive thread synchronization (`'locks' in navigator`)
* `crypto` — Subprocess subtle crypter (`'subtle' in crypto`)
* `sanitizer` — Experimental HTML Sanitizer API (`'Sanitizer' in globalThis`)
* `waapi` — Element animations execution engine (`'animate' in document.createElement('div')`)
* `popover` — Native overlays support (`'popover' in document.createElement('div')`)

## AbortSignal and Cleanup Contract
This module contains stateless detection flags evaluated once during parsing; it maintains no microtask listeners, event hooks, or open streams, and requires no manual disposers or `AbortSignal` bindings.

## Known Browser Gaps and Polyfill Strategy
* **HTML Sanitizer API**: Currently experimental. The core sanitization module transparently falls back to a custom `DOMParser`-based node-filtering algorithm when `supports.sanitizer` returns `false`.
* **Web Locks API**: Missing in ancient layout runtimes. The locks facade gracefully falls back to direct callback execution when `supports.webLocks` returns `false`.
