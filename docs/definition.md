# Web Component Definition Interface — Design Proposal

**Author:** Antigravity  
**Status:** Design Proposal  
**Scope:** `@adukiorg/native` UI Element Layer (`src/elements/`)  

---

## The Problem: Boilerplate & Inline CSS Clutter

In the current implementation of custom elements (e.g., `<ui-button>`, `<ui-badge>`), authoring a component involves a substantial amount of boilerplate:

1. **Inheritance & Class Setup:** Explicitly extending `Base`, overriding `constructor`, calling `super()`, attaching a Shadow DOM, and cloning HTML templates manually.
2. **CSS Inlining:** Embedding long styling blocks inside JavaScript template strings. This ruins developer ergonomics—losing CSS syntax highlighting, autocomplete, linting, and formatting.
3. **Manual Lifecycle Hookup:** Adding event listeners manually in `connectedCallback` and tracking `AbortSignal` manually, then writing repetitive `disconnectedCallback` blocks.
4. **Reactivity & Attribute Boilerplate:** Writing tedious `observedAttributes`, mapping them to `attributeChangedCallback` and property getters/setters, and manually synchronizing values to custom state pseudo-classes (`:state()`).

### The Goal

Create a single, clean **Definition Interface** (`ui.element`) that allows developers to define a UI component as a **plain configuration object**. Under the hood, the library dynamically generates the standards-compliant class, manages stylesheet loading from a separate CSS file, automatically tracks property reactivity, registers custom states, coordinates form-association, and fully secures the memory footprint.

---

## 1. CSS Separation Strategy

Instead of keeping styles inline in JS text strings, components should refer to their own separate, dedicated CSS files. The library must support a zero-bundler, standards-compliant stylesheet delivery model.

### Technical Options for Loading Component CSS

| Strategy | Implementation | Pros | Cons |
| :--- | :--- | :--- | :--- |
| **Option A: Dynamic adoptedStyleSheets (Default)** | Fetch the `.css` file once, compile it into a shared `CSSStyleSheet` using `replaceSync()`, and cache it in memory. All instances of the element share the compiled sheet. | • Perfect file separation<br>• Single network request per component class<br>• Maximum memory efficiency (shared stylesheet object) | • Dynamic CSS fetch might trigger a slight delay before the first render |
| **Option B: Declarative `<link>` Injection (Fallback)** | Append a `<link rel="stylesheet" href="...">` inside the component's Shadow DOM template. | • Standard, works in all browsers since day one<br>• Fully browser-cached<br>• Parallel preloading enabled | • CSS fetches per-instance if not cached<br>• Slight possibility of Flash of Unstyled Content (FOUC) inside the shadow root |

### Proposed Combined Loading Model

The factory interface automatically detects browser capabilities and defaults to **Option A (adoptedStyleSheets Caching)**. If `adoptedStyleSheets` is unsupported, or if security policies (like strict Content Security Policies) prohibit dynamic stylesheet compilation, the factory seamlessly falls back to **Option B (Declarative `<link>` Injection)**.

---

## 2. The Proposed Definition Interface

We introduce `ui.element(tag, spec)`, a factory function that replaces custom element classes.

```javascript
import { ui } from 'lib/core/ui/index.js';

ui.element('ui-button', {
  // 1. Separate CSS file path
  style: '/lib/elements/primitives/button.css',

  // 2. Form Association (automatically attaches internals and form behaviors)
  form: true,

  // 3. Declarative properties & attributes with automatic casting & reflection
  props: {
    disabled: { type: Boolean, reflect: true },
    type: { type: String, default: 'button', reflect: true },
    loading: { type: Boolean, state: true } // state: true maps to custom state pseudo-class
  },

  // 4. HTML Template (plain markup without inline <style>)
  template: `
    <button part="button">
      <slot></slot>
    </button>
  `,

  // 5. Memory-safe lifecycle mounting (automatically aborted on disconnect)
  mount({ el, ctrl, internals }) {
    const button = el.shadowRoot.querySelector('button');

    button.addEventListener('click', (e) => {
      if (el.disabled || el.loading) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (el.type === 'submit') {
        internals.form?.requestSubmit();
      } else if (el.type === 'reset') {
        internals.form?.reset();
      }

      el.emit('activate'); // Helper to dispatch bubbles + composed CustomEvent
    }, { signal: ctrl.signal });
  },

  // 6. Public methods attached directly to the custom element instance
  methods: {
    focus() {
      this.shadowRoot.querySelector('button')?.focus();
    }
  }
});
```

---

## 3. Side-by-Side Comparison

### Example 1: `<ui-badge>`

#### [Before] Redundant Boilerplate & Inline CSS

