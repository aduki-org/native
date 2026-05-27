## Internal API — core.* Namespace

**Spec Authorities:** WHATWG HTML Living Standard · WICG Prioritized Task Scheduling · W3C Navigation API · W3C Web Cryptography API  
**Status:** Working Specification — May 2026  
**Scope:** This document defines the design philosophy, namespace structure, module contracts, and public surface of every `core.*` module. It is the canonical interface specification for all platform-layer code. Application-layer code may not interact with browser APIs directly; all access is mediated through this layer.

---

## Design Philosophy

### The Façade as Architectural Contract

The Internal API layer is a **thin, standards-traceable façade** over the browser's native APIs. It is emphatically not a framework. It introduces no new programming model, no compilation step, no virtual machine on top of the browser's own. Every method in `core.*` has a clearly identifiable browser API it delegates to, and that delegation path is documented explicitly.

The façade exists for three reasons:

**1. Feature-detection normalisation.** Browser APIs vary in availability across engines. The `core.*` layer provides a single place where feature detection guards are managed, fallback paths are activated, and polyfill entry points are wired. Application code calls `core.ui.transition()` and never needs to know whether `startViewTransition()` is available.

**2. Lifecycle integration.** Raw browser APIs are stateless — they do not know when a component is mounted or unmounted. `core.*` methods accept AbortSignals or return Disposer functions that integrate with the component lifecycle, ensuring that subscriptions, observers, and tasks are cleaned up when components disconnect.

**3. Testability and auditability.** A thin, predictable façade is easier to audit for security correctness, easier to mock in tests, and easier to update when a browser API changes surface. Application code that calls browser APIs directly cannot be updated centrally when a specification changes.

### Anti-Patterns This Layer Explicitly Prevents

- Direct `indexedDB.open()` calls — all storage goes through `core.storage`
- Direct `navigator.serviceWorker.register()` outside of the bootstrap sequence
- Direct `new Worker()` outside of `core.workers`
- `document.addEventListener()` in components — all event handling goes through `core.events` or AbortSignal-gated `element.addEventListener()`
- `window.history.pushState()` — all navigation goes through `core.router`
- Global mutable state — all cross-module state goes through `core.state`

### Module Boundary Rules

Each `core.*` module is an ES Module. The import graph within `core.*` is directed downward:

```
Application Layer
      ↓ imports from
Component Layer
      ↓ imports from
core/* (Internal API Layer)
      ↓ imports from
core/platform/* (Platform Abstraction — feature detection, thin browser wrappers)
      ↓ delegates to
Browser Runtime APIs
```

No module imports from a higher layer. No module imports from a sibling `core.*` module except through documented, stable interfaces. Cross-cutting dependencies (e.g., `core.events` used by `core.state`) are declared explicitly and kept minimal.

---

## Module Directory

```
core/
├── platform/           Feature detection, thin browser wrappers, polyfill guards
├── api/                Networking — fetch pipeline, streaming, retries
├── router/             Navigation API, URLPattern matching, history management
├── state/              Reactive state primitives — Proxy-based store, subscriptions
├── events/             Event bus, delegation utilities, AbortSignal integration
├── storage/            Unified storage façade — IDB, Cache, OPFS, StorageManager
├── workers/            Worker lifecycle, pool management, BroadcastChannel, Web Locks
├── ui/                 Component utilities, View Transitions, scheduling, observers
├── security/           SubtleCrypto wrappers, Permissions API, Sanitizer
├── offline/            Service Worker bridge, Background Sync queue, sync state
└── animations/         Web Animations API, View Transitions orchestration
```

---

## core/platform — Platform Abstraction

This module is the lowest layer. No other `core.*` module interacts with browser APIs directly; they go through `core/platform` utilities for feature detection and thin normalisation.

### Feature Detection Model

Feature detection is never inlined as `if ('someApi' in window)` at call sites. It is centralised in `core/platform/supports.js` as named boolean or capability constants. This ensures that detection logic is maintained once and referenced everywhere.

Detection categories:

- **Hard capability check:** `'serviceWorker' in navigator` — binary. The capability either exists or does not.
- **API shape check:** `typeof scheduler.yield === 'function'` — verifies not just the parent object but the specific method signature.
- **Supports query:** CSS `@supports` queries accessible via the CSS Object Model — `CSS.supports('content-visibility', 'auto')`.
- **Permission-dependent capability:** `navigator.geolocation` exists but its use requires a runtime permission. The platform module distinguishes API availability from runtime permission state.

