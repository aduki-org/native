# Performance Changes — Native UI Framework
### Full-Stack Audit: JS Runtime · Router · Rust Tooling

> Compiled from code review of `all.text`, `all.rust`, and `all.router` plus live research.  
> Every item includes the exact file, the diagnosed bottleneck, the fix, and cross-layer notes where one change has implications in another area.  
> Severity: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## Layer 1 — JavaScript Runtime (`src/core/ui/`)

---

### R-01 🔴 Property getters call `getAttribute()` on every read

**File:** `src/core/ui/define/element.js` — `Object.defineProperty` loop

Every read of `el.count`, `el.disabled`, or any declared prop triggers a live DOM attribute lookup. On a component with 5 props updating at 60 fps, that is 300 forced DOM round-trips per second per instance. It also forces a layout flush if any CSS property depends on those attributes.

```js
// Current — DOM round-trip on every read
get() {
  const val = this.getAttribute(attrName);
  return config.type === Number ? Number(val) : val;
}
```

**Fix:** Introduce a `Symbol`-keyed backing field initialised in `constructor()`. The getter reads the field; only the setter and `attributeChangedCallback` touch the DOM.

```js
const storeKey = Symbol(key);

// constructor — set initial value
this[storeKey] = config.default ?? (config.type === Boolean ? false : null);

get() { return this[storeKey]; },
set(val) {
  if (this[storeKey] === val) return;
  this[storeKey] = val;
  // attribute sync + state update scheduling unchanged
}
```

**Cross-layer note:** The router reads props back via `currentChild[key] = value` in `orchestrator.js`. With backing fields this write path becomes a single fast assignment instead of triggering `setAttribute` → `attributeChangedCallback` → property write. Route param injection is materially faster.

---

### R-02 🔴 `passive: false` hardcoded on every root event listener

**File:** `src/core/ui/define/proxy.js` → `createEventDelegator` → `ensureListener`

```js
shadowRoot.addEventListener(eventType, rootListener, {
  signal: defaultSignal,
  capture,
  passive: false  // blocks scroll on ALL event types
});
```

Chrome DevTools marks any non-passive `touchstart`/`touchmove`/`wheel` listener as a scroll-blocking bottleneck. Setting it on every event type (including `click`, `input`, `keydown`) opts out of browser scroll optimisations unnecessarily.

**Fix:** Default to `passive: true`; let callers opt out when they genuinely need `preventDefault()`.

```js
shadowRoot.addEventListener(eventType, rootListener, {
  signal: defaultSignal,
  capture,
  passive: options?.passive !== false
});
```

---

### R-03 🟠 `scheduleFrame(rAF)` used for all prop updates regardless of visual need

**File:** `src/core/ui/define/element.js` update flush, `src/core/ui/schedule.js`

`requestAnimationFrame` fires ~16 ms before the next paint. Using it for non-visual state changes (ARIA updates, form validity, route param sync) adds a full frame of latency where a microtask or `scheduler.postTask` would be instant.

**Fix:** Add a `visual` hint to `spec.update`. Default is `false` (microtask). Components that genuinely repaint can opt into `rAF`.

```js
// element.js flush path
const flush = (spec.update?.visual === true)
  ? () => scheduleFrame(runUpdates)
  : () => queueMicrotask(runUpdates);
```

`schedule.js` already supports `scheduler.postTask` — use `priority: 'user-blocking'` for synchronous-looking UI responses (typing, button presses), `'user-visible'` for deferred rendering.

**Cross-layer note:** Route param injection (`orchestrator.js` → `currentChild[key] = value`) triggers `spec.update`. If those updates are scheduled on `rAF`, props visibly lag behind navigation. With microtask scheduling they commit in the same turn as `swapView`.

---

### R-04 🟠 MutationObserver always sets `subtree: true` and both `*OldValue` flags

**File:** `src/core/ui/define/proxy.js` → `computeWatchOptions`

```js
const options = {
  attributeOldValue: shouldObserveAttrs,   // allocates old-value memory per mutation
  characterDataOldValue: hasText || hasTree,
  subtree: true   // always on — fires for every DOM change anywhere in the shadow root
};
```

`subtree: true` fires for every DOM change inside the component, even when all active `watch` registrations target a single direct-element ref. The `*OldValue` flags allocate extra memory for every mutation record even when no handler uses the old value.

**Fix:** Tighten `computeWatchOptions` to reflect what active registrations actually need:

```js
const needsSubtree = [...registry.values()].some(r => r.selector !== null);
const needsAttrOld = [...registry.values()].some(r => r.kind === 'attr');
const needsTextOld = [...registry.values()].some(r => r.kind === 'text' || r.kind === 'tree');

return {
  attributes: shouldObserveAttrs,
  attributeOldValue: needsAttrOld,
  childList: hasKids || hasTree,
  characterData: hasText || hasTree,
  characterDataOldValue: needsTextOld,
  subtree: needsSubtree
};
```

---

### R-05 🟠 Per-instance HMR listeners on `window`

**File:** `src/core/ui/define/element.js` → `connectedCallback` HMR block

With 50 instances of `<ui-button>`, there are 50 `window` listeners all checking the same `styleUrl`. They fire serially on every CSS hot-reload event. `stylesheet.replaceSync(css)` only needs to run once per unique stylesheet — the shared `CSSStyleSheet` reference propagates the change to all shadow roots automatically.

