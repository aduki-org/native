/**
 * src/elements/feedback/alert.js
 *
 * Feedback Element: <ui-alert>
 * Inline severity notifications (info, success, warning, error) incorporating WAI-ARIA
 * role="alert" live regions and dismiss action controllers.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: block;
      font-family: var(--font-family-sans);
      width: 100%;
      /* Component Tokens — Semantic Reference Only */
      --alert-radius: var(--radius-md);
      --alert-bg:     var(--color-surface-elevated);
      --alert-color:  var(--color-content-primary);
      --alert-border: var(--color-border-default);
    }

    .alert {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-4);
      background: var(--alert-bg);
      color: var(--alert-color);
      border: var(--space-px) solid var(--alert-border);
      border-radius: var(--alert-radius);
      box-sizing: border-box;
      position: relative;
    }

    .body {
      flex: 1;
      font-size: var(--font-size-sm);
      line-height: var(--line-height-normal);
    }

    button {
      background: transparent;
      border: none;
      color: currentColor;
      opacity: 0.6;
      cursor: pointer;
      padding: 0;
      display: none;
      align-items: center;
      justify-content: center;
      transition: opacity var(--duration-fast) var(--ease-out);
    }

    button:hover {
      opacity: 1;
    }

    :host([dismissible]) button {
      display: inline-flex;
    }

    /* Variant mappings using semantic feedback tokens only */
    :host([variant="success"]) {
      --alert-bg:     var(--color-surface-page);
      --alert-border: var(--color-feedback-success);
      --alert-color:  var(--color-content-primary);
    }

    :host([variant="warning"]) {
      --alert-bg:     var(--color-surface-page);
      --alert-border: var(--color-feedback-warning);
      --alert-color:  var(--color-content-primary);
    }

    :host([variant="error"]) {
      --alert-bg:     var(--color-surface-page);
      --alert-border: var(--color-feedback-error);
      --alert-color:  var(--color-content-primary);
    }

    :host([variant="info"]) {
      --alert-bg:     var(--color-surface-page);
      --alert-border: var(--color-feedback-info);
      --alert-color:  var(--color-content-primary);
    }
  </style>
  <div class="alert" part="alert" role="alert">
    <div class="body" part="body">
      <slot></slot>
    </div>
    <button part="close-button" type="button" aria-label="Close alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
`;

export class Alert extends Base {
  static observedAttributes = ['variant', 'dismissible'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const closeBtn = this.shadowRoot.querySelector('button');
    closeBtn.addEventListener('click', this.#dismiss, { signal: this.ctrl.signal });
  }

  #dismiss = () => {
    this.dispatchEvent(new CustomEvent('dismiss', { bubbles: true, composed: true }));
    this.remove();
  };
}

customElements.define('ui-alert', Alert);
