/**
 * src/elements/overlay/popover.js
 *
 * Overlay System: <ui-popover>
 * Lightweight contextual overlay container utilizing the native Popover API
 * for top-layer rendering and automatic light dismiss.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §5
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: inline-block;
      font-family: var(--font-family-sans);
    }

    [popover] {
      margin: 0;
      padding: var(--space-4);
      background: var(--color-surface-elevated);
      border: var(--space-px) solid var(--color-border-default);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-xl);
      color: var(--color-content-primary);
      box-sizing: border-box;
      outline: none;
    }

    /* Popover backdrop overlay styles */
    [popover]::backdrop {
      background: transparent;
    }
  </style>
  <div popover="auto" part="popover">
    <slot></slot>
  </div>
`;

export class Popover extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const popover = this.shadowRoot.querySelector('[popover]');

    // Expose toggle events to parent elements
    popover.addEventListener('toggle', (e) => {
      this.dispatchEvent(new CustomEvent('toggle', {
        detail: { newState: e.newState },
        bubbles: true,
        composed: true
      }));
    }, { signal: this.ctrl.signal });
  }

  show() {
    this.shadowRoot.querySelector('[popover]').showPopover();
  }

  hide() {
    this.shadowRoot.querySelector('[popover]').hidePopover();
  }

  toggle() {
    const popover = this.shadowRoot.querySelector('[popover]');
    if (popover.matches(':popover-open')) {
      popover.hidePopover();
    } else {
      popover.showPopover();
    }
  }
}

customElements.define('ui-popover', Popover);
