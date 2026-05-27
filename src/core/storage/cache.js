/**
 * src/core/storage/cache.js
 *
 * Cache API Wrapper.
 * Provides a Promise-based cache client with seamless TTL (Time-To-Live)
 * support by leveraging cloned Response header extensions.
 *
 * Source: doc 11 — Networking §6, doc 22 — Storage Architecture §5
 */

export class CacheStorage {
  constructor(name) {
    this.name = name;
  }

  /**
   * Opens the underlying browser cache.
   */
  open() {
    return caches.open(this.name);
  }

  /**
   * Retrieves a cached response, automatically evicting if expired.
   */
  async get(request) {
    const cache = await this.open();
    const req = typeof request === 'string' ? new Request(request) : request;
    const res = await cache.match(req);

    if (!res) return null;

    // Evaluate custom TTL header
    const expires = res.headers.get('x-expires-at');
    if (expires && Date.now() > parseInt(expires, 10)) {
      await cache.delete(req);
      return null;
    }

    return res;
  }

  /**
   * Caches a Response with an optional TTL (Time-to-Live).
   */
  async set(request, response, ttlMs) {
    const cache = await this.open();
    const req = typeof request === 'string' ? new Request(request) : request;

    let finalResponse = response.clone();

    // Attach custom expiry header if a TTL is provided and response allows header mutation
    if (ttlMs && response.type !== 'opaque') {
      const headers = new Headers(response.headers);
      headers.set('x-expires-at', String(Date.now() + ttlMs));

      // Construct a new response copying the original body stream and properties
      finalResponse = new Response(response.body ? response.clone().body : null, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    await cache.put(req, finalResponse);
  }

  /**
   * Removes an entry from the cache.
   */
  async delete(request) {
    const cache = await this.open();
    const req = typeof request === 'string' ? new Request(request) : request;
    return cache.delete(req);
  }

  /**
   * Deletes the entire cache storage pool.
   */
  async clear() {
    return caches.delete(this.name);
  }
}
