/**
 * src/core/storage/opfs.js
 *
 * Origin Private File System Façade.
 * Offloads OPFS operations to an inline dedicated Web Worker to leverage
 * high-performance synchronous file access handles (`createSyncAccessHandle`).
 * Broadcasts cross-tab invalidations via standard BroadcastChannel.
 *
 * Source: doc 22 — Storage Architecture §4
 */

const workerCode = `
  self.onmessage = async (e) => {
    const { id, op, key, value } = e.data;
    try {
      const root = await navigator.storage.getDirectory();

      if (op === 'set') {
        const fileHandle = await root.getFileHandle(key, { create: true });
        const accessHandle = await fileHandle.createSyncAccessHandle();
        const encoder = new TextEncoder();
        const buffer = encoder.encode(JSON.stringify(value));

        accessHandle.truncate(0);
        accessHandle.write(buffer);
        accessHandle.close();

        self.postMessage({ id, success: true });
      } else if (op === 'get') {
        try {
          const fileHandle = await root.getFileHandle(key);
          const accessHandle = await fileHandle.createSyncAccessHandle();
          const size = accessHandle.getSize();

          if (size === 0) {
            accessHandle.close();
            self.postMessage({ id, success: true, value: null });
            return;
          }

          const buffer = new Uint8Array(size);
          accessHandle.read(buffer);
          accessHandle.close();

          const decoder = new TextDecoder();
          const parsed = JSON.parse(decoder.decode(buffer));
          self.postMessage({ id, success: true, value: parsed });
        } catch (err) {
          if (err.name === 'NotFoundError') {
            self.postMessage({ id, success: true, value: null });
          } else {
            throw err;
          }
        }
      } else if (op === 'delete') {
        try {
          await root.removeEntry(key);
          self.postMessage({ id, success: true });
        } catch (err) {
          if (err.name === 'NotFoundError') {
            self.postMessage({ id, success: true });
          } else {
            throw err;
          }
        }
      } else if (op === 'clear') {
        for await (const name of root.keys()) {
          await root.removeEntry(name);
        }
        self.postMessage({ id, success: true });
      } else if (op === 'list') {
        const list = [];
        for await (const name of root.keys()) {
          list.push(name);
        }
        self.postMessage({ id, success: true, value: list });
      }
    } catch (err) {
      self.postMessage({ id, success: false, error: err.message });
    }
  };
`;

class OpfsManager {
  #worker = null;
  #pending = new Map();
  #channel = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.#worker = new Worker(URL.createObjectURL(blob));
      this.#channel = new BroadcastChannel('core:opfs-invalidation');

      this.#worker.onmessage = (e) => {
        const { id, success, value, error } = e.data;
        const promise = this.#pending.get(id);
        if (promise) {
          this.#pending.delete(id);
          if (success) {
            promise.resolve(value);
          } else {
            promise.reject(new Error(error));
          }
        }
      };
    }
  }

  #send(op, key, value) {
    if (!this.#worker) return Promise.reject(new Error('OPFS not supported in this context'));

    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker.postMessage({ id, op, key, value });
    });
  }

  /**
   * Reads a file entry from OPFS.
   */
  get(key) {
    return this.#send('get', key);
  }

  /**
   * Writes a file entry to OPFS and broadcasts an invalidation.
   */
  set(key, value) {
    return this.#send('set', key, value).then(() => {
      this.#channel?.postMessage({ op: 'set', key });
    });
  }

  /**
   * Deletes a file entry from OPFS.
   */
  delete(key) {
    return this.#send('delete', key).then(() => {
      this.#channel?.postMessage({ op: 'delete', key });
    });
  }

  /**
   * Clears all entries in OPFS.
   */
  clear() {
    return this.#send('clear').then(() => {
      this.#channel?.postMessage({ op: 'clear' });
    });
  }

  /**
   * Lists all entry names in OPFS.
   */
  list() {
    return this.#send('list');
  }

  /**
   * Subscribes to write invalidations.
   */
  onChange(fn, signal) {
    if (signal?.aborted) return () => {};

    const listener = (event) => fn(event.data);
    this.#channel?.addEventListener('message', listener);

    const dispose = () => {
      this.#channel?.removeEventListener('message', listener);
    };

    if (signal) {
      signal.addEventListener('abort', dispose);
    }

    return dispose;
  }
}

export const opfs = new OpfsManager();
