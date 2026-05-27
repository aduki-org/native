# Native-First Web Platform — Implementation Plan

**Version:** 2.0 (reconciled from library.md v1 + library2.md v2 + all.md architecture spec)
**Stack:** Vanilla ES Modules · No bundler · No framework · No transpilation
**Authority:** WHATWG · W3C · TC39 · MDN Web Docs
**Goal:** A distributable SDK consumed via Import Map in any project, providing every
layer from the browser abstraction surface up to production-ready custom elements.

---

## Naming Contract

One word first. Folder carries domain. File carries concept. Neither repeats the other.

| Pattern | Rule |
|---|---|
| FK suffix `_id` | Drop — use entity name alone |
| `is_` boolean prefix | Drop — use adjective alone |
| Compound noun | Collapse to most specific word in context |
| Repeated qualifier | If folder names it, drop from file |
| Multi-word file | `lowercase` no separator: `authguard.js` |
| Multi-word CSS prop | `snake_case`: `--color-interactive` |
| Multi-word JS id | `camelCase`: `canBack()` |
| Custom element tag | `ui-` + one word: `<ui-button>` |

---

## Folder Structure

```
/
├── src/
│   ├── core/
│   │   ├── platform/
│   │   │   ├── supports.js        — all feature-detection booleans, lazy + cached
│   │   │   ├── guard.js           — feature-gate wrapper; loads polyfill on first use
│   │   │   ├── polyfills/
│   │   │   │   ├── urlpattern.js  — path-to-regexp fallback ~1.5 KB
│   │   │   │   ├── navigation.js  — History API bridge ~2 KB
│   │   │   │   ├── popover.js     — Popover API polyfill ~3 KB
│   │   │   │   ├── shadow.js      — Declarative Shadow DOM <1 KB
│   │   │   │   └── anchor.js      — Floating UI positional fallback ~3.5 KB
│   │   │   └── index.js
│   │   │
│   │   ├── api/
│   │   │   ├── pipeline.js        — composable interceptor chain
│   │   │   ├── fetch.js           — fetch wrapper; AbortSignal timeout; scheduler priority
│   │   │   ├── retry.js           — exponential backoff with jitter
│   │   │   ├── cache.js           — Cache API; cache-first / network-first / stale-revalidate
│   │   │   ├── stream.js          — ReadableStream; NDJSON TransformStream; backpressure
│   │   │   ├── upload.js          — XHR-based; progress events
│   │   │   └── index.js
│   │   │
│   │   ├── router/
│   │   │   ├── match.js           — URLPattern table; named captures; wildcards
│   │   │   ├── intercept.js       — Navigation API navigate event handler
│   │   │   ├── history.js         — History API fallback bridge
│   │   │   ├── outlet.js          — <route-outlet> custom element
│   │   │   ├── transitions.js     — startViewTransition wrapper; reduced-motion guard
│   │   │   └── index.js
│   │   │
│   │   ├── state/
│   │   │   ├── store.js           — Proxy-based reactive store; explicit subscriptions
│   │   │   ├── derived.js         — computed values; lazy eval; WeakMap memo
│   │   │   ├── sync.js            — BroadcastChannel cross-tab state sync
│   │   │   ├── persist.js         — IDB-backed persistence; rehydration on init
│   │   │   └── index.js
│   │   │
│   │   ├── events/
│   │   │   ├── bus.js             — typed EventTarget singleton; system-level events only
│   │   │   ├── delegate.js        — delegation; closest() traversal; shadow-boundary safe
│   │   │   ├── once.js            — one-shot listener with automatic cleanup
│   │   │   └── index.js
│   │   │
│   │   ├── storage/
│   │   │   ├── idb.js             — IndexedDB; versioned schema; transaction helpers
│   │   │   ├── opfs.js            — Origin Private File System; sync access via Worker
│   │   │   ├── cache.js           — Cache API façade; named caches; TTL support
│   │   │   ├── quota.js           — StorageManager estimate + persist; 80% eviction guard
│   │   │   ├── lru.js             — bounded LRU; configurable max size; WeakRef variant
│   │   │   └── index.js
│   │   │
│   │   ├── workers/
│   │   │   ├── pool.js            — dedicated worker pool; bounded by hardwareConcurrency-1
│   │   │   ├── dedicated.js       — Worker lifecycle; typed messaging; structured clone
│   │   │   ├── shared.js          — SharedWorker; port management; multi-tab coordination
│   │   │   ├── broadcast.js       — BroadcastChannel helpers; typed channels
│   │   │   ├── locks.js           — Web Locks API; exclusive/shared; AbortSignal timeout
│   │   │   ├── offscreen.js       — OffscreenCanvas transfer lifecycle
│   │   │   └── index.js
│   │   │
│   │   ├── ui/
│   │   │   ├── base.js            — HTMLElement base; lifecycle AbortController
│   │   │   ├── schedule.js        — scheduler.postTask wrappers; rAF batching
│   │   │   ├── observe.js         — ResizeObserver / IntersectionObserver / MutationObserver
│   │   │   ├── transitions.js     — View Transitions orchestration; reduced-motion guard
│   │   │   ├── template.js        — <template> clone factory; parse-once, clone-many
│   │   │   ├── define.js          — customElements.define; duplicate-registration guard
│   │   │   └── index.js
│   │   │
│   │   ├── security/
│   │   │   ├── crypto.js          — SubtleCrypto; AES-GCM; PBKDF2; HMAC; ECDSA
│   │   │   ├── sanitize.js        — Sanitizer API + DOMPurify fallback via guard.js
│   │   │   ├── permissions.js     — Permissions API; query + request; change events
│   │   │   └── index.js
│   │   │
│   │   ├── offline/
│   │   │   ├── bridge.js          — postMessage channel to Service Worker
│   │   │   ├── queue.js           — IDB-backed operation queue; idempotency keys; retry
│   │   │   ├── sync.js            — Background Sync; manual online-event fallback
│   │   │   ├── connectivity.js    — reliable HEAD-probe; navigator.onLine is unreliable
│   │   │   └── index.js
│   │   │
│   │   └── animations/
│   │       ├── registry.js        — named animation store; keyframe + timing registered once
│   │       ├── play.js            — element.animate wrapper; stagger; memory-safe cancel
│   │       ├── scroll.js          — ScrollTimeline + ViewTimeline; feature-detected
│   │       ├── waapi.js           — WAAPI helpers; timeline; playback control
│   │       └── index.js
│   │
│   ├── elements/
│   │   ├── base.js                — re-exports core/ui/base.js (library internal boundary)
│   │   │
│   │   ├── primitives/
│   │   │   ├── button.js          — <ui-button>    formAssociated; :state(loading/disabled)
│   │   │   ├── icon.js            — <ui-icon>      SVG sprite; aria-hidden default
│   │   │   ├── badge.js           — <ui-badge>     status variants via attribute
│   │   │   ├── avatar.js          — <ui-avatar>    image with fallback initials
│   │   │   ├── divider.js         — <ui-divider>   horizontal / vertical
│   │   │   ├── text.js            — <ui-text>      semantic type scale; as="" attr
│   │   │   ├── link.js            — <nav-link>     router-aware; aria-current
│   │   │   └── spinner.js         — <ui-spinner>   WAAPI rotation; reduced-motion aware
│   │   │
│   │   ├── forms/
│   │   │   ├── input.js           — <ui-input>     formAssociated; validation; error slot
│   │   │   ├── textarea.js        — <ui-textarea>  formAssociated; auto-resize
│   │   │   ├── select.js          — <ui-select>    formAssociated; Popover API dropdown
│   │   │   ├── checkbox.js        — <ui-checkbox>  tri-state; :state(checked/indeterminate)
│   │   │   ├── radio.js           — <ui-radio>     formAssociated; group coordination
│   │   │   ├── toggle.js          — <ui-toggle>    formAssociated; :state(on)
│   │   │   ├── field.js           — <ui-field>     label + input + error layout wrapper
│   │   │   ├── upload.js          — <ui-upload>    drag/drop + picker; progress events
│   │   │   └── form.js            — <ui-form>      submission; offline queue integration
│   │   │
│   │   ├── overlay/
│   │   │   ├── dialog.js          — <ui-dialog>    native <dialog>; focus trap; scroll lock
│   │   │   ├── popover.js         — <ui-popover>   Popover API; anchor positioning
│   │   │   ├── tooltip.js         — <ui-tooltip>   Popover API; hover + focus; ARIA
│   │   │   ├── menu.js            — <ui-menu>      popover + anchor; role=menu; roving tabindex
│   │   │   ├── drawer.js          — <ui-drawer>    side panel; animated; focus managed
│   │   │   └── sheet.js           — <ui-sheet>     bottom sheet; drag-to-dismiss
│   │   │
│   │   ├── feedback/
│   │   │   ├── alert.js           — <ui-alert>     role=alert live region; severity variants
│   │   │   ├── toast.js           — <ui-toast>     top-layer popover; auto-dismiss; queue
│   │   │   ├── progress.js        — <ui-progress>  determinate + indeterminate
│   │   │   ├── skeleton.js        — <ui-skeleton>  animated shimmer; shape variants
│   │   │   └── empty.js           — <ui-empty>     icon + heading + body + action slots
│   │   │
│   │   ├── data/
│   │   │   ├── table.js           — <ui-table>     content-visibility rows; sort; multi-select
│   │   │   ├── list.js            — <ui-list>      IntersectionObserver virtual scroll
│   │   │   ├── card.js            — <ui-card>      header/body/footer/media slots
│   │   │   ├── stat.js            — <ui-stat>      metric display; label + value + delta
│   │   │   └── empty.js           — (symlink to feedback/empty.js)
│   │   │
│   │   ├── navigation/
│   │   │   ├── nav.js             — <ui-nav>       <nav> landmark; aria-current from router
│   │   │   ├── tabs.js            — <ui-tabs>      ARIA tablist; keyboard; URL sync option
│   │   │   ├── breadcrumb.js      — <ui-breadcrumb> router.entries(); structured data
│   │   │   ├── pagination.js      — <ui-pagination> router.navigate() integration
│   │   │   └── steps.js           — <ui-steps>     wizard / multi-step indicator
│   │   │
│   │   └── layout/
│   │       ├── app.js             — <ui-app>       application shell; router outlet; theme host
│   │       ├── header.js          — <ui-header>    sticky top bar; start/center/end slots
│   │       ├── sidebar.js         — <ui-sidebar>   collapsible; ResizeObserver width tracking
│   │       ├── stack.js           — <ui-stack>     flex column/row; gap tokens
│   │       ├── grid.js            — <ui-grid>      CSS Grid; container query breakpoints
│   │       ├── split.js           — <ui-split>     resizable two-panel layout
│   │       ├── scroll.js          — <ui-scroll>    scroll container; snap; overflow control
│   │       └── surface.js         — <ui-surface>   elevation surface; token-driven shadow
│   │
│   ├── tokens/                    ← pure CSS only; no .js files
│   │   ├── primitives/
│   │   │   ├── colors.css         — OKLCH palette; brand 12-step; neutral 12-step; status
│   │   │   ├── spacing.css        — rem scale; 4px base unit; --space-1 … --space-32
│   │   │   ├── typography.css     — type scale; weights; line-heights; fluid clamp()
│   │   │   ├── motion.css         — duration scale; easing curves; prefers-reduced-motion
│   │   │   ├── radius.css         — border radius: none → full (9999px)
│   │   │   ├── shadow.css         — ambient + key light model; OKLCH alpha; dark overrides
│   │   │   └── zindex.css         — named z-index: base → raised → overlay → toast → tooltip
│   │   │
│   │   ├── registered/
│   │   │   ├── colors.css         — @property for animatable semantic colour tokens
│   │   │   └── dimensions.css     — @property for animatable size/spacing tokens
│   │   │
│   │   ├── semantic/
│   │   │   ├── light.css          — :root defaults; --color-surface-*, --color-interactive-*
│   │   │   ├── dark.css           — [data-theme="dark"] overrides; same names, dark primitives
│   │   │   └── contrast.css       — [data-theme="high-contrast"] WCAG AAA overrides
│   │   │
│   │   └── index.css              — import order: primitives/* → registered/* → semantic/*
│   │
│   ├── styles/                    ← pure CSS only; no .js files
│   │   ├── layers.css             — @layer reset, base, tokens, components, utilities, overrides
│   │   ├── reset.css              — @layer reset; margin/padding/box-sizing
│   │   ├── base.css               — @layer base; body font; focus-visible; selection
│   │   └── index.css              — imports layers → reset → base in order
│   │
│   └── sw/
│       ├── strategies.js          — CacheFirst, NetworkFirst, StaleRevalidate, NetworkOnly
│       ├── routes.js              — URLPattern fetch handler routing for SW fetch event
│       ├── queue.js               — Background Sync queue; serialize/retry
│       ├── expire.js              — TTL-based cache expiry; cleanup on activate
│       ├── install.js             — precache(); prefetchFallback()
│       ├── activate.js            — pruneStale(); claim(); enableNavPreload()
│       ├── sync.js                — replayQueue(); requeueFailed()
│       ├── push.js                — VAPID subscribe(); Notification API wrapper
│       └── index.js               — re-exports all SW utilities
│
├── dist/                          — built output; mirrors src/
├── tests/                         — mirrors src/ structure; runs in real browser
├── types/                         — JSDoc .d.ts declarations; mirrors src/
└── docs/                          — per-module markdown; mirrors src/
```

