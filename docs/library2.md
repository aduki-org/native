# ui-library.md

## Native-First Web Platform Library — Complete Structure

**Version:** 2.0
**Stack:** Vanilla ES Modules — no bundler dependency, no framework, no transpilation required
**Authority:** WHATWG Living Standard · W3C · TC39 · MDN Web Docs
**Scope:** Distributable SDK. Provides platform, routing, state, networking, workers, offline,
           security, animations, storage, AND UI elements. Consumed via Import Map in any project.

---

## What This Library Is

Not a UI component library. Not a framework. A complete native web platform SDK that any
project installs once and imports from. It provides every layer from the browser abstraction
surface up to production-ready custom elements — packaged so consumers never touch a browser
API directly, never rewrite a fetch pipeline, never re-implement AbortSignal lifecycle cleanup.

A consuming project adds the library to its Import Map and gets:

- `core/platform`   — feature detection, polyfill guards, thin browser wrappers
- `core/api`        — fetch pipeline, streaming, retries, interceptors
- `core/router`     — Navigation API + URLPattern client-side routing
- `core/state`      — Proxy-based reactive state, derived values, cross-tab sync
- `core/events`     — memory-safe event bus, delegation, AbortSignal integration
- `core/storage`    — unified IDB + Cache + OPFS + StorageManager façade
- `core/workers`    — dedicated/shared worker lifecycle, BroadcastChannel, Web Locks
- `core/ui`         — component base, scheduling, observers, View Transitions
- `core/security`   — SubtleCrypto wrappers, Permissions API, Sanitizer
- `core/offline`    — Service Worker bridge, Background Sync queue, connectivity
- `core/animations` — Web Animations API, scroll-driven, View Transitions orchestration
- `elements/*`      — production custom elements consuming all of the above
- `tokens/*`        — three-layer OKLCH design token CSS system (pure CSS, no JS)
- `styles/*`        — cascade layer declarations, base reset (pure CSS, no JS)
- `sw/*`            — caching strategies, routing, sync utilities for the consumer's SW

---

## CSS Distribution — Library Constraint

**The library ships CSS as CSS.** No JavaScript wrapper. No `fetch()` call. No `adoptedStyleSheets`
manipulation inside library source. `styles/` and `tokens/` contain `.css` files only.

### Why not CSS Module Scripts (`import ... with { type: 'css' }`)

CSS Module Scripts are EC2025-standardised but are **not yet Baseline cross-browser** as of 2026:

- Chrome / Edge: supported since v93
- Firefox: experimental only (behind flag as of FF145, October 2025) — not shipping by default
- Safari: import attributes shipped but CSS module scripts not implemented

A native-first library must not build its CSS delivery on a feature that requires a flag in one
major browser and is absent in another. CSS Module Scripts may become the primary path in a future
version when they reach Baseline Widely Available. The library is structured to adopt them with
zero file changes — the `.css` files are already there, a future `styles/index.js` wrapper can
re-export them as `CSSStyleSheet` objects without touching any other source.

### How consumers load library CSS

The library exposes one entry point per CSS layer:

```
dist/tokens/index.css   — all design tokens (primitives → registered → semantic)
dist/styles/index.css   — cascade layers + base reset
```

Consumers include exactly two `<link>` tags — at a **clean URL, not a `/node_modules/` path**.
That clean URL is achieved by one of two approaches (consumer's choice, not the library's problem):

**Approach A — Server URL alias (one config line)**

```js
// Vite
export default { resolve: { alias: { '/lib': '/node_modules/platform/dist' } } };

// Express
app.use('/lib', express.static('node_modules/platform/dist'));

// Nginx
// location /lib/ { alias /app/node_modules/platform/dist/; }
```

**Approach B — Post-install copy (zero server config)**

```js
// scripts/vendor.js  (runs via "postinstall" in consumer's package.json)
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const src  = join(import.meta.dirname, '../node_modules/platform/dist');
const dest = join(import.meta.dirname, '../public/lib');
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
```

