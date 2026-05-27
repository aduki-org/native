/**
 * src/elements/forms/textarea.js
 *
 * Form Control: <ui-textarea>
 * Form-participating multi-line text area supporting validation,
 * custom disabled states, and dynamic auto-resizing.
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
      --textarea-bg:           var(--color-surface-page);
      --textarea-border:       var(--color-border-default);
      --textarea-border-focus: var(--color-border-focus);
      --textarea-radius:       var(--radius-md);
      --textarea-font-size:    var(--font-size-base);
      --textarea-padding-y:    var(--space-2);
      --textarea-padding-x:    var(--space-3);
      --textarea-text-color:   var(--color-content-primary);
    }

    textarea {
      background: var(--textarea-bg);
      border: var(--space-px) solid var(--textarea-border);
      border-radius: var(--textarea-radius);
      font-size: var(--textarea-font-size);
      font-family: inherit;
      padding: var(--textarea-padding-y) var(--textarea-padding-x);
      color: var(--textarea-text-color);
      outline: none;
      resize: vertical;
      transition: 
        border-color var(--duration-fast) var(--ease-out),
        box-shadow var(--duration-fast) var(--ease-out);
      box-sizing: border-box;
      width: 100%;
      min-height: calc(var(--space-12) * 2);
    }

    textarea:focus {
      border-color: var(--textarea-border-focus);
      box-shadow: 0 0 0 var(--space-0-5) var(--color-border-focus);
    }

    :host([autoresize]) textarea {
      resize: none;
      overflow-y: hidden;
    }

    :host(:state(disabled)) textarea {
      background: var(--color-interactive-disabled);
      color: var(--color-content-disabled);
      cursor: not-allowed;
    }

    .error-container {
      font-size: var(--font-size-xs);
      color: var(--color-feedback-error);
      min-height: var(--space-4);
    }
  </style>
  <textarea part="textarea"></textarea>
  <div class="error-container" part="error-box">
    <slot name="error"></slot>
  </div>
`;

export class Textarea extends Base {
  static formAssociated = true;
  static observedAttributes = [
    'value', 'placeholder', 'disabled', 'required',
    'minlength', 'maxlength', 'autoresize', 'rows'
  ];

  #internals;
  #observer = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
    this.#internals = this.attachInternals();
  }

  mount() {
    const area = this.shadowRoot.querySelector('textarea');
    area.addEventListener('input', this.#handleInput, { signal: this.ctrl.signal });
    area.addEventListener('change', this.#handleChange, { signal: this.ctrl.signal });

    // Auto-resizing ResizeObserver setup
    this.#observer = new ResizeObserver(() => this.#resize());
    this.#observer.observe(area);
    this.ctrl.signal.addEventListener('abort', () => this.#observer.disconnect());

    this.#syncAttributes();
  }

  unmount() {
    if (this.#observer) {
      this.#observer.disconnect();
      this.#observer = null;
    }
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#syncAttributes();
    }
  }

  #syncAttributes() {
    const area = this.shadowRoot.querySelector('textarea');
    const disabled = this.hasAttribute('disabled');

    const attrs = ['placeholder', 'required', 'minlength', 'maxlength', 'rows'];
    for (const attr of attrs) {
      if (this.hasAttribute(attr)) {
        area.setAttribute(attr, this.getAttribute(attr));
      } else {
        area.removeAttribute(attr);
      }
    }

    area.disabled = disabled;
    area.value = this.getAttribute('value') || '';

    if (disabled) {
      this.#internals.states.add('disabled');
    } else {
      this.#internals.states.delete('disabled');
    }

    this.#resize();
    this.#validate();
  }

  #handleInput = () => {
    const area = this.shadowRoot.querySelector('textarea');
    this.setAttribute('value', area.value);
    this.#resize();
    this.#validate();
  };

  #handleChange = () => {
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  };

  #resize() {
    if (!this.hasAttribute('autoresize')) return;
    const area = this.shadowRoot.querySelector('textarea');
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight}px`;
  }

  #validate() {
    const area = this.shadowRoot.querySelector('textarea');
    const val = area.value;

    this.#internals.setFormValue(val);

    if (!area.validity.valid) {
      this.#internals.setValidity(area.validity, area.validationMessage, area);
    } else {
      this.#internals.setValidity({});
    }
  }

  formResetCallback() {
    this.value = this.getAttribute('value') || '';
  }

  formDisabledCallback(disabled) {
    const area = this.shadowRoot.querySelector('textarea');
    area.disabled = disabled;
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
  }

  get validity() { return this.#internals.validity; }
  get validationMessage() { return this.#internals.validationMessage; }
  checkValidity() { return this.#internals.checkValidity(); }
  reportValidity() { return this.#internals.reportValidity(); }
}

customElements.define('ui-textarea', Textarea);