### Fallback Registration

For APIs that have polyfills or progressive degradation paths, `core/platform` registers the fallback at module evaluation time. The application-layer call site is always the same, regardless of whether it hits the native API or the fallback. Example: `core.ui.transition()` calls `document.startViewTransition()` natively where available, or executes the callback directly (no visual transition, but no error) in environments without View Transitions support.

---

## core.router — Navigation

**Underlying APIs:** Navigation API (`window.navigation`), URLPattern, View Transitions API  
**Spec:** WICG Navigation API · WICG URLPattern  
**Status:** Navigation API — Baseline Newly Available (January 2026); URLPattern — Baseline Newly Available (September 2025)

The router is built directly on the Navigation API (`window.navigation`), which provides a unified event model for all navigation types (link clicks, programmatic pushes, browser back/forward, form submissions within scope). The `navigate` event fires for every navigation; `event.intercept()` allows the router to take control of the navigation and execute a custom handler before the browser completes the navigation.

### Public Interface

```
core.router.navigate(url, state?)         → void
core.router.replace(url, state?)          → void
core.router.back()                        → void
core.router.forward()                     → void
core.router.go(delta)                     → void
core.router.on(pattern, handler)          → Disposer
core.router.match(url)                    → RouteMatch | null
core.router.currentEntry()                → NavigationHistoryEntry
core.router.entries()                     → NavigationHistoryEntry[]
core.router.canGoBack()                   → boolean
core.router.canGoForward()                → boolean
```

### Route Pattern Matching — URLPattern

Route patterns are defined using the `URLPattern` API, which supports:

- Pathname segments with named capture groups: `/users/:id/posts/:postId`
- Wildcard segments: `/docs/*`
- Regular expression groups within segments
- Protocol, hostname, port, search, and hash pattern matching

`URLPattern` is also available in Service Workers, enabling URL-based routing decisions in the fetch event handler without importing a routing library into the SW bundle.

### Navigation Interception

The router registers a single `navigate` event listener on `window.navigation`. When a navigation event fires:

1. The URL is matched against registered route patterns in priority order.
2. If a match is found, `event.intercept()` is called with an async handler. The browser shows its native loading indicator during the handler's execution.
3. The handler loads the route's module (via dynamic `import()`), updates the reactive state layer with the new route context, and triggers the rendering pipeline.
4. View Transitions are applied around the render step if the route declares a transition.
5. If no match is found, the navigation proceeds to the server (hard navigation).

### History Entry State

The Navigation API's `NavigationHistoryEntry` objects carry per-entry state via `entry.getState()`. Route-level UI state (scroll position, active tab index, filter values) is persisted in navigation state so that forward/back navigation restores the exact UI context the user left. This is a platform-native capability that requires no userland scroll/state restoration logic.

### Navigation Transition Guards

Route handlers can declare transition guards — async functions that may cancel a navigation. Guards are used for unsaved-change warnings, authentication checks, and permission validation. A guard that returns `false` calls `event.preventDefault()` (for navigation events) or `navigation.transition.rollback()` (for in-progress transitions).

---

## core.state — Reactive State

**Underlying APIs:** ES Proxy, EventTarget (custom event delivery), WeakRef, FinalizationRegistry  
**TC39 compatibility target:** TC39 Signals (Stage 2, mid-2026) — migration path defined

The state module provides fine-grained reactive state primitives that integrate with the component lifecycle. It does not use a virtual DOM. State changes propagate directly to the registered subscriber functions, which perform targeted DOM mutations.

### Public Interface

```
core.state.create(initialState)         → ReactiveStore
store.get(key)                          → value
store.set(key, value)                   → void
store.update(key, updater)              → void
store.subscribe(key, callback, signal?) → Disposer
store.derived(keys[], computeFn)        → ComputedValue
computedValue.get()                     → value
computedValue.subscribe(callback, signal?) → Disposer
store.snapshot()                        → PlainObject
store.hydrate(snapshot)                 → void
store.destroy()                         → void
```

### Proxy-Based Reactivity

Each `ReactiveStore` wraps its state object in an ES `Proxy`. The Proxy's `set` trap intercepts writes and notifies all registered subscribers for the affected key. The trap fires synchronously — the subscriber callbacks are not deferred. For batch updates (multiple keys changing simultaneously), the store provides a `store.batch(fn)` method that collects mutations and delivers a single combined notification after `fn` completes.

