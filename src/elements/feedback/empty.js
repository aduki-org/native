/**
 * src/elements/feedback/empty.js
 *
 * Feedback Element: <ui-empty>
 * Informative empty state component supporting custom illustrations slots,
 * titles, secondary paragraphs, and CTA actions triggers.
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
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-12) var(--space-6);
      font-family: var(--font-family-sans);
      box-sizing: border-box;
      width: 100%;
    }

    .illustration {
      margin-bottom: var(--space-4);
      color: var(--color-content-secondary);
      display: flex;
      justify-content: center;
    }

    /* Slotted illustration size constraints */
    ::slotted(svg), ::slotted(img) {
      width: calc(var(--space-12) * 2);
      height: calc(var(--space-12) * 2);
    }

    h3 {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-content-primary);
      margin: 0 0 var(--space-2) 0;
    }

    p {
      font-size: var(--font-size-sm);
      color: var(--color-content-secondary);
      max-width: calc(var(--space-32) * 3);
      margin: 0 0 var(--space-6) 0;
      line-height: var(--line-height-normal);
    }

    .actions {
      display: flex;
      gap: var(--space-3);
      justify-content: center;
    }
  </style>
  <div class="illustration" part="illustration">
    <slot name="illustration">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    </slot>
  </div>
  <h3 id="title-label" part="title"></h3>
  <p id="desc-label" part="description"></p>
  <div class="actions" part="actions">
    <slot></slot>
  </div>
`;

export class Empty extends Base {
  static observedAttributes = ['title', 'description'];

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
    const title = this.getAttribute('title') || 'No records found';
    const description = this.getAttribute('description') || 'Try adjusting your search criteria or add new records.';

    this.shadowRoot.querySelector('#title-label').textContent = title;
    this.shadowRoot.querySelector('#desc-label').textContent = description;
  }
}

customElements.define('ui-empty', Empty);