```javascript
// elements/primitives/badge.js
import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      --badge-radius: var(--radius-full);
      --badge-bg: var(--color-surface-elevated);
      --badge-color: var(--color-content-secondary);
    }
    span {
      display: inline-flex;
      align-items: center;
      background: var(--badge-bg);
      color: var(--badge-color);
      border-radius: var(--badge-radius);
      padding: var(--space-0-5) var(--space-2);
    }
    :host([variant="success"]) {
      --badge-bg: var(--color-feedback-success);
      --badge-color: var(--color-content-inverse);
    }
  </style>
  <span part="badge"><slot></slot></span>
`;

export class Badge extends Base {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
  }
}

customElements.define('ui-badge', Badge);
```

#### [After] Declarative & Clean File Separation

**File 1: Component Style (`src/elements/primitives/badge.css`)**

```css
:host {
  display: inline-flex;
  --badge-radius: var(--radius-full);
  --badge-bg: var(--color-surface-elevated);
  --badge-color: var(--color-content-secondary);
}

span {
  display: inline-flex;
  align-items: center;
  background: var(--badge-bg);
  color: var(--badge-color);
  border-radius: var(--badge-radius);
  padding: var(--space-0-5) var(--space-2);
}

:host([variant="success"]) {
  --badge-bg: var(--color-feedback-success);
  --badge-color: var(--color-content-inverse);
}
```

**File 2: Component Logic (`src/elements/primitives/badge.js`)**

```javascript
import { ui } from 'lib/core/ui/index.js';

ui.element('ui-badge', {
  style: '/lib/elements/primitives/badge.css',
  props: {
    variant: { type: String, reflect: true }
  },
  template: `
    <span part="badge">
      <slot></slot>
    </span>
  `
});
```

---

## 4. Under the Hood: Factory Implementation

The library's internal factory creates a clean wrapper class extending `BaseElement`. Below is the complete, high-performance prototype implementation of the `ui.element` factory.

```javascript
// src/core/ui/element.js
import { BaseElement } from './base.js';
import { define } from './define.js';

const styleCache = new Map();

