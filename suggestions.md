# Performance Suggestions — Native UI Framework

> Produced from a full read of `all.rust` + `all.text` and live research.  
> Priority order within each section: **Critical → High → Medium → Low.**

---

## 1. JavaScript Runtime (`src/core/ui/`)

### 1.1 CRITICAL — Property getters hit `getAttribute()` on every read

**Where:** `element.js`, the `Object.defineProperty` loop for every prop key.

```js
get() {
  // Called every time `el.count` is read
  const val = this.getAttribute(attrName); // forces a DOM round-trip
  if (val === null) return config.default;
  return config.type === Number ? Number(val) : val;
}
```

Every `el.count` or `el.disabled` in `mount`/`update` callbacks re-reads the DOM attribute. On a component with 5 props that is updated 60×/sec, that's 300 live DOM reads per second per instance.

**Fix:** Add a private backing field initialized in `constructor()` and written in the setter. The getter reads the field, not the attribute.

```js
const storeKey = Symbol(key);

get() {
  return this[storeKey] ?? config.default;
},
set(val) {
  if (this[storeKey] === val) return;
  this[storeKey] = val;
  // ... attribute sync + update scheduling stays the same
}
```

Reflected attributes (HTML → JS direction) still write through `attributeChangedCallback`.

---

### 1.2 CRITICAL — `passive: false` on all delegated root listeners

**Where:** `proxy.js` → `createEventDelegator` → `ensureListener`.

```js
shadowRoot.addEventListener(eventType, rootListener, {
  signal: defaultSignal,
  capture,
  passive: false   // ← forces the browser to wait for JS before scrolling
});
```

`passive: false` is the default for `touch*` and `wheel` events only when unspecified, but setting it explicitly blocks scroll-jank optimizations on **every** event type including non-scroll ones. Chrome DevTools will flag this as a "non-passive event listener blocking scroll".

**Fix:** Default to `passive: true` and let callers opt out:

```js
shadowRoot.addEventListener(eventType, rootListener, {
  signal: defaultSignal,
  capture,
  passive: options.passive !== false   // opt-out pattern
});
```

---

### 1.3 HIGH — `scheduleFrame` uses `requestAnimationFrame` for prop updates

**Where:** `schedule.js` + `element.js` `updateScheduledMap` flush path.

```js
scheduleFrame(() => {
  // dispatches spec.update(...)
});
```

`requestAnimationFrame` fires at the next paint boundary (~16 ms away). For a text field that triggers `update` 10× in 16 ms, this correctly batches them — but the entire batch is delayed by a full frame. For non-visual state changes (e.g. updating ARIA attributes, re-routing after a data fetch) this is an unnecessary 16 ms penalty.

**Fix:** Use `queueMicrotask` for updates that don't touch layout, falling back to `rAF` only when a visual repaint is needed. Expose a `visual: true` flag on `spec.update` so the scheduler can decide:

```js
const flush = spec.update.visual
  ? () => scheduleFrame(run)
  : () => queueMicrotask(run);
```

`scheduler.postTask` with `priority: 'user-visible'` is the ideal path on Chrome/Edge (your `schedule.js` already supports it — use it here too).

---

### 1.4 HIGH — `MutationObserver` always sets `subtree: true` and both `*OldValue` flags

**Where:** `proxy.js` → `computeWatchOptions`.

```js
const options = {
  attributes: shouldObserveAttrs,
  attributeOldValue: shouldObserveAttrs,   // extra memory per mutation
  childList: hasKids || hasTree,
  characterData: hasText || hasTree,
  characterDataOldValue: hasText || hasTree, // extra memory
  subtree: true                              // always on
};
```

`subtree: true` on the shadow root fires for **every** DOM change anywhere inside the component, then your dispatch loop re-filters records. As Nolan Lawson's LWC work documented, this becomes the hottest path at scale — filtering is cheap but volume is not. The `*OldValue` flags allocate memory for old values even when no handler uses them.

