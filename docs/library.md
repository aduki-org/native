# library.md

## Native-First Web Platform Library — Complete Structure

**Version:** 1.0
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
- `tokens/*`        — three-layer OKLCH design token CSS system
- `styles/*`        — cascade layer declarations, base reset
- `sw/*`            — caching strategies, routing, sync utilities for the consumer's SW

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

```bash
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
│   ├── tokens/
│   │   ├── primitives/
│   │   ├── semantic/
│   │   └── registered/
│   │
│   ├── styles/
│   │
│   └── sw/
│
├── dist/                    — built output; mirrors src/
├── tests/                   — mirrors src/ structure
├── types/                   — JSDoc .d.ts declarations; mirrors src/
└── docs/                    — per-module markdown; mirrors src/
```

---

## src/core/ — Platform Abstraction and Internal APIs

All `core/*` modules are independently importable. Tree-shakeable.
Import graph is directed downward only — no upward coupling, no peer coupling without
explicit declaration. Circular imports within any core module are a hard architectural error.

```
core/
│
├── platform/
│   ├── supports.js          — all feature-detection booleans; lazy, cached on first access
│   │                            supports.navigationAPI        → boolean
│   │                            supports.urlPattern           → boolean
│   │                            supports.viewTransitions      → boolean
│   │                            supports.popoverAPI           → boolean
│   │                            supports.anchorPositioning    → boolean
│   │                            supports.schedulerPostTask    → boolean
│   │                            supports.schedulerYield       → boolean
│   │                            supports.declarativeShadowDOM → boolean
│   │                            supports.sanitizerAPI         → boolean
│   │                            supports.backgroundSync       → boolean
│   │                            supports.speculationRules     → boolean
│   │                            supports.contentVisibility    → boolean
│   │                            supports.customStatePseudo    → boolean
│   │                            supports.fileSystemPickers    → boolean
│   │                            supports.importMaps           → boolean
│   │                            supports.cssModules           → boolean
│   │                            supports.scrollTimeline       → boolean
│   │
│   ├── guard.js             — feature-gate wrapper; loads polyfill on first use;
│   │                          call sites receive same API regardless of native/polyfill path
│   │
│   ├── polyfills/
│   │   ├── urlpattern.js    — path-to-regexp fallback; ~1.5 KB; activates when !supports.urlPattern
│   │   ├── navigation.js    — History API bridge; ~2 KB; activates when !supports.navigationAPI
│   │   ├── popover.js       — Popover API polyfill; activates when !supports.popoverAPI
│   │   ├── shadow.js        — Declarative Shadow DOM; <1 KB; activates when !supports.declarativeShadowDOM
│   │   └── anchor.js        — Floating UI positional fallback; ~3.5 KB; activates when !supports.anchorPositioning
│   │
│   └── index.js             — re-exports supports, guard; polyfills registered here on module evaluation
│
│
├── api/
│   ├── pipeline.js          — composable interceptor chain; outbound → cache → network → response
│   ├── fetch.js             — core fetch wrapper; AbortSignal timeout; priority via scheduler
│   ├── retry.js             — exponential backoff; jitter; configurable max attempts
│   ├── cache.js             — Cache API integration; cache-first / network-first / stale-revalidate strategies
│   ├── stream.js            — ReadableStream consumption; NDJSON TransformStream pipeline; backpressure
│   ├── upload.js            — XHR-based; progress events; cross-browser (streaming fetch fallback)
│   └── index.js
│   │
│   │   Public surface:
│   │     api.get(url, opts?)          → Promise<T>
│   │     api.post(url, body, opts?)   → Promise<T>
│   │     api.put(url, body, opts?)    → Promise<T>
│   │     api.patch(url, body, opts?)  → Promise<T>
│   │     api.delete(url, opts?)       → Promise<T>
│   │     api.stream(url, opts?)       → AsyncIterable<Chunk>
│   │     api.upload(url, file, opts?) → Promise<T>       (progress via opts.onProgress)
│   │
│   │   Options: signal, cache (strategy name), retries, timeout, priority, interceptors[]
│
│
├── router/
│   ├── match.js             — URLPattern table; named capture groups; wildcard; optional segments
│   ├── intercept.js         — Navigation API navigate event handler; event.intercept() lifecycle
│   ├── history.js           — History API fallback bridge; activated via guard.js when !supports.navigationAPI
│   ├── outlet.js            — <route-outlet> custom element; renders active route component into slot
│   ├── transitions.js       — startViewTransition wrapper per navigationType; reduced-motion guard
│   └── index.js
│   │
│   │   Public surface:
│   │     router.on(pattern, handler)       → Disposer
│   │     router.navigate(url, state?)      → void
│   │     router.replace(url, state?)       → void
│   │     router.back()                     → void
│   │     router.forward()                  → void
│   │     router.go(delta)                  → void
│   │     router.match(url)                 → RouteMatch | null
│   │     router.current()                  → NavigationHistoryEntry
│   │     router.entries()                  → NavigationHistoryEntry[]
│   │     router.canBack()                  → boolean
│   │     router.canForward()               → boolean
│
│
├── state/
│   ├── store.js             — Proxy-based reactive store; get/set traps; dependency tracking;
│   │                          explicit named subscriptions (no implicit tracking context)
│   ├── derived.js           — computed values with declared dependency lists; WeakMap memoisation;
│   │                          invalidated and lazily recomputed when any dependency changes
│   ├── sync.js              — BroadcastChannel bridge; cross-tab state consistency;
│   │                          channel name: 'core:state-sync'; typed message envelopes
│   └── index.js
│   │
│   │   Public surface:
│   │     state.create(initial)           → Store
│   │     store.get(key)                  → value
│   │     store.set(key, value)           → void
│   │     store.subscribe(key, fn, sig?)  → Disposer
│   │     store.derived(keys, computeFn)  → ComputedValue
│   │     store.snapshot()                → PlainObject
│   │     store.hydrate(snapshot)         → void
│   │     store.reset()                   → void
│
│
├── events/
│   ├── bus.js               — named EventTarget singleton; exported for system-level cross-cutting
│   │                          events only (auth change, connectivity, preference updates);
│   │                          not for component-to-component — use state layer for that
│   ├── delegate.js          — delegation factory; closest() traversal; composed path support;
│   │                          works across shadow DOM boundaries with { composed: true }
│   └── index.js
│   │
│   │   Public surface:
│   │     events.emit(type, detail?)         → void
│   │     events.on(type, fn, signal?)       → void
│   │     events.once(type)                  → Promise<Event>
│   │     events.delegate(root, sel, type, fn, sig?) → Disposer
│
│
├── storage/
│   ├── idb.js               — IndexedDB Promise wrapper; versioned schema migrations via onupgradeneeded;
│   │                          transaction management; cursor iteration; index queries
│   ├── opfs.js              — Origin Private File System; synchronous access via dedicated Worker;
│   │                          BroadcastChannel invalidation signal on write
│   ├── cache.js             — Cache API facade; keyed by Request; strategy helpers
│   ├── quota.js             — StorageManager estimate() + persist(); eviction guard;
│   │                          threshold alerts at 80% usage; prune LRU on approach
│   ├── lru.js               — in-memory bounded LRU cache; configurable max size; TTL support;
│   │                          WeakRef variant for GC-eligible cached values
│   └── index.js
│   │
│   │   Public surface:
│   │     storage.get(key)                → Promise<T | null>
│   │     storage.set(key, value)         → Promise<void>
│   │     storage.delete(key)             → Promise<void>
│   │     storage.query(store, query)     → Promise<T[]>
│   │     storage.estimate()              → Promise<StorageEstimate>
│   │     storage.persist()               → Promise<boolean>
│   │
│   │   Routes operations to IDB / Cache / OPFS based on data type and declared tier.
│   │   Reads served from in-memory LRU before hitting IDB.
│   │   Writes journalled for durability before async application.
│
│
├── workers/
│   ├── pool.js              — dedicated worker pool; bounded by (hardwareConcurrency - 1);
│   │                          min 2, configurable max; task routing by declared type;
│   │                          priority queue: user-blocking > user-visible > background;
│   │                          unhealthy workers replaced automatically
│   ├── shared.js            — shared worker lifecycle; MessagePort registry per named connection
│   ├── locks.js             — Web Locks API; exclusive / shared modes; AbortSignal timeout;
│   │                          RAII model — lock released when async callback settles;
│   │                          use cases: IDB write coord, token refresh, OPFS, leader election
│   ├── channel.js           — BroadcastChannel factory; typed message envelopes; cleanup on signal;
│   │                          channel.close() called in disconnectedCallback
│   ├── offscreen.js         — OffscreenCanvas transfer lifecycle; Worker rendering context handover
│   └── index.js
│   │
│   │   Public surface:
│   │     workers.run(scriptUrl, task, opts?)    → Promise<T>      (pool dispatch)
│   │     workers.shared(name)                  → SharedConnection
│   │     workers.lock(name, fn, opts?)          → Promise<T>
│   │     workers.broadcast(channel, msg)        → void
│   │     workers.subscribe(channel, fn, sig?)   → Disposer
│   │     workers.offscreen(canvas, workerUrl)   → OffscreenHandle
│
│
├── ui/
│   ├── base.js              — HTMLElement base class all library elements extend;
│   │                          connectedCallback: creates this.ctrl (AbortController);
│   │                          disconnectedCallback: calls this.ctrl.abort();
│   │                          all subscriptions receive { signal: this.ctrl.signal }
│   ├── schedule.js          — scheduler.postTask wrapper; priority enum; scheduler.yield for chunks;
│   │                          rAF wrapper for DOM-visible mutations only;
│   │                          setTimeout fallback when !supports.schedulerPostTask
│   ├── observe.js           — observer factories with AbortSignal cleanup:
│   │                            ui.observe.resize(el, fn, sig?)        → Disposer
│   │                            ui.observe.intersection(el, fn, sig?)  → Disposer
│   │                            ui.observe.mutation(el, fn, sig?)      → Disposer
│   │                            ui.observe.performance(types, fn, sig?) → Disposer
│   ├── transition.js        — startViewTransition wrapper; fallback direct-invoke;
│   │                          prefers-reduced-motion guard; skipTransition on motion preference
│   ├── template.js          — <template> clone factory; parse-once, clone-many pattern;
│   │                          faster than innerHTML for multiply-instantiated components
│   ├── define.js            — customElements.define wrapper; duplicate-registration guard;
│   │                          dev-mode warning on unknown element access
│   └── index.js
│   │
│   │   Public surface:
│   │     ui.define(tag, Class)                 → void
│   │     ui.schedule(fn, priority?)            → Promise<void>
│   │     ui.scheduleFrame(fn)                  → void          (rAF only)
│   │     ui.transition(fn, names?, opts?)      → Promise<ViewTransition>
│   │     ui.template(strings)                  → DocumentFragment  (tagged template)
│   │     ui.observe.resize(el, fn, sig?)       → Disposer
│   │     ui.observe.intersection(el, fn, sig?) → Disposer
│   │     ui.observe.mutation(el, fn, sig?)     → Disposer
│   │     ui.observe.performance(types, fn)     → Disposer
│
│
├── security/
│   ├── crypto.js            — SubtleCrypto wrappers; all operations async, off-main-thread;
│   │                          AES-GCM encrypt/decrypt with fresh IV per operation;
│   │                          HMAC-SHA-256 signing; ECDSA/Ed25519; PBKDF2 with ≥600k iterations;
│   │                          crypto.randomUUID(); non-extractable CryptoKey default;
│   │                          keys storable in IDB as structured-cloneable objects
│   ├── sanitize.js          — Sanitizer API native when available; DOMPurify (~14 KB) fallback;
│   │                          transparent swap via guard.js; call sites never change
│   ├── permissions.js       — Permissions API; query/request/watch for all gated features;
│   │                          permission.change EventTarget integration with AbortSignal
│   └── index.js
│   │
│   │   Public surface:
│   │     security.hash(data, algo?)           → Promise<ArrayBuffer>
│   │     security.hmac(key, data)             → Promise<ArrayBuffer>
│   │     security.sign(key, data)             → Promise<ArrayBuffer>
│   │     security.verify(key, data, sig)      → Promise<boolean>
│   │     security.encrypt(key, data)          → Promise<ArrayBuffer>
│   │     security.decrypt(key, data)          → Promise<ArrayBuffer>
│   │     security.generateKey(algo, usage[])  → Promise<CryptoKey>
│   │     security.permission(name)            → Promise<PermissionState>
│   │     security.sanitize(html, config?)     → string
│   │     security.uuid()                      → string           (crypto.randomUUID())
│
│
├── offline/
│   ├── queue.js             — IndexedDB-backed operation queue; idempotency keys; timestamp;
│   │                          retry count; max-retry limit; dead-letter store for exhausted ops;
│   │                          entries: { type, payload, key, created, retries, maxRetries }
│   ├── sync.js              — Background Sync registration via registration.sync.register();
│   │                          manual online-event fallback for Firefox/Safari;
│   │                          connectivity-restored triggers syncNow() when tab is open
│   ├── probe.js             — reliable connectivity detection; HEAD request to known endpoint;
│   │                          navigator.onLine is unreliable (interface up ≠ internet up);
│   │                          declares connectivity change only on probe result change
│   └── index.js
│   │
│   │   Public surface:
│   │     offline.isOnline()                          → boolean
│   │     offline.onChange(fn, signal?)               → Disposer
│   │     offline.queue(operation)                    → Promise<void>
│   │     offline.syncNow()                           → Promise<SyncResult>
│   │     offline.pending()                           → Promise<number>
│   │     offline.clear()                             → Promise<void>
│   │     offline.swReady()                           → Promise<ServiceWorkerRegistration>
│   │     offline.send(type, payload)                 → Promise<T>   (main → SW message)
│
│
└── animations/
    ├── registry.js          — named animation store; keyframe + timing definitions registered once;
    │                          applied to any element by name; avoids repeating keyframe objects
    ├── play.js              — element.animate wrapper; cancel/finish with fill:'forwards' cleanup;
    │                          stagger: same animation across element array with configurable delay;
    │                          memory-safe: cancel() called in disconnectedCallback
    ├── scroll.js            — ScrollTimeline + ViewTimeline constructors; scroll-driven utilities;
    │                          feature-detected; graceful static fallback when !supports.scrollTimeline
    └── index.js

        Public surface:
          animations.register(name, keyframes, opts)        → void
          animations.play(el, keyframesOrName, opts?)       → Animation
          animations.cancel(anim)                           → void
          animations.finish(anim)                           → Promise<void>
          animations.stagger(els, keyframesOrName, opts?, delay?) → Promise<void>
          animations.transition(fn, names?, opts?)          → Promise<ViewTransition>
          animations.scroll(el, keyframes, opts)            → Animation   (ScrollTimeline)
          animations.view(el, keyframes, opts)              → Animation   (ViewTimeline)
```

