/**
 * src/elements/primitives/link/index.js
 *
 * Primitive Element: <ui-link>
 * Single-page router-aware anchor hyperlink element. Automatically intercepts
 * standard clicks and navigates via the custom router, managing active states.
 *
 * Source: doc 04 — Web Components §3, doc 09 — Routing §8, §9
 */

import { ui } from '../../../core/ui/index.js';
import { navigate } from '../../../core/router/index.js';

ui.element('ui-link', {
  style: './style.css',
  template: './index.html',
  props: {
    href: { type: String, reflect: true },
    target: { type: String, reflect: true },
    current: { type: String, reflect: true },
    external: { type: Boolean, reflect: true }
  },
  mount({ el, ctrl }) {
    const a = el.shadowRoot.querySelector('a');
    a.addEventListener('click', (e) => el._click(e), { signal: ctrl.signal });

    // Track standard global navigation events to update active state automatically
    if (typeof window !== 'undefined' && window.navigation) {
      window.navigation.addEventListener('navigate', () => el._syncState(), { signal: ctrl.signal });
    }

    el._update();
  },
  update({ el }) {
    el._update();
  },
  methods: {
    _update() {
      const a = this.shadowRoot.querySelector('a');
      const href = this.href || '';
      const target = this.target;
      const external = this.external || href.startsWith('http://') || href.startsWith('https://');

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

      this._syncState();
    },
    _syncState() {
      const a = this.shadowRoot.querySelector('a');
      const href = this.href;
      
      if (this.hasAttribute('current')) {
        const currentVal = this.current;
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
    },
    _click(e) {
      const href = this.href;
      const target = this.target;
      const external = this.external || href?.startsWith('http://') || href?.startsWith('https://');

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
    }
  }
}, import.meta.url);
