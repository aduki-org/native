/**
 * src/elements/overlay/sheet.js
 *
 * Overlay System: <ui-sheet>
 * Bottom Sheet container rendering in the top-layer backed by native <dialog>,
 * and implementing highly interactive pointer-driven drag-to-dismiss gesture controls.
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
      border-radius: var(--radius-lg) var(--radius-lg) var(--radius-none) var(--radius-none);
      box-shadow: var(--shadow-2xl);
      width: 100%;
      max-width: min(calc(var(--space-32) * 6), 100vw);
      margin: 0 auto;
      position: fixed;
      bottom: 0;
      box-sizing: border-box;
      outline: none;
      display: flex;
      flex-direction: column;
      max-height: 80vh;
      transform: translateY(100%);
      transition: transform var(--duration-medium) var(--ease-out);
      padding: var(--space-0) var(--space-4) var(--space-4) var(--space-4);
    }

    dialog::backdrop {
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(var(--space-0-5));
      opacity: 0;
      transition: opacity var(--duration-medium) var(--ease-out);
    }

    /* Drag handle indicator overlays */
    .handle-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      height: var(--space-6);
      cursor: grab;
      user-select: none;
      touch-action: none;
    }

    .handle-line {
      width: calc(var(--space-8) * 1.5);
      height: var(--space-1);
      background: var(--color-border-strong);
      border-radius: var(--radius-full);
      opacity: 0.5;
    }

    /* Open anim trigger classes */
    dialog.open {
      transform: translateY(0);
    }

    dialog.open::backdrop {
      opacity: 1;
    }

    .content {
      overflow-y: auto;
      flex: 1;
    }
  </style>
  <dialog part="dialog">
    <div class="handle-bar" part="handle">
      <div class="handle-line"></div>
    </div>
    <div class="content" part="content">
      <slot></slot>
    </div>
  </dialog>
`;

export class Sheet extends Base {
  static observedAttributes = ['open'];

  #startY = 0;
  #currentY = 0;
  #dragging = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const dialog = this.shadowRoot.querySelector('dialog');
    const handle = this.shadowRoot.querySelector('.handle-bar');

    dialog.addEventListener('close', this.#onClose, { signal: this.ctrl.signal });

    // Pointer event bindings for drag gesture handling
    handle.addEventListener('pointerdown', this.#onDragStart, { signal: this.ctrl.signal });
    this.shadowRoot.addEventListener('pointermove', this.#onDragMove, { signal: this.ctrl.signal });
    this.shadowRoot.addEventListener('pointerup', this.#onDragEnd, { signal: this.ctrl.signal });
    this.shadowRoot.addEventListener('pointercancel', this.#onDragEnd, { signal: this.ctrl.signal });

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

    if (open && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => dialog.classList.add('open'));
    } else if (!open && dialog.open) {
      dialog.classList.remove('open');
      setTimeout(() => dialog.close(), 300);
    }
  }

  #onDragStart = (e) => {
    e.preventDefault();
    this.#startY = e.clientY;
    this.#dragging = true;
    const dialog = this.shadowRoot.querySelector('dialog');
    dialog.style.transition = 'none';
    const handle = this.shadowRoot.querySelector('.handle-bar');
    handle.style.cursor = 'grabbing';
  };

  #onDragMove = (e) => {
    if (!this.#dragging) return;
    const deltaY = e.clientY - this.#startY;
    
    // Only allow dragging downwards (positive delta Y)
    if (deltaY > 0) {
      const dialog = this.shadowRoot.querySelector('dialog');
      dialog.style.transform = `translateY(${deltaY}px)`;
      this.#currentY = deltaY;
    }
  };

  #onDragEnd = () => {
    if (!this.#dragging) return;
    this.#dragging = false;

    const dialog = this.shadowRoot.querySelector('dialog');
    dialog.style.transition = '';
    const handle = this.shadowRoot.querySelector('.handle-bar');
    handle.style.cursor = 'grab';

    // If dragged Y exceeds 120px threshold, dismiss the sheet. Else restore position.
    if (this.#currentY > 120) {
      this.hide();
    } else {
      dialog.style.transform = '';
    }
    
    this.#currentY = 0;
  };

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

customElements.define('ui-sheet', Sheet);