**Fix:** Maintain a static `Map<styleUrl, CSSStyleSheet>` (already in `assetCache`) and a single `window` listener per unique URL. The per-instance listener adds zero benefit.

```js
// utils.js — register one global HMR handler per style URL
if (styleUrl && !hmrListeners.has(styleUrl)) {
  const handler = (e) => {
    if (e.detail.path === styleUrl || styleUrl.endsWith(e.detail.path)) {
      assetCache.get(styleUrl)?.replaceSync(e.detail.css);
    }
  };
  window.addEventListener('native:hmr:css', handler);
  hmrListeners.set(styleUrl, handler);
}
```

---

### R-06 🟠 `resourcesPromise` blocks first paint — no preload signal

**File:** `src/core/ui/define/utils.js` → `preloadResources`, `element.js` → `connectedCallback`

`preloadResources` starts fetching at `element()` registration time (good). But the component's `connectedCallback` still awaits the Promise, rendering nothing until stylesheets and templates resolve. On a cold HTTP/2 connection this can be 50–200 ms of invisible element.

**Fix (two levels):**

1. Add `<link rel="preload" as="fetch" crossorigin href="...">` for CSS and HTML template URLs in the document `<head>`, so the browser's preload scanner fetches them before any JS runs. Research confirms this measurably reduces TTFCP for adoptedStyleSheet-based components.

2. For inline `style`/`template` strings (no URL), `preloadResources` already returns synchronously — prioritise this path for critical components.

---

### R-07 🟡 Shadow root method monkey-patching in `installInvalidationHooks`

**File:** `src/core/ui/define/proxy.js` → `installInvalidationHooks`

```js
shadowRoot.replaceChildren = (...nodes) => {
  for (const cache of hooks.caches) cache.clear();
  return hooks.replaceChildren(...nodes);
};
```

Adding own-property methods that shadow the prototype bypasses V8 inline caching for those call sites on every component instance.

**Fix:** Instead of patching, add explicit `ctx.tags.clear()` calls in component code after structural DOM mutations. For automatic invalidation, reuse the existing `watch.kids` observer (one `MutationObserver` already exists per component) to trigger cache invalidation on `childList` changes at the shadow root — no method wrapping needed.

---

### R-08 🟡 `createRefs` runs N separate `querySelectorAll` calls

**File:** `src/core/ui/define/proxy.js` → `createRefs`

One `querySelectorAll` per ref name at mount time. For a 10-ref component instantiated 200 times, that is 2000 separate selector queries at startup.

**Fix:** Single pass — one `querySelectorAll('[ref]')` then map by attribute value:

```js
const all = shadowRoot.querySelectorAll('[ref]');
for (const node of all) {
  const name = node.getAttribute('ref');
  if (name && !refs[name]) refs[name] = node;
  else if (name && DEV) console.warn(`[Native UI] Duplicate ref "${name}"`);
}
```

O(DOM size) instead of O(refs × DOM size).

---

### R-09 🟡 `container.js` → `swapView` awaits `vt.finished` (full animation)

**File:** `src/core/ui/define/container.js`, `src/elements/route-container.js`

```js
const vt = this.startViewTransition({ callback: doSwap });
await vt.finished;  // blocks ~300 ms for animation
```

Awaiting `finished` prevents a second navigation from starting until the first animation completes. Fast taps, keyboard navigation, and programmatic `nav.to()` chains queue up.

**Fix:** Await `vt.ready` instead. `ready` resolves once snapshots are captured and the new DOM is live — the animation still runs but the container is free for the next navigation immediately.

```js
await vt.ready;  // free after snapshot, not after animation end
```

**Cross-layer note:** This change should be applied in both `container.js` (the `ui.element` integration) and `route-container.js` (the standalone `RouteContainer` base class). Both currently await `finished`.

---

### R-10 🟡 `TagsCache` — verify `oneCache` / `allCache` stay separate in hot paths

**File:** `src/core/ui/define/proxy.js` → `TagsCache`

The current implementation uses `this.oneCache` and `this.allCache` as separate `Map` instances. This is correct. However, the `prewarmTags` function populates only `oneCache`. If a component calls `tags.all('.btn')` before `tags.one('.btn')`, the `allCache` entry is independently correct — but the `oneCache` entry is `null` and never gets populated from `allCache`. This is not a bug but it means prewarm work may be wasted.

**Fix:** In `prewarm(selector, element)`, populate both caches when the element is a single match:

```js
prewarm(selector, element) {
  if (element) {
    this.oneCache.set(selector, element);
    // Don't populate allCache here — it needs the full NodeList
  }
}
```

The existing implementation is already safe. Document this clearly so future contributors don't accidentally merge the caches.

---

### R-11 🟡 `specRegistry` spec closure leaks — keep specs lean

**File:** `src/core/ui/define/state.js`

```js
export const specRegistry = new Map();  // never shrinks
```

Every `element()` or `container()` call adds an entry that lives for the page lifetime. Specs that close over large objects (module-level arrays, DOM nodes) prevent GC. This is especially problematic for page elements that are dynamically imported.

**Fix:** Document and enforce: `mount`, `update`, and `unmount` must be function references, not inline arrows closing over outer-module state. Keep the spec object itself small — no DOM refs, no large data structures at the spec level.

---

### R-12 🟢 `template.js` silently discards interpolated values

