/**
 * src/sw/activate.js
 *
 * Activation Lifecycle Helpers.
 * Coordinates stale cache eviction pruning, controlled browsing context claims,
 * and standard navigation preloads.
 *
 * Source: doc 13 — Offline and Background §3
 */

/**
 * Prunes all cached storage buckets except for the active version and fallback cache.
 */
export async function pruneStale(currentCacheName) {
  try {
    const keys = await caches.keys();
    const whitelist = new Set([currentCacheName, 'platform-offline-fallback']);

    for (const key of keys) {
      if (!whitelist.has(key)) {
        await caches.delete(key);
      }
    }
  } catch (err) {
    console.warn('Pruning stale caches failed:', err);
  }
}

/**
 * Instructs the Service Worker to take immediate control of all controlled tabs.
 */
export async function claim() {
  if (typeof self !== 'undefined' && self.clients?.claim) {
    await self.clients.claim();
  }
}

/**
 * Enables standard native Navigation Preload.
 */
export async function enableNavPreload(registration) {
  const targetReg = registration || (typeof self !== 'undefined' ? self.registration : null);

  if (targetReg && targetReg.navigationPreload) {
    try {
      await targetReg.navigationPreload.enable();
    } catch (err) {
      console.warn('Failed to enable navigation preload:', err);
    }
  }
}