---

## src/elements/ — Custom Elements

Every element extends `core/ui/base.js`. Shadow DOM is the rendering boundary.
Styles cross the shadow boundary only via CSS custom properties — the design token bridge.
Component tokens namespace with the element name to prevent collisions.
`ElementInternals` used for ARIA delegation and Custom State Pseudo-Class (`:state()`).
`FormAssociated` used for all form-participating elements.
Folder carries the domain. File carries the element concept. Neither repeats the other.

```
elements/
│
├── base.js                  — shared element authoring utilities re-exported from core/ui/base.js;
│                              import from here not from core directly (library internal boundary)
│
├── primitives/
│   ├── button.js            — <ui-button>     FormAssociated; :state(loading); :state(disabled)
│   ├── badge.js             — <ui-badge>      semantic token variants; size scale
│   ├── icon.js              — <ui-icon>       SVG sprite reference; aria-hidden default; size tokens
│   ├── text.js              — <ui-text>       semantic type scale; as="" attr for element choice
│   ├── divider.js           — <ui-divider>    <hr> equivalent; orientation; spacing tokens
│   └── link.js              — <ui-link>       router-aware; aria-current; external indicator
│
├── forms/
│   ├── field.js             — <ui-field>      label + control wrapper; error/hint slots; required
│   ├── input.js             — <ui-input>      FormAssociated; ElementInternals; type variants
│   ├── select.js            — <ui-select>     appearance:base-select; Popover API dropdown;
│   │                                          Anchor Positioning placement; cross-browser fallback
│   ├── checkbox.js          — <ui-checkbox>   tri-state; FormAssociated; :state(checked/:indeterminate)
│   ├── toggle.js            — <ui-toggle>     switch pattern; FormAssociated; :state(on)
│   ├── textarea.js          — <ui-textarea>   auto-resize via ResizeObserver; FormAssociated
│   ├── upload.js            — <ui-upload>     drag/drop + file picker; progress events from core/api
│   └── form.js              — <ui-form>       wraps native <form>; submit via core/api pipeline hook;
│                                              offline queue integration via core/offline
│
├── overlay/
│   ├── dialog.js            — <ui-dialog>     native <dialog>; showModal(); focus trap at zero cost;
│   │                                          returnValue; ::backdrop; Escape dismissal
│   ├── popover.js           — <ui-popover>    Popover API; top-layer; light dismiss; auto-close stack;
│   │                                          implicit anchor; Anchor Positioning fallback
│   ├── tooltip.js           — <ui-tooltip>    popover hint; implicit anchor via popovertarget;
│   │                                          :hover + :focus-visible trigger; no JS positioning
│   └── menu.js              — <ui-menu>       popover + anchor; role="menu"; roving tabindex;
│                                              keyboard nav: arrows, Home, End, typeahead
│
├── feedback/
│   ├── alert.js             — <ui-alert>      role="alert" live region; severity: info/success/warning/error
│   ├── toast.js             — <ui-toast>      top-layer popover; auto-dismiss timeout;
│   │                                          queue management; role="status"
│   ├── spinner.js           — <ui-spinner>    WAAPI rotation; prefers-reduced-motion aware;
│   │                                          aria-label required; role="progressbar" indeterminate
│   ├── skeleton.js          — <ui-skeleton>   content-visibility placeholder; shape variants
│   ├── empty.js             — <ui-empty>      empty-state composition: icon, heading, body, action slots
│   └── progress.js          — <ui-progress>   determinate + indeterminate; WAAPI animation;
│                                              role="progressbar"; aria-valuenow/min/max
│
├── data/
│   ├── table.js             — <ui-table>      content-visibility:auto rows; sort; multi-select;
│   │                                          sticky header via CSS position:sticky; keyboard nav
│   ├── list.js              — <ui-list>       IntersectionObserver-driven progressive render;
│   │                                          content-visibility:auto + contain-intrinsic-size
│   ├── card.js              — <ui-card>       slots: header / body / footer / media; container query;
│   │                                          elevation tokens via --card-shadow
│   └── chart.js             — <ui-chart>      OffscreenCanvas delegate; worker-rendered via core/workers;
│                                              no third-party chart dependency
│
├── navigation/
│   ├── nav.js               — <ui-nav>        <nav> landmark; aria-current driven by core/router state
│   ├── tabs.js              — <ui-tabs>       ARIA tablist; keyboard nav; panel slots; URL sync option
│   ├── breadcrumb.js        — <ui-breadcrumb> built from router.entries(); aria-label; structured data
│   └── pagination.js        — <ui-pagination> page range; router.navigate() integration; aria-label
│
└── layout/
    ├── app.js               — <ui-app>        application shell; router outlet; theme attribute host
    ├── header.js            — <ui-header>     top navigation bar; sticky; slots: start/center/end
    ├── sidebar.js           — <ui-sidebar>    collapsible; ResizeObserver width tracking; CSS snap
    ├── drawer.js            — <ui-drawer>     dialog-backed slide panel; focus trap via native dialog
    ├── grid.js              — <ui-grid>       CSS Grid layout; container query breakpoints
    └── stack.js             — <ui-stack>      flex column/row layout primitive; gap tokens
```

