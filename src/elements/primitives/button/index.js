/**
 * src/elements/primitives/button/index.js
 *
 * Primitive Element: <ui-button>
 * FormAssociated button element featuring loading and disabled states,
 * custom state pseudo-classes, and robust semantic tokens bindings.
 *
 * Source: doc 04 — Web Components §3, §6, doc 05 — Native UI Primitives §3
 */

import { ui } from '../../../core/ui/index.js';

ui.element('ui-button', {
  style: './style.css',
  template: './index.html',
  form: true,
  props: {
    disabled: { type: Boolean, reflect: true, state: true },
    loading: { type: Boolean, reflect: true, state: true },
    type: { type: String, reflect: true, default: 'button' },
    value: { type: String, reflect: true }
  },
  mount({ el, internals, tags, on }) {
    const btn = tags.one('button');

    // Sync button attributes
    btn.disabled = el.disabled;
    btn.type = el.type;

    on.click('button', (e) => {
      if (el.disabled || el.loading) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const type = el.type;
      if (type === 'submit') {
        const form = internals.form;
        if (form) {
          form.requestSubmit();
        }
      } else if (type === 'reset') {
        const form = internals.form;
        if (form) {
          form.reset();
        }
      }

      el.dispatchEvent(new CustomEvent('activate', { bubbles: true, composed: true }));
    });
  },
  update({ el, name, val, tags }) {
    const btn = tags.one('button');
    if (name === 'disabled') {
      btn.disabled = !!val;
    } else if (name === 'type') {
      btn.type = val || 'button';
    }
  }
}, import.meta.url);
