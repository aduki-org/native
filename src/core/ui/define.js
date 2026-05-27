/**
 * src/core/ui/define.js
 *
 * Custom Element Definer.
 * Wraps browser customElements.define, implementing a duplicate registration
 * guard to safely avoid runtime crashes during hot-module replacement (HMR)
 * or dual module loads.
 *
 * Source: doc 04 — Web Components §1
 */

/**
 * Registers a custom element with a duplicate-registration safety guard.
 */
export function define(tag, Class) {
  if (typeof customElements !== 'undefined') {
    if (customElements.get(tag)) {
      // Warm warning instead of throwing a fatal registration crash
      console.warn(`Custom Element "${tag}" is already registered. Skipping duplicate load.`);
      return;
    }
    customElements.define(tag, Class);
  }
}
