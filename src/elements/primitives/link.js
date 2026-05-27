/**
 * src/elements/primitives/link.js
 *
 * Primitive Element: <ui-link>
 * Single-page router-aware anchor hyperlink element. Automatically intercepts
 * standard clicks and navigates via the custom router, managing active states.
 *
 * Source: doc 04 — Web Components §3, doc 09 — Routing §8, §9
 */

import { Base } from '../base.js';
import { navigate } from '../../core/router/index.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      /* Component Tokens — Semantic Reference Only */
      --link-color:        var(--color-content-link);
      --link-color-hover:  var(--color-interactive-hover);
      --link-color-active: var(--color-interactive-active);
      --link-decoration:   none;
    }

    a {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      color: var(--link-color);
      text-decoration: var(--link-decoration);
      cursor: pointer;
      outline: none;
      transition: color var(--duration-fast) var(--ease-out);
    }

    a:hover {
      color: var(--link-color-hover);
      text-decoration: underline;
    }

    a:active {
      color: var(--link-color-active);
    }

    a:focus-visible {
      outline: var(--space-0-5) solid var(--color-border-focus);
      outline-offset: var(--space-0-5);
      border-radius: var(--radius-sm);
    }

    /* External links indicator styling */
    .external-icon {
      width: 0.85em;
      height: 0.85em;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
    }
  </style>
  <a part="anchor">
    <slot></slot>
  </a>
`;

export class Link extends Base {
  static observedAttributes = ['href', 'target', 'current', 'external'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const a = this.shadowRoot.querySelector('a');
    a.addEventListener('click', this.#click, { signal: this.ctrl.signal });

    // Track standard global navigation events to update active state automatically
    if (typeof window !== 'undefined' && window.navigation) {
      window.navigation.addEventListener('navigate', this.#syncState, { signal: this.ctrl.signal });
    }

    this.#update();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#update();
    }
  }

  #update() {
    const a = this.shadowRoot.querySelector('a');
    const href = this.getAttribute('href') || '';
    const target = this.getAttribute('target');
    const external = this.hasAttribute('external') || href.startsWith('http://') || href.startsWith('https://');

    a.href = href;
    if (target) {
      a.target = target;
    } else {
      a.removeAttribute('target');
    }

    // Handle external indicator icon overlay
    const existingIcon = a.querySelector('.external-icon');
    if (external && !existingIcon) {
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('class', 'external-icon');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m11-3H14m8 0v8m0-8L10 14"/>';
      a.appendChild(svg);
    } else if (!external && existingIcon) {
      existingIcon.remove();
    }

    this.#syncState();
  }

  #syncState = () => {
    const a = this.shadowRoot.querySelector('a');
    const href = this.getAttribute('href');
    
    if (this.hasAttribute('current')) {
      const currentVal = this.getAttribute('current');
      a.setAttribute('aria-current', currentVal);
    } else if (href && typeof window !== 'undefined') {
      const currentUrl = new URL(window.navigation?.currentEntry?.url || window.location.href);
      const linkUrl = new URL(href, currentUrl.origin);

      if (currentUrl.pathname === linkUrl.pathname && currentUrl.search === linkUrl.search) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    } else {
      a.removeAttribute('aria-current');
    }
  };

  #click = (e) => {
    const href = this.getAttribute('href');
    const target = this.getAttribute('target');
    const external = this.hasAttribute('external') || href?.startsWith('http://') || href?.startsWith('https://');

    // Skip interception if clicking target blank, external site, hash reference, or modified click
    if (
      !href ||
      target === '_blank' ||
      external ||
      href.startsWith('#') ||
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }

    e.preventDefault();
    navigate(href);
  };
}

customElements.define('ui-link', Link);
