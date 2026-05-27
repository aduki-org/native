# Definition — UI Element Interface Spec

**Scope:** The `ui.element(tag, spec, base?)` factory interface.  
**Goal:** Replace custom element class boilerplate with a declarative, lightweight config object.

---

## The Core Concept

Instead of writing verbose custom element classes, developers declare components as plain JavaScript configuration objects. The library automatically handles:

- Attaching shadow roots and rendering markup.
- Asynchronously fetching and caching separated `.css` and `.html` files.
- Setting up property/attribute getters and setters with type-safe casting.
- Mapping state changes to Custom State Pseudo-Classes (`:state()`).
- Securing lifecycles and unmount cleanup via automated `AbortController` signals.

---

## 1. Automatic Style and Template Path Resolution

Traditionally, loading separate CSS/HTML files relative to a JS module during development requires complex bundler rewrites. We solve this natively using the browser's own **ESM Module Resolution context**.

Developers write paths relative to the component's script file and pass `import.meta.url` as the third parameter to `ui.element()`:

```javascript
// src/elements/primitives/badge.js
import { ui } from 'core/ui/index.js';

ui.element('ui-badge', {
  style: './badge.css',       // Resolved relative to badge.js
  template: './badge.html',   // Resolved relative to badge.js
  props: {
    variant: { type: String, reflect: true }
  }
}, import.meta.url);
```

### Under the Hood: Resolving via URL Constructor

When the library evaluates the definition:

1. It reads the `base` parameter (which is the value of `import.meta.url` passed from the module).
2. It resolves the relative path to an absolute path using the browser's native `URL` constructor:

   ```javascript
   const absoluteStyleUrl = new URL(spec.style, base).href;
   const absoluteTemplateUrl = new URL(spec.template, base).href;
   ```

3. It fetches the `.html` template asynchronously **exactly once** when the component class is generated.
4. It parses the fetched HTML string using the high-speed `<template>` fragment parser, and caches the result.
5. All future instances of `<ui-badge>` clone the cached document fragment synchronously inside their constructors.

This is **100% browser-native**. There are no build steps, no webpack rewrites, and no server-side compilation required. It works identically in the development server and in production.

---

## 2. API Signature Specification

```typescript
ui.element(tag: string, spec: ElementSpec, base?: string): void
```

### ElementSpec Shape

| Property | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `style` | `string` | No | Path to the separated `.css` stylesheet file. Resolved relative to `base`. |
| `template` | `string` | No | Path to the separated `.html` template file (ends in `.html`) OR an inline HTML string. |
| `form` | `boolean` | No | If `true`, enables form-association and attaches `ElementInternals`. |
| `props` | `Object` | No | Reactive attributes and properties configurations. See `props.md`. |
| `mount` | `Function` | No | Lifecycle hook invoked in `connectedCallback`. Passed `{ el, ctrl, internals }`. |
| `unmount` | `Function` | No | Lifecycle hook invoked in `disconnectedCallback`. Passed `{ el, internals }`. |
| `update` | `Function` | No | Lifecycle hook invoked when a reactive property changes. |
| `methods` | `Object` | No | Key-value mapping of custom methods to attach directly to the element instance. |

---

## 3. Side-by-Side Code Reductions

Below is an inspection of how a reactive primitive is authored before and after:

### [Before] Class Boilerplate

```javascript
import { Base } from '../base.js';

export class Badge extends Base {
  static observedAttributes = ['variant'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    super.connectedCallback();
    const res = await fetch(new URL('./badge.html', import.meta.url));
    const html = await res.text();
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    this.shadowRoot.appendChild(tpl.content.cloneNode(true));
  }

  attributeChangedCallback(name, _, next) {
    if (name === 'variant') {
      this.render();
    }
  }

  get variant() { return this.getAttribute('variant'); }
  set variant(val) { this.setAttribute('variant', val); }
}

customElements.define('ui-badge', Badge);
```

### [After] Clean Declarative Definition

```javascript
import { ui } from 'core/ui/index.js';

ui.element('ui-badge', {
  style: './badge.css',
  template: './badge.html',
  props: {
    variant: { type: String, reflect: true }
  }
}, import.meta.url);
```

The library handles all class generation, asynchronous file loading, template parsing caching, property synchronization, and registration behind the scenes.
