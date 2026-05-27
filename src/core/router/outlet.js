/**
 * src/core/router/outlet.js
 *
 * <route-outlet> Custom Element.
 * Serves as the mounting target for matched route views.
 * Supports layout hierarchies, shadow-tree encapsulation, and dynamic property hydration.
 *
 * Source: doc 09 — Routing §6
 */

const outlets = new Map();

export class RouteOutlet extends HTMLElement {
  #name = 'root';
  #shadow;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['name'];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'name' && newVal) {
      this.#unregister(oldVal || 'root');
      this.#name = newVal;
      this.#register(newVal);
    }
  }

  connectedCallback() {
    this.#register(this.#name);
  }

  disconnectedCallback() {
    this.#unregister(this.#name);
  }

  #register(name) {
    if (!outlets.has(name)) {
      outlets.set(name, new Set());
    }
    outlets.get(name).add(this);
  }

  #unregister(name) {
    const set = outlets.get(name);
    if (set) {
      set.delete(this);
      if (set.size === 0) {
        outlets.delete(name);
      }
    }
  }

  /**
   * Renders a Custom Element tag name, a class, or a pre-built element instance into this shadow outlet.
   */
  async render(elementOrClass, props = {}) {
    this.#shadow.innerHTML = '';

    if (typeof elementOrClass === 'string') {
      const el = document.createElement(elementOrClass);
      for (const [key, value] of Object.entries(props)) {
        el[key] = value;
      }
      this.#shadow.appendChild(el);
      return el;
    }

    if (typeof elementOrClass === 'function') {
      // Auto-define custom element tags for standard ES Classes
      let tagName = elementOrClass.name.toLowerCase();
      if (!tagName.includes('-')) {
        tagName = `route-${tagName}`;
      }
      if (!customElements.get(tagName)) {
        customElements.define(tagName, elementOrClass);
      }
      const el = document.createElement(tagName);
      for (const [key, value] of Object.entries(props)) {
        el[key] = value;
      }
      this.#shadow.appendChild(el);
      return el;
    }

    if (elementOrClass instanceof HTMLElement) {
      this.#shadow.appendChild(elementOrClass);
      return elementOrClass;
    }

    throw new Error('Unsupported route component type provided to <route-outlet>');
  }
}

// Eagerly define the Custom Element
if (typeof customElements !== 'undefined' && !customElements.get('route-outlet')) {
  customElements.define('route-outlet', RouteOutlet);
}

/**
 * Dispatches component rendering to all registered outlets with a given layout name.
 */
export function renderOutlet(name, component, props = {}) {
  const set = outlets.get(name);
  if (set) {
    for (const outlet of set) {
      outlet.render(component, props);
    }
  }
}
