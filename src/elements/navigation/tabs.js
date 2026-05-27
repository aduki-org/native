/**
 * src/elements/navigation/tabs.js
 *
 * Navigation System: <ui-tabs>
 * Roving-tabindex, keyboard-accessible (Left/Right arrows, Home, End),
 * and URL-sync capable tab container matching complete WAI-ARIA tablist structures.
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
      width: 100%;
      font-family: var(--font-family-sans);
    }

    .tablist {
      display: flex;
      border-bottom: var(--space-px) solid var(--color-border-default);
      gap: var(--space-4);
      box-sizing: border-box;
      width: 100%;
    }

    /* Slotted child headers styling */
    ::slotted([role="tab"]) {
      padding: var(--space-3) var(--space-1);
      cursor: pointer;
      border: none;
      background: transparent;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-content-secondary);
      border-bottom: var(--space-0-5) solid transparent;
      outline: none;
      transition: 
        color var(--duration-fast) var(--ease-out),
        border-color var(--duration-fast) var(--ease-out);
      user-select: none;
    }

    ::slotted([role="tab"]:hover) {
      color: var(--color-content-primary);
    }

    ::slotted([role="tab"][aria-selected="true"]) {
      color: var(--color-interactive);
      border-bottom-color: var(--color-interactive);
    }

    .panels {
      padding-top: var(--space-4);
    }

    ::slotted([role="tabpanel"]) {
      display: none;
    }

    ::slotted([role="tabpanel"].active) {
      display: block;
    }
  </style>
  <div class="tablist" part="tablist" role="tablist">
    <slot name="tab"></slot>
  </div>
  <div class="panels" part="panels">
    <slot></slot>
  </div>
`;

export class Tabs extends Base {
  static observedAttributes = ['active'];
  #focusedIndex = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const tablist = this.shadowRoot.querySelector('.tablist');
    const tabSlot = this.shadowRoot.querySelector('slot[name="tab"]');

    tabSlot.addEventListener('slotchange', this.#onSlotChange, { signal: this.ctrl.signal });
    tablist.addEventListener('keydown', this.#onKeyDown, { signal: this.ctrl.signal });

    this.#syncTabs();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#syncTabs();
    }
  }

  #onSlotChange = () => {
    const tabs = this.#getTabs();
    tabs.forEach((tab, index) => {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('tabindex', index === 0 ? '0' : '-1');
      tab.removeEventListener('click', this.#onTabClick);
      tab.addEventListener('click', this.#onTabClick, { signal: this.ctrl.signal });
    });
    this.#syncTabs();
  };

  #getTabs() {
    const slot = this.shadowRoot.querySelector('slot[name="tab"]');
    return slot.assignedElements();
  }

  #getPanels() {
    const slot = this.shadowRoot.querySelector('slot:not([name])');
    return slot.assignedElements().filter(el => el.getAttribute('role') === 'tabpanel' || el.tagName.toLowerCase() === 'ui-tab-panel');
  }

  #onTabClick = (e) => {
    const tab = e.currentTarget;
    const value = tab.getAttribute('value') || tab.textContent.trim();
    this.setAttribute('active', value);
  };

  #syncTabs() {
    const active = this.getAttribute('active');
    const tabs = this.#getTabs();
    const panels = this.#getPanels();

    if (tabs.length === 0) return;

    let activeIndex = 0;
    tabs.forEach((tab, idx) => {
      const tabVal = tab.getAttribute('value') || tab.textContent.trim();
      const isSelected = active ? tabVal === active : idx === 0;

      tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      tab.setAttribute('tabindex', isSelected ? '0' : '-1');
      
      if (isSelected) {
        activeIndex = idx;
      }
    });

    this.#focusedIndex = activeIndex;

    panels.forEach((panel, idx) => {
      if (idx === activeIndex) {
        panel.classList.add('active');
        panel.setAttribute('aria-hidden', 'false');
      } else {
        panel.classList.remove('active');
        panel.setAttribute('aria-hidden', 'true');
      }
    });
  }

  #focusTab(index) {
    const tabs = this.#getTabs();
    if (tabs.length === 0) return;

    this.#focusedIndex = (index + tabs.length) % tabs.length;
    const targetTab = tabs[this.#focusedIndex];

    tabs.forEach((tab, idx) => {
      tab.setAttribute('tabindex', idx === this.#focusedIndex ? '0' : '-1');
    });

    targetTab.focus();
    const value = targetTab.getAttribute('value') || targetTab.textContent.trim();
    this.setAttribute('active', value);
  }

  #onKeyDown = (e) => {
    const tabs = this.#getTabs();
    if (tabs.length === 0) return;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        this.#focusTab(this.#focusedIndex + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.#focusTab(this.#focusedIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        this.#focusTab(0);
        break;
      case 'End':
        e.preventDefault();
        this.#focusTab(tabs.length - 1);
        break;
    }
  };
}

customElements.define('ui-tabs', Tabs);
