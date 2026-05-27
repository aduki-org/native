/**
 * src/elements/primitives/avatar/index.js
 *
 * Primitive Element: <ui-avatar>
 * Accessible profile picture avatar. Renders a user image or falls back to
 * name initials, enforcing an explicit aria-label description.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { ui } from '../../../core/ui/index.js';

ui.element('ui-avatar', {
  style: './style.css',
  template: './index.html',
  props: {
    src: { type: String, reflect: true },
    name: { type: String, reflect: true },
    size: { type: String, reflect: true }
  },
  mount({ el }) {
    el._update();
  },
  update({ el }) {
    el._update();
  },
  methods: {
    _update() {
      const img = this.shadowRoot.querySelector('img');
      const span = this.shadowRoot.querySelector('span');

      const src = this.src;
      const name = this.name || '';
      const size = this.size;

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
}, import.meta.url);
