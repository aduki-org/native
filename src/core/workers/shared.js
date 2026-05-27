/**
 * src/core/workers/shared.js
 *
 * SharedWorker Lifecycle Wrapper.
 * Facilitates multi-tab coordination using a single background execution thread
 * (e.g., maintaining a single active WebSocket channel shared across tabs),
 * with graceful fallbacks for browsers without SharedWorker support.
 *
 * Source: doc 21 — Worker Architecture §5
 */

export class SharedConnection {
  constructor(scriptUrl, name = 'platform-shared') {
    this.scriptUrl = scriptUrl;
    this.name = name;
    this.port = null;
    this.listeners = new Set();
  }

  /**
   * Initializes the connection port to the SharedWorker.
   */
  connect() {
    if (typeof SharedWorker === 'undefined') {
      console.warn('SharedWorker is not supported in this browser runtime. Falling back to local port emulation.');
      this.#fallback();
      return;
    }

    try {
      const worker = new SharedWorker(this.scriptUrl, {
        name: this.name,
        type: 'module'
      });

      this.port = worker.port;
      this.port.onmessage = (e) => {
        for (const listener of this.listeners) {
          try {
            listener(e.data);
          } catch (err) {
            console.error('Error in SharedConnection listener:', err);
          }
        }
      };

      this.port.start();
    } catch (err) {
      console.warn('Failed to start SharedWorker, shifting to dedicated fallback:', err);
      this.#fallback();
    }
  }

  #fallback() {
    // Graceful fallback to dedicated worker or local frame sync
    try {
      const worker = new Worker(this.scriptUrl, { type: 'module' });
      this.port = {
        postMessage: (msg) => worker.postMessage(msg),
        addEventListener: (type, fn) => worker.addEventListener(type, fn),
        removeEventListener: (type, fn) => worker.removeEventListener(type, fn)
      };

      worker.onmessage = (e) => {
        for (const listener of this.listeners) {
          listener(e.data);
        }
      };
    } catch (err) {
      console.error('Completely offline or isolated worker environment:', err);
    }
  }

  /**
   * Sends a message to the SharedWorker thread.
   */
  send(message) {
    if (this.port) {
      this.port.postMessage(message);
    }
  }

  /**
   * Subscribes to inbound messages from the SharedWorker port.
   */
  subscribe(fn, signal) {
    if (signal?.aborted) return () => {};

    this.listeners.add(fn);

    const dispose = () => {
      this.listeners.delete(fn);
    };

    if (signal) {
      signal.addEventListener('abort', dispose);
    }

    return dispose;
  }
}