**File:** `src/core/ui/template.js`

```js
t.innerHTML = strings.join('');  // values silently dropped
```

**Fix:** Add a dev-only guard:

```js
if (DEV && values.length > 0) {
  console.warn('[ui.template] Interpolated values are ignored. Use refs for dynamic binding.');
}
```

---

## Layer 2 — Router (`src/core/router/`)

---

### RT-01 🔴 `match()` is called TWICE per navigation

**File:** `src/core/router/intercept.js` — both `handler()` and `TransitionController`

In `handler()`:
```js
const routeMatch = await match(destination.url);  // call 1
```

In `TransitionController` constructor:
```js
this.promise.then(async () => {
  const routeMatch = await match(this.url);  // call 2 — same URL, same result
```

Every `nav.to()` call runs full route matching twice: once inside the intercept handler, and again inside `TransitionController`. URLPattern `exec()` is not free — it compiles against the full URL including hostname.

**Fix:** Pass the already-resolved `routeMatch` result into `TransitionController` rather than re-matching:

```js
// In intercept.js — cache the result on the navigation event
const routeMatch = await match(destination.url);
// Store on event or pass to TransitionController
emit('found', { tag, params, url, direction, _match: routeMatch });
```

Or resolve the `TransitionController` result from the global `'found'`/`'notfound'` event instead of re-running `match`.

---

### RT-02 🔴 Guards run twice on every navigation in every browser

**File:** `src/core/router/intercept.js`

```js
async precommitHandler(controller) {
  for (const guardFn of guards) { ... }  // run 1
},
async handler() {
  // Comment says "Safari fallback" but there is no browser detection
  for (const guardFn of guards) { ... }  // run 2 — always executes
```

Guards execute twice on Chrome and Firefox, not just Safari. The code comment describes this as a Safari fallback but the double-execution is unconditional. Async guard functions (auth checks, token validation) make two network round-trips per navigation.

**Fix:** Track whether `precommitHandler` ran successfully, and skip the repeat in `handler()`:

```js
let precommitRan = false;

async precommitHandler(controller) {
  precommitRan = true;
  for (const guardFn of guards) { ... }
},

async handler() {
  // Only repeat for Safari, which skips precommitHandler
  if (!precommitRan) {
    for (const guardFn of guards) { ... }
  }
  // rest of handler
}
```

Or use a feature-detect for `precommitHandler` support (Chrome/Firefox only) rather than relying on execution order.

---

### RT-03 🔴 `match()` is async on every navigation — `getURLPattern()` adds microtask overhead

**File:** `src/core/router/match.js`, `src/core/router/sync/transport.js`

```js
async function getURLPattern() {
  if (!URLPatternClass) {
    URLPatternClass = await guard.urlPattern();  // polyfill guard
  }
  return URLPatternClass;
}

export async function match(url) {
  const Pattern = await getURLPattern();  // async on every call
  const targetUrl = new URL(url, ...);   // URL allocation on every call
```

`URLPattern` is **Baseline September 2025** — available in Chrome, Firefox, Safari, and Edge without polyfill. The `guard.urlPattern()` polyfill dance introduces an unnecessary `await` on every navigation for all modern browsers. `match()` could be synchronous once the Pattern class is resolved.

**Fix:** Pre-resolve `URLPatternClass` at module load time and make `match()` synchronous for the hot path:

```js
// Resolve once at module init — URLPattern is Baseline Sept 2025
let URLPatternClass = (typeof URLPattern !== 'undefined')
  ? URLPattern
  : null;  // null triggers async polyfill only if truly needed

export function matchSync(url) {
  if (!URLPatternClass) return null;  // fall back to async path
  const targetUrl = new URL(url, globalThis.location?.href || 'http://localhost');
  for (const route of routes) {
    if (!route.pattern) {
      route.pattern = new URLPatternClass(
        route.patternStr.startsWith('http') ? route.patternStr : { pathname: route.patternStr }
      );
    }
    const result = route.pattern.exec(targetUrl.href);
    if (result) return { route, tag: route.handler, params: result.pathname.groups || {} };
  }
  return null;
}
```

Same fix applies to `coordinateConnections` in `transport.js` — both files call `guard.urlPattern()` independently for the same result.

---

### RT-04 🟠 Route matching is O(n) linear scan

**File:** `src/core/router/match.js`

Every navigation iterates the entire `routes` array until a match is found. For an app with 80 routes, deeply nested patterns (e.g. `/admin/users/:id/settings`) are checked last every time.

**Fix — two levels:**

**Level 1 (low effort):** Sort routes at registration time by specificity — static paths first, parameterised paths next, wildcard patterns last. This ensures `/users/profile` matches before `/users/:id` and `/` matches before `*`.

**Level 2 (high effort, big apps):** Build a static-segment prefix trie. Look up the first path segment (`/users` → trie node) to get a subset of patterns, then run `URLPattern.exec` only on that subset. For 80 routes with typical path distributions this reduces average comparisons from 40 to ~3.

---

### RT-05 🟠 `transitions.run()` wraps `emit('found', ...)` in a document-level view transition

**File:** `src/core/router/intercept.js`, `src/core/router/transitions.js`

```js
await transitions.run(async () => {
  // This calls emit('found'), which calls orchestrator.js
  // which calls container.swapView()
  // which runs ANOTHER view transition inside the container
});
```

