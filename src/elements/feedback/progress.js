/**
 * src/elements/feedback/progress.js
 *
 * Feedback Element: <ui-progress>
 * Premium progress indicator mapping directly to native progress states
 * while incorporating smooth CSS animations and active percentage labels.
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
      gap: var(--space-1);
      font-family: var(--font-family-sans);
      width: 100%;
      /* Component Tokens — Semantic Reference Only */
      --progress-bg:    var(--color-border-default);
      --progress-fill:  var(--color-interactive);
      --progress-track: var(--space-2);
      --progress-radius: var(--radius-full);
    }

    .track {
      background: var(--progress-bg);
      border-radius: var(--progress-radius);
      height: var(--progress-track);
      width: 100%;
      overflow: hidden;
      box-sizing: border-box;
    }

    .fill {
      background: var(--progress-fill);
      height: 100%;
      width: 0%;
      border-radius: var(--progress-radius);
      transition: width var(--duration-medium) var(--ease-out);
    }

    .label-box {
      display: flex;
      justify-content: space-between;
      font-size: var(--font-size-xs);
      color: var(--color-content-secondary);
    }
  </style>
  <div class="label-box" part="labels">
    <slot name="label">Progress</slot>
    <span id="percent-label">0%</span>
  </div>
  <div class="track" part="track">
    <div class="fill" part="fill"></div>
  </div>
`;

export class Progress extends Base {
  static observedAttributes = ['value', 'max'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    // ARIA updates
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'progressbar');
    }
    this.#update();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#update();
    }
  }

  #update() {
    const val = Number(this.getAttribute('value')) || 0;
    const max = Number(this.getAttribute('max')) || 100;
    const fill = this.shadowRoot.querySelector('.fill');
    const label = this.shadowRoot.querySelector('#percent-label');

    const pct = Math.min(100, Math.max(0, Math.round((val / max) * 100)));
    
    fill.style.width = `${pct}%`;
    label.textContent = `${pct}%`;

    this.setAttribute('aria-valuenow', val);
    this.setAttribute('aria-valuemin', 0);
    this.setAttribute('aria-valuemax', max);
  }
}

customElements.define('ui-progress', Progress);
