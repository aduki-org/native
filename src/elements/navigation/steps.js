/**
 * src/elements/navigation/steps.js
 *
 * Navigation System: <ui-steps>
 * Linear step indicator tracking completed, active, and upcoming workflow steps.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      font-family: var(--font-family-sans);
      position: relative;
    }

    /* Connecting background progress line */
    .line {
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: var(--space-0-5);
      background: var(--color-border-default);
      transform: translateY(-50%);
      z-index: 1;
    }

    .line-fill {
      height: 100%;
      width: 0%;
      background: var(--color-interactive);
      transition: width var(--duration-medium) var(--ease-out);
    }

    .container {
      display: flex;
      justify-content: space-between;
      width: 100%;
      position: relative;
      z-index: 2;
    }

    ::slotted(ui-step), ::slotted(div[role="step"]) {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
    }

    /* Step indicator node circles */
    ::slotted(*)::before {
      content: "";
      width: var(--space-8);
      height: var(--space-8);
      border-radius: var(--radius-full);
      background: var(--color-surface-elevated);
      border: var(--space-px) solid var(--color-border-default);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-content-secondary);
      transition: 
        background-color var(--duration-medium) var(--ease-out),
        border-color var(--duration-medium) var(--ease-out),
        color var(--duration-medium) var(--ease-out);
      box-sizing: border-box;
      margin-bottom: var(--space-2);
    }

    ::slotted([state="active"])::before {
      border-color: var(--color-interactive);
      color: var(--color-interactive);
      background: var(--color-surface-page);
      box-shadow: 0 0 0 var(--space-0-5) var(--color-border-focus);
    }

    ::slotted([state="completed"])::before {
      background: var(--color-interactive);
      border-color: transparent;
      color: var(--color-content-inverse);
      content: "✓";
    }
  </style>
  <div class="line" part="line">
    <div class="line-fill" part="line-fill"></div>
  </div>
  <div class="container" part="container">
    <slot></slot>
  </div>
`;

export class Steps extends Base {
  static observedAttributes = ['active'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const slot = this.shadowRoot.querySelector('slot');
    slot.addEventListener('slotchange', this.#onSlotChange, { signal: this.ctrl.signal });
    this.#update();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#update();
    }
  }

  #onSlotChange = () => {
    const steps = this.#getSteps();
    steps.forEach((step, index) => {
      step.setAttribute('role', 'step');
      // Set numeric step labels inside nodes
      if (step.getAttribute('state') !== 'completed') {
        step.style.setProperty('--step-num', `"${index + 1}"`);
      }
    });
    this.#update();
  };

  #getSteps() {
    const slot = this.shadowRoot.querySelector('slot');
    return slot.assignedElements();
  }

  #update() {
    const steps = this.#getSteps();
    const active = Number(this.getAttribute('active')) || 0;
    const lineFill = this.shadowRoot.querySelector('.line-fill');

    if (steps.length === 0) return;

    steps.forEach((step, index) => {
      if (index < active) {
        step.setAttribute('state', 'completed');
      } else if (index === active) {
        step.setAttribute('state', 'active');
      } else {
        step.removeAttribute('state');
      }
    });

    const percent = steps.length > 1 ? (active / (steps.length - 1)) * 100 : 0;
    lineFill.style.width = `${percent}%`;
  }
}

customElements.define('ui-steps', Steps);
