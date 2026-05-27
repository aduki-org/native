/**
 * src/elements/overlay/menu.js
 *
 * Overlay System: <ui-menu>
 * Anchor-able popover menu container implementing roving tabindex,
 * full keyboard menu navigation (arrows, Home, End), and WAI-ARIA role="menu" specifications.
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
      padding: var(--space-1) var(--space-0);
      background: var(--color-surface-elevated);
      border: var(--space-px) solid var(--color-border-default);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      box-sizing: border-box;
      outline: none;
      display: flex;
      flex-direction: column;
      min-width: calc(var(--space-12) * 3);
    }

    ::slotted(ui-button), ::slotted(div[role="menuitem"]), ::slotted(button) {
      display: flex;
      align-items: center;
      width: 100%;
      text-align: left;
      border: none;
      background: transparent;
      padding: var(--space-2) var(--space-4);
      font-size: var(--font-size-sm);
      color: var(--color-content-primary);
      cursor: pointer;
      box-sizing: border-box;
      user-select: none;
      transition: background-color var(--duration-fast) var(--ease-out);
    }

    ::slotted(ui-button:hover), ::slotted(div[role="menuitem"]:hover), ::slotted(button:hover) {
      background: var(--color-surface-page);
    }

    ::slotted(:focus-visible) {
      background: var(--color-surface-page);
      outline: none;
    }
  </style>
  <div popover="auto" part="menu" role="menu">
    <slot></slot>
  </div>
`;

export class Menu extends Base {
  #focusedIndex = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const popover = this.shadowRoot.querySelector('[popover]');
    const slot = this.shadowRoot.querySelector('slot');

    slot.addEventListener('slotchange', this.#onSlotChange, { signal: this.ctrl.signal });
    popover.addEventListener('keydown', this.#onKeyDown, { signal: this.ctrl.signal });
  }

  show() {
    this.shadowRoot.querySelector('[popover]').showPopover();
    this.#focusItem(0);
  }

  hide() {
    this.shadowRoot.querySelector('[popover]').hidePopover();
  }

  toggle() {
    const popover = this.shadowRoot.querySelector('[popover]');
    if (popover.matches(':popover-open')) {
      popover.hidePopover();
    } else {
      this.show();
    }
  }

  #onSlotChange = () => {
    const items = this.#getItems();
    items.forEach((item, index) => {
      if (!item.hasAttribute('role')) {
        item.setAttribute('role', 'menuitem');
      }
      item.setAttribute('tabindex', index === 0 ? '0' : '-1');
    });
  };

  #getItems() {
    const slot = this.shadowRoot.querySelector('slot');
    return slot.assignedElements().filter((el) => {
      const tag = el.tagName.toLowerCase();
      return tag === 'ui-button' || tag === 'button' || el.getAttribute('role') === 'menuitem';
    });
  }

  #focusItem(index) {
    const items = this.#getItems();
    if (items.length === 0) return;

    // Boundary wrap protection
    this.#focusedIndex = (index + items.length) % items.length;

    items.forEach((item, idx) => {
      if (idx === this.#focusedIndex) {
        item.setAttribute('tabindex', '0');
        item.focus();
      } else {
        item.setAttribute('tabindex', '-1');
      }
    });
  }

  #onKeyDown = (e) => {
    const items = this.#getItems();
    if (items.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.#focusItem(this.#focusedIndex + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.#focusItem(this.#focusedIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        this.#focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        this.#focusItem(items.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        this.hide();
        break;
    }
  };
}

customElements.define('ui-menu', Menu);