---

## src/tokens/ — Design Token CSS

Three-layer architecture. Source of truth is DTCG JSON.
Style Dictionary v4 transforms DTCG JSON → CSS output.
Primitives feed semantic. Semantic feeds registered. Registered enables animation.
`index.css` imports all layers in strict dependency order.

```
tokens/
│
├── primitives/
│   ├── colors.css           — OKLCH palette; brand (12-step), neutral (12-step), status scales;
│   │                          perceptually uniform — equal numerical diff = equal perceptual diff
│   ├── spacing.css          — rem-based scale; 4px base unit; --space-px through --space-32
│   ├── typography.css       — type scale (modular 1.25 ratio); weights; line-heights;
│   │                          letter-spacing; font-family stacks; fluid clamp() variants
│   ├── motion.css           — duration scale: instant → slower; easing curves incl. spring;
│   │                          @media prefers-reduced-motion overrides all durations to 0ms here
│   ├── radius.css           — border radius scale: none → full (9999px)
│   ├── shadow.css           — elevation shadows; ambient + key light model; OKLCH alpha;
│   │                          dark mode overrides increase opacity (shadows behave differently on dark)
│   └── zindex.css           — named z-index scale: base → raised → dropdown → sticky →
│                              overlay → modal → popover → toast → tooltip
│
├── semantic/
│   ├── light.css            — :root defaults; maps primitives to intent roles:
│   │                          --color-surface-*, --color-content-*, --color-interactive-*,
│   │                          --color-feedback-*, --color-border-*
│   ├── dark.css             — [data-theme="dark"] overrides; same semantic names, different primitive refs;
│   │                          @media prefers-color-scheme: dark guard with :not([data-theme="light"])
│   └── contrast.css         — [data-theme="high-contrast"] WCAG AAA overrides
│
├── registered/
│   ├── colors.css           — @property for animatable semantic colour tokens;
│   │                          syntax: '<color>'; inherits: true;
│   │                          enables smooth theme transitions via CSS transition on :root
│   └── dimensions.css       — @property for animatable size/spacing tokens;
│                              syntax: '<length>'; enables animated layout transitions
│
├── dtcg/
│   └── tokens.json          — W3C DTCG format (stable 2025.10); source for Style Dictionary;
│                              Figma / Penpot / Tokens Studio export target;
│                              all token values with $value, $type, $description
│
└── index.css                — master import; strict order:
                                 primitives/* → registered/* → semantic/*
                               registered must precede semantic (same property names need
                               @property declared before semantic values reference them)
```

