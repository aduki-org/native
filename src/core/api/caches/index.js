/**
 * src/core/api/caches/index.js
 *
 * Unified Cache API wrapper for the dynamic API client.
 * Implements granular TTL/expiry controls and glob namespace invalidation patterns.
 *
 * Source: doc 11 — Networking §6, core/api/plan.md
 */

import { globToRegex } from './glob.js';

const CACHE_NAME = 'platform-api-cache';

export class ApiCache {
  constructor(name = CACHE_NAME) {
    this.name = name;
  }

  /**
   * Opens the underlying cache store.
   *
   * @returns {Promise<Cache>}
   */
  open() {
    return caches.open(this.name);
  }

  /**
   * Retrieves an item from the cache store.
   * Evicts the record and returns null if the entry has expired.
   *
   * @param {string|Request} request
   * @returns {Promise<Response|null>}
   */
  async get(request) {
    if (typeof caches === 'undefined') return null;
    
    const store = await this.open();
    const req = typeof request === 'string' ? new Request(request) : request;
    const cached = await store.match(req);

    if (!cached) return null;

    const expiresAt = cached.headers.get('x-expires-at');
    if (expiresAt && Date.now() > Number(expiresAt)) {
      await store.delete(req);
      return null;
    }

    return cached.clone();
  }

  /**
   * Caches a Response with a designated TTL.
   *
   * @param {string|Request} request
   * @param {Response} response
   * @param {number} ttlMs
   * @returns {Promise<void>}
   */
  async set(request, response, ttlMs) {
    if (typeof caches === 'undefined') return;

    const store = await this.open();
    const req = typeof request === 'string' ? new Request(request) : request;
    const headers = new Headers(response.headers);
    
    if (ttlMs) {
      headers.set('x-expires-at', String(Date.now() + ttlMs));
    }

    const cloned = new Response(response.body ? response.clone().body : null, {
      status: response.status,
      statusText: response.statusText,
      headers
    });

    await store.put(req, cloned);
  }

  /**
   * Removes cached entries matching the provided url or glob pattern.
   *
   * @param {string} pattern
   * @returns {Promise<void>}
   */
  async delete(pattern) {
    if (typeof caches === 'undefined') return;

    const store = await this.open();

    if (pattern.includes('*')) {
      const regex = globToRegex(pattern);
      const keys = await store.keys();
      
      for (const req of keys) {
        const urlObj = new URL(req.url);
        if (regex.test(req.url) || regex.test(urlObj.pathname)) {
          await store.delete(req);
        }
      }
    } else {
      await store.delete(pattern);
    }
  }

  /**
   * Completely purges the entire API cache store.
   *
   * @returns {Promise<void>}
   */
  async clear() {
    if (typeof caches === 'undefined') return;
    await caches.delete(this.name);
  }
}

export const cache = new ApiCache();
