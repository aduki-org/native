/**
 * src/core/state/persist.js
 *
 * Transaction-aware IndexedDB persistence engine.
 * Wraps low-level IDBRequest events with a clean Promise-based facade,
 * manages chronologically ordered schema upgrades inside versionchange transactions,
 * and exposes storage manager quota/persistence handlers.
 *
 * Source: doc 08 — State Management §5, §12, §13, §15
 */

export class PlatformStorage {
  #db = null;
  #migrations = [];
  #version = 1;
  #dbName = 'platform-db';

  /**
   * Registers custom schema migration handlers.
   * Migrations are index-mapped to the sequential schema upgrades (oldVersion -> N).
   */
  registerMigrations(migrations) {
    this.#migrations = migrations;
    this.#version = migrations.length + 1;
  }

  /**
   * Connects to IndexedDB, evaluating upgrades sequentially inside transactions.
   */
  async open() {
    if (this.#db) return this.#db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.#dbName, this.#version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const tx = event.target.transaction;
        const oldVersion = event.oldVersion;

        for (let i = oldVersion; i < this.#migrations.length; i++) {
          try {
            this.#migrations[i](db, tx);
          } catch (err) {
            console.error(`Storage schema migration failed for version v${i + 1}:`, err);
            tx.abort();
            return reject(err);
          }
        }
      };

      request.onsuccess = (event) => {
        this.#db = event.target.result;
        resolve(this.#db);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * Retrieves a record from a specific store by its key.
   */
  async get(storeName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Adds or updates a record inside a specific store.
   */
  async set(storeName, key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      
      // key is optional if store has inline keyPath
      const request = key ? store.put(value, key) : store.put(value);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Deletes a record from a specific store.
   */
  async delete(storeName, key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Resolves a filtered list of records from a specific store.
   */
  async query(storeName, queryFn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        resolve(queryFn ? results.filter(queryFn) : results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Fetches browser disk space allocation parameters for this origin.
   */
  async estimate() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      return navigator.storage.estimate();
    }
    return { quota: 0, usage: 0 };
  }

  /**
   * Requests origin storage to be marked as persistent (exempt from browser eviction).
   */
  async persist() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist();
    }
    return false;
  }

  /**
   * Checks whether the origin has persistent storage enabled.
   */
  async isPersisted() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      return navigator.storage.persisted();
    }
    return false;
  }
}

export const storage = new PlatformStorage();
