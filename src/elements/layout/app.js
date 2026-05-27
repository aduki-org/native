/**
 * src/elements/layout/app.js
 *
 * Layout System: <ui-app>
 * Global application frame shell providing side-by-side or stacked layouts
 * matching modern responsive standards.
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
      min-height: 100vh;
      width: 100%;
      background: var(--color-surface-page);
      color: var(--color-content-primary);
      font-family: var(--font-family-sans);
    }

    .app-frame {
      display: flex;
      flex: 1;
      width: 100%;
      box-sizing: border-box;
      flex-direction: row;
    }

    .main-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      box-sizing: border-box;
    }

    /* Target nested headers, sidebars, and main content views */
    ::slotted(ui-header) {
      width: 100%;
      z-index: 100;
    }

    ::slotted(ui-sidebar) {
      z-index: 90;
    }

    @media (max-width: 768px) {
      .app-frame {
        flex-direction: column;
      }
    }
  </style>
  <slot name="header"></slot>
  <div class="app-frame" part="frame">
    <slot name="sidebar"></slot>
    <main class="main-content" part="main">
      <slot></slot>
    </main>
  </div>
`;

export class App extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }
}

customElements.define('ui-app', App);
