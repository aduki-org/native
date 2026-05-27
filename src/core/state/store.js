/**
 * src/core/state/store.js
 *
 * Proxy-based reactive state store.
 * Tracks reactive read accesses (get) dynamically when an active subscriber
 * context is present, and schedules microtask-batched triggers on writes.
 * Supports manual batching (batch), serialization snapshots, and hydration.
 *
 * Source: doc 08 — State Management §4, §7, §8, §9
 */

let activeSubscriber = null;

/**
 * Sets the global active subscriber registry (used by reactive derived nodes).
 */
export function setActiveSubscriber(subscriber) {
  activeSubscriber = subscriber;
}

/**
 * Returns the current active subscriber registry.
 */
export function getActiveSubscriber() {
  return activeSubscriber;
}

export class ReactiveStore {
  #target;
  #state;
  #listeners = new Map(); // key -> Set<callback>
  #batching = false;
  #pendingNotifications = new Set();
  #onMutationCallback = null;

  constructor(initial = {}) {
    const self = this;
    this.#target = initial;
    this.#state = new Proxy(initial, {
      get(target, key) {
        self.#track(key);
        return Reflect.get(target, key);
      },
      set(target, key, value) {
        const oldVal = Reflect.get(target, key);
        if (Object.is(oldVal, value)) return true;
        Reflect.set(target, key, value);
        self.#trigger(key);
        return true;
      },
      deleteProperty(target, key) {
        if (Reflect.has(target, key)) {
          Reflect.deleteProperty(target, key);
          self.#trigger(key);
        }
        return true;
      }
    });
  }

  /**
   * Retrieves a property value from the reactive state.
   */
  get(key) {
    return this.#state[key];
  }

  /**
   * Modifies a property value in the reactive state.
   */
  set(key, value, source = 'local') {
    this.#state[key] = value;
    if (this.#onMutationCallback) {
      this.#onMutationCallback(key, value, source);
    }
  }

  /**
   * Registers a callback to monitor all state mutations (used by BroadcastChannel sync).
   */
  onMutation(callback) {
    this.#onMutationCallback = callback;
  }

  #track(key) {
    if (activeSubscriber) {
      activeSubscriber.add({ store: this, key });
    }
  }

  #trigger(key) {
    this.#pendingNotifications.add(key);
    if (!this.#batching) {
      this.#scheduleQueue();
    }
  }

  #scheduleQueue() {
    queueMicrotask(() => {
      if (this.#pendingNotifications.size === 0) return;
      const keys = [...this.#pendingNotifications];
      this.#pendingNotifications.clear();

      const notifiedCallbacks = new Set();
      for (const key of keys) {
        const set = this.#listeners.get(key);
        if (set) {
          for (const cb of set) {
            notifiedCallbacks.add(cb);
          }
        }
      }

      for (const cb of notifiedCallbacks) {
        try {
          cb();
        } catch (err) {
          console.error('Error executing store change subscription:', err);
        }
      }
    });
  }

  /**
   * Subscribes to changes on a specific state key.
   */
  subscribe(key, callback, signal) {
    if (signal?.aborted) return () => {};

    if (!this.#listeners.has(key)) {
      this.#listeners.set(key, new Set());
    }
    this.#listeners.get(key).add(callback);

    const dispose = () => {
      const set = this.#listeners.get(key);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.#listeners.delete(key);
        }
      }
    };

    if (signal) {
      signal.addEventListener('abort', dispose);
    }

    return dispose;
  }

  /**
   * Batches multiple mutations atomically in a single microtask notification.
   */
  batch(fn) {
    this.#batching = true;
    try {
      fn();
    } finally {
      this.#batching = false;
      this.#scheduleQueue();
    }
  }

  /**
   * Serializes a deep-cloned copy of the current store state.
   */
  snapshot() {
    if (typeof structuredClone === 'function') {
      return structuredClone(this.#target);
    }
    return JSON.parse(JSON.stringify(this.#target));
  }

  /**
   * Re-hydrates the store state from a snapshot without firing redundant triggers.
   */
  hydrate(snapshot) {
    this.batch(() => {
      for (const [key, value] of Object.entries(snapshot)) {
        this.#state[key] = value;
      }
    });
  }

  /**
   * Cleans and resets the store with new initial values.
   */
  reset(initial = {}) {
    this.batch(() => {
      for (const key of Object.keys(this.#state)) {
        delete this.#state[key];
      }
      for (const [key, value] of Object.entries(initial)) {
        this.#state[key] = value;
      }
    });
  }
}