---

## Import Map (Consumer Setup)

```json
{
  "imports": {
    "lib/core/":     "/lib/core/",
    "lib/elements/": "/lib/elements/",
    "lib/tokens/":   "/lib/tokens/",
    "lib/styles/":   "/lib/styles/",
    "lib/sw/":       "/lib/sw/"
  }
}
```

CSS entry points (two `<link>` tags only, no `/node_modules/` in path):

```html
<link rel="stylesheet" href="/lib/tokens/index.css">
<link rel="stylesheet" href="/lib/styles/index.css">
```

---

## Module Boundary Rules

```
Consumer Application
      ↓ imports from
lib/elements/*     (Custom Elements — never import each other)
      ↓ imports from
lib/core/*         (Platform API — via index.js only, never internal files directly)
      ↓ imports from
lib/core/platform/ (feature detection, polyfill guards)
      ↓ delegates to
Browser Runtime APIs
```

Downward only. No circular imports. Side effects in module scope are prohibited.
All event subscriptions accept an `AbortSignal`. All ongoing relationships return a `Disposer`.

---

## Error Shape (Library-Wide)

```js
{
  code:        string,   // 'STORAGE_QUOTA' | 'NETWORK_TIMEOUT' | 'AUTH_EXPIRED'
  message:     string,   // human-readable; not for display to end users
  cause:       Error,    // original browser API error
  context:     object,   // metadata: key, url, operation
  recoverable: boolean
}
```

