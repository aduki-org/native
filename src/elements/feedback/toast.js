/**
 * src/elements/feedback/toast.js
 *
 * Feedback Element: <ui-toast>
 * Dynamic toast notifications. Manages automated dismiss timeouts, top-layer
 * popup placement overlays, and accessible WAI-ARIA role="status" regions.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §5
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: block;
      font-family: var(--font-family-sans);
    }

    .toast {
      background: var(--color-surface-inverse);
      color: var(--color-content-inverse);
      padding: var(--space-3) var(--space-5);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-xl);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      display: flex;
      align-items: center;
      gap: var(--space-3);
      pointer-events: auto;
      animation: slideIn var(--duration-medium) var(--ease-out);
      transition: opacity var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out);
    }

    .toast.fade-out {
      opacity: 0;
      transform: translateY(var(--space-2));
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(var(--space-4));
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  </style>
  <div class="toast" part="toast" role="status">
    <slot></slot>
  </div>
`;

let container = null;

function getContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.bottom = 'var(--space-6)';
  container.style.right = 'var(--space-6)';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = 'var(--space-2)';
  container.style.zIndex = '9999';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);
  return container;
}

export class Toast extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const duration = Number(this.getAttribute('duration')) || 3000;
    
    // Auto-dismiss timeout setup
    const timeoutId = setTimeout(() => this.dismiss(), duration);
    this.ctrl.signal.addEventListener('abort', () => clearTimeout(timeoutId));
  }

  dismiss() {
    const toast = this.shadowRoot.querySelector('.toast');
    toast.classList.add('fade-out');
    // Delete after fade transition completes
    setTimeout(() => this.remove(), 250);
  }

  /**
   * Static convenience helper to easily trigger a Toast dynamic alert popup.
   */
  static show(message, options = {}) {
    if (typeof window === 'undefined') return;
    const parent = getContainer();
    const el = document.createElement('ui-toast');
    if (options.duration) {
      el.setAttribute('duration', options.duration);
    }
    el.textContent = message;
    parent.appendChild(el);
    return el;
  }
}

customElements.define('ui-toast', Toast);
