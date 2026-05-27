/**
 * src/elements/layout/grid.js
 *
 * Layout System: <ui-grid>
 * Multi-column responsive layout grid offering automated columns mapping
 * and standard spacing gaps.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: block;
      /* Component Tokens — Semantic Reference Only */
      --grid-gap:  var(--space-4);
      --grid-cols: repeat(auto-fit, minmax(250px, 1fr));
      width: 100%;
    }

    .grid {
      display: grid;
      grid-template-columns: var(--grid-cols);
      gap: var(--grid-gap);
      width: 100%;
      box-sizing: border-box;
    }
  </style>
  <div class="grid" part="grid">
    <slot></slot>
  </div>
`;

export class Grid extends Base {
  static observedAttributes = ['cols', 'gap'];

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
    const cols = this.getAttribute('cols');
    const gap = this.getAttribute('gap');

    if (cols) {
      if (!isNaN(cols)) {
        this.style.setProperty('--grid-cols', `repeat(${cols}, minmax(0, 1fr))`);
      } else {
        this.style.setProperty('--grid-cols', cols);
      }
    } else {
      this.style.removeProperty('--grid-cols');
    }

    if (gap) {
      const gapVal = gap.includes('px') || gap.includes('rem') ? gap : `var(--space-${gap})`;
      this.style.setProperty('--grid-gap', gapVal);
    } else {
      this.style.removeProperty('--grid-gap');
    }
  }
}

customElements.define('ui-grid', Grid);
