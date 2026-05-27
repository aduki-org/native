/**
 * src/elements/primitives/spinner.js
 *
 * Primitive Element: <ui-spinner>
 * Indeterminate progress spinner utilizing Web Animations API (WAAPI)
 * for butter-smooth off-thread rotation, observing prefers-reduced-motion.
 *
 * Source: doc 04 — Web Components §3, doc 12 — Performance §5
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      /* Component Tokens — Semantic Reference Only */
      --spinner-size:  var(--space-6);
      --spinner-color: var(--color-interactive);
      --spinner-width: var(--space-0-5);
    }

    .ring {
      width: var(--spinner-size);
      height: var(--spinner-size);
      border: var(--spinner-width) solid var(--color-border-default);
      border-top-color: var(--spinner-color);
      border-radius: var(--radius-full);
      box-sizing: border-box;
    }
  </style>
  <div class="ring" part="ring"></div>
`;

export class Spinner extends Base {
  #animation = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const ring = this.shadowRoot.querySelector('.ring');

    // ARIA tags enforcements
    if (!this.hasAttribute('role')) {
      this.setAttribute('role', 'progressbar');
    }
    if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) {
      this.setAttribute('aria-label', 'Loading');
    }

    // Trigger high-performance hardware-accelerated infinite WAAPI spin
    this.#animation = ring.animate(
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
    this.#handleMotion(motionQuery);

    motionQuery.addEventListener('change', this.#handleMotion, { signal: this.ctrl.signal });
  }

  unmount() {
    if (this.#animation) {
      this.#animation.cancel();
      this.#animation = null;
    }
  }

  #handleMotion = (e) => {
    if (!this.#animation) return;
    if (e.matches) {
      this.#animation.pause();
    } else {
      this.#animation.play();
    }
  };
}

customElements.define('ui-spinner', Spinner);