### Subscription Lifecycle

Subscriptions accept an optional `AbortSignal`. When the signal fires, the subscription is removed without the subscriber needing to call a cleanup function explicitly. This integrates directly with the component lifecycle: each component creates one `AbortController` in `connectedCallback()` and passes its `signal` to all `store.subscribe()` calls. In `disconnectedCallback()`, `controller.abort()` removes all subscriptions in a single call.

If no `AbortSignal` is provided, `store.subscribe()` returns a Disposer — a zero-argument function that removes the subscription when called.

### Derived (Computed) Values

`store.derived([keys], computeFn)` creates a computed value that re-evaluates whenever any of its declared dependency keys change. The computed value is lazy — it does not evaluate until its `.get()` method is first called. After the initial evaluation, it caches its result and only re-evaluates when a dependency changes. This is equivalent to `useMemo` in React's model but implemented as a direct browser primitive, without a VDOM reconciler.

Computed values may also be subscribed to. A subscriber on a computed value is notified when the computed value's output changes (not merely when a dependency changes — if the computation returns the same result despite a dependency change, subscribers are not notified).

### TC39 Signals Migration Path

The TC39 Signals proposal (Stage 2, mid-2026) defines `Signal.State` and `Signal.Computed` with semantics equivalent to this architecture's `ReactiveStore` and `derived()`. When native Signals ship, the `core.state` implementation can be swapped for native signals without changing any subscriber call sites. The public interface is forward-compatible by design: `store.subscribe(key, callback)` maps to `new Signal.subtle.Watcher([signal], callback)`.

### Cross-Store Communication

Stores do not communicate with each other directly. Cross-store data flow goes through the application layer, which observes one store and writes to another. This prevents circular dependencies and makes data flow explicitly traceable.

Cross-tab state synchronisation goes through BroadcastChannel (in `core.workers`). When a write occurs in one tab's store, the store may declare a cross-tab sync policy. If the sync policy is `broadcast`, the write is sent on the designated channel after it completes locally. Other tabs' store layers receive the channel message and apply the update as a local write.

---

## core.events — Event System

**Underlying APIs:** EventTarget (standalone instantiation), CustomEvent, AbortSignal, addEventListener `{ signal }` option

### Design Choices

The event system has two surfaces: the global event bus (`core.events`) and the component-local event handling utilities. These are not the same thing and are not interchangeable.

The global event bus is for **system-level events** — events where the producer and consumer share no common ancestor and have no better communication path. Authentication state changes, global connectivity changes, theme switches, feature flag reloads. It is a named-event pub/sub channel backed by a standalone `EventTarget` instance.

Component-level communication follows the Custom Elements model: downward via property/attribute, upward via `CustomEvent` with `{ bubbles: true, composed: true }`, sibling via a shared parent's state or the global bus. Direct component-to-component coupling is not supported.

### Public Interface

```
core.events.emit(type, detail?)           → void
core.events.on(type, handler, signal?)    → void
core.events.once(type, signal?)           → Promise<CustomEvent>
core.events.off(type, handler)            → void
```

All subscriptions accept an `AbortSignal` for lifecycle-coupled cleanup. `core.events.once()` returns a Promise that resolves on the next emission of the named event type and rejects if the signal fires before the event. This pattern replaces one-time event callbacks with clean async/await syntax.

### System Event Catalogue

Defined event types emitted by the `core.*` modules are documented centrally. Application code may emit custom event types with a reverse-domain prefix (`app:user-authenticated`, `app:route-changed`). The `core:` prefix is reserved for platform events:

|Event type|Emitted by|Payload|
|---|---|---|
|`core:connectivity-changed`|core/offline|`{ online: boolean }`|
|`core:storage-quota-warning`|core/storage|`{ usageRatio: number }`|
|`core:storage-quota-exceeded`|core/storage|`{ attemptedKey: string }`|
|`core:sync-started`|core/offline|`{ queueLength: number }`|
|`core:sync-completed`|core/offline|`{ synced: number, failed: number }`|
|`core:auth-expired`|core/security|`{}`|
|`core:worker-error`|core/workers|`{ workerType: string, error: Error }`|
|`core:route-resolved`|core/router|`{ pattern, match, entry }`|

