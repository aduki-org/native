/**
 * src/elements/primitives/button.js
 *
 * Primitive Element: <ui-button>
 * FormAssociated button element featuring loading and disabled states,
 * custom state pseudo-classes, and robust semantic tokens bindings.
 *
 * Source: doc 04 — Web Components §3, §6, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      outline: none;
      /* Component Tokens — Semantic Reference Only */
      --btn-bg:          var(--color-interactive);
      --btn-bg-hover:    var(--color-interactive-hover);
      --btn-bg-active:   var(--color-interactive-active);
      --btn-bg-disabled: var(--color-interactive-disabled);
      --btn-color:       var(--color-content-inverse);
      --btn-radius:      var(--radius-md);
      --btn-font:        var(--font-family-sans);
      --btn-size:        var(--font-size-sm);
      --btn-weight:      var(--font-weight-medium);
      --btn-padding-y:   var(--space-2);
      --btn-padding-x:   var(--space-4);
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      background: var(--btn-bg);
      color: var(--btn-color);
      border: none;
      border-radius: var(--btn-radius);
      font-family: var(--btn-font);
      font-size: var(--btn-size);
      font-weight: var(--btn-weight);
      padding: var(--btn-padding-y) var(--btn-padding-x);
      cursor: pointer;
      user-select: none;
      outline: none;
      transition: 
        background-color var(--duration-fast) var(--ease-out),
        transform var(--duration-fast) var(--ease-out),
        box-shadow var(--duration-fast) var(--ease-out);
    }

    button:hover:not(:disabled) {
      background: var(--btn-bg-hover);
    }

    button:active:not(:disabled) {
      background: var(--btn-bg-active);
      transform: scale(0.98);
    }

    button:focus-visible {
      box-shadow: 0 0 0 var(--space-0-5) var(--color-border-focus);
    }

    :host(:state(loading)) button {
      opacity: 0.65;
      pointer-events: none;
      cursor: wait;
    }

    :host(:state(disabled)) button {
      background: var(--btn-bg-disabled);
      color: var(--color-content-disabled);
      cursor: not-allowed;
      pointer-events: none;
    }
  </style>
  <button part="button" type="button">
    <slot></slot>
  </button>
`;

export class Button extends Base {
  static formAssociated = true;
  static observedAttributes = ['disabled', 'type', 'value'];

  #internals;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
    this.#internals = this.attachInternals();
  }

  mount() {
    this.shadowRoot
      .querySelector('button')
      .addEventListener('click', this.#click, { signal: this.ctrl.signal });
    this.#syncAttributes();
  }

  attributeChangedCallback(name, _, next) {
    if (this.shadowRoot) {
      this.#syncAttributes();
    }
  }

  #syncAttributes() {
    const btn = this.shadowRoot.querySelector('button');
    const disabled = this.hasAttribute('disabled');
    const type = this.getAttribute('type') || 'button';

    btn.disabled = disabled;
    btn.type = type;

    if (disabled) {
      this.#internals.states.add('disabled');
    } else {
      this.#internals.states.delete('disabled');
    }
  }

  set loading(val) {
    if (val) {
      this.#internals.states.add('loading');
    } else {
      this.#internals.states.delete('loading');
    }
  }

  get loading() {
    return this.#internals.states.has('loading');
  }

  #click = (e) => {
    if (this.hasAttribute('disabled') || this.loading) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const type = this.getAttribute('type');
    if (type === 'submit') {
      const form = this.#internals.form;
      if (form) {
        form.requestSubmit();
      }
    } else if (type === 'reset') {
      const form = this.#internals.form;
      if (form) {
        form.reset();
      }
    }

    this.dispatchEvent(new CustomEvent('activate', { bubbles: true, composed: true }));
  };
}

customElements.define('ui-button', Button);
