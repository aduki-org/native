/**
 * src/elements/layout/stack.js
 *
 * Layout System: <ui-stack>
 * Vertical stack container applying standardized layout gap spacers.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      /* Component Tokens — Semantic Reference Only */
      --stack-gap: var(--space-4);
      width: 100%;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: var(--stack-gap);
      width: 100%;
      box-sizing: border-box;
    }
  </style>
  <div class="stack" part="stack">
    <slot></slot>
  </div>
`;

export class Stack extends Base {
  static observedAttributes = ['gap'];

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
    const gap = this.getAttribute('gap');
    if (gap) {
      const gapVal = gap.includes('px') || gap.includes('rem') ? gap : `var(--space-${gap})`;
      this.style.setProperty('--stack-gap', gapVal);
    } else {
      this.style.removeProperty('--stack-gap');
    }
  }
}

customElements.define('ui-stack', Stack);
