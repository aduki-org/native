/**
 * src/elements/layout/header.js
 *
 * Layout System: <ui-header>
 * Top navigation header component displaying logo/branding sections,
 * action slots, and matching premium bordered surfaces.
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
      border-bottom: var(--space-px) solid var(--color-border-default);
      box-sizing: border-box;
      width: 100%;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: var(--space-16);
      padding: 0 var(--space-6);
      box-sizing: border-box;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .actions {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }
  </style>
  <header part="header">
    <div class="brand" part="brand">
      <slot name="brand"></slot>
    </div>
    <div class="actions" part="actions">
      <slot></slot>
    </div>
  </header>
`;

export class Header extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }
}

customElements.define('ui-header', Header);