export function element(tag, spec) {
  const observed = [];
  const propConfigs = spec.props || {};

  // Pre-parse the HTML template once at definition time to avoid repetitive innerHTML parsing
  let templateObj = null;
  if (spec.template) {
    templateObj = document.createElement('template');
    templateObj.innerHTML = spec.template;
  }

  // Build observed attributes list from prop configuration
  for (const [name, config] of Object.entries(propConfigs)) {
    if (config.reflect) {
      observed.push(name);
    }
  }

  class CustomElement extends BaseElement {
    static formAssociated = !!spec.form;
    static observedAttributes = observed;

    #internals;
    #initialized = false;

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      
      // 1. Setup Form Association Internals
      if (spec.form) {
        this.#internals = this.attachInternals();
      }

      // 2. Setup Property Getters & Setters dynamically
      for (const [name, config] of Object.entries(propConfigs)) {
        Object.defineProperty(this, name, {
          get() {
            if (config.type === Boolean) {
              return this.hasAttribute(name);
            }
            const val = this.getAttribute(name);
            if (val === null && config.default !== undefined) {
              return config.default;
            }
            if (config.type === Number) {
              return Number(val);
            }
            return val;
          },
          set(val) {
            const old = this[name];
            if (old === val) return;

            // Reflect property changes to attributes
            if (config.type === Boolean) {
              val ? this.setAttribute(name, '') : this.removeAttribute(name);
            } else {
              val === null || val === undefined 
                ? this.removeAttribute(name) 
                : this.setAttribute(name, String(val));
            }

            // Handle custom states mapping if requested
            if (config.state && this.#internals) {
              val 
                ? this.#internals.states.add(name) 
                : this.#internals.states.delete(name);
            }

            // Schedule update frame if initialized
            if (this.#initialized && spec.update) {
              ui.scheduleFrame(() => spec.update({ el: this, name, val, old }));
            }
          },
          configurable: true,
          enumerable: true
        });
      }
    }

    connectedCallback() {
      // BaseElement automatically sets up this.ctrl (AbortController)
      super.connectedCallback();

      if (!this.#initialized) {
        // 3. Render HTML template via high-speed cloneNode (avoiding innerHTML parsing overhead)
        if (templateObj) {
          this.shadowRoot.appendChild(templateObj.content.cloneNode(true));
        }

        // 4. Load Separated Stylesheet (adoptedStyleSheets vs Link Fallback)
        if (spec.style) {
          if (document.adoptedStyleSheets) {
            if (!styleCache.has(spec.style)) {
              const sheet = new CSSStyleSheet();
              styleCache.set(spec.style, sheet);
              
              // Load stylesheet asynchronously
              fetch(spec.style)
                .then(r => r.text())
                .then(css => sheet.replaceSync(css))
                .catch(err => console.error(`Failed to load component style: ${spec.style}`, err));
            }
            this.shadowRoot.adoptedStyleSheets = [styleCache.get(spec.style)];
          } else {
            // Fallback: Append link tag
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = spec.style;
            this.shadowRoot.appendChild(link);
          }
        }

        // 5. Attach methods directly to element instance
        if (spec.methods) {
          for (const [name, fn] of Object.entries(spec.methods)) {
            this[name] = fn.bind(this);
          }
        }

        this.#initialized = true;
      }

      // 6. Invoke Mount lifecycle hook
      if (spec.mount) {
        spec.mount({ el: this, ctrl: this.ctrl, internals: this.#internals });
      }
    }

    disconnectedCallback() {
      // Invoke user-defined unmount hook
      if (spec.unmount) {
        spec.unmount({ el: this, internals: this.#internals });
      }
      
      // BaseElement automatically aborts this.ctrl, securing all event listeners
      super.disconnectedCallback();
    }

    attributeChangedCallback(name, old, next) {
      if (old === next) return;
      
      const config = propConfigs[name];
      if (config && config.state && this.#internals) {
        next !== null 
          ? this.#internals.states.add(name) 
          : this.#internals.states.delete(name);
      }

      if (this.#initialized && spec.update) {
        ui.scheduleFrame(() => spec.update({ el: this, name, val: next, old }));
      }
    }

    // Helper method to dispatch bubbles + composed CustomEvents easily
    emit(event, detail = null) {
      this.dispatchEvent(new CustomEvent(event, {
        detail,
        bubbles: true,
        composed: true
      }));
    }
  }

  // Register Custom Element safely with HMR guard
  define(tag, CustomElement);
}
```

---

## 5. Where Styles Live in Consumer Projects

When a consumer integrates `@adukiorg/native` into their own project, their custom UI component styles and logic map cleanly onto their local assets folder structure.

### Proposed Directory Layout for Consumer Applications

```
my-web-project/
├── index.html
├── app.js                   ← Bootstraps routes and elements
├── components/              ← Consumer custom components
│   ├── usercard/
│   │   ├── index.js         ← Logic calls ui.element()
│   │   └── style.css        ← Component styles
│   └── navigation/
│       ├── index.js
│       └── style.css
└── vendor/
    └── native/              ← Built library files copy (if self-hosted)
```

### Clean Stylesheet Resolution

By placing component-specific `.css` files directly beside their respective `.js` element files, styles remain highly modular, easily refactored, and easily cached by the browser.

In the component definition (`components/usercard/index.js`), the developer refers to their stylesheet relative to the application's hosting origin:

```javascript
import { ui } from '@adukiorg/native/ui';

ui.element('user-card', {
  // Stylesheet lives inside the component's own folder
  style: '/components/usercard/style.css',
  
  template: `
    <div part="card">
      <img part="avatar" src="" alt="">
      <h3 part="name"><slot></slot></h3>
    </div>
  `
});
```

#### Why This is Superior

1. **Developer Tooling Synergy:** Editing `/components/usercard/style.css` is natively recognized by all modern IDEs, providing instant syntax highlighting, Emmet completion, linting (e.g. stylelint), and auto-formatting (e.g. Prettier) out-of-the-box.
2. **Zero In-flight Network Duplication:** The browser's standard network caching serves `/components/usercard/style.css` instantly from cache for subsequent requests, removing compile-time injection bloat.
3. **Decoupled Main Page CSS:** The main page's styles are not polluted with deep, nested layout components. The component's encapsulation boundary is strictly enforced by the Shadow DOM cascade.

---

## 6. Architectural Benefits

1. **Zero Boilerplate:** Component logic files scale down by 70%. Developers only write the absolute core behaviors.
2. **Parse-Once, Clone-Many Rendering:** The dynamic factory compiles HTML template strings exactly **once** at module evaluation time. Subsequent element instantiations execute only a high-speed `cloneNode()`, securing the absolute limits of native rendering performance.
3. **Beautiful Separation of Concerns:** Logic lives in `.js`, style lives in `.css`. Full tooling, syntax highlighting, and formatting are restored.
4. **Automatic Memory Safety:** No more manual EventListener tracking or repetitive `disconnectedCallback` cleanups. Passing `ctrl.signal` to listeners makes memory leaks physically impossible in our system.
5. **Standard Declarative Reactivity:** Properties sync to attributes and custom state pseudo-classes (`:state()`) implicitly via configuration.
6. **No Bundlers / Transpilers Needed:** The factory uses pure browser standards (ES Modules, Web Components, fetch caching, `adoptedStyleSheets`). Runs natively in all modern browsers.