---

## src/styles/ — Global Stylesheet Layers

```
styles/
├── reset.css                — @layer reset; margin/padding zero; box-sizing border-box;
│                              list-style none; img/video/canvas display block
├── base.css                 — @layer base; :root font stack; body background + color tokens;
│                              ::selection; focus-visible ring from --color-border-focus token
├── layers.css               — @layer declaration order for consuming projects to import:
│                              @layer reset, base, tokens, components, utilities, overrides
│                              (Shadow DOM has its own cascade scope — layers here are doc-level only)
└── index.css                — imports reset → base → layers in order
```

---

## src/sw/ — Service Worker Utilities

The library does not ship a Service Worker. It ships composable utilities that the
consuming project's `sw.js` imports and uses. All modules use ES Module syntax;
SW must be registered with `{ type: 'module' }`.

```
sw/
├── strategies.js            — caching strategy implementations:
│   │                            CacheFirst(cacheName, opts)
│   │                            NetworkFirst(cacheName, opts)         (configurable timeout, default 4s)
│   │                            StaleRevalidate(cacheName, opts)
│   │                            CacheThenNetwork(cacheName, opts)     (two-pass; app handles both responses)
│   │                            OfflineFallback(fallbackUrl)
│
├── routes.js                — URLPattern-based fetch handler routing for the SW;
│   │                          same URLPattern API available in Service Worker context;
│   │                          router.register(pattern, strategy) → used in fetch event
│
├── install.js               — install phase helpers:
│   │                            precache(cacheName, urls[])        — cache shell + critical assets
│   │                            prefetchFallback(url)               — cache offline fallback page
│
├── activate.js              — activate phase helpers:
│   │                            pruneStale(currentCacheName)        — delete all caches not matching name
│   │                            claim()                             — clients.claim() wrapper
│   │                            enableNavPreload(registration)      — navigation preload activation
│
├── sync.js                  — Background Sync handler utilities:
│   │                            replayQueue(idbKey)                 — read IDB queue, replay in order
│   │                            requeueFailed(entry)                — increment retry; dead-letter at limit
│
├── push.js                  — Push API + Web Push VAPID utilities:
│   │                            subscribe(reg, vapidKey)            → PushSubscription
│   │                            notify(title, opts)                 — Notification API wrapper
│
└── index.js                 — re-exports all SW utilities
```

