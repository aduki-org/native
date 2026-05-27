/**
 * src/elements/navigation/nav.js
 *
 * Navigation System: <ui-nav>
 * Flexible routing navigation wrapper offering horizontal/vertical orientation
 * and standard accessible semantic lists markup.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: block;
      font-family: var(--font-family-sans);
    }

    nav {
      display: flex;
      width: 100%;
      box-sizing: border-box;
    }

    :host([orientation="vertical"]) nav {
      flex-direction: column;
      gap: var(--space-1);
    }

    :host([orientation="horizontal"]) nav {
      flex-direction: row;
      align-items: center;
      gap: var(--space-4);
    }

    /* Distribute styles downwards to child link elements */
    ::slotted(nav-link) {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      transition: background-color var(--duration-fast) var(--ease-out);
    }

    ::slotted(nav-link:hover) {
      background: var(--color-interactive-disabled);
    }

    ::slotted(nav-link[aria-current="page"]) {
      background: var(--color-interactive-disabled);
      color: var(--color-interactive);
      font-weight: var(--font-weight-semibold);
    }
  </style>
  <nav part="nav">
    <slot></slot>
  </nav>
`;

export class Nav extends Base {
  static observedAttributes = ['orientation'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    if (!this.hasAttribute('orientation')) {
      this.setAttribute('orientation', 'horizontal');
    }
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'navigation');
    }
  }
}

customElements.define('ui-nav', Nav);