Both produce the same result: `<link href="/lib/tokens/index.css">` and
`<link href="/lib/styles/index.css">` in the consumer's HTML — no `/node_modules/` anywhere.

### CSS custom properties and Shadow DOM

Design tokens are CSS custom properties. Custom properties are **inherited** — they cross
shadow boundaries through normal CSS inheritance. No JS bridge, no adopted sheets, no
special Shadow DOM handling is required for tokens to reach shadow-rooted elements.
The cascade does this natively.

Element-scoped component tokens (e.g. `--btn-bg`) are declared inside each element's
`<style>` block (in the Shadow DOM template). They reference semantic tokens via `var()`.
When the semantic token updates (theme switch), component tokens update automatically — zero JS.

---

## Naming Contract

Every name passes the one-word test first.
Folder carries the domain. File carries the concept. Neither repeats the other.
Compound only when a single word genuinely loses critical meaning.
`snake_case` for multi-word CSS custom properties and JSON keys.
`camelCase` for multi-word JS identifiers.
`lowercase` no separator for multi-word files and folders.

---

## Full Source Layout

```
/
├── src/
│   ├── core/
│   │   ├── platform/
│   │   ├── api/
│   │   ├── router/
│   │   ├── state/
│   │   ├── events/
│   │   ├── storage/
│   │   ├── workers/
│   │   ├── ui/
│   │   ├── security/
│   │   ├── offline/
│   │   └── animations/
│   │
│   ├── elements/
│   │   ├── primitives/
│   │   ├── forms/
│   │   ├── overlay/
│   │   ├── feedback/
│   │   ├── data/
│   │   ├── navigation/
│   │   └── layout/
│   │
│   ├── tokens/              ← pure CSS only; no .js files
│   │   ├── primitives/
│   │   ├── semantic/
│   │   ├── registered/
│   │   └── index.css
│   │
│   ├── styles/              ← pure CSS only; no .js files
│   │   ├── reset.css
│   │   ├── base.css
│   │   ├── layers.css
│   │   └── index.css
│   │
│   └── sw/
│
├── dist/                    — built output; mirrors src/
├── tests/                   — mirrors src/ structure
├── types/                   — JSDoc .d.ts declarations; mirrors src/
└── docs/                    — per-module markdown; mirrors src/
```

---

## src/tokens/ — Design Token System (Pure CSS)

Three-layer cascade. No JavaScript. No build-time transformation required.
Consumers reference `dist/tokens/index.css` only.

```
tokens/
│
├── primitives/
│   ├── colors.css        — raw OKLCH colour palette (brand, neutral, status)
│   ├── spacing.css       — spacing scale (--space-1 … --space-16)
│   ├── typography.css    — type scale, weights, families
│   ├── motion.css        — duration and easing values
│   ├── radius.css        — border radius values
│   ├── shadow.css        — shadow definitions
│   └── zindex.css        — z-index scale
│
├── registered/
│   ├── colors.css        — @property registrations for animatable colour tokens
│   └── dimensions.css    — @property registrations for animatable size tokens
│
├── semantic/
│   ├── light.css         — semantic tokens mapped to primitives (default / light)
│   ├── dark.css          — [data-theme="dark"] overrides
│   └── contrast.css      — [data-theme="high-contrast"] WCAG AAA overrides
│
└── index.css             — imports all layers in correct dependency order
```

### tokens/index.css — import order is load order

```css
/* tokens/index.css */

/* Layer 1 — raw values; no references to other tokens */
@import './primitives/colors.css';
@import './primitives/spacing.css';
@import './primitives/typography.css';
@import './primitives/motion.css';
@import './primitives/radius.css';
@import './primitives/shadow.css';
@import './primitives/zindex.css';

/* Layer 2 — @property registrations; must precede semantic tokens that share names */
@import './registered/colors.css';
@import './registered/dimensions.css';

/* Layer 3 — semantic mapping; references primitives via var(); last so they win */
@import './semantic/light.css';
@import './semantic/dark.css';
@import './semantic/contrast.css';
```

