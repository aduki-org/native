/**
 * src/elements/layout/scroll.js
 *
 * Layout System: <ui-scroll>
 * Custom scroll containment container offering momentum scrolling
 * and layout scroll-snap coordination.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: block;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .viewport {
      width: 100%;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      box-sizing: border-box;
    }

    /* Scroll snapping implementations */
    :host([snap]) .viewport {
      scroll-snap-type: y mandatory;
    }

    ::slotted(*) {
      scroll-snap-align: start;
    }
  </style>
  <div class="viewport" part="viewport">
    <slot></slot>
  </div>
`;

export class Scroll extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }
}

customElements.define('ui-scroll', Scroll);