`transitions.run` always uses `document.startViewTransition`. If the container element runs `element.startViewTransition` (its Strategy 1), the page has two nested transitions: the document-level outer one from the router and the element-scoped inner one from the container. This causes undefined layering behaviour and double-captures.

**Fix:** `transitions.run` in the router should be a **no-op wrapper** — it should just call `updateDOM()` directly. The container owns all visual transition responsibility. The router's job is navigation lifecycle management, not animation:

```js
// transitions.js — simplified to pure lifecycle wrapper
export const transitions = {
  async run(updateDOM) {
    await updateDOM();  // Container handles its own view transitions
  }
};
```

If router-level transitions are desired for cross-container page changes (e.g. full navigations with no container), add a flag: `transitions.run(fn, { scope: 'document' | 'container' })`.

---

### RT-06 🟠 `container.js` MutationObserver watches `document.body` with `subtree: true`

**File:** `src/core/router/container.js` → `ensureObserver`

```js
observer.observe(document.body, { childList: true, subtree: true });
```

This fires on every DOM change anywhere in the body. For standard DOM element containers (not custom elements), this is the fallback. But once started, it never stops observing even if all tracked selectors have been found.

**Fix:** Disconnect the observer once all `observedSelectors` have been resolved:

```js
// In the MutationObserver callback
const allResolved = [...observedSelectors].every(s => containerNodeMap.get(s)?.deref());
if (allResolved) {
  observer.disconnect();
  observer = null;
}
```

Also scope the observe target more narrowly when possible — if tracked selectors always live inside a known root element, observe that root instead of `document.body`.

---

### RT-07 🟠 `TransitionController` uses a dynamic `import('./container.js')` on every `nav.to()`

**File:** `src/core/router/intercept.js` → `TransitionController` constructor

```js
const { getContainer } = await import('./container.js');
```

`container.js` is already statically imported at the top of `intercept.js`. This dynamic `import()` inside `TransitionController` is redundant, adds module resolution overhead, and returns the same cached module anyway.

**Fix:** Remove the dynamic import and use the statically-imported `getContainer` from the top-level import:

```js
// Already at the top of intercept.js:
import { getContainer } from './container.js';

// Remove from TransitionController — use the static import directly
if (!getContainer(routeMatch.route.meta.container)) { ... }
```

---

### RT-08 🟠 Route elements not lazy-loaded — all page components evaluate at startup

**File:** `src/core/ui/define/element.js` → `element()` with `spec.url`

```js
if (spec.url) {
  router.register(spec.url, tag, meta);
}
```

When `ui.element('page-x', { url: '/page-x', ... })` is called, the module containing that page's logic is immediately evaluated. If 20 page elements are imported at the top of the app's entry point, all 20 execute their registration, fetch their stylesheets, and prewarm their templates — even for pages the user may never visit.

**Fix:** Use dynamic `import()` in route `register()` calls. Pass a factory function as the handler instead of the string tag name:

```js
// Route registration with lazy factory
router.register('/page-x', () => import('./elements/page-x.js').then(() => 'page-x'));
```

In `match.js`, if `route.handler` is a function, call it to get the tag (with the module loaded as a side effect):

```js
const tag = typeof route.handler === 'function' ? await route.handler() : route.handler;
```

This is the equivalent of Angular's `loadComponent` and Vue Router's `() => import(...)` — the page module only loads when its route is first matched.

---

### RT-09 🟡 `coordinateConnections` re-runs URLPattern on every `navigatesuccess`

**File:** `src/core/router/sync/transport.js`, triggered via dynamic import in `intercept.js`

```js
window.navigation.addEventListener('navigatesuccess', () => {
  import('./sync/index.js').then(({ coordinateConnections }) => {
    coordinateConnections(url);
  });
});
```

`coordinateConnections` creates a `new URL()` and iterates all registered connection patterns on every navigation success. The dynamic `import()` here resolves from cache but still involves module system overhead. `transport.js` and `match.js` also each independently call `guard.urlPattern()`.

**Fix:**
1. Pre-import `sync/index.js` statically in `intercept.js` — it is already needed.
2. Share the `URLPatternClass` between `match.js` and `transport.js` via a shared `platform/pattern.js` singleton.
3. Cache the last-matched `url` to skip `coordinateConnections` if the URL hasn't changed (relevant for `navigate` calls that resolve to the same path).

---

### RT-10 🟡 `setupTabSync` broadcasts every navigation — no deduplication guard

**File:** `src/core/router/sync/tab.js`

```js
window.navigation.addEventListener('navigatesuccess', () => {
  if (isSyncing) return;  // only prevents own echoes
  channel.postMessage({ type: 'sync-navigate', url: entry.url, state });
});
```

Every navigation success broadcasts to all open tabs, including navigations triggered by programmatic `router.replace()` calls that don't need cross-tab sync (e.g., URL param updates, scroll restoration). There is also no deduplication if two tabs navigate to the same URL near-simultaneously — each broadcasts back to the other.

**Fix:** Add a debounce and a same-URL guard:

```js
let lastBroadcastUrl = null;

// In navigatesuccess handler:
if (entry.url === lastBroadcastUrl) return;
lastBroadcastUrl = entry.url;
channel.postMessage({ type: 'sync-navigate', url: entry.url });
```

