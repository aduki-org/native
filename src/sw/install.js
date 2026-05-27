/**
 * src/sw/install.js
 *
 * Installation Lifecycle Helpers.
 * Handles precaching of core application shell resources and offline fallback
 * pages during the Service Worker installation phase.
 *
 * Source: doc 13 — Offline and Background §3, §4
 */

/**
 * Pre-caches critical shell and script assets.
 */
export async function precache(cacheName, urls) {
  try {
    const cache = await caches.open(cacheName);
    await cache.addAll(urls);
  } catch (err) {
    console.error(`Precache failed for cache "${cacheName}":`, err);
    throw err;
  }
}

/**
 * Explicitly pre-caches the offline fallback page document.
 */
export async function prefetchFallback(fallbackUrl) {
  try {
    const cache = await caches.open('platform-offline-fallback');
    await cache.add(fallbackUrl);
  } catch (err) {
    console.error(`Prefetch fallback failed for "${fallbackUrl}":`, err);
    throw err;
  }
}
