/**
 * src/elements/primitives/divider.js
 *
 * Primitive Element: <ui-divider>
 * Flexible separating line component providing orientation selections
 * and spacing token integrations.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: flex;
      align-self: stretch;
      /* Component Tokens — Semantic Reference Only */
      --divider-color: var(--color-border-default);
    }

    hr {
      border: none;
      background-color: var(--divider-color);
      margin: 0;
      padding: 0;
    }

    :host([orientation="horizontal"]) {
      width: 100%;
      flex-direction: column;
      padding-block: var(--divider-space, var(--space-2));
    }

    :host([orientation="horizontal"]) hr {
      width: 100%;
      height: var(--space-px);
    }

    :host([orientation="vertical"]) {
      height: 100%;
      display: inline-flex;
      flex-direction: row;
      padding-inline: var(--divider-space, var(--space-2));
    }

    :host([orientation="vertical"]) hr {
      height: 100%;
      width: var(--space-px);
      align-self: stretch;
    }
  </style>
  <hr part="line" />
`;

export class Divider extends Base {
  static observedAttributes = ['orientation', 'spacing'];

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
    const orientation = this.getAttribute('orientation') || 'horizontal';
    const spacing = this.getAttribute('spacing');

    if (!this.hasAttribute('orientation')) {
      this.setAttribute('orientation', orientation);
    }

    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'separator');
    }

    if (spacing) {
      const spaceVal = spacing.includes('px') || spacing.includes('rem') ? spacing : `var(--space-${spacing})`;
      this.style.setProperty('--divider-space', spaceVal);
    } else {
      this.style.removeProperty('--divider-space');
    }
  }
}

customElements.define('ui-divider', Divider);
