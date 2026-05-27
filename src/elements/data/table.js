/**
 * src/elements/data/table.js
 *
 * Data Element: <ui-table>
 * Responsive data table layout wrapping native standard <table> tags and attaching
 * complete semantic design token styles using slotted tree CSS.
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
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border: var(--space-px) solid var(--color-border-default);
      border-radius: var(--radius-md);
      background: var(--color-surface-elevated);
    }

    /* Target standard table tags distributed into slot */
    ::slotted(table) {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      font-family: var(--font-family-sans);
      font-size: var(--font-size-sm);
      color: var(--color-content-primary);
      text-align: left;
    }

    ::slotted(thead) {
      background: var(--color-surface-page);
      border-bottom: var(--space-px) solid var(--color-border-default);
    }

    ::slotted(th) {
      padding: var(--space-3) var(--space-4);
      font-weight: var(--font-weight-semibold);
      color: var(--color-content-secondary);
      user-select: none;
    }

    ::slotted(tr) {
      border-bottom: var(--space-px) solid var(--color-border-default);
      transition: background-color var(--duration-fast) var(--ease-out);
    }

    ::slotted(tr:last-child) {
      border-bottom: none;
    }

    ::slotted(tbody tr:hover) {
      background: var(--color-interactive-disabled);
    }

    ::slotted(td) {
      padding: var(--space-4);
      vertical-align: middle;
    }
  </style>
  <slot></slot>
`;

export class Table extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }
}

customElements.define('ui-table', Table);
