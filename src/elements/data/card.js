/**
 * src/elements/data/card.js
 *
 * Data Element: <ui-card>
 * Premium card containment container including header, body, footer slots,
 * and subtle micro-animation interactive hover lifts.
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
      background: var(--color-surface-elevated);
      border: var(--space-px) solid var(--color-border-default);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      font-family: var(--font-family-sans);
      transition: 
        transform var(--duration-fast) var(--ease-out),
        box-shadow var(--duration-fast) var(--ease-out),
        border-color var(--duration-fast) var(--ease-out);
      box-sizing: border-box;
      width: 100%;
    }

    .header {
      padding: var(--space-4) var(--space-6);
      border-bottom: var(--space-px) solid var(--color-border-default);
    }

    .body {
      padding: var(--space-6);
      flex: 1;
    }

    .footer {
      padding: var(--space-4) var(--space-6);
      background: var(--color-surface-page);
      border-top: var(--space-px) solid var(--color-border-default);
      display: flex;
      gap: var(--space-3);
      justify-content: flex-end;
    }

    /* Hover elevation highlights for interactive cards */
    :host([interactive]) {
      cursor: pointer;
    }

    :host([interactive]:hover) {
      transform: translateY(calc(-1 * var(--space-1)));
      box-shadow: var(--shadow-md);
      border-color: var(--color-border-strong);
    }
  </style>
  <div class="header" part="header">
    <slot name="header"></slot>
  </div>
  <div class="body" part="body">
    <slot></slot>
  </div>
  <div class="footer" part="footer">
    <slot name="footer"></slot>
  </div>
`;

export class Card extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }
}

customElements.define('ui-card', Card);
