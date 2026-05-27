/**
 * src/elements/primitives/badge/index.js
 *
 * Primitive Element: <ui-badge>
 * Label indicator with variant mapping (info, success, warning, error)
 * and accessible layout size scaling.
 *
 * Source: doc 04 — Web Components §3, doc 05 — Native UI Primitives §3
 */

import { ui } from '../../../core/ui/index.js';

ui.element('ui-badge', {
  style: './style.css',
  template: './index.html',
  props: {
    variant: { type: String, reflect: true },
    size: { type: String, reflect: true }
  }
}, import.meta.url);