Errors also emitted on `events.emit('core:error', error)`.

---

## Polyfill Budget

| Polyfill | Compressed | Activation |
|---|---|---|
| es-module-shims | ~13 KB | `!supports.importMaps` |
| urlpattern | ~1.5 KB | `!supports.urlPattern` |
| navigation | ~2 KB | `!supports.navigationAPI` |
| DOMPurify | ~14 KB | `!supports.sanitizerAPI` |
| Floating UI (pos) | ~3.5 KB | `!supports.anchorPositioning` |
| Popover polyfill | ~3 KB | `!supports.popoverAPI` |
| Declarative SD | <1 KB | `!supports.declarativeShadowDOM` |
| **Worst-case total** | **~37 KB** | All conditions true |

All loaded conditionally via `core/platform/guard.js`. Never in the main module graph.

---

## Implementation Phases

---

### Phase 1 — Foundation: Platform Layer + Design Tokens

**Goal:** Everything needed before any component can be written.
No elements. No routing. No networking. Pure infrastructure.

#### 1-A · `core/platform/`

- [ ] `supports.js` — All feature-detection booleans. Lazy, cached on first access.
  Flags: `navigationAPI`, `urlPattern`, `viewTransitions`, `popoverAPI`,
  `anchorPositioning`, `schedulerPostTask`, `schedulerYield`, `declarativeShadowDOM`,
  `sanitizerAPI`, `backgroundSync`, `speculationRules`, `contentVisibility`,
  `customStatePseudo`, `fileSystemPickers`, `importMaps`, `scrollTimeline`, `cssModuleScripts`
- [ ] `guard.js` — Feature-gate wrapper. Loads polyfill on first use.
  Call sites receive the same API regardless of native vs polyfill path.
- [ ] `polyfills/urlpattern.js` — path-to-regexp fallback; activates when `!supports.urlPattern`
- [ ] `polyfills/navigation.js` — History API bridge; activates when `!supports.navigationAPI`
- [ ] `polyfills/popover.js` — Popover API polyfill; activates when `!supports.popoverAPI`
- [ ] `polyfills/shadow.js` — Declarative Shadow DOM; activates when `!supports.declarativeShadowDOM`
- [ ] `polyfills/anchor.js` — Floating UI positional fallback; activates when `!supports.anchorPositioning`
- [ ] `index.js` — re-exports `supports`, `guard`; registers polyfills on module evaluation

#### 1-B · `tokens/` — Pure CSS, No JS

**Three-layer cascade. Source of truth. No build transformation required.**

Load order is import order. This order must never be violated:
`primitives/*` → `registered/*` → `semantic/*`

- [ ] `tokens/primitives/colors.css` — OKLCH palette. Brand 12-step, neutral 12-step, status scales.
  Perceptually uniform — equal numerical diff = equal perceptual diff.
- [ ] `tokens/primitives/spacing.css` — `--space-1` … `--space-32`. 4px base unit, rem-based.
- [ ] `tokens/primitives/typography.css` — Type scale (modular 1.25 ratio), weights,
  line-heights, letter-spacing, font-family stacks, fluid `clamp()` variants.
- [ ] `tokens/primitives/motion.css` — Duration scale: instant → slower. Easing curves incl. spring.
  `@media prefers-reduced-motion` overrides all durations to `0ms` here.
- [ ] `tokens/primitives/radius.css` — Border radius scale: none → full (9999px).
- [ ] `tokens/primitives/shadow.css` — Ambient + key light model. OKLCH alpha.
  Dark mode overrides increase opacity (shadows behave differently on dark).
- [ ] `tokens/primitives/zindex.css` — Named z-index: base → raised → dropdown → sticky →
  overlay → modal → popover → toast → tooltip.
- [ ] `tokens/registered/colors.css` — `@property` for animatable semantic colour tokens.
  `syntax: '<color>'; inherits: true;` — enables smooth theme transitions via CSS `transition` on `:root`.
- [ ] `tokens/registered/dimensions.css` — `@property` for animatable size/spacing tokens.
- [ ] `tokens/semantic/light.css` — `:root` defaults. Maps primitives to intent roles:
  `--color-surface-*`, `--color-content-*`, `--color-interactive-*`, `--color-feedback-*`, `--color-border-*`.
- [ ] `tokens/semantic/dark.css` — `[data-theme="dark"]` overrides. Same semantic names, different primitive refs.
  `@media prefers-color-scheme: dark` guard with `:not([data-theme="light"])`.