---

## dist/ — Build Output

Mirrors `src/`. Consumed directly via Import Map in the consuming project.
No bundler required by the consumer. Each module is independently fetchable and cacheable.

```
dist/
├── core/
│   ├── platform/
│   │   ├── supports.js
│   │   ├── guard.js
│   │   ├── polyfills/
│   │   └── index.js
│   ├── api/            (index.js + individual files)
│   ├── router/
│   ├── state/
│   ├── events/
│   ├── storage/
│   ├── workers/
│   ├── ui/
│   ├── security/
│   ├── offline/
│   └── animations/
│
├── elements/
│   ├── primitives/
│   ├── forms/
│   ├── overlay/
│   ├── feedback/
│   ├── data/
│   ├── navigation/
│   └── layout/
│
├── tokens/
│   ├── primitives/
│   ├── semantic/
│   ├── registered/
│   ├── dtcg/
│   └── index.css
│
├── styles/
│   ├── reset.css
│   ├── base.css
│   ├── layers.css
│   └── index.css
│
├── sw/
│   ├── strategies.js
│   ├── routes.js
│   ├── install.js
│   ├── activate.js
│   ├── sync.js
│   ├── push.js
│   └── index.js
│
└── index.js                 — full library re-export (CDN single-file entry point)
```

---