**Fix:**
- Only enable `subtree: true` if at least one active registration uses a CSS selector target (direct-element registrations don't need subtree).
- Only enable `attributeOldValue` when `watch.attr` registrations are active; same for `characterDataOldValue`.
- Your `computeWatchOptions()` function already recomputes on add/remove — extend it with these narrower conditions.

```js
const needsSubtree = [...registry.values()].some(r => r.selector !== null);
options.subtree = needsSubtree;
```

---

### 1.5 HIGH — HMR listener leaks on multiple instances of the same component

**Where:** `element.js` → `connectedCallback` HMR block.

```js
window.addEventListener('native:hmr:css', hmrHandler);
// cleaned up via ctrl.signal abort ✓
```

Cleanup via `ctrl.signal` is correct, but if 50 instances of `<ui-button>` are mounted, there are 50 root `window` listeners all checking the same `styleUrl`. They fire serially.

**Fix:** Move the HMR listener to a **static, per-tag singleton** stored in a `Map<tag, Set<WeakRef<ShadowRoot>>>`. One `window` listener updates the shared `CSSStyleSheet` (which is already shared), then calls `replaceSync` once instead of 50 times — because `adoptedStyleSheets` is shared by reference, the single `replaceSync` already propagates to all instances automatically.

```js
// In utils.js — already works because stylesheet is shared:
stylesheet.replaceSync(css);  // All 50 shadow roots update instantly
// No per-instance listener needed at all.
```

---

### 1.6 HIGH — `resourcesPromise` blocks first paint in `connectedCallback`

**Where:** `element.js` → `async connectedCallback`.

```js
const { templateNode, stylesheet, tagsDescriptor } = await resourcesPromise;
```

`resourcesPromise` is created at `element()` call-time (registration), which is good — it starts fetching early. But the component still shows nothing until `await` resolves. If the stylesheet and template are large or if the network is slow, first-connected elements are invisible for tens of milliseconds.

**Fix (two levels):**

1. **Short-term:** Add `<link rel="modulepreload">` or `<link rel="preload" as="fetch" crossorigin>` for CSS/HTML template URLs in `<head>` so the browser's preload scanner starts fetching them before any JS runs. Research confirms preloading constructable stylesheet sources measurably reduces TTFCP.

2. **Long-term:** Support **inline** `template` and `style` strings as the default path (already partially there) so `preloadResources` returns synchronously for components that don't need a network fetch.

---

### 1.7 MEDIUM — `installInvalidationHooks` monkey-patches the shadow root prototype chain

**Where:** `proxy.js` → `installInvalidationHooks`.

```js
shadowRoot.replaceChildren = (...nodes) => {
  for (const cache of hooks.caches) cache.clear();
  return hooks.replaceChildren(...nodes);
};
```

This adds an own property on the `ShadowRoot` instance that wraps the native method. Patching instance methods is safe but bypasses engine optimizations that assume the call target is the prototype method. On 100+ component instances this accumulates.

**Fix:** Instead of patching the method, make `TagsCache` accept an explicit `invalidate()` call from component code after structural DOM mutations:

```js
// In spec.mount or spec.update, after DOM rewrites:
ctx.tags.clear();
```

For automatic invalidation, a tiny `MutationObserver` watching only `childList` on the shadow root (no subtree, no attributes) has lower overhead than method wrapping and uses the observer you already have.

---

### 1.8 MEDIUM — `createRefs` does `querySelectorAll('[ref="…"]')` per ref at mount

**Where:** `proxy.js` → `createRefs`.

Every `ref` in the descriptor triggers a separate selector query. For a component with 10 refs that is created 200 times, that is 2000 `querySelector` calls at startup. The `prewarmTags` step partially mitigates this by caching results into `TagsCache`, but `createRefs` still runs its own loop first.

**Fix:** Do a **single** `shadowRoot.querySelectorAll('[ref]')` and build the `refs` object from the resulting NodeList:

```js
const all = Array.from(shadowRoot.querySelectorAll('[ref]'));
for (const node of all) {
  const name = node.getAttribute('ref');
  if (name && !refs[name]) refs[name] = node;
}
```

This is O(DOM size) instead of O(refs × DOM size). If a descriptor is present, validate names against it after the single pass rather than driving the query loop.

---

### 1.9 MEDIUM — `container.js` → `swapView` awaits `vt.finished`

**Where:** `container.js`.

```js
const vt = this.startViewTransition({ callback: doSwap });
await vt.finished;   // blocks until animation completes (~300 ms)
```

Awaiting `finished` means no subsequent navigation can start until the current transition animation is done. Fast taps or keyboard navigation queue up behind the animation duration.

**Fix:** Await `vt.ready` instead of `vt.finished`. `ready` resolves once the snapshots are captured and the new DOM is live — the animation still runs but the container is free to accept the next navigation immediately. Research confirms element-scoped transitions (your Strategy 1) support concurrent transitions, but document-scoped ones (Strategy 2) still serialize.

```js
const vt = this.startViewTransition({ callback: doSwap });
await vt.ready;  // free after snapshot, not after animation
```

---

### 1.10 LOW — `template.js` ignores interpolated values silently

**Where:** `template.js`.

```js
t.innerHTML = strings.join('');  // values are dropped
```

This is documented as intentional (values are bound post-clone via refs). The risk is a developer passing dynamic content as a value, having it silently dropped, and seeing stale UI. Add a `DEV` guard:

```js
if (import.meta.env?.DEV && values.length) {
  console.warn('[ui.template] Interpolated values are ignored. Use refs for dynamic binding.');
}
```

---

## 2. Rust Tooling (`tools/src/`)

### 2.1 CRITICAL — Sequential file walking in `extract::run`

**Where:** `runner.rs` → `pub fn run`.

```rust
for entry in WalkDir::new(src_dir)
    .into_iter()
    .filter_map(|e| e.ok())
    .filter(|e| e.file_type().is_file())
{
    // parse_element_file(path) — single-threaded SWC parse per file
}
```

SWC parsing is CPU-bound. On a project with 200 JS/HTML files, every build pass parses serially. This is the biggest build-time bottleneck.

**Fix:** Replace with `rayon` parallel iteration using `par_bridge()`:

```rust
use rayon::prelude::*;

let specs: Vec<_> = WalkDir::new(src_dir)
    .into_iter()
    .filter_map(|e| e.ok())
    .filter(|e| e.file_type().is_file())
    .par_bridge()          // rayon parallel bridge
    .filter_map(|entry| {
        let path = entry.path();
        // parse_element_file is pure / no shared mutable state
        if path.extension().map_or(false, |e| e == "js") {
            parse_element_file(path).map(|spec| (path.to_path_buf(), spec))
        } else { None }
    })
    .collect();
```

Or switch to `jwalk` which performs the directory traversal itself in parallel using rayon (benchmarked at ~4× `walkdir` speed for large trees).

**Note:** HTML parsing (`parse_and_emit`) does file I/O (write) so requires careful deduplication — collect HTML paths separately and write sequentially, or use `DashMap` for concurrent writes.

---

### 2.2 HIGH — New `Arc<SourceMap>` per file in `parse_element_file`

**Where:** `runner.rs`.

```rust
fn parse_element_file(file_path: &Path) -> Option<ExtractedSpec> {
    let cm: Arc<SourceMap> = Arc::new(SourceMap::default());
    // ...
}
```

`SourceMap::default()` allocates a new map for every single JS file. In a 200-file project this means 200 allocations of a non-trivial SWC struct, even though diagnostics (source maps) are not emitted in the tools context.

**Fix:** Pass a shared `Arc<SourceMap>` from `run()` into `parse_element_file`:

```rust
pub fn run(src_dir: &Path, dist_types_dir: &Path) {
    let cm: Arc<SourceMap> = Arc::new(SourceMap::default());
    // ...
    parse_element_file(path, Arc::clone(&cm))
}
```

With rayon parallelism, `Arc::clone` is cheap and the `SourceMap` is thread-safe.

---

### 2.3 HIGH — Watcher `poll_events` busy-loops with 50 ms sleep blocking the tokio executor

**Where:** `watcher/runner.rs` → `poll_events` inside a `tokio::spawn` loop.

```rust
tokio::spawn(async move {
    loop {
        let messages = watcher.poll_events();  // blocks for up to 50ms (recv_timeout)
        // ...
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
});
```

`poll_events` calls `self.rx.recv_timeout(Duration::from_millis(50))` which is a **blocking** `std::sync::mpsc` operation. Running it inside `tokio::spawn` blocks the async executor thread for 50 ms on every iteration, starving other futures (the HTTP server, SSE broadcast) of execution time.

**Fix:** Move the blocking receive to `tokio::task::spawn_blocking`:

```rust
tokio::spawn(async move {
    loop {
        let messages = tokio::task::spawn_blocking({
            let watcher = watcher_arc.clone();
            move || watcher.poll_events()
        }).await.unwrap_or_default();
        // rest of broadcast logic...
    }
});
```

Or better, replace `std::sync::mpsc` with `tokio::sync::mpsc` and use `.recv().await` directly, which yields the executor instead of blocking it.

---

### 2.4 HIGH — Watcher sets `poll_interval` on `RecommendedWatcher`

**Where:** `watcher/runner.rs`.

```rust
let mut watcher = RecommendedWatcher::new(
    move |res| { let _ = tx.send(res); },
    Config::default().with_poll_interval(Duration::from_millis(100)),
)?;
```

`RecommendedWatcher` on Linux uses `inotify`, on macOS uses `FSEvents`. These are **event-driven** — they do not poll. Passing `with_poll_interval` has no effect on native backends (it only applies to `PollWatcher`) but documents an incorrect assumption. More importantly, the 50 ms `recv_timeout` in `poll_events` is the real latency floor, not the interval.

**Fix:** Remove the poll interval config from `RecommendedWatcher`. If you need the poll fallback, detect `PollWatcher` explicitly:

```rust
Config::default()  // no poll_interval — native backends ignore it anyway
```

For the latency floor, replace `recv_timeout(50ms)` with `recv_timeout(5ms)` or use an async channel (see 2.3) to respond to events near-instantly.

---

### 2.5 MEDIUM — `serde_json::to_string_pretty` for runtime-consumed descriptors

**Where:** `html.rs` → `emit_descriptor`.

```rust
let json = serde_json::to_string_pretty(descriptor)?;
```

`to_string_pretty` adds indentation and newlines for human readability. The `.tags.json` files are fetched by the browser at runtime and parsed with `JSON.parse`. Minified JSON is faster to transfer and parse.

**Fix:** Use `serde_json::to_string` in production/build mode. Keep `to_string_pretty` only when a `--debug-descriptors` flag is set.

---

### 2.6 MEDIUM — `sync_src_to_dist` copies all files unconditionally on every build

**Where:** `runner.rs` → `sync_src_to_dist`.

```rust
std::fs::copy(path, &target).ok();  // no mtime check
```

Every `native-tools build` re-copies every file even if unchanged. On large projects with many assets this adds unnecessary I/O.

**Fix:** Compare `fs::metadata` modification times before copying:

```rust
let should_copy = match (fs::metadata(path), fs::metadata(&target)) {
    (Ok(src_meta), Ok(dst_meta)) => {
        src_meta.modified().ok() > dst_meta.modified().ok()
    }
    _ => true,
};
if should_copy {
    fs::copy(path, &target).ok();
}
```

---

### 2.7 LOW — Duplicate `to_string()` / `into_owned()` allocations in hot paths

**Where:** `html.rs`, `watcher/runner.rs`.

```rust
// html.rs
tags.insert(tag_name.to_string());       // every node
refs.insert(reference.to_string());      // every [ref]

// watcher/runner.rs
let relative_path = path.strip_prefix(&self.src_path)
    .ok()?.to_string_lossy().into_owned();  // per event
```

These are small, but in the HTML parser loop they run on every element. Using `Cow<str>` instead of `String::from` for intermediate values avoids allocations when the string is already static:

```rust
fn infer_element_type(tag: &str) -> &'static str { ... }  // already returns &'static str ✓
```

For the `HashSet<String>` that immediately gets sorted and moved into a `Vec<String>`, consider building directly into a `BTreeSet<String>` which keeps insertion-sorted order and eliminates the final `sort()` call.

---

## 3. Architecture / Design

### 3.1 HIGH — Element-scoped View Transition is Chrome 140+ only (flag-gated at time of research)

**Where:** `container.js`.

```js
if (typeof this.startViewTransition === 'function') {
  // Strategy 1: Element-scoped (Chrome 147+ target)
```

Chrome DevTools blog (2025) confirms `element.startViewTransition()` is behind `Experimental Web Platform features` in Chrome 140. `document.startViewTransition()` is Baseline Newly Available as of Firefox 144 / October 2025. Your fallback chain is correct, but the priority order is right — just document the browser matrix so no one is surprised.

---

### 3.2 HIGH — `specRegistry` is a module-level `Map` that never shrinks

**Where:** `state.js`.

```js
export const specRegistry = new Map();
```

Every `element()` or `container()` call adds an entry keyed by tag name. For apps that dynamically import many page elements, these entries live for the lifetime of the page. This is unavoidable for the router orchestrator, but be aware: circular references between the spec closures (which may capture large objects) and `specRegistry` can prevent GC.

**Fix:** Keep specs lean — avoid closing over large DOM trees or entire module namespaces in `mount`/`update`. Document that `spec.mount` should be a function reference, not an inline arrow that captures the outer module scope.

---

### 3.3 MEDIUM — `broadcast::channel` capacity of 100 may drop HMR events under heavy saves

**Where:** `main.rs`, `watcher/runner.rs`.

```rust
let (tx, _rx) = broadcast::channel::<HmrMessage>(100);
```

`tokio::sync::broadcast` drops the oldest messages when the channel is full. If `extract::run` (triggered on JS change) takes longer than 100 events worth of time, messages silently disappear and connected browsers never get reloaded.

**Fix:** Increase capacity to 512, or switch to `tokio::sync::watch` for HMR — watch only ever holds the latest value and never drops. Since you only need "something changed, please reload", watch semantics are a better fit than broadcast.

---

### 3.4 LOW — SSE keep-alive interval of 15 seconds

**Where:** `server/runner.rs`.

```rust
Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
```

15 seconds is long for a dev-server. Proxies and some load balancers have 60-second idle timeouts. Reducing to 5 seconds keeps the connection alive without meaningful cost.

---

## Summary Table

| # | Area | Severity | File(s) |
|---|------|----------|---------|
| 1.1 | Property getter calls `getAttribute()` every read | Critical | `element.js` |
| 1.2 | `passive: false` on all root listeners | Critical | `proxy.js` |
| 1.3 | `rAF` used for non-visual prop updates | High | `element.js`, `schedule.js` |
| 1.4 | MutationObserver over-broad options | High | `proxy.js` |
| 1.5 | Per-instance HMR listeners on `window` | High | `element.js` |
| 1.6 | `resourcesPromise` blocks first paint | High | `element.js`, `utils.js` |
| 1.7 | Shadow root method monkey-patching | Medium | `proxy.js` |
| 1.8 | `createRefs` N-queries instead of 1 | Medium | `proxy.js` |
| 1.9 | `swapView` awaits full animation | Medium | `container.js` |
| 1.10 | Silent dropped template values | Low | `template.js` |
| 2.1 | Sequential WalkDir + SWC parse | Critical | `extract/runner.rs` |
| 2.2 | New `Arc<SourceMap>` per file | High | `extract/runner.rs` |
| 2.3 | Blocking recv in tokio executor | High | `watcher/runner.rs` |
| 2.4 | Misleading poll_interval on native watcher | High | `watcher/runner.rs` |
| 2.5 | `to_string_pretty` for runtime JSON | Medium | `extract/html.rs` |
| 2.6 | Unconditional file copy on build | Medium | `extract/runner.rs` |
| 2.7 | Redundant string allocations | Low | `html.rs`, `watcher/runner.rs` |
| 3.1 | Element-scoped VT browser support gap | High | `container.js` |
| 3.2 | `specRegistry` spec closure leaks | High | `state.js` |
| 3.3 | Broadcast channel drops events under load | Medium | `main.rs` |
| 3.4 | SSE keep-alive too long | Low | `server/runner.rs` |