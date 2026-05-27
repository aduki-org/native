/**
 * src/elements/overlay/dialog.js
 *
 * Overlay System: <ui-dialog>
 * Premium dialog overlay wrapping native browser <dialog> for zero-cost
 * focus traps, light backdrops, Escape dismissals, and modal lifecycles.
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

    dialog {
      background: var(--color-surface-elevated);
      border: var(--space-px) solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-6);
      box-shadow: var(--shadow-2xl);
      max-width: min(calc(var(--space-32) * 5), 90vw);
      max-height: 85vh;
      color: var(--color-content-primary);
      outline: none;
      box-sizing: border-box;
    }

    /* Standard modal backdrop aesthetics */
    dialog::backdrop {
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(var(--space-0-5));
      transition: backdrop-filter var(--duration-fast) var(--ease-out);
    }

    /* Nested layouts wrappers */
    .wrapper {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }
  </style>
  <dialog part="dialog">
    <div class="wrapper">
      <slot></slot>
    </div>
  </dialog>
`;

export class Dialog extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const dialog = this.shadowRoot.querySelector('dialog');

    // Sync close and cancel events from native dialog
    dialog.addEventListener('close', this.#onClose, { signal: this.ctrl.signal });
    dialog.addEventListener('cancel', this.#onCancel, { signal: this.ctrl.signal });
  }

  showModal() {
    const dialog = this.shadowRoot.querySelector('dialog');
    dialog.showModal();
    this.setAttribute('open', '');
    this.dispatchEvent(new CustomEvent('show', { bubbles: true, composed: true }));
  }

  close(returnValue = '') {
    const dialog = this.shadowRoot.querySelector('dialog');
    dialog.close(returnValue);
    this.removeAttribute('open');
  }

  #onClose = () => {
    const dialog = this.shadowRoot.querySelector('dialog');
    this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('close', {
      detail: { returnValue: dialog.returnValue },
      bubbles: true,
      composed: true
    }));
  };

  #onCancel = (e) => {
    const cancelEvent = new CustomEvent('cancel', {
      bubbles: true,
      composed: true,
      cancelable: true
    });
    this.dispatchEvent(cancelEvent);
    if (cancelEvent.defaultPrevented) {
      e.preventDefault();
    }
  };

  get open() {
    return this.hasAttribute('open');
  }

  get returnValue() {
    return this.shadowRoot.querySelector('dialog').returnValue;
  }
}

customElements.define('ui-dialog', Dialog);
