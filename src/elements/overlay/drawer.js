/**
 * src/elements/overlay/drawer.js
 *
 * Overlay System: <ui-drawer>
 * side layout panel utilizing native <dialog> focus trapping features
 * and beautiful off-thread slide transition capabilities.
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
      border: none;
      box-shadow: var(--shadow-2xl);
      height: 100vh;
      max-height: 100vh;
      margin: 0;
      position: fixed;
      top: 0;
      box-sizing: border-box;
      outline: none;
      display: flex;
      flex-direction: column;
      width: min(calc(var(--space-32) * 3), 85vw);
      transition: transform var(--duration-medium) var(--ease-out);
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(var(--space-0-5));
      opacity: 0;
      transition: opacity var(--duration-medium) var(--ease-out);
    }

    /* Placement styles with beautiful transform slide ins */
    :host([placement="left"]) dialog {
      left: 0;
      transform: translateX(-100%);
    }

    :host([placement="right"]) dialog {
      right: 0;
      transform: translateX(100%);
    }

    /* Open anim trigger classes */
    dialog.open {
      transform: translateX(0);
    }

    dialog.open::backdrop {
      opacity: 1;
    }
  </style>
  <dialog part="dialog">
    <slot></slot>
  </dialog>
`;

export class Drawer extends Base {
  static observedAttributes = ['open', 'placement'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const dialog = this.shadowRoot.querySelector('dialog');
    dialog.addEventListener('close', this.#onClose, { signal: this.ctrl.signal });
    this.#syncAttributes();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#syncAttributes();
    }
  }

  #syncAttributes() {
    const dialog = this.shadowRoot.querySelector('dialog');
    const open = this.hasAttribute('open');

    if (!this.hasAttribute('placement')) {
      this.setAttribute('placement', 'right');
    }

    if (open && !dialog.open) {
      dialog.showModal();
      // Delay class toggle by a microtask to fire slide transitions
      requestAnimationFrame(() => dialog.classList.add('open'));
    } else if (!open && dialog.open) {
      dialog.classList.remove('open');
      // Wait for transform transitions to complete before closing modal
      setTimeout(() => dialog.close(), 300);
    }
  }

  show() {
    this.setAttribute('open', '');
  }

  hide() {
    this.removeAttribute('open');
  }

  #onClose = () => {
    this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  };

  get open() {
    return this.hasAttribute('open');
  }

  set open(val) {
    if (val) {
      this.setAttribute('open', '');
    } else {
      this.removeAttribute('open');
    }
  }
}

customElements.define('ui-drawer', Drawer);