---

## src/styles/ — Cascade Layers and Base Reset (Pure CSS)

```
styles/
│
├── layers.css     — @layer declarations (order matters; declared once here)
├── reset.css      — minimal modern reset; margin/padding/box-sizing/inherit
├── base.css       — body typography, focus-visible, selection colour, scrollbar
└── index.css      — imports all style files in correct order
```

### styles/index.css

```css
/* styles/index.css */
@import './layers.css';    /* declare layer order before any layer-aware rules */
@import './reset.css';
@import './base.css';
```

### styles/layers.css — layer order declared once

```css
/* styles/layers.css */
/* Explicit layer order. Lower = lower specificity. */
@layer reset, base, tokens, components, utilities, overrides;
```

---

## Consumer HTML — Two Link Tags, Zero node_modules

```html
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <!-- Design tokens: primitives → registered @property → semantic (light/dark/contrast) -->
  <link rel="stylesheet" href="/lib/tokens/index.css">

  <!-- Cascade layer order + base reset -->
  <link rel="stylesheet" href="/lib/styles/index.css">

  <script type="importmap">
  {
    "imports": {
      "lib/core/":     "/lib/core/",
      "lib/elements/": "/lib/elements/",
      "lib/tokens/":   "/lib/tokens/",
      "lib/styles/":   "/lib/styles/",
      "lib/sw/":       "/lib/sw/"
    }
  }
  </script>

  <script type="module" src="/app/bootstrap.js"></script>
</head>
```

No `/node_modules/` path. Import Map handles JS; `<link>` handles CSS.
Both point to the same `/lib/` prefix resolved via server alias or postinstall copy.

---

## src/core/ — Platform Abstraction and Internal APIs

All `core/*` modules are independently importable. Tree-shakeable.
Import graph directed downward only — no upward coupling, no peer coupling without
explicit declaration. Circular imports within any core module are a hard architectural error.

