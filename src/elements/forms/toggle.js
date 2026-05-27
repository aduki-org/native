/**
 * src/elements/forms/toggle.js
 *
 * Form Control: <ui-toggle>
 * Form-participating Switch toggle element. Features standard switch ARIA roles,
 * custom :state(on) pseudo-classes, and beautiful slide animations.
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
      --switch-bg:           var(--color-border-strong);
      --switch-bg-on:        var(--color-interactive);
      --switch-thumb-color:  var(--color-content-inverse);
      --switch-width:        var(--space-10);
      --switch-height:       var(--space-6);
      --switch-thumb-size:   calc(var(--switch-height) - var(--space-1));
    }

    .track {
      width: var(--switch-width);
      height: var(--switch-height);
      background: var(--switch-bg);
      border-radius: var(--radius-full);
      position: relative;
      outline: none;
      box-sizing: border-box;
      transition: 
        background-color var(--duration-fast) var(--ease-out),
        box-shadow var(--duration-fast) var(--ease-out);
    }

    :host(:focus-visible) .track {
      box-shadow: 0 0 0 var(--space-0-5) var(--color-border-focus);
    }

    /* Moving thumb circular handle design */
    .thumb {
      width: var(--switch-thumb-size);
      height: var(--switch-thumb-size);
      background: var(--switch-thumb-color);
      border-radius: var(--radius-full);
      position: absolute;
      top: var(--space-0-5);
      left: var(--space-0-5);
      box-shadow: var(--shadow-sm);
      transition: transform var(--duration-fast) var(--ease-out);
    }

    :host(:state(on)) .track {
      background: var(--switch-bg-on);
    }

    :host(:state(on)) .thumb {
      transform: translateX(calc(var(--switch-width) - var(--switch-thumb-size) - var(--space-1)));
    }

    :host(:state(disabled)) {
      cursor: not-allowed;
      color: var(--color-content-disabled);
    }

    :host(:state(disabled)) .track {
      background: var(--color-interactive-disabled);
      opacity: 0.6;
    }
  </style>
  <div class="track" part="track" tabindex="0">
    <div class="thumb" part="thumb"></div>
  </div>
  <slot></slot>
`;

export class Toggle extends Base {
  static formAssociated = true;
  static observedAttributes = ['checked', 'disabled', 'value'];

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
      this.setAttribute('role', 'switch');
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
    const disabled = this.hasAttribute('disabled');

    if (checked) {
      this.#internals.states.add('on');
      this.setAttribute('aria-checked', 'true');
    } else {
      this.#internals.states.delete('on');
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

customElements.define('ui-toggle', Toggle);