---

## core.api — Networking

**Underlying APIs:** Fetch API, AbortController, ReadableStream / TransformStream, Headers, Request, Response  
**Detail:** Fully specified in `networking.md`. This section summarises the interface contract only.

```
core.api.get(url, options?)              → Promise<T>
core.api.post(url, body, options?)       → Promise<T>
core.api.put(url, body, options?)        → Promise<T>
core.api.patch(url, body, options?)      → Promise<T>
core.api.delete(url, options?)           → Promise<T>
core.api.stream(url, options?)           → AsyncIterable<T>
core.api.upload(url, file, options?)     → { promise: Promise<T>, progress: ReadableStream<number> }
core.api.addInterceptor(stage, fn)       → Disposer
```

### Options Contract

All `core.api.*` methods accept a common `options` object:

```
{
  signal?: AbortSignal         // Propagated to fetch(); cancels on component disconnect
  cache?: 'default'|'no-cache'|'force-cache'|'reload'
  strategy?: 'network-first'|'cache-first'|'stale-while-revalidate'|'network-only'
  retries?: number             // Exponential backoff retry count (default: 3)
  timeout?: number             // Ms before AbortSignal auto-fires
  headers?: Record<string, string>
  credentials?: 'omit'|'same-origin'|'include'
}
```

### Interceptor Pipeline

Interceptors are registered globally or per-request. A global outbound interceptor injects authentication headers on every request that targets the application's API base URL. A global response interceptor normalises error shapes. Interceptors compose via middleware chaining — each interceptor receives the request/response and a `next()` function to continue the chain.

---

## core.storage — Persistence

**Full specification:** `storage.md`  
**Underlying APIs:** IndexedDB, Cache API, OPFS, StorageManager, Web Locks, localStorage (bootstrap only)

```
core.storage.get(key, options?)           → Promise<T | null>
core.storage.set(key, value, options?)    → Promise<void>
core.storage.delete(key, options?)        → Promise<void>
core.storage.query(storeName, query)      → Promise<T[]>
core.storage.transaction(stores, mode, fn) → Promise<T>
core.storage.estimate()                   → Promise<StorageEstimate>
core.storage.persist()                    → Promise<boolean>
core.storage.persisted()                  → Promise<boolean>
core.storage.onQuotaWarning(handler)      → Disposer
```

### Query Object Shape

```
query {
  index?: string           // Index name to query against
  range?: IDBKeyRange      // Key range for the query
  direction?: 'next'|'prev'|'nextunique'|'prevunique'
  limit?: number
  offset?: number
}
```

---

## core.workers — Worker Management

**Underlying APIs:** Worker, SharedWorker, BroadcastChannel, Web Locks, MessageChannel, Transferable objects  
**Full specification:** `worker-architecture.md`

```
core.workers.create(scriptUrl, options?)  → ManagedWorker
core.workers.shared(name, scriptUrl?)     → SharedWorkerConnection
core.workers.terminate(worker)            → void
core.workers.broadcast(channel, message)  → void
core.workers.subscribe(channel, handler, signal?) → Disposer
core.workers.lock(name, options?, fn)     → Promise<T>
core.workers.tryLock(name, fn)            → Promise<T | null>
```

### ManagedWorker Interface

```
ManagedWorker {
  request(type, payload, transfer?)   → Promise<T>
  notify(type, payload, transfer?)    → void
  stream(type, payload, transfer?)    → AsyncIterable<T>
  terminate()                         → void
  readonly status: 'idle'|'busy'|'error'|'terminated'
}
```

The `ManagedWorker.request()` method creates a `MessageChannel` per call, sends the request with one port, awaits the response on the other port, then cleans up the channel. This is the preferred communication pattern for request/response interactions. `notify()` is fire-and-forget (no response expected). `stream()` receives a `ReadableStream` from the Worker via transfer and wraps it as an `AsyncIterable`.

### SharedWorkerConnection Interface

```
SharedWorkerConnection {
  request(type, payload)              → Promise<T>
  notify(type, payload)               → void
  on(eventType, handler, signal?)     → void
  disconnect()                        → void
}
```

---

## core.ui — Component and Rendering Utilities

**Underlying APIs:** Custom Elements registry, View Transitions API, `<template>`, scheduler API, ResizeObserver, IntersectionObserver, MutationObserver, requestAnimationFrame