## tests/ — Test Modules

No build step. Runs in a real browser via `web-test-runner`.
Every assertion against a real DOM, real Custom Element lifecycle, real browser APIs.
`setup.js` bootstraps: mock SW registration, in-memory IDB, fake timers.
Mirrors `src/` one-to-one.

```
tests/
├── setup.js
├── core/
│   ├── platform/
│   │   └── supports.test.js
│   ├── api/
│   │   ├── fetch.test.js
│   │   ├── retry.test.js
│   │   └── stream.test.js
│   ├── router/
│   │   ├── match.test.js
│   │   └── intercept.test.js
│   ├── state/
│   │   ├── store.test.js
│   │   ├── derived.test.js
│   │   └── sync.test.js
│   ├── events/
│   │   └── bus.test.js
│   ├── storage/
│   │   ├── idb.test.js
│   │   └── lru.test.js
│   ├── workers/
│   │   ├── pool.test.js
│   │   └── locks.test.js
│   ├── security/
│   │   ├── crypto.test.js
│   │   └── sanitize.test.js
│   ├── offline/
│   │   ├── queue.test.js
│   │   └── probe.test.js
│   └── animations/
│       └── play.test.js
└── elements/
    ├── primitives/
    │   ├── button.test.js
    │   └── input.test.js     (in forms/ but tested here by element name)
    ├── forms/
    │   ├── field.test.js
    │   └── form.test.js
    ├── overlay/
    │   ├── dialog.test.js
    │   └── popover.test.js
    └── navigation/
        └── tabs.test.js
```

