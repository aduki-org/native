/**
 * src/elements/forms/checkbox.js
 *
 * Form Control: <ui-checkbox>
 * Accessible form-participating tri-state checkbox element utilizing ElementInternals
 * states and beautiful semantic-bound SVGs indicators.
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
      --check-bg:           var(--color-surface-page);
      --check-bg-checked:   var(--color-interactive);
      --check-border:       var(--color-border-default);
      --check-border-focus: var(--color-border-focus);
      --check-radius:       var(--radius-sm);
      --check-size:         var(--space-5);
      --check-color:        var(--color-content-inverse);
    }

    .box {
      width: var(--check-size);
      height: var(--check-size);
      background: var(--check-bg);
      border: var(--space-px) solid var(--check-border);
      border-radius: var(--check-radius);
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

    :host(:focus-visible) .box {
      border-color: var(--check-border-focus);
      box-shadow: 0 0 0 var(--space-0-5) var(--color-border-focus);
    }

    /* Checkmark indicators sizing */
    svg {
      width: 80%;
      height: 80%;
      fill: none;
      stroke: var(--check-color);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      display: none;
    }

    .dash {
      width: 50%;
      height: var(--space-0-5);
      background: var(--check-color);
      border-radius: var(--radius-none);
      display: none;
    }

    :host(:state(checked)) .box {
      background: var(--check-bg-checked);
      border-color: transparent;
    }

    :host(:state(checked)) svg {
      display: block;
    }

    :host(:state(indeterminate)) .box {
      background: var(--check-bg-checked);
      border-color: transparent;
    }

    :host(:state(indeterminate)) .dash {
      display: block;
    }

    :host(:state(disabled)) {
      cursor: not-allowed;
      color: var(--color-content-disabled);
    }

    :host(:state(disabled)) .box {
      background: var(--color-interactive-disabled);
      border-color: var(--color-border-default);
    }
  </style>
  <div class="box" part="box" tabindex="0">
    <svg viewBox="0 0 24 24">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
    <div class="dash"></div>
  </div>
  <slot></slot>
`;

export class Checkbox extends Base {
  static formAssociated = true;
  static observedAttributes = ['checked', 'indeterminate', 'disabled', 'required', 'value'];

  #internals;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
    this.#internals = this.attachInternals();
  }

  mount() {
    // Tabindex defaults
    if (!this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', '0');
    }

    this.addEventListener('click', this.#click, { signal: this.ctrl.signal });
    this.addEventListener('keydown', this.#keydown, { signal: this.ctrl.signal });

    this.#syncAttributes();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#syncAttributes();
    }
  }

  #syncAttributes() {
    const checked = this.hasAttribute('checked');
    const indeterminate = this.hasAttribute('indeterminate');
    const disabled = this.hasAttribute('disabled');

    if (checked) {
      this.#internals.states.add('checked');
      this.#internals.states.delete('indeterminate');
    } else if (indeterminate) {
      this.#internals.states.add('indeterminate');
      this.#internals.states.delete('checked');
    } else {
      this.#internals.states.delete('checked');
      this.#internals.states.delete('indeterminate');
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
    this.#validate();
  }

  #click = (e) => {
    if (this.hasAttribute('disabled')) return;
    e.preventDefault();
    this.checked = !this.checked;
  };

  #keydown = (e) => {
    if (this.hasAttribute('disabled')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this.checked = !this.checked;
    }
  };

  #validate() {
    if (this.hasAttribute('required') && !this.checked) {
      this.#internals.setValidity({ valueMissing: true }, 'You must check this box.');
    } else {
      this.#internals.setValidity({});
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
      this.removeAttribute('indeterminate');
    } else {
      this.removeAttribute('checked');
    }
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  get indeterminate() {
    return this.hasAttribute('indeterminate');
  }

  set indeterminate(val) {
    if (val) {
      this.setAttribute('indeterminate', '');
      this.removeAttribute('checked');
    } else {
      this.removeAttribute('indeterminate');
    }
  }

  get validity() { return this.#internals.validity; }
  get validationMessage() { return this.#internals.validationMessage; }
  checkValidity() { return this.#internals.checkValidity(); }
  reportValidity() { return this.#internals.reportValidity(); }
}

customElements.define('ui-checkbox', Checkbox);