```
core.ui.define(tagName, ElementClass)                      → void
core.ui.transition(updateFn, options?)                     → Promise<ViewTransition>
core.ui.template(id)                                       → DocumentFragment
core.ui.schedule(fn, priority?)                            → Promise<void>
core.ui.scheduleFrame(fn)                                  → number (rAF handle)
core.ui.observe.resize(element, callback, signal?)         → Disposer
core.ui.observe.intersection(element, callback, options?, signal?) → Disposer
core.ui.observe.mutation(element, callback, options?, signal?)     → Disposer
core.ui.observe.performance(entryTypes, callback, signal?) → Disposer
```

### core.ui.define

Wraps `customElements.define()` with:

- Duplicate registration guard (does not throw if the element is already defined)
- Development-mode validation of the lifecycle interface (warns if `disconnectedCallback` is missing, indicating potential cleanup failures)
- Registry of all defined elements for debugging tooling

### core.ui.transition

Wraps `document.startViewTransition()` with a feature-detection guard. If View Transitions are supported, the provided `updateFn` is executed inside the transition, returning the native `ViewTransition` object. If not supported, `updateFn` is called directly and a resolved Promise is returned. Callers never branch on View Transitions support; the API is uniformly async.

Additional features:

- Named view transition elements are declared via the `options.names` map: `{ '#hero-image': 'hero', '.page-content': 'content' }`. The utility applies `view-transition-name` CSS properties, executes the transition, and cleans up the names afterward.
- Cross-document View Transitions (between page navigations) are handled via the router layer, not directly through this utility.

### core.ui.schedule

Wraps `scheduler.postTask()` with `user-visible` as the default priority. The signature is consistent regardless of whether `scheduler.postTask` is available — a `requestAnimationFrame`-based fallback applies automatically on unsupported browsers.

Priority mappings:

- `'blocking'` → `scheduler.postTask({ priority: 'user-blocking' })`
- `'visible'` (default) → `scheduler.postTask({ priority: 'user-visible' })`
- `'background'` → `scheduler.postTask({ priority: 'background' })`
- `'idle'` → `requestIdleCallback({ timeout: 1000 })`

### Observer Utilities

Each `core.ui.observe.*` method creates the appropriate observer type, attaches it to the target element, and returns a Disposer that disconnects the observer when called. All accept an optional `AbortSignal` for lifecycle-coupled cleanup as an alternative to the Disposer pattern.

Observers are not created per-element — the `core.ui.observe.resize()` utility shares a single `ResizeObserver` instance across all observed elements (the observer is created once and elements are added/removed from it). This follows the observer instance-sharing pattern described in the Web Performance Working Group's guidance for ResizeObserver usage.

---

## core.security — Cryptography and Permissions

**Underlying APIs:** Web Cryptography API (SubtleCrypto), Permissions API, Sanitizer API (when available), DOMPurify (fallback)

```
core.security.hash(data, algorithm?)               → Promise<ArrayBuffer>
core.security.hmac(key, data)                      → Promise<ArrayBuffer>
core.security.encrypt(key, data, iv?)              → Promise<ArrayBuffer>
core.security.decrypt(key, data, iv?)              → Promise<ArrayBuffer>
core.security.generateKey(algorithm, usage[])      → Promise<CryptoKey>
core.security.importKey(format, keyData, algorithm, usage[]) → Promise<CryptoKey>
core.security.exportKey(format, key)               → Promise<ArrayBuffer | JsonWebKey>
core.security.deriveKey(password, salt, iterations) → Promise<CryptoKey>
core.security.sign(key, data)                      → Promise<ArrayBuffer>
core.security.verify(key, signature, data)         → Promise<boolean>
core.security.randomBytes(length)                  → Uint8Array
core.security.permission(name)                     → Promise<PermissionState>
core.security.watchPermission(name, handler, signal?) → Disposer
core.security.sanitize(html, config?)              → string
```

### SubtleCrypto Wrapping Strategy

`crypto.subtle` methods return `Promise<ArrayBuffer>` for most operations. `core.security` wrappers:

- Accept plain strings where the spec requires `BufferSource`, converting via `TextEncoder`.
- Provide sensible algorithm defaults (AES-GCM 256-bit for encryption, SHA-256 for hashing, HMAC-SHA256 for signing).
- Generate IVs automatically for encryption and return them alongside the ciphertext as a combined structure.
- Export `CryptoKey` objects as needed, but never store raw key material in application state.