```
core/
│
├── platform/
│   ├── supports.js          — all feature-detection booleans; lazy, cached on first access
│   │                            supports.navigationAPI
│   │                            supports.urlPattern
│   │                            supports.viewTransitions
│   │                            supports.popoverAPI
│   │                            supports.anchorPositioning
│   │                            supports.schedulerPostTask
│   │                            supports.schedulerYield
│   │                            supports.declarativeShadowDOM
│   │                            supports.sanitizerAPI
│   │                            supports.backgroundSync
│   │                            supports.speculationRules
│   │                            supports.contentVisibility
│   │                            supports.customStatePseudo
│   │                            supports.fileSystemPickers
│   │                            supports.importMaps
│   │                            supports.cssModuleScripts    ← tracked; not yet used
│   │                            supports.scrollTimeline
│   │
│   ├── guard.js             — feature-gate wrapper; loads polyfill on first use
│   │
│   ├── polyfills/
│   │   ├── urlpattern.js    — path-to-regexp fallback; ~1.5 KB
│   │   ├── navigation.js    — History API bridge; ~2 KB
│   │   ├── popover.js       — Popover API polyfill; ~3 KB
│   │   ├── shadow.js        — Declarative Shadow DOM; <1 KB
│   │   └── anchor.js        — Floating UI positional fallback; ~3.5 KB
│   │
│   └── index.js
│
│
├── api/
│   ├── pipeline.js          — composable interceptor chain
│   ├── fetch.js             — core fetch wrapper; AbortSignal timeout; scheduler priority
│   ├── retry.js             — exponential backoff with jitter
│   ├── cache.js             — Cache API; cache-first / network-first / stale-revalidate
│   ├── stream.js            — ReadableStream; NDJSON TransformStream; backpressure
│   ├── upload.js            — XHR-based; progress events
│   └── index.js
│
│       api.get(url, opts?)          → Promise<T>
│       api.post(url, body, opts?)   → Promise<T>
│       api.put(url, body, opts?)    → Promise<T>
│       api.patch(url, body, opts?)  → Promise<T>
│       api.delete(url, opts?)       → Promise<T>
│       api.stream(url, opts?)       → AsyncIterable<Chunk>
│       api.upload(url, file, opts?) → Promise<T>
│
│       Options: signal, cache (strategy name), retries, timeout, priority, interceptors[]
│
│
├── router/
│   ├── match.js             — URLPattern table; named capture groups; wildcards
│   ├── intercept.js         — Navigation API navigate event handler
│   ├── history.js           — History API fallback bridge
│   ├── outlet.js            — <route-outlet> custom element
│   ├── transitions.js       — startViewTransition wrapper; reduced-motion guard
│   └── index.js
│
│       router.on(pattern, handler)       → Disposer
│       router.navigate(url, state?)      → void
│       router.replace(url, state?)       → void
│       router.back()                     → void
│       router.forward()                  → void
│       router.go(delta)                  → void
│       router.match(url)                 → RouteMatch | null
│       router.current()                  → NavigationHistoryEntry
│       router.entries()                  → NavigationHistoryEntry[]
│       router.canBack()                  → boolean
│       router.canForward()               → boolean
│
│
├── state/
│   ├── store.js             — Proxy-based reactive store; path subscriptions
│   ├── derived.js           — computed values; lazy evaluation; memo
│   ├── sync.js              — BroadcastChannel cross-tab state sync
│   ├── persist.js           — IDB-backed persistence; rehydration on init
│   └── index.js
│
│       store.get(path)                   → value
│       store.set(path, value)            → void
│       store.update(path, fn)            → void
│       store.subscribe(path, handler)    → Disposer
│       store.batch(fn)                   → void
│       derived(deps[], compute)          → DerivedRef
│
│
├── events/
│   ├── bus.js               — typed event bus; AbortSignal integration
│   ├── delegate.js          — event delegation; selector-based; memory-safe
│   ├── once.js              — one-shot listener with automatic cleanup
│   └── index.js
│
│       events.on(type, handler, opts?)   → Disposer
│       events.emit(type, data?)          → void
│       events.once(type, handler)        → Disposer
│       events.delegate(root, sel, type, handler) → Disposer
│
│
├── storage/
│   ├── idb.js               — IndexedDB; versioned schema; transaction helpers
│   ├── cache.js             — Cache API façade; named caches; TTL support
│   ├── opfs.js              — Origin Private File System; read/write/watch
│   ├── quota.js             — StorageManager; estimate; persist request
│   └── index.js
│
│       store.get(key)                    → Promise<T | null>
│       store.set(key, value)             → Promise<void>
│       store.delete(key)                 → Promise<void>
│       store.list(prefix?)              → Promise<string[]>
│       store.clear()                     → Promise<void>
│
│
├── workers/
│   ├── dedicated.js         — Worker lifecycle; typed messaging; structured clone
│   ├── shared.js            — SharedWorker; port management; multi-tab coordination
│   ├── broadcast.js         — BroadcastChannel helpers; typed channels
│   ├── locks.js             — Web Locks API wrappers; deadlock detection
│   └── index.js
│
│
├── ui/
│   ├── base.js              — HTMLElement base class; lifecycle helpers; AbortController
│   ├── schedule.js          — scheduler.postTask wrappers; requestAnimationFrame batching
│   ├── observe.js           — ResizeObserver / IntersectionObserver / MutationObserver wrappers
│   ├── transitions.js       — View Transitions orchestration; reduced-motion guard
│   └── index.js
│
│
├── security/
│   ├── crypto.js            — SubtleCrypto wrappers; AES-GCM encrypt/decrypt; PBKDF2
│   ├── sanitize.js          — Sanitizer API + DOMPurify fallback (via guard.js)
│   ├── permissions.js       — Permissions API; query + request; change events
│   └── index.js
│
│
├── offline/
│   ├── bridge.js            — postMessage channel to Service Worker; typed messages
│   ├── sync.js              — Background Sync queue; retry on reconnect
│   ├── connectivity.js      — online/offline detection; debounced events
│   └── index.js
│
│
└── animations/
    ├── waapi.js             — Web Animations API helpers; timeline; playback control
    ├── scroll.js            — scroll-driven animation helpers; ScrollTimeline
    ├── transitions.js       — View Transitions helpers; named transitions
    └── index.js
```

