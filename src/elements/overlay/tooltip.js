/**
 * src/elements/overlay/tooltip.js
 *
 * Overlay System: <ui-tooltip>
 * Accessible CSS-driven tooltip indicator. Wraps content and displays a popup hint
 * on hover and focus-within without requiring JS positioning computations.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §5
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      position: relative;
    }

    .wrapper {
      display: inline-flex;
      align-items: center;
      position: relative;
    }

    .tooltip {
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translate(-50%, var(--space-0));
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      background: var(--color-surface-inverse);
      color: var(--color-content-inverse);
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      font-family: var(--font-family-sans);
      white-space: nowrap;
      box-shadow: var(--shadow-sm);
      transition: 
        opacity var(--duration-fast) var(--ease-out),
        transform var(--duration-fast) var(--ease-out),
        visibility var(--duration-fast) var(--ease-out);
      z-index: 1000;
    }

    /* Hover and focus triggers */
    .wrapper:hover .tooltip,
    .wrapper:focus-within .tooltip {
      opacity: 1;
      visibility: visible;
      transform: translate(-50%, calc(-1 * var(--space-2)));
    }
  </style>
  <div class="wrapper" part="wrapper" tabindex="0">
    <slot></slot>
    <div class="tooltip" part="tooltip" role="tooltip">
      <slot name="content"></slot>
    </div>
  </div>
`;

export class Tooltip extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }
}

customElements.define('ui-tooltip', Tooltip);