`crypto.subtle` runs on the main thread but is non-blocking. For bulk cryptographic operations (encrypting large files), the operation is delegated to a Dedicated Worker via `core.workers`.

### Permissions API Integration

The Permissions API (`navigator.permissions.query()`) allows querying permission state without prompting the user. `core.security.permission()` returns the current `PermissionState` (`'granted'`, `'denied'`, `'prompt'`). `core.security.watchPermission()` subscribes to permission state changes via a `PermissionStatus.onchange` handler and delivers updates through the callback until the signal fires.

### Sanitizer API

The Sanitizer API is not yet in Baseline as of mid-2026. `core.security.sanitize()` uses the native `Sanitizer` object when `'Sanitizer' in window`, and falls back to a DOMParser-based manual sanitisation approach otherwise. The switch is transparent to call sites. When the Sanitizer API reaches Baseline, the fallback path is removed without any application code changes.

---

## core.offline — Service Worker Bridge

**Underlying APIs:** Service Worker API, navigator.serviceWorker, Background Sync, online/offline events, navigator.onLine

```
core.offline.isOnline()                              → boolean
core.offline.onConnectivityChange(handler, signal?)  → Disposer
core.offline.queueOperation(operation)               → Promise<void>
core.offline.syncNow()                               → Promise<SyncResult>
core.offline.getPendingCount()                        → Promise<number>
core.offline.clearQueue()                             → Promise<void>
core.offline.swReady()                                → Promise<ServiceWorkerRegistration>
core.offline.sendToSW(type, payload)                 → Promise<T>
```

### Connectivity Detection

`navigator.onLine` is an unreliable indicator — it reflects whether the device has a network interface, not whether the network connection is usable. The offline module provides a more reliable check by combining `navigator.onLine` with a periodic lightweight network probe (a HEAD request to a known endpoint). A connectivity change is only declared when the probe result changes, not merely when `navigator.onLine` changes.

The `online` and `offline` DOM events on `window` are still observed and used to trigger probes. The event itself is not treated as a ground truth signal.

### Background Sync Queue

`core.offline.queueOperation(operation)` serialises an operation description to IndexedDB and calls `registration.sync.register('pending-operations')` on the Service Worker registration. The queue entry includes: operation type, payload, idempotency key, timestamp, retry count, and maximum retry limit.

When the browser fires a `sync` event in the Service Worker (on connectivity restoration), the SW bridge reads all pending operations from IndexedDB and replays them in timestamp order. Failed operations are re-queued with incremented retry counts. Operations that exceed the retry limit are moved to a dead-letter store for manual inspection.

For browsers without Background Sync (Firefox, Safari), the manual retry path is activated: the `online` event triggers `core.offline.syncNow()` on the main thread. This requires the tab to be open, which is a weaker guarantee than Background Sync's browser-managed sync, but functions correctly for the majority of user scenarios.

---

## core.animations — Animation Orchestration

**Underlying APIs:** Web Animations API, View Transitions API, CSS Custom Properties animation

```
core.animations.play(element, keyframes, options?)  → Animation
core.animations.cancel(animation)                   → void
core.animations.finish(animation)                   → Promise<void>
core.animations.stagger(elements, keyframes, options?, delay?) → Promise<void>
core.animations.transition(fn, names?, options?)    → Promise<ViewTransition>
core.animations.register(name, keyframes, options?) → void
core.animations.get(name)                           → { keyframes, options }
```

The animation module is a named animation registry backed by the Web Animations API. Named animations (registered once via `core.animations.register()`) can be applied to any element without repeating keyframe definitions. The `stagger` method applies the same animation to multiple elements with a configurable delay between each, enabling entrance animations for lists without requiring a rendering framework.

---

## Dependency Injection and Service Container

### ES Module Singleton Pattern

Services in `core.*` are instantiated once. ES Module caching semantics provide natural singleton behaviour: a module evaluated once is not re-evaluated on subsequent imports within the same browsing context. The module's top-level exported values are the singleton instances. There is no class registry, no decorator metadata, no IoC container framework.

### Service Initialisation Order

Some `core.*` modules have initialisation dependencies (e.g., `core.router` requires the Service Worker to be registered before it can intercept navigations; `core.storage` requires the IndexedDB schema version check to complete before it can serve reads).