---

## types/ — TypeScript Declarations

Hand-authored or generated via `custom-elements-manifest`.
One `.d.ts` file per source module. Mirrors `src/`.

```
types/
├── core/
│   ├── platform/
│   │   └── supports.d.ts
│   ├── api/index.d.ts
│   ├── router/index.d.ts
│   ├── state/index.d.ts
│   ├── events/index.d.ts
│   ├── storage/index.d.ts
│   ├── workers/index.d.ts
│   ├── ui/index.d.ts
│   ├── security/index.d.ts
│   ├── offline/index.d.ts
│   └── animations/index.d.ts
├── elements/
│   └── (one .d.ts per element file; declares properties, events, slots, CSS parts)
└── index.d.ts
```

---

## Import Map — Consumer Project Setup

The consuming project declares one Import Map and gets access to the entire library.

```json
{
  "imports": {
    "lib/core/":     "/node_modules/platform/dist/core/",
    "lib/elements/": "/node_modules/platform/dist/elements/",
    "lib/tokens/":   "/node_modules/platform/dist/tokens/",
    "lib/styles/":   "/node_modules/platform/dist/styles/",
    "lib/sw/":       "/node_modules/platform/dist/sw/"
  },
  "integrity": {
    "/node_modules/platform/dist/core/router/index.js": "sha384-...",
    "/node_modules/platform/dist/core/state/index.js":  "sha384-..."
  }
}
```

Consumer code:

```js
// Import exactly what you need — tree-shakeable at the module graph level
import { api }      from 'lib/core/api/index.js';
import { router }   from 'lib/core/router/index.js';
import { store }    from 'lib/core/state/index.js';
import { events }   from 'lib/core/events/index.js';
import { storage }  from 'lib/core/storage/index.js';
import { workers }  from 'lib/core/workers/index.js';
import { security } from 'lib/core/security/index.js';
import { offline }  from 'lib/core/offline/index.js';
import { animations } from 'lib/core/animations/index.js';
import { ui }       from 'lib/core/ui/index.js';

// Elements self-register on import; no further setup needed
import 'lib/elements/primitives/button.js';
import 'lib/elements/overlay/dialog.js';
import 'lib/elements/forms/input.js';
```

Consumer CSS:

```html
<link rel="stylesheet" href="/node_modules/platform/dist/tokens/index.css">
<link rel="stylesheet" href="/node_modules/platform/dist/styles/index.css">
```

Consumer Service Worker (`sw.js`, registered with `{ type: 'module' }`):

```js
import { CacheFirst, NetworkFirst, StaleRevalidate } from 'lib/sw/strategies.js';
import { router }  from 'lib/sw/routes.js';
import { precache } from 'lib/sw/install.js';
import { pruneStale, claim, enableNavPreload } from 'lib/sw/activate.js';
import { replayQueue } from 'lib/sw/sync.js';

const CACHE = 'shell-v1';

self.addEventListener('install', e => {
  e.waitUntil(precache(CACHE, ['/index.html', '/bootstrap.js']));
});

self.addEventListener('activate', e => {
  e.waitUntil(pruneStale(CACHE).then(claim).then(() => enableNavPreload(registration)));
});

const fetch$ = router();
fetch$.register('/api/*',    new NetworkFirst('api-v1'));
fetch$.register('/assets/*', new CacheFirst('assets-v1'));
fetch$.register('*',         new StaleRevalidate('content-v1'));
self.addEventListener('fetch', e => fetch$.handle(e));

self.addEventListener('sync', e => {
  if (e.tag === 'pending') e.waitUntil(replayQueue('pending-ops'));
});
```

---

## Module Layer Boundary Rules

```
Consumer Application
      ↓ imports from
lib/elements/*     (Custom Elements)
      ↓ imports from
lib/core/*         (Platform API modules)
      ↓ imports from
lib/core/platform/ (feature detection, polyfill guards)
      ↓ delegates to
Browser Runtime APIs
```

Downward only. A `elements/forms/input.js` may not import from `core/storage/idb.js`
directly — it goes through `core/storage/index.js`. An element may not call `indexedDB.open()`
directly — it calls `storage.get()`. No element imports from another element.

---

## Component Authoring Contract