- [ ] `tokens/semantic/contrast.css` — `[data-theme="high-contrast"]` WCAG AAA overrides.
- [ ] `tokens/index.css` — Master import in strict dependency order.

#### 1-C · `styles/` — Cascade Layers + Base Reset

- [ ] `styles/layers.css` — `@layer reset, base, tokens, components, utilities, overrides;`
  Explicit layer order declared once. Lower = lower specificity.
- [ ] `styles/reset.css` — `@layer reset;` margin/padding zero, `box-sizing: border-box`,
  `list-style: none`, `img/video/canvas display: block`.
- [ ] `styles/base.css` — `@layer base;` `:root` font stack, body background + color tokens,
  `::selection`, `focus-visible` ring from `--color-border-focus` token.
- [ ] `styles/index.css` — `@import './layers.css'; @import './reset.css'; @import './base.css';`

#### Phase 1 Token Cascade Contract

```
Primitive              Semantic                    Component
─────────────────────  ──────────────────────────  ──────────────────────────────────
--color-brand-500   ←── --color-interactive      ←── --btn-bg: var(--color-interactive)
--color-brand-600   ←── --color-interactive-hover ←── --btn-bg-h
```

Theme switch: `[data-theme="dark"]` on `<html>` → semantic tokens update via CSS cascade
→ registered `@property` colours transition smoothly (250ms) → component tokens auto-update
→ no component code, no re-render, no class toggling per element.

---

### Phase 2 — Core APIs: Networking, Routing, State, Events

**Goal:** The four modules that all components and routes depend on.
Each is independently importable and tree-shakeable.

#### 2-A · `core/api/` — Networking

Every request passes through a composable pipeline. No request bypasses it.

- [ ] `pipeline.js` — Composable interceptor chain. Pure functions: receive request descriptor,
  return modified descriptor or response.
  Pipeline order: outbound interceptors → cache layer → network → response interceptors → consumer.
- [ ] `fetch.js` — Core fetch wrapper. `AbortSignal` timeout. Priority via `scheduler.postTask`.
  Authentication header injection. Correlation ID attachment.
- [ ] `retry.js` — Exponential backoff with jitter. Configurable max attempts.
  Only retries on transient failures (5xx, network errors). Never retries 4xx.
- [ ] `cache.js` — Cache API integration.
  Strategies: `cache-first` (shell assets), `network-first` (API), `stale-revalidate` (content).
- [ ] `stream.js` — `ReadableStream` consumption. NDJSON `TransformStream` pipeline.
  Backpressure handled automatically via Streams API `desiredSize`.
- [ ] `upload.js` — XHR-based (streaming fetch fallback). Progress events via `opts.onProgress`.
- [ ] `index.js` — Public surface:
  ```
  api.get(url, opts?)          → Promise<T>
  api.post(url, body, opts?)   → Promise<T>
  api.put(url, body, opts?)    → Promise<T>
  api.patch(url, body, opts?)  → Promise<T>
  api.delete(url, opts?)       → Promise<T>
  api.stream(url, opts?)       → AsyncIterable<Chunk>
  api.upload(url, file, opts?) → Promise<T>
  Options: signal, cache, retries, timeout, priority, interceptors[]
  ```

#### 2-B · `core/router/` — Client-Side Routing

Built on Navigation API + URLPattern. Zero third-party dependency for routing.

- [ ] `match.js` — URLPattern route table. Named capture groups, wildcards, optional segments.
  Returns `RouteMatch | null`. Also available in Service Worker context.
- [ ] `intercept.js` — `window.navigation` `navigate` event handler. `event.intercept()` lifecycle.
  Fires for all navigation types: push, replace, reload, traverse.
- [ ] `history.js` — History API fallback bridge. Activated via `guard.js` when `!supports.navigationAPI`.
- [ ] `outlet.js` — `<route-outlet>` custom element. Renders active route component into slot.
  Parent routes provide layout; child routes render into the outlet.
- [ ] `transitions.js` — `startViewTransition()` wrapper per `navigationType`.
  Reduced-motion guard. `view-transition-name` dynamic assignment for shared element transitions.
- [ ] `index.js` — Public surface:
  ```
  router.on(pattern, handler)     → Disposer
  router.navigate(url, state?)    → void
  router.replace(url, state?)     → void
  router.back()                   → void
  router.forward()                → void
  router.go(delta)                → void
  router.match(url)               → RouteMatch | null
  router.current()                → NavigationHistoryEntry
  router.entries()                → NavigationHistoryEntry[]
  router.canBack()                → boolean
  router.canForward()             → boolean
  ```

Route lifecycle:
1. `navigate` fires → router intercepts
2. Route matched → lazy `import()` if not cached
3. View Transition initiated via `startViewTransition()`
4. Route handler executes → DOM updated
5. Navigation commits → URL updated, history entry created
6. `navigatesuccess` fires

#### 2-C · `core/state/` — Reactive State

Proxy-based. Explicit subscriptions — no implicit tracking context (prevents tracking bugs).

- [ ] `store.js` — `Proxy`-based reactive store. `get`/`set` traps. Dependency tracking.
  Explicit named subscriptions. No mutable global tracking context.
- [ ] `derived.js` — Computed values with declared dependency lists. `WeakMap` memoisation.
  Invalidated and lazily recomputed when any dependency changes.
- [ ] `sync.js` — `BroadcastChannel` bridge. Channel name: `core:state-sync`.
  Typed message envelopes. Cross-tab state consistency.
- [ ] `persist.js` — IDB-backed persistence. Rehydration on init. Structural sharing on write.
- [ ] `index.js` — Public surface:
  ```
  state.create(initial)          → Store
  store.get(key)                 → value
  store.set(key, value)          → void
  store.update(path, fn)         → void
  store.subscribe(key, fn, sig?) → Disposer
  store.batch(fn)                → void
  store.derived(keys, computeFn) → ComputedValue
  store.snapshot()               → PlainObject
  store.hydrate(snapshot)        → void
  store.reset()                  → void
  ```

State topology:
- **URL state** — owned by router; survives reload; shareable; bookmarkable
- **Session state** — in-memory; lost on reload; managed by this layer
- **Persistent local** — IndexedDB; survives sessions; managed by storage layer
- **Remote state** — always a materialised view; never source of truth on client

#### 2-D · `core/events/` — Event Bus

For system-level cross-cutting concerns only. Not for component-to-component (use state layer).

- [ ] `bus.js` — Named `EventTarget` singleton. Exported for: auth state changes,
  connectivity status, user preference updates.