On the receiving side, the `currentUrl === url` check already handles the echo — but adding the sender-side dedup halves the total messages.

---

### RT-11 🟡 `orchestrator.js` `router.on('found', ...)` listener has no cleanup

**File:** `src/core/ui/define/orchestrator.js`

```js
export function initOrchestrator() {
  if (typeof window !== 'undefined') {
    router.on('found', async ({ tag, params, direction }) => {
      // ...
    });
  }
}
```

`router.on()` returns a disposer function but the orchestrator discards it. `initOrchestrator()` is called once from `src/core/ui/define/index.js`. If the function is ever called again (test environments, HMR module reload), a second listener accumulates, causing double mounts on navigation.

**Fix:** Store and expose the disposer:

```js
let disposeOrchestrator = null;

export function initOrchestrator() {
  disposeOrchestrator?.();  // clean up any previous listener
  disposeOrchestrator = router.on('found', async (event) => { ... });
}

export function destroyOrchestrator() {
  disposeOrchestrator?.();
  disposeOrchestrator = null;
}
```

---

### RT-12 🟡 `history.js` — `window.navigation` checked on every individual call

**File:** `src/core/router/history.js`

Each of the 10 exported functions begins:
```js
if (typeof window === 'undefined' || !window.navigation) return;
```

In a browser environment this check never fails, but it runs on every programmatic navigation call. More importantly, `!window.navigation` will become permanently `false` once Navigation API is confirmed (Baseline Jan 2026). This is a minor overhead but adds up in routing-heavy apps.

**Fix:** Resolve `nav` once at module load time:

```js
const nav = (typeof window !== 'undefined') ? window.navigation : null;

export function navigate(url, options = {}) {
  return nav?.navigate(url, options);
}
// etc.
```

---

### RT-13 🟡 Boot match runs in a microtask without `customElements.whenDefined` guard

**File:** `src/core/router/intercept.js` → `setup()` boot block

```js
Promise.resolve().then(async () => {
  const url = window.navigation.currentEntry?.url;
  const routeMatch = await match(url);
  if (routeMatch) emit('found', { tag, params, url });
});
```

This fires before the matched custom element's definition is guaranteed to be registered. `orchestrator.js` then calls `document.createElement(tag)` on the matched tag. If `element.js` for that tag hasn't executed yet (async dynamic import path), `createElement` creates an `HTMLUnknownElement`.

**Fix:** Add a `customElements.whenDefined(tag)` gate before mounting:

```js
// In orchestrator.js before document.createElement(tag)
if (!customElements.get(tag)) {
  await customElements.whenDefined(tag);
}
const pageEl = document.createElement(tag);
```

**Cross-layer note:** This pairs with **RT-08** (lazy-loading route elements). With lazy loading, `whenDefined` becomes the synchronisation point between route match and element availability.

---

### RT-14 🟢 `router.on()` listener `Set` has no iteration order guarantee under concurrent modification

**File:** `src/core/router/intercept.js` → `on()`, `emit()`

```js
for (const callback of listeners[type]) {
  try { callback(detail); } catch (err) { ... }
}
```

If a callback calls `router.on()` or returns a disposer that calls `listeners[type].delete()` during iteration, the `Set` iterator may skip or repeat entries. This is an edge case but real in test environments and HMR.

**Fix:** Snapshot before iteration:

```js
for (const callback of Array.from(listeners[type])) {
  try { callback(detail); } catch (err) { ... }
}
```

---

## Layer 3 — Rust Tooling (`tools/src/`)

---

### T-01 🔴 Sequential file walking — SWC parses serially

**File:** `tools/src/extract/runner.rs` → `pub fn run`

```rust
for entry in WalkDir::new(src_dir)  // single-threaded
    .into_iter()
    .filter_map(|e| e.ok())
{
    if path.extension() == "js" {
        parse_element_file(path);   // CPU-bound SWC parse, one at a time
    }
}
```

SWC parsing is CPU-bound. On a 200-file project every build pass parses serially. On an 8-core machine, 7 cores sit idle.

**Fix:** Use `rayon`'s `par_bridge()` to parallelize the iterator:

```rust
use rayon::prelude::*;

let specs: Vec<_> = WalkDir::new(src_dir)
    .into_iter()
    .filter_map(|e| e.ok())
    .filter(|e| e.file_type().is_file())
    .par_bridge()
    .filter_map(|entry| {
        let path = entry.path();
        if path.extension().map_or(false, |e| e == "js") {
            parse_element_file(path, Arc::clone(&shared_cm))
                .map(|spec| (path.to_path_buf(), spec))
        } else { None }
    })
    .collect();
```

Or replace `walkdir` with `jwalk` (benchmarked at ~4× speed for large trees, parallelizes the directory traversal itself). HTML parsing writes files — collect those separately and write serially or use `DashMap`.

---

### T-02 🔴 New `Arc<SourceMap>` allocated per file in `parse_element_file`

**File:** `tools/src/extract/runner.rs` → `parse_element_file`

```rust
fn parse_element_file(file_path: &Path) -> Option<ExtractedSpec> {
    let cm: Arc<SourceMap> = Arc::new(SourceMap::default());  // per file!
```

`SourceMap` is a non-trivial SWC allocation. For 200 files, 200 separate maps are allocated and immediately dropped after parsing.

**Fix:** Create one shared `Arc<SourceMap>` in `run()` and pass it in:

```rust
pub fn run(src_dir: &Path, dist_types_dir: &Path) {
    let cm: Arc<SourceMap> = Arc::new(SourceMap::default());
    // pass Arc::clone(&cm) into each parse_element_file call
}
```

With rayon parallelism `Arc::clone` is O(1) and `SourceMap` is internally thread-safe for concurrent reads.

---

### T-03 🟠 `poll_events` blocking `std::sync::mpsc::recv_timeout` inside a tokio executor

**File:** `tools/src/watcher/runner.rs` → `watcher` loop inside `tokio::spawn`

```rust
tokio::spawn(async move {
    loop {
        let messages = watcher.poll_events();   // calls recv_timeout(50ms) — BLOCKING
        // ...
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
});
```

`recv_timeout` is a blocking syscall. Running it inside `tokio::spawn` occupies a thread from tokio's async thread pool for 50 ms per iteration. This starves the Axum server and SSE broadcast futures of execution time.

**Fix:** Move the blocking receive to `tokio::task::spawn_blocking`, which runs on a dedicated blocking thread pool:

```rust
tokio::spawn(async move {
    loop {
        let msgs = tokio::task::spawn_blocking({
            let w = watcher_arc.clone();
            move || w.poll_events()
        }).await.unwrap_or_default();

        for msg in msgs {
            let _ = tx.send(msg);
        }
    }
});
```

Or better: replace `std::sync::mpsc` entirely with `tokio::sync::mpsc` and `recv().await`, which yields to the executor rather than blocking.

---

### T-04 🟠 `with_poll_interval` set on `RecommendedWatcher` (no-op on native backends)

**File:** `tools/src/watcher/runner.rs`

```rust
Config::default().with_poll_interval(Duration::from_millis(100)),
```

`RecommendedWatcher` on Linux uses `inotify`; on macOS uses `FSEvents`. Both are event-driven and ignore `poll_interval`. The real latency floor is the `recv_timeout(50ms)` inside `poll_events`, which is the fix target in T-03.

**Fix:** Remove the redundant config. Consider using `notify-debouncer-full` (part of the `notify` crate family) which provides built-in debouncing with a cleaner API than the manual debounce loop in `poll_events`.

---

### T-05 🟡 `serde_json::to_string_pretty` for runtime-consumed JSON descriptors

**File:** `tools/src/extract/html.rs` → `emit_descriptor`

```rust
let json = serde_json::to_string_pretty(descriptor)?;
```

`.tags.json` files are fetched by the browser and parsed with `JSON.parse`. Pretty-printing (indentation + newlines) adds ~30–40% to file size and parse time with no runtime benefit.

**Fix:** Use `serde_json::to_string` in build/watch mode. Keep `to_string_pretty` gated behind a `--debug` flag.

---

### T-06 🟡 `sync_src_to_dist` copies all files unconditionally on every build

**File:** `tools/src/extract/runner.rs` → `sync_src_to_dist`

```rust
std::fs::copy(path, &target).ok();  // no mtime or hash check
```

Every `native-tools build` re-copies every file even if unchanged. On large projects this adds seconds of unnecessary I/O.

**Fix:** Skip unchanged files via mtime comparison:

```rust
let should_copy = match (fs::metadata(path), fs::metadata(&target)) {
    (Ok(src_m), Ok(dst_m)) => src_m.modified().ok() > dst_m.modified().ok(),
    _ => true,
};
if should_copy { fs::copy(path, &target).ok(); }
```

---

### T-07 🟡 `broadcast::channel` capacity of 100 drops HMR events under burst saves

**File:** `tools/src/main.rs`

```rust
let (tx, _rx) = broadcast::channel::<HmrMessage>(100);
```

`tokio::sync::broadcast` silently drops the oldest messages when the buffer is full. A burst save of 30 files (e.g., git checkout) triggers 30 events. If the extract pass takes longer than 100 messages worth of time, reload signals are lost.

**Fix:** Increase capacity to 512. Or switch to `tokio::sync::watch` — watch holds only the latest value and never drops. Since HMR only needs "something changed, reload", watch semantics are a better fit than broadcast.

---

### T-08 🟡 Redundant string allocations in hot parsing loops

**File:** `tools/src/extract/html.rs`, `tools/src/watcher/runner.rs`

```rust
tags.insert(tag_name.to_string());   // allocates String for every element node
refs.insert(reference.to_string());  // allocates String for every [ref] attribute
```

Use `BTreeSet<String>` instead of `HashSet<String>` to build refs/ids/classes/tags — the `BTreeSet` maintains insertion-sorted order, eliminating the separate `sort()` call at the end.

```rust
let mut tags: BTreeSet<String> = BTreeSet::new();
// At end: tags.into_iter().collect::<Vec<_>>()  — already sorted
```

---

### T-09 🟢 SSE keep-alive interval of 15 seconds is too long

**File:** `tools/src/server/runner.rs`

```rust
Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
```

Many reverse proxies and firewalls impose 60-second idle-connection timeouts. A 15-second keep-alive is safe against those, but 5 seconds is more resilient and has negligible overhead on a local dev server.

---

## Cross-Cutting Fixes — Changes That Span Multiple Layers

---

### X-01 🔴 Route param injection triggers a DOM-round-trip property write per param

**Files:** `src/core/router/orchestrator.js` × `src/core/ui/define/element.js`

