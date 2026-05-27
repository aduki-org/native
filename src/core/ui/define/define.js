/**
 * Registers a custom element with a duplicate-registration safety guard.
 */
export function define(tag, Class) {
  if (typeof customElements !== 'undefined') {
    if (customElements.get(tag)) {
      console.warn(`Custom Element "${tag}" is already registered. Skipping duplicate load.`);
      return;
    }
    customElements.define(tag, Class);
  }
}