- [ ] `delegate.js` — Delegation factory. `closest()` traversal. Composed path support.
  Works across shadow DOM boundaries with `{ composed: true }`.
- [ ] `once.js` — One-shot listener with automatic cleanup.
- [ ] `index.js` — Public surface:
  ```
  events.emit(type, detail?)              → void
  events.on(type, fn, signal?)            → void
  events.once(type)                       → Promise<Event>
  events.delegate(root, sel, type, fn, sig?) → Disposer
  ```

---

### Phase 3 — Core Infrastructure: Storage, Workers, UI Base, Security, Offline, Animations

**Goal:** Complete the `core/*` namespace. After this phase, all browser primitives
are wrapped. Elements can be built.

#### 3-A · `core/storage/` — Unified Storage Façade

Never call `indexedDB.open()` or `caches.open()` directly in application code. Always go through this layer.

- [ ] `idb.js` — IndexedDB Promise wrapper. Versioned schema migrations via `onupgradeneeded`.
  Transaction management. Cursor iteration. Index queries.
  Schema changes are sequential from current version to target — never skip versions.
- [ ] `opfs.js` — Origin Private File System. Synchronous access via dedicated Worker only
  (synchronous API is not available on main thread). `BroadcastChannel` invalidation on write.
  3–4× faster than IndexedDB for raw byte throughput.
- [ ] `cache.js` — Cache API façade. Keyed by Request. Strategy helpers. TTL support.
- [ ] `quota.js` — `StorageManager.estimate()` + `persist()`. Eviction guard at 80% usage.
  Triggers: notify user, prune LRU records, re-request persistent storage.
- [ ] `lru.js` — Bounded in-memory LRU cache. Configurable max size. TTL variant.
  `WeakRef` variant for GC-eligible cached values (for object-keyed caches).
- [ ] `index.js` — Routes to IDB / Cache / OPFS by data type and declared tier.
  Reads served from in-memory LRU before hitting IDB. Writes journalled before async apply.
  Public surface:
  ```
  storage.get(key)              → Promise<T | null>
  storage.set(key, value)       → Promise<void>
  storage.delete(key)           → Promise<void>
  storage.query(store, query)   → Promise<T[]>
  storage.list(prefix?)         → Promise<string[]>
  storage.clear()               → Promise<void>
  storage.estimate()            → Promise<StorageEstimate>
  storage.persist()             → Promise<boolean>
  ```

#### 3-B · `core/workers/` — Worker Lifecycle

- [ ] `pool.js` — Dedicated worker pool. Bounded by `hardwareConcurrency - 1` (min 2).
  Priority queue: `user-blocking` > `user-visible` > `background`.
  Unhealthy workers replaced automatically. Task routing by declared type.
- [ ] `dedicated.js` — `Worker` lifecycle. Typed messaging. `Transferable` support for zero-copy.
  `MessageChannel` per request for concurrent in-flight requests without conflation.
- [ ] `shared.js` — `SharedWorker` lifecycle. `MessagePort` registry per named connection.
  Holds single WebSocket connection shared across all tabs.
- [ ] `broadcast.js` — `BroadcastChannel` factory. Typed message envelopes.
  `channel.close()` called in `disconnectedCallback`.
- [ ] `locks.js` — Web Locks API. Exclusive / shared modes. `AbortSignal` timeout.
  RAII model — lock released when async callback settles.
  Use cases: IDB write coordination, token refresh, OPFS, leader election.
- [ ] `offscreen.js` — `OffscreenCanvas` transfer lifecycle. Worker rendering context handover.
- [ ] `index.js` — Public surface:
  ```
  workers.run(scriptUrl, task, opts?)   → Promise<T>   (pool dispatch)
  workers.shared(name)                  → SharedConnection
  workers.lock(name, fn, opts?)         → Promise<T>
  workers.broadcast(channel, msg)       → void
  workers.subscribe(channel, fn, sig?)  → Disposer
  workers.offscreen(canvas, workerUrl)  → OffscreenHandle
  ```

#### 3-C · `core/ui/` — Component Base and Scheduling

**This is the most critical module. Every element extends it.**

- [ ] `base.js` — `HTMLElement` base class all library elements extend.
  `connectedCallback`: creates `this.ctrl` (`AbortController`).
  `disconnectedCallback`: calls `this.ctrl.abort()` — single call tears down all subscriptions.
  All subscriptions receive `{ signal: this.ctrl.signal }`. Pattern is not optional.
- [ ] `schedule.js` — `scheduler.postTask` wrapper. Priority enum.
  `scheduler.yield()` for long-running chunked work.
  `requestAnimationFrame` wrapper for DOM-visible mutations only.
  `setTimeout` fallback when `!supports.schedulerPostTask`.
- [ ] `observe.js` — Observer factories with `AbortSignal` cleanup:
  ```
  ui.observe.resize(el, fn, sig?)         → Disposer
  ui.observe.intersection(el, fn, sig?)   → Disposer
  ui.observe.mutation(el, fn, sig?)       → Disposer
  ui.observe.performance(types, fn, sig?) → Disposer
  ```
- [ ] `transitions.js` — `startViewTransition()` wrapper. Fallback direct-invoke.
  `prefers-reduced-motion` guard. `skipTransition()` on motion preference.
- [ ] `template.js` — `<template>` clone factory. Parse-once, clone-many pattern.
  Significantly faster than `innerHTML` for multiply-instantiated components.
- [ ] `define.js` — `customElements.define` wrapper. Duplicate-registration guard.
  Dev-mode warning on unknown element access.
- [ ] `index.js` — Public surface:
  ```
  ui.define(tag, Class)                 → void
  ui.schedule(fn, priority?)            → Promise<void>
  ui.scheduleFrame(fn)                  → void
  ui.transition(fn, names?, opts?)      → Promise<ViewTransition>
  ui.template(strings)                  → DocumentFragment
  ui.observe.resize(el, fn, sig?)       → Disposer
  ui.observe.intersection(el, fn, sig?) → Disposer
  ui.observe.mutation(el, fn, sig?)     → Disposer
  ui.observe.performance(types, fn)     → Disposer
  ```

Component memory lifecycle (enforced via `base.js`):
1. **Allocation** — constructor: Shadow DOM, template clone, local state. No subscriptions.
2. **Active** — `connectedCallback`: all subscriptions via `this.ctrl.signal`.
3. **Cleanup** — `disconnectedCallback`: `this.ctrl.abort()` → all subscriptions removed.

