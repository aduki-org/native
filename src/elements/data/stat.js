/**
 * src/elements/data/stat.js
 *
 * Data Element: <ui-stat>
 * Standard KPI statistic display panel offering large numerical values,
 * secondary descriptive labels, and styled positive/negative/neutral trend change metrics.
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
      background: var(--color-surface-elevated);
      border: var(--space-px) solid var(--color-border-default);
      border-radius: var(--radius-lg);
      padding: var(--space-6);
      box-shadow: var(--shadow-sm);
      font-family: var(--font-family-sans);
      box-sizing: border-box;
      width: 100%;
    }

    .label {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-content-secondary);
      text-transform: uppercase;
      letter-spacing: var(--space-0-5);
      margin-bottom: var(--space-1);
    }

    .value {
      font-size: var(--font-size-3xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-content-primary);
      line-height: var(--line-height-none);
      margin-bottom: var(--space-2);
    }

    .trend-box {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
    }

    /* Trend variance color configurations mapping only to semantic feedback tokens */
    :host([trend="positive"]) .trend-box {
      color: var(--color-feedback-success);
    }

    :host([trend="negative"]) .trend-box {
      color: var(--color-feedback-error);
    }

    :host([trend="neutral"]) .trend-box {
      color: var(--color-content-secondary);
    }
  </style>
  <div class="label" part="label">
    <slot name="label"></slot>
  </div>
  <div class="value" part="value">
    <slot></slot>
  </div>
  <div class="trend-box" part="trend">
    <slot name="change"></slot>
  </div>
`;

export class Stat extends Base {
  static observedAttributes = ['trend'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    if (!this.hasAttribute('trend')) {
      this.setAttribute('trend', 'neutral');
    }
  }
}

customElements.define('ui-stat', Stat);