```js
// elements/primitives/button.js

import { Base } from '../base.js';

// Template parsed once at module evaluation; cloned per instance — zero re-parse cost
const tpl = document.createElement('template');
tpl.innerHTML = `
  <style>
    :host {
      display: inline-flex;
      /* Semantic token bridge — crosses shadow boundary via CSS custom property inheritance */
      --btn-bg:      var(--color-interactive);
      --btn-bg-h:    var(--color-interactive-hover);
      --btn-bg-a:    var(--color-interactive-active);
      --btn-color:   var(--color-neutral-0);
      --btn-radius:  var(--radius-md);
      --btn-size:    var(--font-size-sm);
    }
    button {
      background:    var(--btn-bg);
      color:         var(--btn-color);
      border-radius: var(--btn-radius);
      font-size:     var(--btn-size);
      padding-block:  var(--space-2);
      padding-inline: var(--space-4);
      transition:
        background-color var(--duration-fast) var(--ease-out),
        transform        var(--duration-fast) var(--ease-out);
    }
    button:hover:not(:disabled)  { background: var(--btn-bg-h); }
    button:active:not(:disabled) { background: var(--btn-bg-a); transform: scale(0.98); }

    /* Custom State Pseudo-Class — no class-list manipulation needed */
    :host(:state(loading)) button { opacity: 0.6; pointer-events: none; }
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
    super.connectedCallback();        // creates this.ctrl (AbortController)
    this.shadowRoot
      .querySelector('button')
      .addEventListener('click', this.#click, { signal: this.ctrl.signal });
  }

  disconnectedCallback() {
    super.disconnectedCallback();     // this.ctrl.abort() — cleans up all signals at once
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
    // Upward communication via CustomEvent — bubbles + composed crosses shadow boundary
    this.dispatchEvent(new CustomEvent('activate', { bubbles: true, composed: true }));
  };
}

customElements.define('ui-button', Button);
```

---

## Token Cascade — Three Layers in Practice

```
Primitive            Semantic                  Component
──────────────────   ───────────────────────   ────────────────────────────────
--color-brand-500 ←─ --color-interactive   ←── --btn-bg: var(--color-interactive)
--color-brand-600 ←─ --color-interactive-hover ←── --btn-bg-h
--color-brand-300    (dark mode override)       component token auto-updates

Theme switch: set/remove [data-theme="dark"] on <html>
All semantic tokens update via the CSS cascade.
All registered @property colour tokens transition smoothly (250ms) — zero JS.
All component tokens that reference semantic tokens update automatically.
No component-level code needed. No re-render. No class toggling per element.
```

---

## Error Shape — Library-Wide

All errors from `core/*` normalise to this shape before reaching call sites.
Raw `DOMException` and `IDBRequestErrorEvent` objects never escape module boundaries.

```js
{
  code:        string,   // 'STORAGE_QUOTA' | 'NETWORK_TIMEOUT' | 'AUTH_EXPIRED' | ...
  message:     string,   // human-readable; not for display to end users
  cause:       Error,    // original browser API error
  context:     object,   // relevant metadata: key, url, operation
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
// later, in disconnectedCallback:
stop();

// Disposers are:
// - idempotent        — calling multiple times has no effect after the first
// - synchronous       — never return a Promise
// - composable        — collect in an array and call each at teardown

// When an AbortSignal is accepted as alternative to Disposer, prefer the signal.
// A single controller.abort() cleans up all subscriptions simultaneously.
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
Cached independently. Transparent to every call site.

---

## Naming Quick Reference

| Context                    | Rule                                  | Correct               | Wrong                          |
|----------------------------|---------------------------------------|-----------------------|--------------------------------|
| Core module folder         | one word                              | `core/router/`        | `core/clientrouter/`           |
| Core module file           | one concept word                      | `match.js`            | `routematch.js`                |
| Element folder             | one domain word                       | `forms/`              | `formcontrols/`                |
| Element file               | element concept, no domain prefix     | `forms/input.js`      | `forms/forminput.js`           |
| Custom element tag         | `ui-` + one word                      | `<ui-button>`         | `<ui-form-button>`             |
| SW utility file            | one concept                           | `strategies.js`       | `cachingstrategies.js`         |
| Token file                 | token category                        | `colors.css`          | `colorpalette.css`             |
| CSS custom property        | `--domain-concept`                    | `--color-interactive` | `--interactiveColor`           |
| CSS component token        | `--elementname-role`                  | `--btn-bg`            | `--button-background-color`    |
| JS public method           | one verb in context                   | `store.set()`         | `store.updateValue()`          |
| Boolean JS method          | adjective                             | `router.canBack()`    | `router.checkIfCanGoBack()`    |
| Feature detect boolean     | `supports.camelName`                  | `supports.urlPattern` | `supports.hasUrlPatternApi`    |
| Loop variable              | singular of collection                | `for (const el of els)` | `for (const element of elements)` |
| Two-word folder (forced)   | lowercase no separator, or split      | `sw/` or `offline/`   | `service-worker/`              |

---

*End of ui-library.md*
