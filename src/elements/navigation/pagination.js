/**
 * src/elements/navigation/pagination.js
 *
 * Navigation System: <ui-pagination>
 * URL query-state aware pagination component. Synchronously updates page variables
 * in a bookmarkable fashion via the client router.
 *
 * Source: doc 04 — Web Components §3, doc 08 — State Management §3, doc 09 — Routing §8
 */

import { Base } from '../base.js';
import { navigate } from '../../core/router/index.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      font-family: var(--font-family-sans);
      width: 100%;
    }

    button {
      background: var(--color-surface-elevated);
      border: var(--space-px) solid var(--color-border-default);
      border-radius: var(--radius-md);
      padding: var(--space-2) var(--space-3);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-content-primary);
      cursor: pointer;
      outline: none;
      transition: 
        background-color var(--duration-fast) var(--ease-out),
        border-color var(--duration-fast) var(--ease-out);
    }

    button:hover:not(:disabled) {
      background: var(--color-interactive-disabled);
    }

    button:disabled {
      color: var(--color-content-disabled);
      cursor: not-allowed;
      opacity: 0.6;
    }

    .page-indicator {
      font-size: var(--font-size-sm);
      color: var(--color-content-secondary);
      user-select: none;
    }
  </style>
  <button id="prev-btn" part="button prev" type="button">Previous</button>
  <span class="page-indicator" part="indicator">Page 1 of 1</span>
  <button id="next-btn" part="button next" type="button">Next</button>
`;

export class Pagination extends Base {
  static observedAttributes = ['page', 'total', 'limit'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const prev = this.shadowRoot.querySelector('#prev-btn');
    const next = this.shadowRoot.querySelector('#next-btn');

    prev.addEventListener('click', () => this.#changePage(-1), { signal: this.ctrl.signal });
    next.addEventListener('click', () => this.#changePage(1), { signal: this.ctrl.signal });

    // Sync pagination state with navigation changes
    if (typeof window !== 'undefined' && window.navigation) {
      window.navigation.addEventListener('navigate', this.#syncState, { signal: this.ctrl.signal });
    }

    this.#syncState();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#syncState();
    }
  }

  #syncState = () => {
    const prev = this.shadowRoot.querySelector('#prev-btn');
    const next = this.shadowRoot.querySelector('#next-btn');
    const indicator = this.shadowRoot.querySelector('.page-indicator');

    // Parse attributes safely using read-site coercion logic
    const total = Math.max(0, Number(this.getAttribute('total')) || 0);
    const limit = Math.max(1, Number(this.getAttribute('limit')) || 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    let page = 1;
    if (this.hasAttribute('page')) {
      page = Number(this.getAttribute('page')) || 1;
    } else if (typeof window !== 'undefined') {
      const url = new URL(window.navigation?.currentEntry?.url || window.location.href);
      page = Number(url.searchParams.get('page')) || 1;
    }
    
    page = Math.min(totalPages, Math.max(1, page));

    indicator.textContent = `Page ${page} of ${totalPages}`;
    prev.disabled = page <= 1;
    next.disabled = page >= totalPages;
  };

  #changePage(delta) {
    const total = Math.max(0, Number(this.getAttribute('total')) || 0);
    const limit = Math.max(1, Number(this.getAttribute('limit')) || 10);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    let page = 1;
    if (this.hasAttribute('page')) {
      page = Number(this.getAttribute('page')) || 1;
    } else if (typeof window !== 'undefined') {
      const url = new URL(window.navigation?.currentEntry?.url || window.location.href);
      page = Number(url.searchParams.get('page')) || 1;
    }

    const nextPage = Math.min(totalPages, Math.max(1, page + delta));

    if (this.hasAttribute('page')) {
      this.setAttribute('page', nextPage);
    } else if (typeof window !== 'undefined') {
      const url = new URL(window.navigation?.currentEntry?.url || window.location.href);
      url.searchParams.set('page', nextPage);
      navigate(url.pathname + url.search);
    }

    this.dispatchEvent(new CustomEvent('page-change', {
      detail: { page: nextPage },
      bubbles: true,
      composed: true
    }));
  }
}

customElements.define('ui-pagination', Pagination);
