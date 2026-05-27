/**
 * src/elements/feedback/skeleton.js
 *
 * Feedback Element: <ui-skeleton>
 * Premium skeleton placeholder container utilizing the Web Animations API (WAAPI)
 * for smooth off-thread opacity shimmers, respecting prefers-reduced-motion.
 *
 * Source: doc 04 — Web Components §3, doc 12 — Performance §5
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: block;
      /* Component Tokens — Semantic Reference Only */
      --skeleton-bg:     var(--color-interactive-disabled);
      --skeleton-radius: var(--radius-md);
      --skeleton-width:  100%;
      --skeleton-height: var(--space-4);
    }

    .shimmer {
      background: var(--skeleton-bg);
      border-radius: var(--skeleton-radius);
      width: var(--skeleton-width);
      height: var(--skeleton-height);
      box-sizing: border-box;
    }

    :host([variant="circle"]) {
      --skeleton-radius: var(--radius-full);
      --skeleton-width:  var(--space-12);
      --skeleton-height: var(--space-12);
      display: inline-block;
    }

    :host([variant="text"]) {
      --skeleton-height: var(--space-3);
      --skeleton-width:  75%;
    }
  </style>
  <div class="shimmer" part="shimmer"></div>
`;

export class Skeleton extends Base {
  static observedAttributes = ['variant', 'width', 'height'];
  #animation = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }

  mount() {
    const shimmer = this.shadowRoot.querySelector('.shimmer');

    // ARIA roles assignment
    if (!this.hasAttribute('aria-hidden')) {
      this.setAttribute('aria-hidden', 'true');
    }

    // High performance off-thread WAAPI shimmer animation
    this.#animation = shimmer.animate(
      [
        { opacity: 0.4 },
        { opacity: 0.85 },
        { opacity: 0.4 }
      ],
      {
        duration: 1500,
        iterations: Infinity,
        easing: 'ease-in-out'
      }
    );

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.#handleMotion(motionQuery);

    motionQuery.addEventListener('change', this.#handleMotion, { signal: this.ctrl.signal });

    this.#syncAttributes();
  }

  unmount() {
    if (this.#animation) {
      this.#animation.cancel();
      this.#animation = null;
    }
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.#syncAttributes();
    }
  }

  #syncAttributes() {
    const width = this.getAttribute('width');
    const height = this.getAttribute('height');

    if (width) {
      this.style.setProperty('--skeleton-width', width.includes('px') || width.includes('%') || width.includes('rem') ? width : `var(--space-${width})`);
    } else {
      this.style.removeProperty('--skeleton-width');
    }

    if (height) {
      this.style.setProperty('--skeleton-height', height.includes('px') || height.includes('%') || height.includes('rem') ? height : `var(--space-${height})`);
    } else {
      this.style.removeProperty('--skeleton-height');
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

customElements.define('ui-skeleton', Skeleton);
