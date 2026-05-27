/**
 * src/core/storage/index.js
 *
 * Unified Storage Gateway.
 * Integrates LRU caching, Cache API, OPFS, and IndexedDB under a unified,
 * tiered public storage surface.
 *
 * Source: doc 22 — Storage Architecture §1, §3
 */

import { Database } from './idb.js';
import { opfs } from './opfs.js';
import { CacheStorage } from './cache.js';
import { LRUCache, WeakLRUCache } from './lru.js';
import { quota } from './quota.js';

// Initialize default storage pool instances
const idb = new Database('platform-db', 1, [
  (db) => {
    // Initial core key-value store
    db.createObjectStore('keyval');
  }
]);

const cache = new CacheStorage('platform-cache');
const lru = new LRUCache(200);

export const storage = {
  /**
   * Retrieves an item from the requested tier.
   * If tier is not specified, defaults to reading from LRU memory first, then IndexedDB.
   */
  async get(key, tier = 'idb') {
    if (tier === 'memory') {
      return lru.get(key);
    }

    if (tier === 'opfs') {
      return opfs.get(key);
    }

    if (tier === 'cache') {
      const res = await cache.get(key);
      if (!res) return null;
      try {
        return await res.json();
      } catch {
        return await res.text();
      }
    }

    // Default 'idb' read with LRU memory caching
    const cached = lru.get(key);
    if (cached !== null) return cached;

    const value = await idb.get('keyval', key);
    if (value !== null) {
      lru.set(key, value);
    }
    return value;
  },

  /**
   * Saves an item to the requested tier.
   */
  async set(key, value, tier = 'idb', ttl = null) {
    if (tier === 'memory') {
      lru.set(key, value, ttl);
      return;
    }

    if (tier === 'opfs') {
      await opfs.set(key, value);
      return;
    }

    if (tier === 'cache') {
      const response = new Response(
        typeof value === 'object' ? JSON.stringify(value) : String(value),
        {
          headers: {
            'content-type': typeof value === 'object' ? 'application/json' : 'text/plain'
          }
        }
      );
      await cache.set(key, response, ttl);
      return;
    }

    // Default: Write to IDB and cache in LRU
    await idb.set('keyval', key, value);
    lru.set(key, value, ttl);
  },

  /**
   * Deletes an item from the storage tiers.
   */
  async delete(key, tier = 'idb') {
    lru.delete(key);

    if (tier === 'opfs') {
      await opfs.delete(key);
      return;
    }

    if (tier === 'cache') {
      await cache.delete(key);
      return;
    }

    await idb.delete('keyval', key);
  },

  /**
   * Performs advanced index/cursor queries on the IDB store.
   */
  async query(storeName, queryOpts) {
    return idb.query(storeName, queryOpts);
  },

  /**
   * Lists keys available in the store.
   */
  async list(tier = 'idb') {
    if (tier === 'opfs') {
      return opfs.list();
    }

    if (tier === 'cache') {
      const c = await cache.open();
      const keys = await c.keys();
      return keys.map((req) => req.url);
    }

    return idb.keys('keyval');
  },

  /**
   * Clears the storage pool for a specific tier or all.
   */
  async clear(tier = 'all') {
    lru.clear();

    if (tier === 'all' || tier === 'opfs') {
      await opfs.clear();
    }

    if (tier === 'all' || tier === 'cache') {
      await cache.clear();
    }

    if (tier === 'all' || tier === 'idb') {
      await idb.clear('keyval');
    }
  },

  /**
   * Retrieves storage quotas.
   */
  estimate() {
    return quota.estimate();
  },

  /**
   * Requests storage persistence.
   */
  persist() {
    return quota.persist();
  }
};

// Named class exports — lets consumers instantiate adapters directly:
// import { Database, LRUCache } from '@adukiorg/native/storage';
export { Database, LRUCache, WeakLRUCache };
