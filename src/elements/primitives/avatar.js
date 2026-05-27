/**
 * src/elements/primitives/avatar.js
 *
 * Primitive Element: <ui-avatar>
 * Accessible profile picture avatar. Renders a user image or falls back to
 * name initials, enforcing an explicit aria-label description.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--avatar-size, var(--space-8));
      height: var(--avatar-size, var(--space-8));
      border-radius: var(--radius-full);
      overflow: hidden;
      background: var(--color-interactive-disabled);
      color: var(--color-content-secondary);
      font-family: var(--font-family-sans);
      font-size: calc(var(--avatar-size, var(--space-8)) * 0.4);
      font-weight: var(--font-weight-medium);
      user-select: none;
      border: var(--space-px) solid var(--color-border-default);
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: none;
    }

    :host([size]) {
      width: var(--avatar-custom-size);
      height: var(--avatar-custom-size);
      font-size: calc(var(--avatar-custom-size) * 0.4);
    }

    span {
      display: inline-block;
      text-transform: uppercase;
    }
  </style>
  <img part="image" />
  <span part="initials"></span>
`;

export class Avatar extends Base {
  static observedAttributes = ['src', 'name', 'size'];

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
    const img = this.shadowRoot.querySelector('img');
    const span = this.shadowRoot.querySelector('span');

    const src = this.getAttribute('src');
    const name = this.getAttribute('name') || '';
    const size = this.getAttribute('size');

    // Accessibility enforcement
    if (!this.hasAttribute('aria-label') && name) {
      this.setAttribute('aria-label', `Avatar of ${name}`);
    } else if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'img');
    }

    // Initials generation
    const parts = name.split(/\s+/).filter(Boolean);
    let initials = '';
    if (parts.length > 0) {
      initials = parts[0][0];
      if (parts.length > 1) {
        initials += parts[parts.length - 1][0];
      }
    }
    span.textContent = initials.slice(0, 2);

    // Apply custom sizing if requested
    if (size) {
      const sizeVal = size.includes('px') || size.includes('rem') ? size : `var(--space-${size})`;
      this.style.setProperty('--avatar-custom-size', sizeVal);
    } else {
      this.style.removeProperty('--avatar-custom-size');
    }

    // Image loading
    if (src) {
      img.src = src;
      img.onload = () => {
        img.style.display = 'block';
        span.style.display = 'none';
      };
      img.onerror = () => {
        img.style.display = 'none';
        span.style.display = 'block';
      };
    } else {
      img.style.display = 'none';
      span.style.display = 'block';
    }
  }
}

customElements.define('ui-avatar', Avatar);
