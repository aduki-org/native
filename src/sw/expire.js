/**
 * src/sw/expire.js
 *
 * Cache Expiration Pruner.
 * Checks Cache API records, extracts custom x-expires-at response headers,
 * and deletes expired cache records dynamically to conserve storage quota.
 *
 * Source: doc 13 — Offline and Background §3, doc 22 — Storage Architecture §2
 */

/**
 * Iterates over a specific cache, parsing expires headers and deleting expired entries.
 */
export async function pruneExpired(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    const now = Date.now();

    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const expiresAtStr = response.headers.get('x-expires-at');
        if (expiresAtStr) {
          const expiresAt = parseInt(expiresAtStr, 10);
          if (expiresAt && expiresAt < now) {
            await cache.delete(request);
          }
        }
      }
    }
  } catch (err) {
    console.warn(`Prune expired failed for cache "${cacheName}":`, err);
  }
}

/**
 * Sets up a periodic automatic pruning interval.
 */
export function setupAutoPrune(cacheName, intervalMs = 60000) {
  if (typeof setInterval !== 'undefined') {
    return setInterval(() => {
      pruneExpired(cacheName).catch(() => {});
    }, intervalMs);
  }
  return null;
}