Initialisation is handled by the application bootstrap sequence in `bootstrap.js`, which awaits each module's initialisation Promise in the correct order. The bootstrapper is the only place where initialisation order is explicitly declared. Individual modules export both their singleton API and an `init()` function; the bootstrap calls `init()` in order and awaits each before proceeding.

A circular dependency between two `core.*` modules is a hard error — it indicates an architectural violation that must be resolved by extracting the shared concern into a lower-level module or the platform layer.

---

## Error Taxonomy

All errors originating from `core.*` modules conform to a common shape. Browser API errors are normalised into this shape at the module boundary. Application-layer code never receives raw `DOMException` or `IDBRequestErrorEvent` objects.

```
CoreError {
  code: string          // 'STORAGE_QUOTA_EXCEEDED' | 'NETWORK_TIMEOUT' | 'AUTH_EXPIRED' | ...
  message: string       // Human-readable description (not for display to users)
  cause?: Error         // The original browser API error
  context?: object      // Relevant metadata (key, URL, operation)
  recoverable: boolean  // Whether the operation can be retried
}
```

Errors in `core.*` modules are emitted on the global event bus (`core.events.emit('core:error', error)`) in addition to being thrown/rejected. This allows a central error monitoring subscriber to collect all platform errors regardless of whether the immediate call site handles them.

---

## Disposer Pattern

Throughout `core.*`, functions that establish ongoing relationships (subscriptions, observers, event listeners) return a **Disposer** — a parameterless function that tears down the relationship when called.

```
const dispose = core.state.subscribe('user', handler);
// ... later, in disconnectedCallback:
dispose();
```

Disposers are:

- Idempotent — calling a Disposer multiple times has no effect after the first call.
- Synchronous — Disposers do not return Promises.
- Composable — multiple Disposers can be collected in an array and called together.

Where an `AbortSignal` is accepted as an alternative to the Disposer pattern, the AbortSignal takes priority — it is the preferred pattern for component-lifecycle-coupled cleanup because it allows a single `controller.abort()` call to clean up all subscriptions simultaneously.

---

## Internal Event Contract for Lifecycle Integration

Components integrate with `core.*` through the following pattern:

```
connectedCallback()
  Create AbortController
  Subscribe to state, events, observers — pass controller.signal
  Initiate data fetch — pass controller.signal to core.api
  Register with core.ui.observe — pass controller.signal

disconnectedCallback()
  controller.abort()
  — All subscriptions, observers, fetch requests, and scheduled tasks
    are cancelled in a single operation
```

This contract is the foundation of the memory-safety guarantee described in `design-principles.md`. No component may establish a subscription, observer, or request without a cleanup path. The `core.*` APIs make this cleanup path the path of least resistance.

---

## Relationship to Other Architecture Modules

- **design-principles.md:** The Internal API layer is the architectural embodiment of Principle 4 (Minimal Abstraction Surface) and Principle 5 (Memory Consciousness).
- **architecture.md:** This document defines the `core.*` layer described abstractly in the system architecture overview.
- **storage.md, worker-architecture.md, networking.md, offline-engine.md, security.md:** Each defines the deep specification for its respective `core.*` module. This document defines the surface contracts only.
- **component-lifecycle.md:** The Disposer pattern and AbortSignal integration defined here are the mechanisms that make component lifecycle cleanup deterministic.
- **performance.md:** `core.ui.schedule()` and `core.ui.scheduleFrame()` are the integration points with the browser's scheduler, as described in the performance architecture.

---

_References:_  
_WHATWG HTML Living Standard — Custom Elements: `html.spec.whatwg.org/#custom-elements`_  
_WICG Navigation API: `github.com/WICG/navigation-api`_  
_WICG URLPattern: `github.com/WICG/urlpattern`_  
_WICG Prioritized Task Scheduling: `wicg.github.io/scheduling-apis`_  
_W3C Web Cryptography API Level 2: `w3c.github.io/webcrypto`_  
_W3C Permissions API: `w3.org/TR/permissions`_  
_MDN — Web Animations API: `developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API`_  
_MDN — View Transitions API: `developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API`_  
_MDN — Sanitizer API: `developer.mozilla.org/en-US/docs/Web/API/Sanitizer_API`_  
_TC39 Signals Proposal: `github.com/tc39/proposal-signals`_