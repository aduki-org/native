/**
 * src/elements/forms/field.js
 *
 * Form Control: <ui-field>
 * Field wrapper layout. Coordinates labels, required indicators, hints,
 * custom error message slots, and wraps any active form controls.
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
      gap: var(--space-1-5);
      font-family: var(--font-family-sans);
      width: 100%;
    }

    label {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-content-primary);
      display: flex;
      align-items: center;
      gap: var(--space-0-5);
    }

    .required-marker {
      color: var(--color-feedback-error);
      font-weight: var(--font-weight-bold);
      display: none;
    }

    :host([required]) .required-marker {
      display: inline;
    }

    .hint-box {
      font-size: var(--font-size-xs);
      color: var(--color-content-secondary);
    }

    .control-box {
      display: flex;
      flex-direction: column;
    }

    .error-box {
      font-size: var(--font-size-xs);
      color: var(--color-feedback-error);
      min-height: var(--space-4);
    }
  </style>
  <label part="label">
    <slot name="label"></slot>
    <span class="required-marker" aria-hidden="true">*</span>
  </label>
  <div class="hint-box" part="hint">
    <slot name="hint"></slot>
  </div>
  <div class="control-box" part="control">
    <slot></slot>
  </div>
  <div class="error-box" part="error">
    <slot name="error"></slot>
  </div>
`;

export class Field extends Base {
  static observedAttributes = ['label', 'required'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    this.#update();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#update();
    }
  }

  #update() {
    const labelVal = this.getAttribute('label');
    const labelSlot = this.shadowRoot.querySelector('slot[name="label"]');

    if (labelVal) {
      // If a label attribute is provided and labelSlot has no customized children, stamp text
      const hasChildren = labelSlot.assignedNodes().length > 0;
      if (!hasChildren) {
        this.shadowRoot.querySelector('label').childNodes[0].textContent = labelVal;
      }
    }
  }
}

customElements.define('ui-field', Field);
