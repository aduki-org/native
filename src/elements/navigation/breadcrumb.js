/**
 * src/elements/navigation/breadcrumb.js
 *
 * Navigation System: <ui-breadcrumb>
 * Standard-compliant accessible navigation trails trails. Injects design spacing
 * dividers between items using CSS pseudoselectors.
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

    ol {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      list-style: none;
      margin: 0;
      padding: 0;
      gap: var(--space-2);
    }

    ::slotted(nav-link), ::slotted(span), ::slotted(a) {
      font-size: var(--font-size-sm);
      color: var(--color-content-secondary);
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }

    ::slotted(nav-link:last-child), ::slotted(span:last-child), ::slotted(a:last-child) {
      color: var(--color-content-primary);
      font-weight: var(--font-weight-medium);
      pointer-events: none;
    }

    /* dynamic separator overlays using CSS content styles */
    ::slotted(*:not(:last-child))::after {
      content: "/";
      color: var(--color-border-strong);
      font-weight: var(--font-weight-regular);
      margin-left: var(--space-2);
    }
  </style>
  <nav part="nav" aria-label="Breadcrumb">
    <ol part="list">
      <slot></slot>
    </ol>
  </nav>
`;

export class Breadcrumb extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }
}

customElements.define('ui-breadcrumb', Breadcrumb);
