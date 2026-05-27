/**
 * src/elements/forms/form.js
 *
 * Form Orchestrator: <ui-form>
 * Wraps form controls and handles accessible native form submission,
 * validation tracking, and automatic offline background sync queue buffering.
 *
 * Source: doc 04 — Web Components §9, doc 13 — Offline and Background §5
 */

import { Base } from '../base.js';
import { check } from '../../core/offline/connectivity.js';
import { queue } from '../../core/offline/queue.js';
import { pipeline } from '../../core/api/pipeline.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: block;
      width: 100%;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
    }
  </style>
  <form part="form">
    <slot></slot>
  </form>
`;

export class Form extends Base {
  static observedAttributes = ['action', 'method', 'offline'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const form = this.shadowRoot.querySelector('form');
    form.addEventListener('submit', this.#submit, { signal: this.ctrl.signal });
    this.#syncAttributes();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#syncAttributes();
    }
  }

  #syncAttributes() {
    const form = this.shadowRoot.querySelector('form');
    if (this.hasAttribute('action')) {
      form.setAttribute('action', this.getAttribute('action'));
    }
    if (this.hasAttribute('method')) {
      form.setAttribute('method', this.getAttribute('method'));
    }
  }

  #submit = async (e) => {
    e.preventDefault();

    const form = this.shadowRoot.querySelector('form');
    const action = this.getAttribute('action') || window.location.href;
    const method = (this.getAttribute('method') || 'POST').toUpperCase();

    // 1. Gather all form-associated inputs under this form subtree
    const controls = Array.from(this.querySelectorAll('*')).filter(
      (el) => el.constructor.formAssociated
    );

    // 2. Validate all active elements using standard validation routines
    let isValid = true;
    for (const ctrl of controls) {
      if (typeof ctrl.reportValidity === 'function' && !ctrl.reportValidity()) {
        isValid = false;
      }
    }

    if (!isValid) {
      this.dispatchEvent(new CustomEvent('invalid', { bubbles: true, composed: true }));
      return;
    }

    // 3. Serialize all elements values into form data
    const payload = {};
    for (const ctrl of controls) {
      const name = ctrl.getAttribute('name');
      if (name) {
        payload[name] = ctrl.value;
      }
    }

    this.dispatchEvent(new CustomEvent('submit-start', { detail: { payload }, bubbles: true, composed: true }));

    // 4. Verify connectivity using network connectivity HEAD probes
    const online = await check();

    if (!online && this.hasAttribute('offline')) {
      // Offline mode: push into background sync queue
      try {
        const syncId = await queue.push('offline-form-submit', {
          url: action,
          method,
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });

        // Register standard browser SyncManager tag if available
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready;
          if (reg.sync) {
            await reg.sync.register('pending');
          }
        }

        this.dispatchEvent(new CustomEvent('offline-queued', { detail: { syncId, payload }, bubbles: true, composed: true }));
      } catch (err) {
        this.dispatchEvent(new CustomEvent('submit-error', { detail: err, bubbles: true, composed: true }));
      }
      return;
    }

    // Online mode: submit directly via our fetch API networking clients pipelines
    try {
      const res = await pipeline(action, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: this.ctrl.signal
      });

      this.dispatchEvent(new CustomEvent('success', { detail: res, bubbles: true, composed: true }));
    } catch (err) {
      this.dispatchEvent(new CustomEvent('submit-error', { detail: err, bubbles: true, composed: true }));
    }
  };
}

customElements.define('ui-form', Form);