In `orchestrator.js`:
```js
for (const [key, value] of Object.entries(params)) {
  currentChild[key] = value;  // triggers setAttribute → attributeChangedCallback → update
}
```

With the current getter/setter implementation (pre-R-01 fix), each `currentChild[key] = value` writes an attribute, fires `attributeChangedCallback`, and schedules an `rAF` update. For a route with 3 params, that is 3 separate `rAF` callbacks queued.

**Fix:** After applying **R-01** (backing fields), the setter writes the field directly and queues a single batched update via `pendingUpdatesMap`. But you can go further: add a `hydrateParams(params)` method on `DeclarativeElement` that sets all params atomically before triggering a single update cycle:

```js
// In element.js
hydrateParams(params) {
  for (const [key, value] of Object.entries(params)) {
    if (this[storeKeyFor(key)] !== value) {
      this[storeKeyFor(key)] = value;
      pendingUpdatesMap.get(this)?.set(key, { val: value, old: this[storeKeyFor(key)] });
    }
  }
  // schedule a single flush instead of N flushes
  if (!updateScheduledMap.get(this) && spec.update) {
    updateScheduledMap.set(this, true);
    scheduleFlush(this);
  }
}
```

---

### X-02 🟠 `customElements.whenDefined` missing before route element creation

**Files:** `src/core/router/orchestrator.js` × `src/core/ui/define/element.js` × `src/core/router/match.js`

When route elements are lazy-loaded (**RT-08**), `document.createElement(tag)` may run before `customElements.define(tag, ...)` executes. The element upgrades asynchronously (promoted from `HTMLUnknownElement`), but `connectedCallback` doesn't fire until upgrade, meaning template and stylesheet setup is delayed.

**Fix in orchestrator.js:**

```js
if (!customElements.get(tag)) {
  await customElements.whenDefined(tag);
}
const pageEl = document.createElement(tag);
```

This is a single native Promise that resolves near-instantly if the element is already defined, and waits for the dynamic import to complete if not.

---

### X-03 🟠 View Transition double-wrapping — router + container both apply transitions

**Files:** `src/core/router/transitions.js` × `src/core/ui/define/container.js` × `src/elements/route-container.js`

The router wraps `emit('found', ...)` in `document.startViewTransition`. The container's `swapView` runs another `element.startViewTransition` or `document.startViewTransition` inside that callback. Two nested transitions cause snapshot layering conflicts.

**Fix (complements RT-05):**

1. Remove `transitions.run` from the router's `handler()` — containers own all transitions.
2. Ensure `route-container.js` `swapView` follows the `vt.ready` pattern (not `vt.finished`) per **R-09**.
3. Document the contract: the router emits the navigation event; the container animates and mounts; the router never touches CSS transitions.

---

### X-04 🟠 `preloadResources` fetch does not coordinate with the router's navigation timing

**Files:** `src/core/ui/define/utils.js` × `src/core/router/intercept.js`

Route elements start fetching their stylesheet and template at `element()` registration time. If the app lazy-loads route modules (**RT-08**), the element is registered only when its route matches — at which point `preloadResources` starts fetching from scratch, adding latency inside the view transition window.

**Fix:** Use `<link rel="prefetch">` or Navigation API `navigation.preload()` to signal the browser to start fetching resources for likely-next routes. The router knows the next route's URL ahead of time (on hover, on link focus):

```js
// On nav-link hover/focus — prefetch the element's module
const tag = router.match(href);  // synchronous with RT-03 fix
import(/* webpackPrefetch: true */ `./elements/${tag}.js`);
// Or via <link rel="prefetch">
```

---

### X-05 🟡 HMR reload message triggers a full `extract::run` for every JS change

**Files:** `tools/src/watcher/runner.rs` × `tools/src/extract/runner.rs` × browser HMR script

```rust
if msg.kind == ChangeKind::Js {
    crate::extract::run(&src_path, &types_path);  // full scan of all JS files
}
```

A single `.js` file change triggers re-scanning and re-parsing all JS files in `src_dir`. For 200 files, changing one rebuilds 199 that haven't changed.

**Fix:** Pass the changed file path into `extract::run` as an optional hint and only re-parse the changed file plus anything that imports it (a simplified dependency graph). At minimum, skip files whose `mtime` is older than the changed file's `mtime`:

```rust
pub fn run_incremental(changed_path: &Path, src_dir: &Path, dist_types_dir: &Path) {
    if let Some(spec) = parse_element_file(changed_path, Arc::clone(&cm)) {
        write_dts_for(changed_path, &spec, dist_types_dir);
        update_global_index(dist_types_dir);
    }
}
```

The watcher already has the changed path — use it.

---

### X-06 🟡 `assetCache` in `utils.js` is a module-level `Map` that never evicts

**File:** `src/core/ui/define/state.js`, `src/core/ui/define/utils.js`

```js
export const assetCache = new Map();
```

Fetched stylesheets and template fragments live here forever. For an app with 50 route elements (each with a stylesheet and template), this caches 100 items that may never be reused if the user navigates away and the route element is garbage-collected.

**Fix:** Switch to a `WeakRef`-keyed cache for template nodes (which are `DocumentFragment`s). Stylesheets must remain strongly referenced because `adoptedStyleSheets` holds a live reference — the cache entry is what keeps them alive. Document this distinction and add cache statistics in dev mode.

---

