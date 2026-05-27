/**
 * src/elements/layout/sidebar.js
 *
 * Layout System: <ui-sidebar>
 * Collapsible side-panel layout displaying navigation bars, action links,
 * and supporting collapsible layouts.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: block;
      background: var(--color-surface-elevated);
      border-right: var(--space-px) solid var(--color-border-default);
      height: calc(100vh - var(--space-16));
      box-sizing: border-box;
      width: calc(var(--space-16) * 4);
      transition: width var(--duration-medium) var(--ease-out);
      position: sticky;
      top: var(--space-16);
    }

    .wrapper {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--space-6) var(--space-4);
      box-sizing: border-box;
      overflow-y: auto;
      gap: var(--space-6);
    }

    /* Collapse styling transformations */
    :host([collapsed]) {
      width: var(--space-16);
    }

    :host([collapsed]) ::slotted(*) {
      display: none;
    }
  </style>
  <div class="wrapper" part="wrapper">
    <slot></slot>
  </div>
`;

export class Sidebar extends Base {
  static observedAttributes = ['collapsed'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  toggle() {
    if (this.hasAttribute('collapsed')) {
      this.removeAttribute('collapsed');
    } else {
      this.setAttribute('collapsed', '');
    }
  }
}

customElements.define('ui-sidebar', Sidebar);