#### 3-D · `core/security/`

- [ ] `crypto.js` — All `SubtleCrypto` operations async, off-main-thread.
  AES-GCM encrypt/decrypt with fresh IV per operation. HMAC-SHA-256 signing.
  ECDSA/Ed25519. PBKDF2 with ≥600k iterations. `crypto.randomUUID()`.
  Non-extractable `CryptoKey` by default. Keys stored in IDB as structured-cloneable objects.
- [ ] `sanitize.js` — Sanitizer API when available; DOMPurify (~14 KB) fallback.
  Transparent swap via `guard.js`. Call sites never change. No `innerHTML` without this.
- [ ] `permissions.js` — Permissions API. Query/request/watch all gated features.
  `PermissionStatus` `change` event integration with `AbortSignal`.
- [ ] `index.js` — Public surface:
  ```
  security.hash(data, algo?)          → Promise<ArrayBuffer>
  security.hmac(key, data)            → Promise<ArrayBuffer>
  security.sign(key, data)            → Promise<ArrayBuffer>
  security.verify(key, data, sig)     → Promise<boolean>
  security.encrypt(key, data)         → Promise<ArrayBuffer>
  security.decrypt(key, data)         → Promise<ArrayBuffer>
  security.generateKey(algo, usage[]) → Promise<CryptoKey>
  security.permission(name)           → Promise<PermissionState>
  security.sanitize(html, config?)    → string
  security.uuid()                     → string
  ```

#### 3-E · `core/offline/`

Background Sync is Chromium-only. The manual `online` event fallback is always required.

- [ ] `bridge.js` — `postMessage` channel to Service Worker. Typed messages.
  Request/response pattern via `MessageChannel`.
- [ ] `queue.js` — IDB-backed operation queue. Idempotency keys. Timestamps. Retry count.
  Max-retry limit. Dead-letter store for exhausted ops.
  Entry shape: `{ type, payload, key, created, retries, maxRetries }`.
- [ ] `sync.js` — Background Sync registration via `registration.sync.register()`.
  Manual `online` event fallback for Firefox/Safari.
  Connectivity-restored triggers `syncNow()` when tab is open.
- [ ] `connectivity.js` — Reliable HEAD probe to known endpoint.
  `navigator.onLine` is unreliable (interface up ≠ internet up).
  Declares connectivity change only on probe result change. Debounced.
- [ ] `index.js` — Public surface:
  ```
  offline.isOnline()               → boolean
  offline.onChange(fn, signal?)    → Disposer
  offline.queue(operation)         → Promise<void>
  offline.syncNow()                → Promise<SyncResult>
  offline.pending()                → Promise<number>
  offline.clear()                  → Promise<void>
  offline.swReady()                → Promise<ServiceWorkerRegistration>
  offline.send(type, payload)      → Promise<T>
  ```

#### 3-F · `core/animations/`

- [ ] `registry.js` — Named animation store. Keyframe + timing definitions registered once.
  Applied to any element by name. Avoids repeating keyframe objects across components.
- [ ] `play.js` — `element.animate()` wrapper. `cancel()`/`finish()` with `fill:'forwards'` cleanup.
  Stagger: same animation across element array with configurable delay.
  Memory-safe: `cancel()` called in `disconnectedCallback`. `fill:'forwards'` held until `commitStyles()`.
- [ ] `scroll.js` — `ScrollTimeline` + `ViewTimeline` constructors.
  Feature-detected: `'ScrollTimeline' in window`. Graceful static fallback.
  Do NOT polyfill with JS — defeats the performance rationale (compositor-thread execution).
- [ ] `waapi.js` — WAAPI helpers. Timeline. Playback control. Compositing via `composite` option.
- [ ] `index.js` — Public surface:
  ```
  animations.register(name, keyframes, opts)         → void
  animations.play(el, keyframesOrName, opts?)        → Animation
  animations.cancel(anim)                            → void
  animations.finish(anim)                            → Promise<void>
  animations.stagger(els, name, opts?, delay?)       → Promise<void>
  animations.transition(fn, names?, opts?)           → Promise<ViewTransition>
  animations.scroll(el, keyframes, opts)             → Animation
  animations.view(el, keyframes, opts)               → Animation
  ```

---

### Phase 4 — Service Worker Utilities (`sw/`)

**The library does not ship a Service Worker. It ships composable utilities
that the consuming project's `sw.js` imports. All modules use ES Module syntax;
SW must be registered with `{ type: 'module' }`.**

- [ ] `strategies.js` — Caching strategy classes:
  - `CacheFirst(cacheName, opts)` — shell assets; unconditional cache serve
  - `NetworkFirst(cacheName, opts)` — API responses; 4s timeout then cache fallback
  - `StaleRevalidate(cacheName, opts)` — content; serve cache + background revalidate
  - `NetworkOnly` — no caching
  - `CacheOnly` — offline-only resources
  - `OfflineFallback(fallbackUrl)` — serve fallback URL when network fails
- [ ] `routes.js` — `URLPattern`-based fetch handler routing for SW fetch event.
  `router.register(pattern, strategy)` → used in `fetch` event.
  Same `URLPattern` API available in Service Worker context as in main thread.
- [ ] `queue.js` — Background Sync request queue. Serialize/deserialize. Retry on reconnect.
- [ ] `expire.js` — TTL-based cache expiry. Cleanup on `activate` event.
- [ ] `install.js` — Install phase helpers:
  - `precache(cacheName, urls[])` — cache shell + critical assets
  - `prefetchFallback(url)` — cache offline fallback page
- [ ] `activate.js` — Activate phase helpers:
  - `pruneStale(currentCacheName)` — delete all caches not matching name
  - `claim()` — `clients.claim()` wrapper
  - `enableNavPreload(registration)` — navigation preload activation
    (eliminates SW startup latency from navigation critical path: 10–100ms savings)
- [ ] `sync.js` — Background Sync handler utilities:
  - `replayQueue(idbKey)` — read IDB queue, replay in order
  - `requeueFailed(entry)` — increment retry; dead-letter at limit
- [ ] `push.js` — Push API + Web Push VAPID:
  - `subscribe(reg, vapidKey)` → `PushSubscription`
  - `notify(title, opts)` — `Notification` API wrapper
- [ ] `index.js` — re-exports all SW utilities

