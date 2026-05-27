/**
 * src/elements/layout/split.js
 *
 * Layout System: <ui-split>
 * Flexible two-pane responsive split layout divider.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: block;
      width: 100%;
    }

    .split {
      display: flex;
      gap: var(--space-6);
      width: 100%;
      box-sizing: border-box;
    }

    /* Ratio configurations mapping to pane sizes */
    :host([ratio="1-1"]) .split ::slotted(*:first-child) { flex: 1; }
    :host([ratio="1-1"]) .split ::slotted(*:last-child) { flex: 1; }

    :host([ratio="1-2"]) .split ::slotted(*:first-child) { flex: 1; }
    :host([ratio="1-2"]) .split ::slotted(*:last-child) { flex: 2; }

    :host([ratio="2-1"]) .split ::slotted(*:first-child) { flex: 2; }
    :host([ratio="2-1"]) .split ::slotted(*:last-child) { flex: 1; }

    @media (max-width: 768px) {
      .split {
        flex-direction: column;
        gap: var(--space-4);
      }
    }
  </style>
  <div class="split" part="split">
    <slot></slot>
  </div>
`;

export class Split extends Base {
  static observedAttributes = ['ratio'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    if (!this.hasAttribute('ratio')) {
      this.setAttribute('ratio', '1-1');
    }
  }
}

customElements.define('ui-split', Split);
