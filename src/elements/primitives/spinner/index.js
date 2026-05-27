/**
 * src/elements/primitives/spinner/index.js
 *
 * Primitive Element: <ui-spinner>
 * Indeterminate progress spinner utilizing Web Animations API (WAAPI)
 * for butter-smooth off-thread rotation, observing prefers-reduced-motion.
 *
 * Source: doc 04 — Web Components §3, doc 12 — Performance §5
 */

import { ui } from '../../../core/ui/index.js';

ui.element('ui-spinner', {
  style: './style.css',
  template: './index.html',
  mount({ el, ctrl }) {
    const ring = el.shadowRoot.querySelector('.ring');

    // ARIA tags enforcements
    if (!el.hasAttribute('role')) {
      el.setAttribute('role', 'progressbar');
    }
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
      el.setAttribute('aria-label', 'Loading');
    }

    // Trigger high-performance hardware-accelerated infinite WAAPI spin
    el._animation = ring.animate(
      [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(360deg)' }
      ],
      {
        duration: 800,
        iterations: Infinity,
        easing: 'linear'
      }
    );

    // Dynamic prefers-reduced-motion adjustments
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    el._handleMotion(motionQuery);

    motionQuery.addEventListener('change', (e) => el._handleMotion(e), { signal: ctrl.signal });
  },
  unmount({ el }) {
    if (el._animation) {
      el._animation.cancel();
      el._animation = null;
    }
  },
  methods: {
    _handleMotion(e) {
      if (!this._animation) return;
      if (e.matches) {
        this._animation.pause();
      } else {
        this._animation.play();
      }
    }
  }
}, import.meta.url);