---

## src/elements/ — Production Custom Elements

All elements extend `core/ui/base.js`. All CSS lives in the element's Shadow DOM `<template>` as
an inline `<style>` block — **not imported, not fetched, not injected via JS**. Component tokens
(`--btn-bg`, `--input-border`, etc.) are CSS custom properties that reference semantic design
tokens; they update automatically when the token cascade changes.

```
elements/
│
├── primitives/
│   ├── button.js            — <ui-button>     formAssociated; states: loading, disabled
│   ├── icon.js              — <ui-icon>        SVG sprite reference; size token
│   ├── badge.js             — <ui-badge>       status variants via attribute
│   ├── avatar.js            — <ui-avatar>      image with fallback initials
│   ├── divider.js           — <ui-divider>     horizontal / vertical
│   └── spinner.js           — <ui-spinner>     indeterminate progress indicator
│
├── forms/
│   ├── input.js             — <ui-input>       formAssociated; validation; error slot
│   ├── textarea.js          — <ui-textarea>    formAssociated; auto-resize option
│   ├── select.js            — <ui-select>      formAssociated; custom dropdown
│   ├── checkbox.js          — <ui-checkbox>    formAssociated; indeterminate state
│   ├── radio.js             — <ui-radio>       formAssociated; group coordination
│   ├── toggle.js            — <ui-toggle>      formAssociated; on/off switch
│   ├── field.js             — <ui-field>       label + input + error layout wrapper
│   └── form.js              — <ui-form>        submission handling; validation summary
│
├── overlay/
│   ├── dialog.js            — <ui-dialog>      <dialog> element; focus trap; scroll lock
│   ├── popover.js           — <ui-popover>     Popover API; anchor positioning
│   ├── tooltip.js           — <ui-tooltip>     Popover API; hover + focus; ARIA
│   ├── drawer.js            — <ui-drawer>      side panel; animated; focus managed
│   └── sheet.js             — <ui-sheet>       bottom sheet; drag-to-dismiss
│
├── feedback/
│   ├── toast.js             — <ui-toast>       timed notifications; ARIA live region
│   ├── alert.js             — <ui-alert>       inline status messages; dismissable
│   ├── progress.js          — <ui-progress>    determinate/indeterminate <progress>
│   └── skeleton.js          — <ui-skeleton>    loading placeholder; animated shimmer
│
├── data/
│   ├── table.js             — <ui-table>       sortable; virtual scroll; ARIA grid
│   ├── list.js              — <ui-list>        virtual scroll list; keyboard nav
│   ├── card.js              — <ui-card>        content container; header/body/footer slots
│   ├── stat.js              — <ui-stat>        metric display; label + value + delta
│   └── empty.js             — <ui-empty>       empty state; icon + message + action slot
│
├── navigation/
│   ├── nav.js               — <ui-nav>         navigation container; ARIA nav landmark
│   ├── tabs.js              — <ui-tabs>        tab panel; keyboard; ARIA tablist
│   ├── breadcrumb.js        — <ui-breadcrumb>  ARIA breadcrumb; separator token
│   ├── pagination.js        — <ui-pagination>  page control; accessible
│   └── steps.js             — <ui-steps>       wizard / multi-step indicator
│
└── layout/
    ├── stack.js             — <ui-stack>       vertical / horizontal flex stack
    ├── grid.js              — <ui-grid>        CSS grid layout container
    ├── split.js             — <ui-split>       resizable two-panel layout
    ├── scroll.js            — <ui-scroll>      scroll container; snap; overflow control
    └── surface.js           — <ui-surface>     elevation surface; token-driven shadow
```

