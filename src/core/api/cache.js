/**
 * src/core/api/cache.js
 *
 * Direct Cache API integration on the main thread.
 * Implements three standard caching strategies:
 * 1. cache-first: Shell & static assets cache.
 * 2. network-first: Dynamic API data fallback.
 * 3. stale-while-revalidate: High-performance near-instant timelines/feeds.
 *
 * Source: doc 11 — Networking §6
 */

const CACHE_NAME = 'platform-api-cache';

/**
 * Handles request caching using declared strategies.
 */
export async function handle(descriptor, executeFetch) {
  const { cache: strategy, url, method = 'GET' } = descriptor;

  // Caching is strictly limited to GET requests and when Cache API is present
  if (!strategy || method !== 'GET' || typeof caches === 'undefined') {
    return executeFetch(descriptor);
  }

  const storage = await caches.open(CACHE_NAME);

  if (strategy === 'cache-first') {
    const cached = await storage.match(url);
    if (cached) return cached;

    const response = await executeFetch(descriptor);
    if (response.ok) {
      await storage.put(url, response.clone());
    }
    return response;
  }

  if (strategy === 'network-first') {
    try {
      const response = await executeFetch(descriptor);
      if (response.ok) {
        await storage.put(url, response.clone());
      }
      return response;
    } catch (err) {
      const cached = await storage.match(url);
      if (cached) return cached;
      throw err; // propagates the normalized error if no cache is present
    }
  }

  if (strategy === 'stale-while-revalidate') {
    const cached = await storage.match(url);

    const revalidate = async () => {
      try {
        const response = await executeFetch(descriptor);
        if (response.ok) {
          await storage.put(url, response.clone());
          // Broadcast to the system that state cache has updated
          globalThis.dispatchEvent(
            new CustomEvent('cache:updated', {
              detail: { url, status: 'updated' }
            })
          );
        }
      } catch (err) {
        console.warn(`Background revalidation failed for ${url}:`, err);
      }
    };

    if (cached) {
      // Trigger background revalidation asynchronously
      revalidate();
      return cached;
    }

    const response = await executeFetch(descriptor);
    if (response.ok) {
      await storage.put(url, response.clone());
    }
    return response;
  }

  return executeFetch(descriptor);
}

/**
 * Clears specific entry or entire API cache store.
 */
export async function invalidate(url) {
  if (typeof caches === 'undefined') return;
  const storage = await caches.open(CACHE_NAME);
  if (url) {
    await storage.delete(url);
  } else {
    await caches.delete(CACHE_NAME);
  }
}
