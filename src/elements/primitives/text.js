/**
 * src/elements/primitives/text.js
 *
 * Primitive Element: <ui-text>
 * Typography primitive dynamically rendering semantic tag configurations
 * and binding typography design scales.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: inline;
      /* Component Tokens — Semantic Reference Only */
      --text-size:   var(--font-size-base);
      --text-weight: var(--font-weight-regular);
      --text-family: var(--font-family-sans);
      --text-height: var(--line-height-normal);
      --text-color:  var(--color-content-primary);
    }

    :host([block]) {
      display: block;
    }

    #root {
      font-size: var(--text-size);
      font-weight: var(--text-weight);
      font-family: var(--text-family);
      line-height: var(--text-height);
      color: var(--text-color);
      margin: 0;
      padding: 0;
    }
  </style>
  <span id="root" part="text"><slot></slot></span>
`;

export class Text extends Base {
  static observedAttributes = ['as', 'size', 'weight', 'color', 'family', 'block'];

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
    const asAttr = this.getAttribute('as') || 'span';
    const root = this.shadowRoot.querySelector('#root');
    const size = this.getAttribute('size');
    const weight = this.getAttribute('weight');
    const color = this.getAttribute('color');
    const family = this.getAttribute('family');

    // Dynamic tag swapping
    if (root.tagName.toLowerCase() !== asAttr.toLowerCase()) {
      const nextRoot = document.createElement(asAttr);
      nextRoot.id = 'root';
      nextRoot.part = 'text';
      while (root.firstChild) {
        nextRoot.appendChild(root.firstChild);
      }
      root.replaceWith(nextRoot);
    }

    // Size mappings
    if (size) {
      this.style.setProperty('--text-size', `var(--font-size-${size})`);
    } else {
      this.style.removeProperty('--text-size');
    }

    // Weight mappings
    if (weight) {
      this.style.setProperty('--text-weight', `var(--font-weight-${weight})`);
    } else {
      this.style.removeProperty('--text-weight');
    }

    // Color mappings
    if (color) {
      this.style.setProperty('--text-color', `var(--color-content-${color})`);
    } else {
      this.style.removeProperty('--text-color');
    }

    // Family mappings
    if (family) {
      this.style.setProperty('--text-family', `var(--font-family-${family})`);
    } else {
      this.style.removeProperty('--text-family');
    }
  }
}

customElements.define('ui-text', Text);