### Element structure — Shadow DOM only, inline style, no external CSS fetch

```js
// elements/primitives/button.js
import { Base } from 'lib/core/ui/index.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    /* Component tokens — reference semantic tokens only; never primitives directly */
    :host {
      --btn-bg:      var(--color-interactive);
      --btn-bg-h:    var(--color-interactive-hover);
      --btn-bg-a:    var(--color-interactive-active);
      --btn-color:   var(--color-neutral-0);
      --btn-radius:  var(--radius-md);
      --btn-size:    var(--font-size-sm);
    }
    button {
      background:     var(--btn-bg);
      color:          var(--btn-color);
      border-radius:  var(--btn-radius);
      font-size:      var(--btn-size);
      padding-block:  var(--space-2);
      padding-inline: var(--space-4);
      border:         none;
      cursor:         pointer;
      transition:
        background-color var(--duration-fast) var(--ease-out),
        transform        var(--duration-fast) var(--ease-out);
    }
    button:hover:not(:disabled)  { background: var(--btn-bg-h); }
    button:active:not(:disabled) { background: var(--btn-bg-a); transform: scale(0.98); }

    :host(:state(loading))  button { opacity: 0.6; pointer-events: none; }
    :host(:state(disabled)) button { background: var(--color-interactive-disabled); cursor: not-allowed; }
  </style>
  <button part="button"><slot></slot></button>
`;

export class Button extends Base {
  static formAssociated = true;
  static observedAttributes = ['disabled', 'type', 'value'];

  #internals;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.append(tpl.content.cloneNode(true));
    this.#internals = this.attachInternals();
  }

  connectedCallback() {
    super.connectedCallback();                              // creates this.ctrl (AbortController)
    this.shadowRoot
      .querySelector('button')
      .addEventListener('click', this.#click, { signal: this.ctrl.signal });
  }

  disconnectedCallback() {
    super.disconnectedCallback();                          // this.ctrl.abort() — cleans all signals
  }

  attributeChangedCallback(name, _, next) {
    if (name === 'disabled') {
      next !== null
        ? this.#internals.states.add('disabled')
        : this.#internals.states.delete('disabled');
    }
  }

  set loading(val) {
    val
      ? this.#internals.states.add('loading')
      : this.#internals.states.delete('loading');
  }

  #click = () => {
    this.dispatchEvent(new CustomEvent('activate', { bubbles: true, composed: true }));
  };
}

customElements.define('ui-button', Button);
```

---

## src/sw/ — Service Worker Utilities

```
sw/
│
├── strategies.js    — CacheFirst, NetworkFirst, StaleRevalidate, NetworkOnly, CacheOnly
├── routes.js        — URL-pattern-based request routing for the Service Worker fetch event
├── queue.js         — Background Sync request queue; serialize/deserialize; retry
├── expire.js        — TTL-based cache expiry; cleanup on activate event
└── index.js
```

Consumers import from `'lib/sw/index.js'` inside their own `service-worker.js` file.
The library does not register, install, or activate a Service Worker directly.

---

## Token Cascade — Three Layers in Practice

```
Primitive              Semantic                    Component
────────────────────   ─────────────────────────   ──────────────────────────────────
--color-brand-500  ←── --color-interactive      ←── --btn-bg: var(--color-interactive)
--color-brand-600  ←── --color-interactive-hover ←── --btn-bg-h
--color-brand-300      (dark mode override in
                        semantic/dark.css)

