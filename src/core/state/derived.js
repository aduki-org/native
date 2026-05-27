/**
 * src/core/state/derived.js
 *
 * Fine-grained reactive derived state (computed nodes).
 * Evaluates computations lazily, memoizes results, and dynamically collects
 * dependency keys by intercepting read accesses during execution.
 *
 * Source: doc 08 — State Management §7, §8
 */

import { setActiveSubscriber, getActiveSubscriber } from './store.js';

export class DerivedValue {
  #compute;
  #value;
  #dependencies = new Set();
  #dirty = true;
  #listeners = new Set();
  #disposers = [];

  constructor(compute) {
    if (typeof compute !== 'function') {
      throw new Error('DerivedValue requires a valid compute function');
    }
    this.#compute = compute;
  }

  /**
   * Retrieves the current computed value (evaluates lazily and memoizes result).
   */
  get value() {
    // Propagate dependency mapping up to parents (for nested derived nodes)
    const outerSubscriber = getActiveSubscriber();
    if (outerSubscriber) {
      for (const dep of this.#dependencies) {
        outerSubscriber.add(dep);
      }
    }

    if (this.#dirty) {
      this.#recompute();
    }

    return this.#value;
  }

  #recompute() {
    // Revoke previous listeners
    for (const dispose of this.#disposers) {
      dispose();
    }
    this.#disposers = [];
    this.#dependencies.clear();

    // Trap active gets inside execution context
    const previous = getActiveSubscriber();
    const tracked = new Set();
    setActiveSubscriber(tracked);

    try {
      this.#value = this.#compute();
      this.#dirty = false;
      this.#dependencies = tracked;

      // Reactively attach to all newly resolved dependency nodes
      for (const dep of this.#dependencies) {
        const dispose = dep.store.subscribe(dep.key, () => {
          this.#markDirty();
        });
        this.#disposers.push(dispose);
      }
    } finally {
      setActiveSubscriber(previous);
    }
  }

  #markDirty() {
    if (this.#dirty) return;
    this.#dirty = true;

    for (const callback of this.#listeners) {
      try {
        callback();
      } catch (err) {
        console.error('Error executing derived state change subscription:', err);
      }
    }
  }

  /**
   * Subscribes to updates on this derived state node.
   */
  subscribe(callback) {
    this.#listeners.add(callback);
    return () => {
      this.#listeners.delete(callback);
    };
  }

  /**
   * Releases and cleans up active subscriptions.
   */
  dispose() {
    for (const dispose of this.#disposers) {
      dispose();
    }
    this.#disposers = [];
    this.#listeners.clear();
  }
}

/**
 * Creates a memoized derived state node.
 */
export function derived(compute) {
  return new DerivedValue(compute);
}