**Consumer SW skeleton (`sw.js`, `{ type: 'module' }`):**
```js
import { CacheFirst, NetworkFirst, StaleRevalidate } from 'lib/sw/strategies.js';
import { router }       from 'lib/sw/routes.js';
import { precache }     from 'lib/sw/install.js';
import { pruneStale, claim, enableNavPreload } from 'lib/sw/activate.js';
import { replayQueue }  from 'lib/sw/sync.js';

const CACHE = 'shell-v1';
self.addEventListener('install',  e => e.waitUntil(precache(CACHE, ['/index.html', '/bootstrap.js'])));
self.addEventListener('activate', e => e.waitUntil(pruneStale(CACHE).then(claim).then(() => enableNavPreload(registration))));

const fetch$ = router();
fetch$.register('/api/*',    new NetworkFirst('api-v1'));
fetch$.register('/assets/*', new CacheFirst('assets-v1'));
fetch$.register('*',         new StaleRevalidate('content-v1'));
self.addEventListener('fetch', e => fetch$.handle(e));
self.addEventListener('sync',  e => { if (e.tag === 'pending') e.waitUntil(replayQueue('pending-ops')); });
```

---

### Phase 5 — Custom Elements (`elements/`)

**All elements extend `core/ui/base.js`. Shadow DOM is the rendering boundary.
CSS lives in the element's Shadow DOM `<template>` as an inline `<style>` block.
No external CSS fetch. No `adoptedStyleSheets` manipulation. No JS CSS injection.
Component tokens reference semantic tokens only — never primitive tokens directly.**

#### Element Authoring Contract

```js
// Every element follows this exact pattern:

import { Base } from '../base.js';

const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      /* Component tokens — reference semantic tokens only */
      --btn-bg:     var(--color-interactive);
      --btn-color:  var(--color-neutral-0);
      --btn-radius: var(--radius-md);
    }
    button {
      background:   var(--btn-bg);
      color:        var(--btn-color);
      border-radius: var(--btn-radius);
      transition: background-color var(--duration-fast) var(--ease-out);
    }
    :host(:state(loading)) button { opacity: 0.6; pointer-events: none; }
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
    super.connectedCallback(); // creates this.ctrl
    this.shadowRoot.querySelector('button')
      .addEventListener('click', this.#click, { signal: this.ctrl.signal });
  }

  disconnectedCallback() {
    super.disconnectedCallback(); // this.ctrl.abort()
  }

  #click = () => {
    this.dispatchEvent(new CustomEvent('activate', { bubbles: true, composed: true }));
  };
}

customElements.define('ui-button', Button);
```

#### 5-A · `elements/primitives/` (8 elements)

- [ ] `button.js` — `<ui-button>` `formAssociated`; `:state(loading)`, `:state(disabled)`
- [ ] `icon.js` — `<ui-icon>` SVG sprite reference; `aria-hidden` default; size tokens
- [ ] `badge.js` — `<ui-badge>` semantic token variants; size scale
- [ ] `avatar.js` — `<ui-avatar>` image with fallback initials; `aria-label` required
- [ ] `divider.js` — `<ui-divider>` `<hr>` equivalent; orientation; spacing tokens
- [ ] `text.js` — `<ui-text>` semantic type scale; `as=""` attr for element choice
- [ ] `link.js` — `<nav-link>` router-aware; `aria-current`; external indicator; dispatches cancelable `external` click event for warnings
- [ ] `spinner.js` — `<ui-spinner>` WAAPI rotation; `prefers-reduced-motion` aware;
  `aria-label` required; `role="progressbar"` indeterminate

#### 5-B · `elements/forms/` (9 elements)

All form elements: `static formAssociated = true` + `attachInternals()`.
Use `ElementInternals` for ARIA and validity. Never wrap native inputs.

- [ ] `input.js` — `<ui-input>` type variants; validation; error slot
- [ ] `textarea.js` — `<ui-textarea>` auto-resize via `ResizeObserver`
- [ ] `select.js` — `<ui-select>` `appearance: base-select`; Popover API dropdown;
  Anchor Positioning placement; cross-browser fallback
- [ ] `checkbox.js` — `<ui-checkbox>` tri-state; `:state(checked)`, `:state(indeterminate)`
- [ ] `radio.js` — `<ui-radio>` group coordination via shared name attribute
- [ ] `toggle.js` — `<ui-toggle>` switch pattern; `:state(on)`
- [ ] `field.js` — `<ui-field>` label + control wrapper; error/hint slots; required marker
- [ ] `upload.js` — `<ui-upload>` drag/drop + file picker; progress events from `core/api`
- [ ] `form.js` — `<ui-form>` wraps native `<form>`; submit via `core/api` pipeline;
  offline queue integration via `core/offline`

#### 5-C · `elements/overlay/` (6 elements)

All overlays use Popover API or native `<dialog>` for top-layer rendering.
No z-index hacks. No userland focus traps (native `<dialog>` provides this).

- [ ] `dialog.js` — `<ui-dialog>` native `<dialog>`; `showModal()`; `returnValue`;
  `::backdrop`; Escape dismissal; focus trap at zero cost
- [ ] `popover.js` — `<ui-popover>` Popover API; top-layer; light dismiss; auto-close stack;
  implicit anchor; Anchor Positioning placement
- [ ] `tooltip.js` — `<ui-tooltip>` popover hint; implicit anchor via `popovertarget`;
  `:hover` + `:focus-visible` trigger; no JS positioning
- [ ] `menu.js` — `<ui-menu>` popover + anchor; `role="menu"`; roving `tabindex`;
  keyboard nav: arrows, Home, End, typeahead
- [ ] `drawer.js` — `<ui-drawer>` dialog-backed slide panel; focus trap via native `<dialog>`
- [ ] `sheet.js` — `<ui-sheet>` bottom sheet; drag-to-dismiss gesture

#### 5-D · `elements/feedback/` (5 elements)

- [ ] `alert.js` — `<ui-alert>` `role="alert"` live region; severity: info/success/warning/error
- [ ] `toast.js` — `<ui-toast>` top-layer popover; auto-dismiss timeout;
  queue management; `role="status"`
- [ ] `progress.js` — `<ui-progress>` determinate + indeterminate; WAAPI animation;
  `role="progressbar"`; `aria-valuenow/min/max`
- [ ] `skeleton.js` — `<ui-skeleton>` `content-visibility` placeholder; shape variants; shimmer
- [ ] `empty.js` — `<ui-empty>` empty-state composition: icon, heading, body, action slots

#### 5-E · `elements/data/` (5 elements)

- [ ] `table.js` — `<ui-table>` `content-visibility: auto` rows; sort; multi-select;
  sticky header via `position: sticky`; keyboard nav; ARIA grid