Theme switch: [data-theme="dark"] on <html>
  → semantic tokens update via CSS cascade
  → registered @property colours transition smoothly (250ms) — zero JS
  → component tokens that reference semantic tokens update automatically
  → no component code, no re-render, no class toggling per element
```

---

## Error Shape — Library-Wide

All errors from `core/*` normalise to this shape before reaching call sites.
Raw `DOMException` and `IDBRequestErrorEvent` never escape module boundaries.

```js
{
  code:        string,   // 'STORAGE_QUOTA' | 'NETWORK_TIMEOUT' | 'AUTH_EXPIRED' | …
  message:     string,   // human-readable; not for display to end users
  cause:       Error,    // original browser API error
  context:     object,   // metadata: key, url, operation
  recoverable: boolean   // whether the caller can retry
}
```

Errors also emitted on `events.emit('core:error', error)` so a central subscriber
can collect all platform errors regardless of whether the call site handles them.

---

## Disposer Pattern — Library-Wide

Functions that establish ongoing relationships return a Disposer: a parameterless function
that tears down the relationship when called.

```js
const stop = store.subscribe('user', handler);   // returns Disposer
stop();   // tears down; idempotent; synchronous

// Disposers are:
// - idempotent     — safe to call multiple times
// - synchronous    — never return a Promise
// - composable     — collect in an array; call each at teardown

// When an AbortSignal is accepted, prefer it — one abort() cleans everything simultaneously.
```

---

## Polyfill Budget

```
Polyfill                   Compressed   Activation Condition                    Affected %
─────────────────────────  ───────────  ──────────────────────────────────────  ──────────
es-module-shims            ~13 KB       !supports.importMaps                    ~4%
urlpattern fallback        ~1.5 KB      !supports.urlPattern                    ~10%
navigation fallback        ~2 KB        !supports.navigationAPI                 ~15%
DOMPurify                  ~14 KB       !supports.sanitizerAPI                  ~60%+
Floating UI (pos only)     ~3.5 KB      !supports.anchorPositioning             ~20%
Popover polyfill           ~3 KB        !supports.popoverAPI                    ~5%
Declarative SD             <1 KB        !supports.declarativeShadowDOM          ~5%
─────────────────────────  ───────────  ──────────────────────────────────────  ──────────
Worst-case total           ~37 KB       All conditions true simultaneously
```

All loaded conditionally via `core/platform/guard.js`. Never in the main module graph.

---

## Naming Quick Reference

| Context                    | Rule                               | Correct                  | Wrong                           |
|----------------------------|------------------------------------|--------------------------|----------------------------------|
| Core module folder         | one word                           | `core/router/`           | `core/clientrouter/`            |
| Core module file           | one concept word                   | `match.js`               | `routematch.js`                 |
| Element folder             | one domain word                    | `forms/`                 | `formcontrols/`                 |
| Element file               | element concept, no domain prefix  | `forms/input.js`         | `forms/forminput.js`            |
| Custom element tag         | `ui-` + one word                   | `<ui-button>`            | `<ui-form-button>`              |
| SW utility file            | one concept                        | `strategies.js`          | `cachingstrategies.js`          |
| Token file                 | token category                     | `colors.css`             | `colorpalette.css`              |
| CSS custom property        | `--domain-concept`                 | `--color-interactive`    | `--interactiveColor`            |
| CSS component token        | `--elementname-role`               | `--btn-bg`               | `--button-background-color`     |
| JS public method           | one verb in context                | `store.set()`            | `store.updateValue()`           |
| Boolean JS method          | adjective                          | `router.canBack()`       | `router.checkIfCanGoBack()`     |
| Feature detect boolean     | `supports.camelName`               | `supports.urlPattern`    | `supports.hasUrlPatternApi`     |
| Loop variable              | singular of collection             | `for (const el of els)`  | `for (const element of elements)` |
| Two-word folder (forced)   | lowercase no separator, or split   | `sw/` or `offline/`      | `service-worker/`               |

---

*End of ui-library.md*