/**
 * src/elements/primitives/icon/index.js
 *
 * Primitive Element: <ui-icon>
 * Renders an accessible SVG sprite reference, supporting size tokens,
 * name/href targets, and proper ARIA decoration.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { ui } from '../../../core/ui/index.js';

ui.element('ui-icon', {
  style: './style.css',
  template: './index.html',
  props: {
    name: { type: String, reflect: true },
    href: { type: String, reflect: true },
    size: { type: String, reflect: true },
    stroke: { type: String, reflect: true }
  },
  mount({ el }) {
    el._update();
  },
  update({ el }) {
    el._update();
  },
  methods: {
    _update() {
      const use = this.shadowRoot.querySelector('use');
      const svg = this.shadowRoot.querySelector('svg');
      const name = this.name;
      const href = this.href;
      const size = this.size;
      const stroke = this.stroke;

      // Resolve svg content target
      if (href) {
        use.setAttribute('href', href);
      } else if (name) {
        // Direct asset folder sprite fallback
        use.setAttribute('href', `/assets/icons.svg#icon-${name}`);
      }

      // Apply custom inline sizing if size attribute is set
      if (size) {
        this.style.setProperty('--icon-size', size.includes('px') || size.includes('rem') ? size : `var(--space-${size})`);
      } else {
        this.style.removeProperty('--icon-size');
      }

      if (stroke) {
        this.style.setProperty('--icon-stroke', stroke);
      } else {
        this.style.removeProperty('--icon-stroke');
      }

      // Accessible labeling
      if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) {
        svg.setAttribute('aria-hidden', 'true');
      } else {
        svg.removeAttribute('aria-hidden');
      }
    }
  }
}, import.meta.url);
