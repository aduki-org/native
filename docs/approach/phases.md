# Implementation Phases — @adukiorg/native Library Core

This roadmap outlines the systematic phases to implement the declarative custom element factory (`ui.element`) in `@adukiorg/native`.

---

## Overview of the Declarative Component Flow

The core goal is to replace verbose class boilerplate with a high-performance, browser-native factory:

```javascript
ui.element('ui-button', {
  style: './button.css',
  template: './button.html',
  props: {
    disabled: { type: Boolean, reflect: true },
    label: { type: String, default: 'Click me' }
  },
  mount({ el, ctrl }) {
    el.shadowRoot.querySelector('button').addEventListener('click', () => {
      console.log('Button clicked!');
    }, { signal: ctrl.signal });
  }
}, import.meta.url);
```

---

## Phase 1: Dynamic Style & Template Loading

- **Path Resolution**: Resolve relative `.css` and `.html` URLs using `new URL(spec.style, base)` and `new URL(spec.template, base)` relative to the component's script.
- **Asynchronous Cache**: Fetch the template content **exactly once** using `fetch()` when the element class is constructed. Store the compiled `<template>` element in an asynchronous cache map keyed by absolute URL.
- **Constructable Stylesheets**: Pre-compile CSS sheets via `new CSSStyleSheet()` and load them asynchronously, so they can be adopted in shadow roots:

  ```javascript
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cssContent);
  shadowRoot.adoptedStyleSheets = [sheet];
  ```

---

## Phase 2: Reactive Properties & Attributes

- **Getter/Setter Generation**: Dynamically define properties on the class prototype with getters/setters mapping to matching observed attributes.
- **Type-Safe Casting**: Handle attribute casting for `Boolean`, `Number`, and `String` types during parsing and updates.
- **Custom State Mapping**: Map boolean properties directly to Custom Element States (using `this.internals.states.add()`/`delete()`) so developers can write `:state(disabled)` in CSS.
- **Cooperative Update Lifecycle**: Throttle state and property changes through our scheduler to batch multiple synchronous property updates into a single microtask render cycle.

---

## Phase 3: Lifecycle Safety & Form Association

- **AbortController Integration**: Automatically manage an internal `AbortController` bound to `connectedCallback`/`disconnectedCallback` lifecycle, passing a unified signal to the custom `mount()` hook to prevent listener memory leaks.
- **Form Association (ElementInternals)**: If `form: true` is defined:
  - Add `static formAssociated = true;` to the class prototype.
  - Automatically attach `ElementInternals` using `this.attachInternals()`.
  - Provide standard form state hooks to simplify building custom inputs.

---

## Phase 4: Dynamic HMR CSS Hot-Swapping

- **HMR Event Listener**: Mount a global `window` listener inside components when running in dev mode to catch live `native:hmr:css` reload messages broadcasted by the watcher.
- **Sheet Replacement**: Locate active `adoptedStyleSheets` referencing the changed path and hot-swap their content on the fly without refreshing the page!

---

## Execution Checklist

- `[ ]` **Phase 1**: Implement module-relative path resolution and single-parse template & style caching.
- `[ ]` **Phase 2**: Implement property definition, type-safe getters/setters, custom element state mapping, and cooperative microtask scheduling.
- `[ ]` **Phase 3**: Implement lifecycle AbortController integration, custom mount/unmount triggers, and Form-Association `ElementInternals`.
- `[ ]` **Phase 4**: Implement active component CSS AdoptedStyleSheet hot-swapping on HMR event triggers.
