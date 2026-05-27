/**
 * src/elements/forms/input.js
 *
 * Form Control: <ui-input>
 * Form-participating text/number/email/password input control using ElementInternals
 * for seamless integration with native form submission and validation.
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
      /* Component Tokens — Semantic Reference Only */
      --input-bg:           var(--color-surface-page);
      --input-border:       var(--color-border-default);
      --input-border-focus: var(--color-border-focus);
      --input-radius:       var(--radius-md);
      --input-font-size:    var(--font-size-base);
      --input-padding-y:    var(--space-2);
      --input-padding-x:    var(--space-3);
      --input-text-color:   var(--color-content-primary);
    }

    input {
      background: var(--input-bg);
      border: var(--space-px) solid var(--input-border);
      border-radius: var(--input-radius);
      font-size: var(--input-font-size);
      padding: var(--input-padding-y) var(--input-padding-x);
      color: var(--input-text-color);
      outline: none;
      transition: 
        border-color var(--duration-fast) var(--ease-out),
        box-shadow var(--duration-fast) var(--ease-out);
      box-sizing: border-box;
      width: 100%;
    }

    input:focus {
      border-color: var(--input-border-focus);
      box-shadow: 0 0 0 var(--space-0-5) var(--color-border-focus);
    }

    :host(:state(disabled)) input {
      background: var(--color-interactive-disabled);
      color: var(--color-content-disabled);
      cursor: not-allowed;
    }

    /* Error indicator slots styling */
    .error-container {
      font-size: var(--font-size-xs);
      color: var(--color-feedback-error);
      min-height: var(--space-4);
    }
  </style>
  <input part="input" />
  <div class="error-container" part="error-box">
    <slot name="error"></slot>
  </div>
`;

export class Input extends Base {
  static formAssociated = true;
  static observedAttributes = [
    'type', 'value', 'placeholder', 'disabled', 'required',
    'minlength', 'maxlength', 'min', 'max', 'pattern'
  ];

  #internals;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
    this.#internals = this.attachInternals();
  }

  mount() {
    const input = this.shadowRoot.querySelector('input');
    
    // Bind change and input event listeners
    input.addEventListener('input', this.#handleInput, { signal: this.ctrl.signal });
    input.addEventListener('change', this.#handleChange, { signal: this.ctrl.signal });

    this.#syncAttributes();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#syncAttributes();
    }
  }

  #syncAttributes() {
    const input = this.shadowRoot.querySelector('input');
    const disabled = this.hasAttribute('disabled');

    // Proxy observed attributes down to native input inside Shadow DOM
    const attrs = ['type', 'placeholder', 'required', 'minlength', 'maxlength', 'min', 'max', 'pattern'];
    for (const attr of attrs) {
      if (this.hasAttribute(attr)) {
        input.setAttribute(attr, this.getAttribute(attr));
      } else {
        input.removeAttribute(attr);
      }
    }

    input.disabled = disabled;
    input.value = this.getAttribute('value') || '';
    
    if (disabled) {
      this.#internals.states.add('disabled');
    } else {
      this.#internals.states.delete('disabled');
    }

    this.#validate();
  }

  #handleInput = () => {
    const input = this.shadowRoot.querySelector('input');
    this.setAttribute('value', input.value);
    this.#validate();
  };

  #handleChange = () => {
    const input = this.shadowRoot.querySelector('input');
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  };

  #validate() {
    const input = this.shadowRoot.querySelector('input');
    const val = input.value;
    
    this.#internals.setFormValue(val);
    
    // Check validation and delegate state to ElementInternals
    if (!input.validity.valid) {
      this.#internals.setValidity(input.validity, input.validationMessage, input);
    } else {
      this.#internals.setValidity({});
    }
  }

  // Form Associated lifecycle reactions
  formResetCallback() {
    this.value = this.getAttribute('value') || '';
  }

  formDisabledCallback(disabled) {
    const input = this.shadowRoot.querySelector('input');
    input.disabled = disabled;
    if (disabled) {
      this.#internals.states.add('disabled');
    } else {
      this.#internals.states.delete('disabled');
    }
  }

  // Value getters and setters
  get value() {
    return this.getAttribute('value') || '';
  }

  set value(val) {
    this.setAttribute('value', val);
  }

  get validity() { return this.#internals.validity; }
  get validationMessage() { return this.#internals.validationMessage; }
  checkValidity() { return this.#internals.checkValidity(); }
  reportValidity() { return this.#internals.reportValidity(); }
}

customElements.define('ui-input', Input);
