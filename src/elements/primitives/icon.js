/**
 * src/elements/primitives/icon.js
 *
 * Primitive Element: <ui-icon>
 * Renders an accessible SVG sprite reference, supporting size tokens,
 * name/href targets, and proper ARIA decoration.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--icon-size, var(--space-4));
      height: var(--icon-size, var(--space-4));
      color: var(--icon-color, currentColor);
    }

    svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke: currentColor;
      stroke-width: var(--icon-stroke, 2);
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  </style>
  <svg part="svg" aria-hidden="true" viewBox="0 0 24 24">
    <use></use>
  </svg>
`;

export class Icon extends Base {
  static observedAttributes = ['name', 'href', 'size', 'stroke'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    this.#update();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#update();
    }
  }

  #update() {
    const use = this.shadowRoot.querySelector('use');
    const svg = this.shadowRoot.querySelector('svg');
    const name = this.getAttribute('name');
    const href = this.getAttribute('href');
    const size = this.getAttribute('size');
    const stroke = this.getAttribute('stroke');

    // Resolve svg content target
    if (href) {
      use.setAttribute('href', href);
    } else if (name) {
      // Direct asset folder sprite fallback
      use.setAttribute('href', `/assets/icons.svg#icon-${name}`);
    }

    // Apply custom inline sizing if size attribute is set
    if (size) {
      this.style.setProperty('--icon-size', size.includes('px') || size.includes('rem') ? size : `var(--space-${size})`);
    } else {
      this.style.removeProperty('--icon-size');
    }

    if (stroke) {
      this.style.setProperty('--icon-stroke', stroke);
    } else {
      this.style.removeProperty('--icon-stroke');
    }

    // Accessible labeling
    if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) {
      svg.setAttribute('aria-hidden', 'true');
    } else {
      svg.removeAttribute('aria-hidden');
    }
  }
}

customElements.define('ui-icon', Icon);
