/**
 * src/elements/layout/surface.js
 *
 * Layout System: <ui-surface>
 * Standard styling layer wrapping semantic backdrop surfaces, elevated shadow levels,
 * and borders.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: block;
      box-sizing: border-box;
      width: 100%;
      /* Component Tokens — Semantic Reference Only */
      --surface-bg:     var(--color-surface-page);
      --surface-border: transparent;
      --surface-shadow: none;
      --surface-radius: var(--radius-none);
    }

    .surface {
      background: var(--surface-bg);
      border: var(--space-px) solid var(--surface-border);
      box-shadow: var(--surface-shadow);
      border-radius: var(--surface-radius);
      padding: var(--space-6);
      box-sizing: border-box;
      width: 100%;
    }

    /* Surface variants mapping to light/dark semantic tokens */
    :host([variant="elevated"]) {
      --surface-bg:     var(--color-surface-elevated);
      --surface-border: var(--color-border-default);
      --surface-shadow: var(--shadow-md);
      --surface-radius: var(--radius-lg);
    }

    :host([variant="flat"]) {
      --surface-bg:     var(--color-surface-page);
      --surface-border: var(--color-border-default);
      --surface-radius: var(--radius-md);
    }
  </style>
  <div class="surface" part="surface">
    <slot></slot>
  </div>
`;

export class Surface extends Base {
  static observedAttributes = ['variant'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    if (!this.hasAttribute('variant')) {
      this.setAttribute('variant', 'flat');
    }
  }
}

customElements.define('ui-surface', Surface);
