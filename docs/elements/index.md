# UI Custom Elements Catalog Documentation

## Purpose and Architectural Position
The `elements` layer (`src/elements/`) comprises 42 premium Custom Elements built on top of `BaseElement` (`src/core/ui/base.js`). They leverage native Shadow DOM for CSS isolation, use inline CSS template blocks targeting semantic design tokens, participate in native form associations, and use roving tabindex indexes for accessibility.

---

## 1. Primitive Elements (`primitives/`)
* **`<ui-button>`** — Premium interactive button.
  * *Attributes*: `disabled`, `variant` (primary, secondary, outline, ghost), `size` (sm, md, lg).
  * *Slots*: Default slot for button label contents.
  * *Custom States*: `:state(disabled)`.
* **`<ui-icon>`** — Vector icon container.
  * *Attributes*: `name` (standard icon glyphs), `size` (sm, md, lg).
* **`<ui-badge>`** — Pill styling badge.
  * *Attributes*: `variant` (success, info, warning, danger).
* **`<ui-avatar>`** — Rounded image avatar with character fallback.
  * *Attributes*: `src`, `alt`, `name`.
* **`<ui-divider>`** — Structural line break.
  * *Attributes*: `orientation` (horizontal, vertical).

---

## 2. Form Controls (`forms/`)
Form controls implement standard browser `ElementInternals` to participate in standard `<form>` submit and validation cycles.

* **`<ui-input>`** — Standard text/email/password field.
  * *Attributes*: `type`, `name`, `value`, `placeholder`, `required`, `pattern`.
  * *Properties*: `value`, `validity`.
  * *Events*: `input`, `change`.
* **`<ui-textarea>`** — Multi-line field.
  * *Attributes*: `rows`, `cols`, `value`, `required`.
* **`<ui-checkbox>`** — Checkbox toggle.
  * *Attributes*: `checked`, `required`.
  * *Properties*: `checked`.
* **`<ui-toggle>`** — Premium iOS-style switch.
  * *Attributes*: `checked`.
* **`<ui-field>`** — Control wrapper.
  * *Attributes*: `label`, `error`, `hint`.
  * *Slots*: `label`, `hint`, `error`, default slot for the active form control.
* **`<ui-form>`** — Advanced form coordinator. Handles submit events, custom field parsing, and IndexedDB queuing fallback when offline.

---

## 3. Overlay System (`overlay/`)
* **`<ui-dialog>`** — Modal dialog container.
  * *Attributes*: `open`.
  * *Methods*: `show()`, `showModal()`, `close()`.
  * *Slots*: Default slot for card content, `header`, `footer`.
* **`<ui-popover>`** — Popover toggler.
  * *Attributes*: `open`, `placement` (top, bottom, left, right).
* **`<ui-tooltip>`** — Anchor-anchored tooltip indicator.
  * *Attributes*: `content`, `placement`.

---

## 4. Navigation System (`navigation/`)
* **`<ui-tabs>`** — Tab switcher.
  * *Attributes*: `value`.
  * *Properties*: `value`.
  * *Slots*: Default slot wraps `<ui-tab>` elements and `<ui-tab-panel>` bodies.
  * *Keyboard Navigation*: Enforces roving tabindex using Arrow keys.

---

## AbortSignal and Cleanup Contract
* **Event Listeners**: Custom elements automatically add and remove listeners inside `connectedCallback()` and `disconnectedCallback()`.
* **Intersection Observers**: Lazy-loaded items (such as `<ui-avatar>` or `<ui-chart>`) disconnect internal observers when elements are removed from the active DOM tree.

## CSS Styling Guidelines
* Components rely exclusively on **Semantic Design Tokens** (`var(--color-bg-base)`, `var(--radius-md)`) rather than primitive color overrides to ensure standard CSS transitions.
* Global styling targets standard custom CSS parts where applicable, allowing developers to inject styles using the standard `::part()` pseudo-element.
