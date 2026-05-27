/**
 * src/elements/forms/radio.js
 *
 * Form Control: <ui-radio>
 * Standard-compliant form-participating radio selection element. Cooperatively
 * coordinates selections within scopes sharing a `name` attribute.
 *
 * Source: doc 04 — Web Components §9, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      font-family: var(--font-family-sans);
      cursor: pointer;
      user-select: none;
      /* Component Tokens — Semantic Reference Only */
      --radio-bg:           var(--color-surface-page);
      --radio-bg-checked:   var(--color-interactive);
      --radio-border:       var(--color-border-default);
      --radio-border-focus: var(--color-border-focus);
      --radio-radius:       var(--radius-full);
      --radio-size:         var(--space-5);
      --radio-color:        var(--color-content-inverse);
    }

    .circle {
      width: var(--radio-size);
      height: var(--radio-size);
      background: var(--radio-bg);
      border: var(--space-px) solid var(--radio-border);
      border-radius: var(--radio-radius);
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      outline: none;
      transition: 
        background-color var(--duration-fast) var(--ease-out),
        border-color var(--duration-fast) var(--ease-out),
        box-shadow var(--duration-fast) var(--ease-out);
    }

    :host(:focus-visible) .circle {
      border-color: var(--radio-border-focus);
      box-shadow: 0 0 0 var(--space-0-5) var(--color-border-focus);
    }

    .dot {
      width: 40%;
      height: 40%;
      background: var(--radio-color);
      border-radius: var(--radius-full);
      display: none;
    }

    :host(:state(checked)) .circle {
      background: var(--radio-bg-checked);
      border-color: transparent;
    }

    :host(:state(checked)) .dot {
      display: block;
    }

    :host(:state(disabled)) {
      cursor: not-allowed;
      color: var(--color-content-disabled);
    }

    :host(:state(disabled)) .circle {
      background: var(--color-interactive-disabled);
      border-color: var(--color-border-default);
    }
  </style>
  <div class="circle" part="circle" tabindex="0">
    <div class="dot"></div>
  </div>
  <slot></slot>
`;

export class Radio extends Base {
  static formAssociated = true;
  static observedAttributes = ['checked', 'disabled', 'name', 'value'];

  #internals;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
    this.#internals = this.attachInternals();
  }

  mount() {
    if (!this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', '0');
    }
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'radio');
    }

    this.addEventListener('click', this.#click, { signal: this.ctrl.signal });
    this.addEventListener('keydown', this.#keydown, { signal: this.ctrl.signal });

    this.#syncAttributes();
  }

  attributeChangedCallback(name) {
    if (this.shadowRoot) {
      this.#syncAttributes();
      if (name === 'checked' && this.checked) {
        this.#uncheckOthers();
      }
    }
  }

  #syncAttributes() {
    const checked = this.hasAttribute('checked');
    const disabled = this.hasAttribute('disabled');

    if (checked) {
      this.#internals.states.add('checked');
      this.setAttribute('aria-checked', 'true');
    } else {
      this.#internals.states.delete('checked');
      this.setAttribute('aria-checked', 'false');
    }

    if (disabled) {
      this.#internals.states.add('disabled');
      this.removeAttribute('tabindex');
    } else {
      this.#internals.states.delete('disabled');
      if (!this.hasAttribute('tabindex')) {
        this.setAttribute('tabindex', '0');
      }
    }

    const subValue = checked ? (this.getAttribute('value') || 'on') : null;
    this.#internals.setFormValue(subValue);
  }

  #click = (e) => {
    if (this.hasAttribute('disabled') || this.checked) return;
    e.preventDefault();
    this.checked = true;
  };

  #keydown = (e) => {
    if (this.hasAttribute('disabled') || this.checked) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this.checked = true;
    }
  };

  #uncheckOthers() {
    const name = this.getAttribute('name');
    if (!name) return;

    // Find and query all other radio components in the same root node sharing the same name
    const root = this.getRootNode();
    const radios = Array.from(root.querySelectorAll(`ui-radio[name="${name}"]`));

    for (const radio of radios) {
      if (radio !== this && radio.checked) {
        radio.removeAttribute('checked');
        radio.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      }
    }
  }

  formResetCallback() {
    this.checked = this.hasAttribute('checked');
  }

  formDisabledCallback(disabled) {
    if (disabled) {
      this.#internals.states.add('disabled');
      this.removeAttribute('tabindex');
    } else {
      this.#internals.states.delete('disabled');
      this.setAttribute('tabindex', '0');
    }
  }

  get checked() {
    return this.hasAttribute('checked');
  }

  set checked(val) {
    if (val) {
      this.setAttribute('checked', '');
      this.#uncheckOthers();
    } else {
      this.removeAttribute('checked');
    }
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  get value() {
    return this.getAttribute('value') || 'on';
  }

  set value(val) {
    this.setAttribute('value', val);
  }

  get validity() { return this.#internals.validity; }
  get validationMessage() { return this.#internals.validationMessage; }
  checkValidity() { return this.#internals.checkValidity(); }
  reportValidity() { return this.#internals.reportValidity(); }
}

customElements.define('ui-radio', Radio);
