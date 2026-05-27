/**
 * src/core/storage/idb.js
 *
 * Promise-wrapped IndexedDB Adapter.
 * Encapsulates transactional storage operations, sequential migrations,
 * and cursor/index queries.
 *
 * Source: doc 22 — Storage Architecture §1, §3
 */

export class Database {
  #db = null;

  constructor(name, version, migrations = []) {
    this.name = name;
    this.version = version;
    this.migrations = migrations; // array of migration functions
  }

  /**
   * Opens the IndexedDB connection and performs sequential migrations if required.
   */
  open() {
    if (this.#db) return Promise.resolve(this.#db);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = event.oldVersion;
        const newVersion = event.newVersion;

        // Perform sequential version migrations (non-skipping)
        for (let v = oldVersion; v < newVersion; v++) {
          const migrate = this.migrations[v];
          if (typeof migrate === 'function') {
            try {
              migrate(db);
            } catch (err) {
              console.error(`Migration to version ${v + 1} failed:`, err);
            }
          }
        }
      };

      request.onsuccess = () => {
        this.#db = request.result;
        resolve(this.#db);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Closes the active IndexedDB connection.
   */
  close() {
    if (this.#db) {
      this.#db.close();
      this.#db = null;
    }
  }

  /**
   * Helper to execute a single-store transaction.
   */
  #run(storeName, mode, callback) {
    return this.open().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);

        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(new Error('Transaction aborted'));

        try {
          result = callback(store, tx);
        } catch (err) {
          tx.abort();
          reject(err);
        }
      });
    });
  }

  get(storeName, key) {
    let req;
    return this.#run(storeName, 'readonly', (store) => {
      req = store.get(key);
    }).then(() => req.result ?? null);
  }

  set(storeName, key, value) {
    return this.#run(storeName, 'readwrite', (store) => {
      store.put(value, key);
    }).then(() => {});
  }

  delete(storeName, key) {
    return this.#run(storeName, 'readwrite', (store) => {
      store.delete(key);
    }).then(() => {});
  }

  clear(storeName) {
    return this.#run(storeName, 'readwrite', (store) => {
      store.clear();
    }).then(() => {});
  }

  getAll(storeName) {
    let req;
    return this.#run(storeName, 'readonly', (store) => {
      req = store.getAll();
    }).then(() => req.result || []);
  }

  keys(storeName) {
    let req;
    return this.#run(storeName, 'readonly', (store) => {
      req = store.getAllKeys();
    }).then(() => req.result || []);
  }

  /**
   * Advanced query matching using indices, ranges, directions, and limits.
   */
  query(storeName, { index, range, direction = 'next', limit = Infinity } = {}) {
    const results = [];
    return this.#run(storeName, 'readonly', (store) => {
      const source = index ? store.index(index) : store;
      const req = source.openCursor(range, direction);

      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        }
      };
    }).then(() => results);
  }
}
