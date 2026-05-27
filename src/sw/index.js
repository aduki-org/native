/**
 * src/sw/index.js
 *
 * Public Service Worker entry point.
 * Aggregates and re-exports all modular service worker strategies, URLPattern
 * routing interceptors, TTL cache expiration pruners, install/activate lifecycle helpers,
 * Background Sync task replay buffers, and Web Push notifications.
 *
 * Source: doc 13 — Offline and Background §3
 */

export {
  CacheFirst,
  NetworkFirst,
  StaleRevalidate,
  CacheThenNetwork,
  NetworkOnly,
  CacheOnly,
  OfflineFallback
} from './strategies.js';

export { router, Router } from './routes.js';
export { serializeRequest, deserializeRequest } from './queue.js';
export { pruneExpired, setupAutoPrune } from './expire.js';
export { precache, prefetchFallback } from './install.js';
export { pruneStale, claim, enableNavPreload } from './activate.js';
export { replayQueue, requeueFailed } from './sync.js';
export { subscribe, notify } from './push.js';