- [ ] `list.js` — `<ui-list>` `IntersectionObserver`-driven progressive render;
  `content-visibility: auto` + `contain-intrinsic-size`
- [ ] `card.js` — `<ui-card>` slots: header / body / footer / media;
  container query breakpoints; elevation via `--card-shadow`
- [ ] `stat.js` — `<ui-stat>` metric display; label + value + delta
- [ ] `empty.js` — `<ui-empty>` (shared with feedback/ or separate instance)

#### 5-F · `elements/navigation/` (5 elements)

- [ ] `nav.js` — `<ui-nav>` `<nav>` landmark; `aria-current` driven by `core/router` state
- [ ] `tabs.js` — `<ui-tabs>` ARIA tablist; keyboard nav; panel slots; URL sync option
- [ ] `breadcrumb.js` — `<ui-breadcrumb>` built from `router.entries()`; `aria-label`; structured data
- [ ] `pagination.js` — `<ui-pagination>` page range; `router.navigate()` integration
- [ ] `steps.js` — `<ui-steps>` wizard / multi-step indicator

#### 5-G · `elements/layout/` (8 elements)

- [ ] `app.js` — `<ui-app>` application shell; router outlet; theme attribute host
- [ ] `header.js` — `<ui-header>` sticky top bar; slots: start / center / end
- [ ] `sidebar.js` — `<ui-sidebar>` collapsible; `ResizeObserver` width tracking; CSS snap
- [ ] `stack.js` — `<ui-stack>` flex column/row layout primitive; gap tokens
- [ ] `grid.js` — `<ui-grid>` CSS Grid layout; container query breakpoints
- [ ] `split.js` — `<ui-split>` resizable two-panel layout
- [ ] `scroll.js` — `<ui-scroll>` scroll container; snap; overflow control
- [ ] `surface.js` — `<ui-surface>` elevation surface; token-driven shadow

---

### Phase 6 — Supporting Infrastructure: Tests, Types, Docs

#### 6-A · `tests/` — Real Browser Testing

No build step. Runs in real Chromium via `@web/test-runner` with Playwright.
No jsdom — Shadow DOM and Custom Element lifecycle callbacks require a real browser.

- [ ] `tests/setup.js` — mock SW registration, in-memory IDB, fake timers
- [ ] `tests/core/platform/supports.test.js`
- [ ] `tests/core/api/fetch.test.js`, `retry.test.js`, `stream.test.js`
- [ ] `tests/core/router/match.test.js`, `intercept.test.js`
- [ ] `tests/core/state/store.test.js`, `derived.test.js`, `sync.test.js`
- [ ] `tests/core/events/bus.test.js`
- [ ] `tests/core/storage/idb.test.js`, `lru.test.js`
- [ ] `tests/core/workers/pool.test.js`, `locks.test.js`
- [ ] `tests/core/security/crypto.test.js`, `sanitize.test.js`
- [ ] `tests/core/offline/queue.test.js`, `connectivity.test.js`
- [ ] `tests/core/animations/play.test.js`
- [ ] `tests/elements/primitives/button.test.js`
- [ ] `tests/elements/forms/field.test.js`, `form.test.js`
- [ ] `tests/elements/overlay/dialog.test.js`, `popover.test.js`
- [ ] `tests/elements/navigation/tabs.test.js`

Testing strategy:
- **Unit** — pure state logic (store, router matching, utils) → Node.js, no browser
- **Component** — each Custom Element in real browser: attributes, events, slots, Shadow DOM, ARIA
- **Integration** — route-level composition via Playwright: full stack incl. SW, IDB, network
- **Visual** — screenshot comparison via Playwright: Shadow DOM isolation makes these stable

#### 6-B · `types/` — TypeScript Declarations

Hand-authored or generated via `custom-elements-manifest`. One `.d.ts` per source module.

- [ ] `types/core/platform/supports.d.ts`
- [ ] `types/core/api/index.d.ts`
- [ ] `types/core/router/index.d.ts`
- [ ] `types/core/state/index.d.ts`
- [ ] `types/core/events/index.d.ts`
- [ ] `types/core/storage/index.d.ts`
- [ ] `types/core/workers/index.d.ts`
- [ ] `types/core/ui/index.d.ts`
- [ ] `types/core/security/index.d.ts`
- [ ] `types/core/offline/index.d.ts`
- [ ] `types/core/animations/index.d.ts`
- [ ] `types/elements/` — one `.d.ts` per element; declares properties, events, slots, CSS parts
- [ ] `types/index.d.ts` — full library re-export

#### 6-C · `docs/` — Per-Module Markdown

Mirrors `src/`. One markdown file per module. Documents:
- Purpose and architectural position
- Public API surface with examples
- AbortSignal and cleanup contract
- Known browser gaps and polyfill strategy

---

## Phase Summary

| Phase | Deliverable | Depends On |
|---|---|---|
| 1 | `core/platform/` + `tokens/` + `styles/` | nothing |
| 2 | `core/api/` + `core/router/` + `core/state/` + `core/events/` | Phase 1 |
| 3 | `core/storage/` + `core/workers/` + `core/ui/` + `core/security/` + `core/offline/` + `core/animations/` | Phase 2 |
| 4 | `sw/` (Service Worker utilities) | Phase 3 |
| 5 | `elements/*` (46 custom elements) | Phase 3 |
| 6 | `tests/` + `types/` + `docs/` | Phases 1–5 |

**Phase 5 can begin in parallel with Phase 4.** Both depend only on Phase 3.

---

## Critical Constraints (Non-Negotiable)

1. **No bundler required** by the consumer. Each module independently fetchable and cacheable.
2. **CSS is CSS.** `tokens/` and `styles/` contain `.css` files only. No JS wrappers.
3. **No element imports another element.** Cross-element composition is the consumer's concern.
4. **All subscriptions take `AbortSignal`.** All ongoing relationships return a `Disposer`.
5. **`fill: 'forwards'` always followed by `commitStyles()` + `cancel()`.** GPU memory leak otherwise.
6. **`VideoFrame.close()` must be called explicitly.** GC does not reclaim GPU memory.
7. **No `innerHTML` with user content without `security.sanitize()`.** No exceptions.
8. **Upward imports are a hard architectural error.** `core` never imports from `elements`.
9. **No side effects in module scope.** Modules must be safe to import without observable effects.
10. **`disconnectedCallback` must call `super.disconnectedCallback()`.** The only cleanup guarantee.

---

*End of plan.md — Native-First Web Platform Implementation Plan*