## Summary Table

| ID | Area | Severity | File(s) |
|---|---|---|---|
| R-01 | Property getters call `getAttribute()` on every read | 🔴 Critical | `element.js` |
| R-02 | `passive: false` on all root event listeners | 🔴 Critical | `proxy.js` |
| R-03 | `rAF` for all prop updates regardless of visual need | 🟠 High | `element.js`, `schedule.js` |
| R-04 | MutationObserver: `subtree: true` + `*OldValue` always on | 🟠 High | `proxy.js` |
| R-05 | Per-instance HMR listeners on `window` | 🟠 High | `element.js`, `utils.js` |
| R-06 | No preload signal for component resources | 🟠 High | `utils.js`, `element.js` |
| R-07 | Shadow root method monkey-patching | 🟡 Medium | `proxy.js` |
| R-08 | `createRefs` N separate querySelector calls | 🟡 Medium | `proxy.js` |
| R-09 | `swapView` awaits full animation (`vt.finished`) | 🟡 Medium | `container.js`, `route-container.js` |
| R-10 | `TagsCache` prewarm coverage gap | 🟡 Medium | `proxy.js` |
| R-11 | `specRegistry` spec closure memory leaks | 🟡 Medium | `state.js` |
| R-12 | `template.js` silently discards interpolated values | 🟢 Low | `template.js` |
| RT-01 | `match()` called twice per navigation | 🔴 Critical | `intercept.js` |
| RT-02 | Guards execute twice on every browser | 🔴 Critical | `intercept.js` |
| RT-03 | `match()` is async — unnecessary polyfill overhead | 🔴 Critical | `match.js`, `transport.js` |
| RT-04 | Route matching O(n) linear scan | 🟠 High | `match.js` |
| RT-05 | Router wraps transitions then container wraps again | 🟠 High | `transitions.js`, `intercept.js` |
| RT-06 | `container.js` MutationObserver watches full `document.body` | 🟠 High | `container.js` |
| RT-07 | `TransitionController` uses redundant dynamic import | 🟠 High | `intercept.js` |
| RT-08 | Route elements not lazy-loaded — all evaluate at startup | 🟠 High | `element.js`, `match.js` |
| RT-09 | `coordinateConnections` dynamic import + URL rebuild every nav | 🟡 Medium | `intercept.js`, `transport.js` |
| RT-10 | `setupTabSync` broadcasts all navigations without dedup | 🟡 Medium | `tab.js` |
| RT-11 | `orchestrator.js` listener has no cleanup — accumulates on HMR | 🟡 Medium | `orchestrator.js` |
| RT-12 | `history.js` guards checked on every individual call | 🟡 Medium | `history.js` |
| RT-13 | Boot match runs without `whenDefined` guard | 🟡 Medium | `intercept.js`, `orchestrator.js` |
| RT-14 | `emit()` iterates `Set` without snapshot — unsafe under mutation | 🟢 Low | `intercept.js` |
| T-01 | Sequential WalkDir + serial SWC parse | 🔴 Critical | `extract/runner.rs` |
| T-02 | New `Arc<SourceMap>` per file | 🟠 High | `extract/runner.rs` |
| T-03 | Blocking `recv_timeout` inside tokio executor | 🟠 High | `watcher/runner.rs` |
| T-04 | `poll_interval` no-op on native watcher backends | 🟠 High | `watcher/runner.rs` |
| T-05 | `to_string_pretty` for runtime JSON descriptors | 🟡 Medium | `extract/html.rs` |
| T-06 | Unconditional file copy on every build | 🟡 Medium | `extract/runner.rs` |
| T-07 | Broadcast channel drops events under burst saves | 🟡 Medium | `main.rs` |
| T-08 | Redundant `String` allocations in HTML parse loop | 🟡 Medium | `extract/html.rs` |
| T-09 | SSE keep-alive interval too long | 🟢 Low | `server/runner.rs` |
| X-01 | Route param injection triggers N separate update flushes | 🔴 Critical | `orchestrator.js` × `element.js` |
| X-02 | `whenDefined` missing before route element creation | 🟠 High | `orchestrator.js` × `element.js` × `match.js` |
| X-03 | Double view-transition wrapping — router + container | 🟠 High | `transitions.js` × `container.js` × `route-container.js` |
| X-04 | `preloadResources` fetch not coordinated with router timing | 🟠 High | `utils.js` × `intercept.js` |
| X-05 | Full re-scan triggered by single JS file change | 🟡 Medium | `watcher/runner.rs` × `extract/runner.rs` |
| X-06 | `assetCache` never evicts entries | 🟡 Medium | `utils.js` × `state.js` |

---

## Recommended Implementation Order

**Sprint 1 — Remove the most expensive bugs (no API changes):**
RT-01, RT-02, RT-03, R-01, R-02, T-01, T-03, X-01

**Sprint 2 — Structural improvements (small API additions):**
R-03, R-04, R-05, RT-05, RT-08, X-02, X-03, T-02, T-04

**Sprint 3 — Memory and lifecycle hygiene:**
R-06, R-07, R-08, R-09, RT-04, RT-06, RT-11, X-04, X-05, T-05, T-06, T-07

**Sprint 4 — Polish and low-severity items:**
R-10, R-11, R-12, RT-07, RT-09, RT-10, RT-12, RT-13, RT-14, T-08, T-09, X-06