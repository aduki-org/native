/**
 * src/core/storage/lru.js
 *
 * Bounded Least-Recently-Used (LRU) Cache.
 * Provides Map-based LRU and WeakRef-based GC-eligible bounded caches
 * supporting custom TTL values.
 *
 * Source: doc 22 — Storage Architecture §2
 */

export class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;

    const entry = this.cache.get(key);
    if (entry.expires && Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    // Refresh access position by moving key to the end
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Map keys iterator guarantees insertion-order; first item is least recently used
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }

    const expires = ttlMs ? Date.now() + ttlMs : null;
    this.cache.set(key, { value, expires });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}

/**
 * WeakRef-based bounded LRU cache.
 * Yields elements to the Garbage Collector if memory pressure requires.
 */
export class WeakLRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;

    const entry = this.cache.get(key);
    const value = entry.ref.deref();

    // Clean up if GC collected the reference or TTL expired
    if (value === undefined || (entry.expires && Date.now() > entry.expires)) {
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);
    return value;
  }

  set(key, value, ttlMs) {
    if (typeof value !== 'object' && typeof value !== 'function') {
      throw new TypeError('WeakLRUCache values must be objects or functions');
    }

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }

    const expires = ttlMs ? Date.now() + ttlMs : null;
    this.cache.set(key, {
      ref: new WeakRef(value),
      expires
    });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}
