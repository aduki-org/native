/**
 * src/core/animations/registry.js
 *
 * Animation Registry.
 * A centralized store to register, lookup, and manage reusable WAAPI keyframe
 * configurations and timing options.
 *
 * Source: doc 03 — Native CSS Architecture §6, doc 12 — Performance §4
 */

export class AnimationRegistry {
  #store = new Map();

  /**
   * Registers a named animation template with keyframes and default timing options.
   */
  register(name, keyframes, defaultOptions = {}) {
    this.#store.set(name, { keyframes, options: defaultOptions });
  }

  /**
   * Retrieves a registered animation configuration.
   */
  get(name) {
    return this.#store.get(name) || null;
  }

  /**
   * Evicts an animation template from the registry.
   */
  delete(name) {
    return this.#store.delete(name);
  }

  /**
   * Flushes all stored animation templates.
   */
  clear() {
    this.#store.clear();
  }
}

export const registry = new AnimationRegistry();
