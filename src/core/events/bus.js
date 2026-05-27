/**
 * src/core/events/bus.js
 *
 * Global Event Bus.
 * Provides a highly performant and memory-safe central communication hub
 * supporting lifecycle-gated subscriptions via native AbortSignal.
 *
 * Source: doc 10 — Event Architecture §9
 */

export class EventBus {
  #listeners = new Map();

  /**
   * Subscribes to a global event.
   * If a signal is provided, the subscription is automatically cleaned up when the signal aborts.
   */
  on(type, fn, signal) {
    if (signal?.aborted) return () => {};

    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set());
    }

    const listener = { fn };
    this.#listeners.get(type).add(listener);

    const dispose = () => {
      const set = this.#listeners.get(type);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.#listeners.delete(type);
        }
      }
      if (signal) {
        signal.removeEventListener('abort', dispose);
      }
    };

    if (signal) {
      signal.addEventListener('abort', dispose, { once: true });
    }

    return dispose;
  }

  /**
   * Dispatches a global custom event with a detail payload.
   */
  emit(type, detail) {
    const set = this.#listeners.get(type);
    if (!set) return;

    const event = new CustomEvent(type, { detail });

    // Iterate a snapshot of the listeners to prevent concurrency mutations
    for (const listener of [...set]) {
      try {
        listener.fn(event);
      } catch (err) {
        console.error(`Error in EventBus listener for event "${type}":`, err);
      }
    }
  }
}

export const bus = new EventBus();
