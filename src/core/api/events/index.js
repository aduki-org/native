/**
 * src/core/api/events/index.js
 *
 * Performant telemetry event emitter for all API network calls.
 * Triggers hooks on timeouts, failures, specific HTTP status codes, or response content types.
 *
 * Source: doc 11 — Networking §2, core/api/plan.md
 */

export class ApiEventEmitter {
  #listeners = new Map();

  /**
   * Subscribes to a specific network or status event.
   * Supports lifecycle-gated cleaning using AbortSignal.
   *
   * @param {string} event
   * @param {Function} handler
   * @param {AbortSignal} [signal]
   * @returns {Function} Disposer
   */
  on(event, handler, signal) {
    if (signal?.aborted) return () => {};

    if (!this.#listeners.has(event)) {
      this.#listeners.set(event, new Set());
    }

    const listener = { handler };
    this.#listeners.get(event).add(listener);

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;

      const set = this.#listeners.get(event);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.#listeners.delete(event);
        }
      }
    };

    if (signal) {
      signal.addEventListener('abort', dispose, { once: true });
    }

    return dispose;
  }

  /**
   * Emits a telemetry event with a detail payload.
   *
   * @param {string} event
   * @param {any} detail
   */
  emit(event, detail) {
    const set = this.#listeners.get(event);
    if (!set) return;

    const apiEvent = { type: event, detail };
    
    for (const listener of [...set]) {
      try {
        listener.handler(apiEvent);
      } catch (err) {
        console.error(`Error in API event listener for "${event}":`, err);
      }
    }
  }
}

export const events = new ApiEventEmitter();
