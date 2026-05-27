/**
 * src/elements/primitives/divider/index.js
 *
 * Primitive Element: <ui-divider>
 * Flexible separating line component providing orientation selections
 * and spacing token integrations.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { ui } from '../../../core/ui/index.js';

ui.element('ui-divider', {
  style: './style.css',
  template: './index.html',
  props: {
    orientation: { type: String, reflect: true, default: 'horizontal' },
    spacing: { type: String, reflect: true }
  },
  mount({ el }) {
    el._update();
  },
  update({ el }) {
    el._update();
  },
  methods: {
    _update() {
      const orientation = this.orientation;
      const spacing = this.spacing;

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
}, import.meta.url);
