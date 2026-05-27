/**
 * src/elements/forms/select.js
 *
 * Form Control: <ui-select>
 * Form-participating dropdown selector utilizing the native Popover API
 * and Anchor Positioning for premium overlay layout.
 *
 * Source: doc 04 — Web Components §9, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      font-family: var(--font-family-sans);
      position: relative;
      /* Component Tokens — Semantic Reference Only */
      --select-bg:           var(--color-surface-page);
      --select-border:       var(--color-border-default);
      --select-border-focus: var(--color-border-focus);
      --select-radius:       var(--radius-md);
      --select-font-size:    var(--font-size-base);
      --select-padding-y:    var(--space-2);
      --select-padding-x:    var(--space-3);
      --select-text-color:   var(--color-content-primary);
    }

    button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--select-bg);
      border: var(--space-px) solid var(--select-border);
      border-radius: var(--select-radius);
      font-size: var(--select-font-size);
      padding: var(--select-padding-y) var(--select-padding-x);
      color: var(--select-text-color);
      cursor: pointer;
      outline: none;
      width: 100%;
      text-align: left;
      transition: 
        border-color var(--duration-fast) var(--ease-out),
        box-shadow var(--duration-fast) var(--ease-out);
      anchor-name: --select-trigger;
    }

    button:focus-visible {
      border-color: var(--select-border-focus);
      box-shadow: 0 0 0 var(--space-0-5) var(--color-border-focus);
    }

    /* Chevron indicators overlay */
    .chevron {
      width: var(--space-4);
      height: var(--space-4);
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      opacity: 0.7;
    }

    /* Native popover style definitions */
    [popover] {
      margin: 0;
      padding: var(--space-1) var(--space-0);
      background: var(--color-surface-elevated);
      border: var(--space-px) solid var(--color-border-default);
      border-radius: var(--select-radius);
      box-shadow: var(--shadow-lg);
      width: anchor-size(width);
      position: absolute;
      top: anchor(bottom);
      left: anchor(left);
      box-sizing: border-box;
      max-height: calc(var(--space-20) * 2);
      overflow-y: auto;
      outline: none;
    }

    /* Slotted styling overrides for option item tags */
    ::slotted(option), ::slotted(div) {
      padding: var(--space-2) var(--space-3);
      cursor: pointer;
      font-size: var(--select-font-size);
      color: var(--select-text-color);
      user-select: none;
      transition: background-color var(--duration-fast) var(--ease-out);
    }

    ::slotted(option:hover), ::slotted(div:hover) {
      background: var(--color-surface-page);
    }

    ::slotted([selected]) {
      background: var(--color-interactive-disabled);
      color: var(--color-interactive);
      font-weight: var(--font-weight-semibold);
    }

    :host(:state(disabled)) button {
      background: var(--color-interactive-disabled);
      color: var(--color-content-disabled);
      cursor: not-allowed;
    }
  </style>
  <button id="trigger" popovertarget="dropdown" type="button" part="button">
    <span id="selected-label">Select option...</span>
    <svg class="chevron" viewBox="0 0 24 24">
      <path d="M6 9l6 6 6-6"/>
    </svg>
  </button>
  <div id="dropdown" popover part="popover">
    <slot></slot>
  </div>
`;

export class Select extends Base {
  static formAssociated = true;
  static observedAttributes = ['value', 'disabled', 'required'];

  #internals;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
    this.#internals = this.attachInternals();
  }

  mount() {
    const slot = this.shadowRoot.querySelector('slot');
    slot.addEventListener('slotchange', this.#onSlotChange, { signal: this.ctrl.signal });

    // Enforce Anchor position support for popover positioning
    const trigger = this.shadowRoot.querySelector('#trigger');
    const popover = this.shadowRoot.querySelector('#dropdown');

    // Anchor positioning polyfill fallback where needed
    if ('anchorName' in document.documentElement.style === false) {
      popover.addEventListener('toggle', (e) => {
        if (e.newState === 'open') {
          const rect = trigger.getBoundingClientRect();
          popover.style.top = `${rect.bottom + window.scrollY}px`;
          popover.style.left = `${rect.left + window.scrollX}px`;
          popover.style.width = `${rect.width}px`;
        }
      }, { signal: this.ctrl.signal });
    }

    this.#syncAttributes();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#syncAttributes();
    }
  }

  #onSlotChange = () => {
    const slot = this.shadowRoot.querySelector('slot');
    const nodes = slot.assignedElements();

    for (const node of nodes) {
      node.removeEventListener('click', this.#onOptionClick);
      node.addEventListener('click', this.#onOptionClick, { signal: this.ctrl.signal });
    }

    this.#syncValue();
  };

  #onOptionClick = (e) => {
    const target = e.currentTarget;
    const val = target.getAttribute('value') || target.textContent.trim();
    this.value = val;

    // Standard Popover close operation
    const popover = this.shadowRoot.querySelector('#dropdown');
    popover.hidePopover();
  };

  #syncAttributes() {
    const trigger = this.shadowRoot.querySelector('#trigger');
    const disabled = this.hasAttribute('disabled');

    trigger.disabled = disabled;
    if (disabled) {
      this.#internals.states.add('disabled');
    } else {
      this.#internals.states.delete('disabled');
    }

    this.#syncValue();
  }

  #syncValue() {
    const slot = this.shadowRoot.querySelector('slot');
    const nodes = slot.assignedElements();
    const val = this.getAttribute('value');
    const label = this.shadowRoot.querySelector('#selected-label');

    let selectedNode = null;
    for (const node of nodes) {
      const nodeVal = node.getAttribute('value') || node.textContent.trim();
      if (nodeVal === val) {
        node.setAttribute('selected', '');
        selectedNode = node;
      } else {
        node.removeAttribute('selected');
      }
    }

    if (selectedNode) {
      label.textContent = selectedNode.textContent.trim();
    } else {
      label.textContent = this.getAttribute('placeholder') || 'Select option...';
    }

    this.#internals.setFormValue(val || '');
    this.#validate();
  }

  #validate() {
    const val = this.getAttribute('value');
    if (this.hasAttribute('required') && !val) {
      this.#internals.setValidity({ valueMissing: true }, 'Please select an option.');
    } else {
      this.#internals.setValidity({});
    }
  }

  formResetCallback() {
    this.value = this.getAttribute('value') || '';
  }

  formDisabledCallback(disabled) {
    const trigger = this.shadowRoot.querySelector('#trigger');
    trigger.disabled = disabled;
    if (disabled) {
      this.#internals.states.add('disabled');
    } else {
      this.#internals.states.delete('disabled');
    }
  }

  get value() {
    return this.getAttribute('value') || '';
  }

  set value(val) {
    this.setAttribute('value', val);
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  get validity() { return this.#internals.validity; }
  get validationMessage() { return this.#internals.validationMessage; }
  checkValidity() { return this.#internals.checkValidity(); }
  reportValidity() { return this.#internals.reportValidity(); }
}

customElements.define('ui-select', Select);
