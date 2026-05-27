# Native-First Web Platform Architecture

**Version:** 1.0  
**Status:** Working Specification  
**Date:** May 2026  
**Authority:** MDN Web Docs, WHATWG Living Standard, W3C Specifications, Chrome Platform Docs

---

## Table of Contents

1. [design-principles.md](#1-design-principles)
2. [architecture.md](#2-architecture)
3. [runtime.md](#3-runtime)
4. [component-lifecycle.md](#4-component-lifecycle)
5. [rendering-system.md](#5-rendering-system)
6. [reactivity.md](#6-reactivity)
7. [router.md](#7-router)
8. [state-management.md](#8-state-management)
9. [events.md](#9-events)
10. [networking.md](#10-networking)
11. [offline-engine.md](#11-offline-engine)
12. [worker-architecture.md](#12-worker-architecture)
13. [storage.md](#13-storage)
14. [performance.md](#14-performance)
15. [memory-management.md](#15-memory-management)
16. [security.md](#16-security)
17. [internal-api.md](#17-internal-api)
18. [native-platform-capabilities.md](#18-native-platform-capabilities)
19. [browser-api-research.md](#19-browser-api-research)
20. [limitations-and-polyfills.md](#20-limitations-and-polyfills)

---

---

# 1. design-principles.md

## Native-First Design Principles

### Philosophy

The browser is not a rendering layer. It is a complete application runtime — a standards-compliant, security-sandboxed, hardware-abstracted operating environment with a mature and expanding API surface. The fundamental thesis of this architecture is that the web platform, as defined by WHATWG, W3C, and TC39, is sufficient to build production-grade, large-scale applications without delegating control to any third-party runtime abstraction.

Every architectural decision in this system begins with the question: what does the platform already provide? A framework is only justified where the platform demonstrably cannot yet meet the need. In every other case, the platform wins.

### Core Principles

**1. Standards Primacy**  
Every API consumed by this system must be traceable to a WHATWG, W3C, or TC39 specification. Proprietary runtime conventions are not used as foundational primitives. Where a browser API is in active standardisation, it may be used behind a feature-detection guard with a clearly documented fallback.

**2. Progressive Enhancement**  
The system is layered. A baseline capability set must function in any standards-compliant browser. Each layer of capability is conditionally activated based on `navigator.*`, `'in' window`, or explicit `supports()` checks. Degraded experiences are intentional, not accidental.

**3. Platform Trust**  
The browser's scheduler, garbage collector, security model, layout engine, and event system are more capable than any userland reimplementation. This system does not replace the browser's systems; it composes them. Virtual DOM diffing, userland task queues, and frame-level timers should be used only where the browser's native equivalents are demonstrably insufficient for the use case.

**4. Minimal Abstraction Surface**  
Every abstraction introduced creates a maintenance debt, a learning burden, and a potential source of behavioural divergence from the underlying platform. This system introduces abstractions only when they provide measurable ergonomic or safety value while preserving 1:1 traceability to the underlying browser API.

**5. Memory Consciousness**  
All components, event listeners, observers, and workers must have defined, deterministic cleanup paths. Lifecycle termination is not optional. WeakRef and FinalizationRegistry are used deliberately, not defensively.

**6. Composability Over Configuration**  
Modules expose narrow, composable interfaces. No module depends on global application state unless explicitly declared. Dependency injection is constructor-level or import-level. Side effects in module scope are prohibited.

**7. Offline as a First-Class Concern**  
Network availability is not assumed. The architecture treats the network as an enhancement, not a dependency. Data flows from local-first storage to UI, and synchronisation with remote systems is a background concern managed by the Service Worker layer.

**8. Explicit Over Implicit**  
Reactivity, data flow, and lifecycle transitions are explicit. No magic property-watchers, no undocumented side effects, no framework-specific compilation steps. Every behaviour is traceable to a concrete browser API call or a documented module contract.

---

---

# 2. architecture.md

## System Architecture Overview

### Conceptual Model

The system is structured as a layered stack, each layer owning a well-defined boundary of responsibility. Higher layers consume lower-layer APIs only through their documented public interfaces.

```
┌─────────────────────────────────────────────────┐
│                   Application Layer              │
│      (Route-level components, page modules)      │
├─────────────────────────────────────────────────┤
│                  Component Layer                 │
│   (Custom Elements, Shadow DOM, HTML Templates)  │
├─────────────────────────────────────────────────┤
│               Internal API Layer (core.*)        │
│  ui / router / state / events / network / store  │
├─────────────────────────────────────────────────┤
│             Platform Abstraction Layer           │
│   (thin wrappers over browser APIs, feature-    │
│    detection guards, polyfill entry points)      │
├─────────────────────────────────────────────────┤
│              Browser Runtime Layer               │
│   Navigation API / Fetch / Scheduler / Streams  │
│   IndexedDB / Service Worker / Web Locks / etc.  │
└─────────────────────────────────────────────────┘
```

### Module Topology

The system is a graph of ES Modules. Each module has a clearly defined role, and the import graph must remain acyclic within any given layer. Cross-layer imports are directed downward only; upward coupling is forbidden.

**Module categories:**

- `core/platform/` — Feature-detection utilities and thin platform wrappers
- `core/api/` — Networking, request lifecycle, streaming, retries
- `core/router/` — Client-side routing built on the Navigation API and URLPattern
- `core/state/` — Reactive state primitives built on Proxy and EventTarget
- `core/events/` — Memory-safe event bus, delegation utilities, AbortSignal integration
- `core/storage/` — Unified storage façade over IndexedDB, Cache API, and StorageManager
- `core/workers/` — Worker lifecycle management, BroadcastChannel orchestration
- `core/ui/` — Component base classes, render scheduling, View Transitions integration
- `core/security/` — SubtleCrypto wrappers, Permissions API, Sanitizer API integration
- `core/animations/` — Web Animations API utilities, View Transitions orchestration
- `core/offline/` — Service Worker communication bridge, Background Sync queue

### Entry Point Strategy

The application shell is a minimal HTML document with:

- A single `<script type="importmap">` declaring all module specifier mappings
- A `<script type="module">` bootstrapping the router and core services
- No render-blocking stylesheets in `<head>` beyond a critical inline stylesheet
- A `<template>` element serving as the application shell skeleton
- A registered Service Worker activated before the first meaningful render

The Import Map resolves all bare specifiers without a bundler. In production, a prebuilt static Import Map is generated from the same source graph used for development.

### Dependency Injection Model

Services are instantiated once and distributed via a lightweight service container. The container is a plain ES Module with named exports. It does not use a class registry or decorator-based metadata. Components receive dependencies through their constructor or via explicit attribute-driven resolution. There is no global singleton pattern; the service container module itself is the singleton by virtue of ES Module caching semantics.

---

---

# 3. runtime.md

## Browser Runtime Model

### Execution Environment

The browser runtime is a single-threaded event loop executing JavaScript on the main thread, with concurrent execution available through Web Workers (dedicated, shared) and Service Workers. The event loop processes a task queue, microtask queue, and rendering pipeline in a defined order per the WHATWG HTML Living Standard.

Understanding this model is prerequisite to every performance and correctness decision in this architecture. Blocking the main thread for more than approximately 50ms (the threshold for user-perceivable input latency) degrades the user experience. All CPU-intensive computation must be offloaded to Workers or broken into scheduler-yielded microbatches.

### Prioritized Task Scheduling API

**Spec:** WICG Prioritized Task Scheduling  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Scheduler`  
**Baseline:** Widely available

The `scheduler.postTask()` method provides explicit priority queues for asynchronous tasks. Tasks are assigned one of three priorities:

- `user-blocking` — Tasks that directly affect user interaction. Must complete before the next frame. Reserved for input handling and synchronous state updates that gate rendering.
- `user-visible` — Tasks that are visible to the user but do not gate input. Default priority for most rendering work.
- `background` — Tasks that do not affect the visible experience. Used for analytics, non-critical prefetching, and cleanup.

The `scheduler.yield()` method is equally important. It allows long-running work to be broken into resumable chunks, yielding control back to the browser between chunks. Calling `scheduler.yield()` inside a `postTask()` callback inherits the callback's priority, ensuring that resumed work does not elevate or degrade inappropriately.

This replaces the common pattern of `setTimeout(fn, 0)` for deferred work. Unlike `setTimeout`, `postTask()` is priority-aware, cancellable via `AbortSignal`, and documented in the specification with deterministic ordering guarantees relative to other tasks at the same priority level.

### requestIdleCallback and requestAnimationFrame

These two platform primitives remain relevant as scheduling primitives:

- `requestAnimationFrame` — Used exclusively for work that must be synchronised with the browser's rendering pipeline. DOM mutations that are immediately visible should be batched and applied inside a `requestAnimationFrame` callback to avoid forced layout.
- `requestIdleCallback` — Used for genuinely low-priority work when the main thread is otherwise idle. Must always include a `timeout` parameter to prevent indefinite deferral.

`scheduler.yield()` now inherits background priority when called from within a `requestIdleCallback`, making these systems composable.

### Module Loading and Caching

ES Modules loaded via `<script type="module">` are cached by the browser's module registry. A module evaluated once is not re-evaluated on subsequent imports within the same browsing context. This provides natural singleton semantics and eliminates the need for explicit singleton factories.

Dynamic `import()` is used for all route-level and conditionally-needed modules. The browser's preload scanner can be guided with `<link rel="modulepreload">` to fetch module graphs before they are needed by the import.

---

---

# 4. component-lifecycle.md

## Web Component Lifecycle

### Standard: Custom Elements v1

**Spec:** WHATWG HTML Living Standard — Custom Elements  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements`  
**Status:** Baseline — fully supported across all major engines as of 2019

### Lifecycle Callbacks

The Custom Elements specification defines the following lifecycle callbacks, all synchronous:

**`constructor()`**  
Invoked when the element is created, either via `document.createElement()` or HTML parsing. Shadow root attachment and internal state initialisation occur here. DOM manipulation of children or attributes is not permitted in the constructor per the specification — it will throw in strict mode. Only `attachShadow()`, `super()`, and default value initialisation are safe here.

**`connectedCallback()`**  
Invoked each time the element is inserted into a document. This is the correct location for: subscribing to events and observers, initiating network requests, registering cleanup with AbortController, rendering into the Shadow DOM, and requesting data from the state layer. This callback may fire multiple times (element moved in the DOM), so subscription logic must be idempotent or guarded.

**`disconnectedCallback()`**  
Invoked each time the element is removed from the document. All subscriptions established in `connectedCallback()` must be torn down here. This is the component's garbage-collection boundary. Event listeners, AbortControllers, ResizeObservers, IntersectionObservers, MutationObservers, and animation timelines must all be disconnected here.

**`attributeChangedCallback(name, oldValue, newValue)`**  
Invoked when an observed attribute changes. Only attributes declared in the static `observedAttributes` getter receive change notifications. This is the correct entrypoint for attribute-driven re-renders. It fires for attribute changes both before and after connection.

**`adoptedCallback()`**  
Invoked when the element is moved to a new document via `document.adoptNode()`. Rarely needed but relevant for multi-document applications using `<iframe>` or shadow portals.

### Declarative Shadow DOM

**Spec:** HTML Living Standard — Declarative Shadow DOM  
**Status:** Baseline Newly Available as of August 5, 2024

Shadow DOM can now be declared in server-rendered HTML using the `shadowrootmode` attribute on a `<template>` element:

```html
<my-component>
  <template shadowrootmode="open">
    <slot></slot>
  </template>
</my-component>
```

This eliminates the Flash of Unstyled Content (FOUC) problem previously inherent in JavaScript-driven Shadow DOM attachment. The browser parses and attaches the shadow root during HTML parsing, before any JavaScript executes. This is critical for server-side rendering and progressive enhancement strategies.

### Component Cleanup Architecture

Every component that subscribes to external state, registers observers, or initiates asynchronous operations must create a single `AbortController` instance in `connectedCallback()` and pass its `signal` to every such operation. `disconnectedCallback()` calls `controller.abort()`. This single call cleanly terminates all fetch requests, event listeners added via `{ signal }` option, scheduler tasks, and any userland code that respects AbortSignal.

This pattern is not optional. It is the primary mechanism preventing memory leaks in a long-lived single-page application.

### Form-Associated Custom Elements

Custom Elements can participate in native form submission and validation through the `FormAssociated` mixin pattern. An element declares `static formAssociated = true` and receives an `ElementInternals` object via `attachInternals()`. This allows custom elements to set values, validity state, and participate in the form lifecycle without wrapping native inputs or reinventing validation.

### Slot Composition and Content Projection

The `<slot>` element enables content projection without copying nodes across shadow boundaries. Slotted content remains in the light DOM; only its rendering position changes. The `slotchange` event fires when slotted nodes are added or removed. The `assignedNodes()` and `assignedElements()` methods on a slot element expose the distributed nodes.

This distinction matters for accessibility: screen readers traverse the flat tree (the composed rendering tree), which includes slotted content in its document-order position within the component. Proper ARIA landmark and role assignment must account for this traversal path.

---

---

# 5. rendering-system.md

## Rendering Architecture

### Shadow DOM as the Rendering Boundary

Each Custom Element's Shadow DOM is an isolated rendering subtree. CSS in the shadow root does not leak out; external CSS does not leak in (with the exception of inherited properties and CSS custom properties, which cross shadow boundaries intentionally). This isolation is the foundation of a scalable component styling architecture.

Styles within a shadow root are scoped by default. There is no need for CSS Modules, BEM, or CSS-in-JS to achieve style isolation. Shadow DOM provides this at the platform level.

### CSS Custom Properties as the Theming Primitive

CSS custom properties (variables) are the only CSS feature that crosses shadow boundaries by inheritance. This makes them the correct and only necessary primitive for design tokens and theming systems. A component exposes its visual API through documented custom properties:

```css
/* host exposes these as its theming contract */
:host {
  background-color: var(--surface-color, #fff);
  color: var(--on-surface-color, #000);
  border-radius: var(--radius-md, 4px);
}
```

Consumers of the component control its appearance exclusively through these declared variables. The component's internal implementation is private. This is the web platform's equivalent of a styled-components theme or a design token system — achieved without any runtime library.

### HTML Templates and Cloning

The `<template>` element holds inert HTML fragments that are not rendered and not parsed for subresources until cloned. The correct usage pattern is:

```js
const tmpl = document.getElementById('my-template');
const clone = tmpl.content.cloneNode(true);
shadowRoot.appendChild(clone);
```

Template cloning is significantly faster than `innerHTML` assignment or sequential `createElement()` calls, because the browser parses the template once during initial document parse and each clone is a structured copy of an already-parsed node tree. For components that are instantiated hundreds of times, this is a measurable performance optimisation.

### Rendering Scheduling

DOM mutations should never be applied synchronously in response to state changes if those changes are triggered outside the rendering pipeline. The correct pattern is:

1. State change occurs (user event, network response, worker message)
2. Component is notified via its subscription mechanism
3. Component schedules a `requestAnimationFrame` or `scheduler.postTask()` with `user-visible` priority
4. DOM mutation occurs in the scheduled callback

This batching approach prevents multiple synchronous DOM mutations within a single event handler from triggering multiple style recalculations and layout passes. It aligns the mutation with the browser's rendering pipeline rather than fighting it.

### View Transitions API

**Spec:** W3C CSS View Transitions Module Level 1 and Level 2  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/View_Transition_API`  
**Status:** Baseline Newly Available as of October 2025 (same-document). Chrome 111+, Edge 111+, Firefox 133+, Safari 18+.

`document.startViewTransition(callback)` wraps a DOM mutation in a cross-fade animation at zero marginal JavaScript cost. The browser captures the current visual state, executes the callback, captures the new state, and interpolates between them using a CSS animation.

`view-transition-name` CSS property assigns named transition groups to individual elements, enabling element-level animated transitions (e.g., a list item that moves to become a page header). Level 2 of the specification extends this to MPA (multi-page application) navigations via the `@view-transition` at-rule, enabling cross-document transitions that fire during navigation without any JavaScript.

For the router layer, `startViewTransition()` wraps every navigation's DOM mutation. For list-to-detail views, `view-transition-name` is dynamically assigned to the transitioning element before navigation. This eliminates the need for any external animation library for navigation transitions.

### Incremental and Partial Rendering

For very large lists or data grids, rendering performance is managed through:

- **IntersectionObserver-driven virtualisation** — Only elements in or near the viewport are rendered. IntersectionObserver fires off-main-thread and has negligible cost compared to scroll event listeners.
- **`content-visibility: auto`** — A CSS property that instructs the browser to skip rendering for off-screen elements, with layout size preserved via `contain-intrinsic-size`. This provides native virtualisation at the layout engine level.
- **Chunked rendering with `scheduler.yield()`** — When inserting large sets of nodes, work is broken into chunks with a yield between each. This keeps the main thread responsive during large DOM operations.

---

---

# 6. reactivity.md

## Reactivity Architecture

### The Browser's Native Reactive Primitives

Reactivity, in the sense of "state changes automatically propagating to dependent consumers," does not require a library. The browser provides several native primitives from which a complete reactive system can be assembled:

- **`Proxy`** — Intercepts property reads (`get`) and writes (`set`) on any object, enabling dependency tracking and change notification
- **`EventTarget`** — A native pub/sub interface; any object can extend it or compose with it
- **`CustomEvent`** — Carries arbitrary payload through the event dispatch system
- **`MutationObserver`** — Reacts to DOM tree mutations
- **`ResizeObserver`** — Reacts to element dimension changes, off-main-thread
- **`IntersectionObserver`** — Reacts to element visibility changes relative to a root
- **`PerformanceObserver`** — Reacts to performance timeline entries

### Proxy-Based Reactive State

A reactive state object is a `Proxy` wrapping a plain object. The proxy's `set` trap records the mutation and notifies registered subscribers. The `get` trap can optionally record which properties are accessed during a computation, establishing a dependency graph for computed values.

This is precisely the reactivity model used by Vue 3's `reactive()`, Solid's signals, and MobX observables — all of which are userland implementations of this same `Proxy` pattern. The underlying primitive is already in the platform.

The critical design constraint for this architecture's reactivity layer is that it must not introduce a mutable global dependency-tracking context (the "currently executing computation" concept used by most signal implementations). Instead, subscriptions are registered explicitly by name: components subscribe to specific state keys rather than being implicitly tracked during render. This avoids the class of bugs caused by accidentally reading reactive state outside a tracking context.

### TC39 Signals Proposal

**Status as of mid-2026:** Stage 2 proposal. Not yet shipped in any browser.

The TC39 Signals proposal (influenced by SolidJS, Angular, and Preact's signal implementations) aims to standardise fine-grained reactivity primitives as native JavaScript types. The proposal includes `Signal.State` (a writable signal), `Signal.Computed` (a lazily evaluated derived signal with automatic dependency tracking), and `Signal.subtle.*` for advanced integrations.

This architecture does not depend on the proposal. The Proxy-based reactive layer described above is functional today and is compatible with a future migration path to native signals, since the mental model is aligned.

### EventTarget-Based Pub/Sub

For cross-component communication that does not involve shared mutable state, `EventTarget` provides a clean pub/sub mechanism. Any module can create an `EventTarget` instance and export it as a named event bus. Consumers add event listeners using the standard `addEventListener()` API, with `{ signal }` options for automatic cleanup.

This pattern has two advantages over custom event systems: it uses the browser's own event dispatch infrastructure (which is optimised at the engine level), and it is immediately familiar to any developer who knows the DOM event model.

### Computed Values and Memoisation

Computed values are functions of state that should not recompute unless their dependencies change. In the absence of native signals, computed values are implemented as methods with explicit dependency lists. When a dependency changes, the computed value is invalidated and lazily recomputed on next access. `WeakMap` is used to cache computed results keyed to their source state objects, ensuring cached values are GC-eligible when their source state is no longer referenced.

---

---

# 7. router.md

## Client-Side Routing Architecture

### Navigation API

**Spec:** WICG Navigation API  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Navigation_API`  
**Status:** Baseline Newly Available as of January 2026 (all major engines)

The Navigation API supersedes the History API (`pushState`, `replaceState`, `popstate`) and resolves its most significant limitations:

- History API `popstate` fires only for user-initiated back/forward, not for `pushState()` calls made programmatically. Navigation API's `navigate` event fires for all navigation types uniformly.
- History API has no mechanism to intercept or cancel navigations initiated by the browser (link clicks, form submissions, back button). Navigation API's `event.intercept()` method provides this capability.
- History API provides no information about the navigation type (push, replace, reload, traverse). Navigation API exposes `event.navigationType`.

The central interface is `window.navigation`. The `navigate` event fires before any navigation commits, and `event.intercept({ handler })` converts the navigation into a client-side navigation by preventing the browser from loading a new document, instead calling the provided handler to update the UI.

Navigation entries are accessible via `window.navigation.entries()`, enabling programmatic history inspection without the state fragility of `window.history`.

### URLPattern API

**Spec:** WICG URL Pattern API  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API`  
**Status:** Baseline Newly Available as of September 2025 (all major engines). Also available in Web Workers.

`URLPattern` provides a path-to-regexp-compatible pattern matcher that runs natively in the browser. Route matching no longer requires any JavaScript library. Patterns support named capture groups, wildcards, non-capturing groups, and optional segments.

A router built on Navigation API and URLPattern is fully standards-compliant and requires no third-party code. The URLPattern API is also available in Web Workers and Service Workers, making it usable for SW-level route matching without duplicating the routing logic.

### Router Architecture

The router module maintains a route table as an array of `{ pattern: URLPattern, handler: Function }` entries. On each `navigate` event, the router iterates the table, tests the destination URL against each pattern, and calls the first matching handler with the extracted parameters.

Route handlers are `async` functions. The `navigate` event's `intercept()` method accepts an `async handler`, and the browser uses the handler's promise lifecycle to manage the navigation's `navigation.currentEntry.index` state and fire `navigatesuccess` or `navigateerror` events accordingly.

**Route lifecycle:**

1. `navigate` fires — router intercepts
2. Route matched — lazy `import()` of route module if not cached
3. View Transition initiated via `document.startViewTransition()`
4. Route handler executes — DOM updated with new route's component
5. Navigation commits — URL updated, history entry created
6. `navigatesuccess` fires

### Nested Routing

Nested routes are implemented as named outlet elements within parent route components. Each outlet is a Custom Element (`<route-outlet>`) that renders its active child route's component. Parent routes provide their layout and navigation chrome; child routes render into the outlet. The router resolves the full URL to a matched route chain, not a single route, and updates only the outlets whose matched segment has changed.

### Lazy Route Loading

Every route module is a dynamic `import()`. The module is not fetched until the route is first navigated to. Subsequent navigations to the same route use the browser's module cache at negligible cost. `<link rel="modulepreload">` hints can be inserted during idle time for routes likely to be visited next, guided by IntersectionObserver-triggered prefetch of visible links.

The Speculation Rules API (`<script type="speculationrules">`) extends this to full document prerendering for MPA-style navigations, with configurable eagerness levels (`immediate`, `moderate`, `conservative`). For SPA routing, `modulepreload` is the correct mechanism.

---

---

# 8. state-management.md

## State Management Architecture

### State Topology

Application state is classified into four distinct categories, each with different ownership, persistence, and propagation semantics:

**URL State** — State encoded in the URL (pathname, search parameters, hash). Owned by the router. Authoritative for navigation-relevant application state. Survives reload, is shareable, and bookmarkable. All state that affects the rendered view and should survive a hard reload must live here.

**Session State** — In-memory state owned by the application for the duration of the browsing session. Lost on reload. Managed by the reactive state layer. Used for UI state, transient selections, form drafts that should not be URL-persisted.

**Persistent Local State** — State stored in IndexedDB, persisted across reloads and sessions. Managed by the storage layer. Used for user preferences, cached data, offline-first application state, and sync queues.

**Remote State** — State fetched from a server. Managed by the network layer with caching. Never treated as the source of truth in the client; remote state is always a materialised view of the server's state projected into local storage or the reactive state layer.

### Store Architecture

Each domain of application state is modelled as an independent store module. A store module exports a reactive state object, a set of mutator functions, and (optionally) a set of computed derivations. Stores do not import each other; cross-store composition is done at the component level or through explicit mediator modules.

Stores communicate with the storage layer for persistence. A store that needs to survive reload writes to IndexedDB via the `core/storage` module and hydrates from IndexedDB on initialisation. A store that needs to be shared across tabs wraps mutations in `BroadcastChannel` messages so that all open contexts stay in sync.

### Immutability Discipline

Mutators in the store layer do not mutate the state object in-place when that would cause subscribers to receive mutable references. For complex nested objects, structural sharing (creating a new object with only the changed branch) is preferable to deep cloning. For large collections, `Map` and `Set` are preferred over plain arrays when order is not required, since they allow O(1) membership checks and mutations without re-creating the entire collection.

---

---

# 9. events.md

## Event Architecture

### Memory-Safe Event Subscription

The most common source of memory leaks in web applications is event listeners that are never removed. This architecture enforces a single pattern for all event subscriptions: every listener is registered with an `AbortSignal`, and cleanup is a single `controller.abort()` call.

```js
// pattern — component subscription lifecycle
connectedCallback() {
  this.#controller = new AbortController();
  const { signal } = this.#controller;
  
  this.addEventListener('click', this.#handleClick, { signal });
  window.addEventListener('resize', this.#handleResize, { signal });
  document.addEventListener('visibilitychange', this.#handleVisibility, { signal });
}

disconnectedCallback() {
  this.#controller.abort();
  // all three listeners removed in a single call
}
```

The `{ signal }` option on `addEventListener` is supported in all modern browsers and is the correct, platform-native approach. It is superior to maintaining an array of cleanup functions.

### Event Delegation

Event delegation — attaching a single listener to a container element rather than individual listeners to each child — remains the correct pattern for lists of interactive items. Combined with AbortSignal-based cleanup, delegation is both memory-efficient and GC-friendly.

The key constraint of delegation is that it requires `event.target` traversal (using `closest()` or manual `matches()` checks) to identify which child element initiated the event. `Element.closest()` is supported in all modern browsers and traverses upward through the composed path, making it usable across light and shadow DOM boundaries when `{ composed: true }` event propagation is used.

### Custom Events and Component Communication

Upward communication from a component to its parent is done via `CustomEvent` with `{ bubbles: true, composed: true }`. The `composed: true` flag allows the event to cross shadow DOM boundaries. This is the correct pattern for "callback props" in a framework-centric mental model.

Downward communication from parent to child (or globally) is done via the reactive state layer or by direct method calls on the component element reference. It is not done via attributes for non-primitive data (attributes are strings; complex objects belong in properties or state).

### The Global Event Bus

A single named `EventTarget` instance is exported from `core/events/bus.js` and serves as the application-level event bus for genuinely cross-cutting concerns: authentication state changes, connectivity status changes, user preference updates. This bus is not used for component-to-component communication; that is handled by the reactive state layer. It is used only for system-level events where the producer and consumer have no shared parent.

---

---

# 10. networking.md

## Networking Architecture

### core.api Namespace Design

The networking layer exposes a clean namespace wrapping the Fetch API with lifecycle hooks, caching strategies, retry logic, and streaming support. The namespace is not a reimplementation of Fetch; it is a composable pipeline built on top of it.

**Conceptual API surface:**

```
core.api.get(url, options)
core.api.post(url, body, options)
core.api.put(url, body, options)
core.api.patch(url, body, options)
core.api.delete(url, options)
core.api.stream(url, options)        // streaming response
core.api.upload(url, file, options)  // progress-tracked upload
```

All methods return a Promise. The streaming variant returns a `ReadableStream`-backed async iterable for progressive processing of server responses.

### Request Lifecycle Pipeline

Every request passes through a configurable pipeline of interceptors (middleware). Interceptors are pure functions: they receive a request descriptor and return a modified request descriptor or a response. This is analogous to the request/response interception pattern in frameworks like Axios, but implemented without any library, using plain function composition.

**Pipeline stages:**

1. **Outbound interceptors** — Authentication header injection, request signing (via SubtleCrypto HMAC), correlation ID attachment
2. **Cache layer** — Cache API lookup for cacheable requests; Cache-first, Network-first, or Stale-While-Revalidate strategies determined per request
3. **Network** — `fetch()` with `AbortSignal` for timeout and cancellation; exponential backoff retry for transient failures
4. **Response interceptors** — Error normalisation, response schema validation, rate-limit header parsing
5. **Consumers** — Component or store receives data

### AbortController and Request Cancellation

Every outgoing request is created with an `AbortSignal` derived from the component's lifecycle controller. When a component is disconnected before a request completes, the request is automatically cancelled. This prevents race conditions where a response for a stale request mutates the state of a component that has since been removed.

For requests initiated by the store layer (not tied to a component lifecycle), requests are cancelled when a newer request for the same resource supersedes them. This deduplication is managed by keying in-flight requests by a cache key derived from the URL and request parameters.

### Streams API for Progressive Responses

For large payloads (reports, bulk data, AI streaming responses), the response body is consumed as a `ReadableStream` rather than awaiting the full body. The `response.body` property is a `ReadableStream` by specification. A `TransformStream` is inserted in the pipeline for chunked decoding and parsing.

Backpressure is handled automatically by the Streams API's internal queue mechanism. If the consumer is slower than the network, the stream's desiredSize drops below zero, and the underlying source automatically slows its production rate. This is a first-class platform concept, not a userland concern.

### Server-Sent Events

For real-time server push without the bidirectional overhead of WebSockets, `EventSource` provides a native streaming connection. `EventSource` handles reconnection automatically with exponential backoff. Each event type maps to a named event that can be subscribed to with `source.addEventListener('event-type', handler)`.

### WebSockets

WebSocket connections are managed by a connection pool singleton in the worker layer. A `SharedWorker` maintains the connection so that multiple tabs share a single WebSocket connection to the server. Messages are distributed to tabs via `BroadcastChannel`.

---

---

# 11. offline-engine.md

## Offline and Background Capabilities

### Service Worker Lifecycle

**Spec:** WHATWG HTML Living Standard — Service Worker  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API`

The Service Worker is the cornerstone of offline capability. It runs in a separate thread, persists independently of open tabs, and intercepts all network requests for its registered scope. Its lifecycle is:

1. **Registration** — The main thread calls `navigator.serviceWorker.register()`. The SW script is fetched and evaluated.
2. **Installation** — The `install` event fires. The SW caches critical assets in the Cache API. If installation fails, the SW is discarded.
3. **Waiting** — A newly installed SW waits for the previous SW to release all controlled clients. This prevents two versions of the app from running simultaneously.
4. **Activation** — The `activate` event fires. The SW deletes stale caches and claims clients via `clients.claim()`.
5. **Fetch interception** — The `fetch` event fires for every network request matching the SW's scope. The SW chooses to respond from cache, network, or a combination.

### Caching Strategies

Each cached resource class uses a different strategy:

**Cache-First (Shell Assets)**  
Application shell HTML, CSS, and core JavaScript modules are served from cache unconditionally. The network is only consulted if the cache is empty. These assets change infrequently; cache invalidation is handled by versioned cache names and SW update lifecycle.

**Network-First with Cache Fallback (API Responses)**  
API responses are fetched from the network first. The response is stored in the cache. If the network fails, the cached response is served as a fallback. Stale data is preferable to an error for most use cases.

**Stale-While-Revalidate (Content)**  
The cache is served immediately for fast response, and a network request fires in parallel to update the cache. On next access, the fresher version is served. Suitable for non-critical content that benefits from eventual freshness.

### Background Sync API

**Spec:** WICG Background Sync  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API`  
**Browser support as of 2026:** Chromium-based browsers only. Firefox has it disabled; Safari does not implement it. A manual retry fallback is always required.

When a user performs an action that requires a network request (submitting a form, sending a message) while offline, the action is:

1. Serialised and stored in IndexedDB as a pending operation
2. A sync event is registered with `registration.sync.register('pending-operations')`
3. When connectivity is restored, the browser fires a `sync` event in the Service Worker
4. The SW reads the pending operations from IndexedDB and replays them in order

The application layer never directly manages connectivity state. It writes to IndexedDB and registers a sync, trusting the browser to execute the sync at the appropriate time.

### Conflict Resolution Architecture

When offline writes are eventually synchronised, conflicts may arise if the same record was modified by another device or user. The system implements a deterministic conflict resolution strategy based on the application's data model:

**Last-Write-Wins (LWW)** — Appropriate for user preferences, settings, and non-collaborative data. Each write carries a logical timestamp (vector clock or Lamport timestamp). The write with the highest timestamp wins.

**Operational Transformation (OT) / CRDT** — For collaborative documents and data where both edits must be preserved and merged. This requires significantly more complex client-side infrastructure and is only justified for explicitly collaborative features.

The sync queue records the originating timestamp and device identifier with each pending operation. The server applies the appropriate resolution strategy and returns a canonical version. The client updates IndexedDB with the resolved version.

### Periodic Background Sync

For applications that require reasonably fresh content even when not actively open (news readers, weather, dashboards), `PeriodicSyncManager` allows the browser to wake the Service Worker on a configurable interval. As of 2026, this API is Chromium-only and requires site installation as a PWA. Its use must always be accompanied by a content-freshness fallback for unsupported browsers.

---

---

# 12. worker-architecture.md

## Worker Architecture

### Worker Types and Their Roles

**Dedicated Worker**  
Owned by a single context (tab or page). Used for computationally intensive tasks that would block the main thread: cryptographic operations, data parsing (large JSON, CSV), compression/decompression, canvas rendering, physics calculations. Communication is via structured-cloned `postMessage`. Large binary data is transferred using `Transferable` objects (ArrayBuffer, MessagePort) to avoid the cost of cloning.

**Shared Worker**  
Shared across multiple tabs, iframes, and windows from the same origin. Its `SharedWorkerGlobalScope` persists as long as at least one context holds a connection. Used for maintaining a single WebSocket connection, a shared authentication token cache, or a shared rate-limiter. Communication is via `MessagePort`.

**Service Worker**  
Owned by the browser, not by any tab. Its lifecycle is browser-managed. Used for network interception, caching, Background Sync, Push notifications, and Periodic Sync. Communication from the main thread is via `navigator.serviceWorker.controller.postMessage()` or the `MessageChannel` API for request/response patterns.

### BroadcastChannel for Cross-Context State

**Spec:** WHATWG HTML Living Standard  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API`  
**Status:** Fully supported in all modern browsers

`BroadcastChannel` provides a one-to-many message bus for all same-origin contexts (tabs, workers, iframes). Unlike `postMessage`, which requires a direct reference to the target, `BroadcastChannel` is subscription-based: any context can join a named channel and receive all messages posted to it.

This is the correct mechanism for syncing application state across multiple open tabs. When a user modifies their profile in one tab, the change is broadcast to all other tabs via a named channel. Each tab's reactive state layer receives the message and applies the update locally, producing a consistent UX across all open contexts.

### Web Locks API

**Spec:** WICG Web Locks  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API`  
**Status:** Widely available

The Web Locks API serialises access to a named resource across tabs and workers. When multiple tabs may concurrently attempt to write to IndexedDB (synchronising offline operations), a lock prevents concurrent writes from corrupting the database state. The lock request accepts an `AbortSignal` for timeout semantics.

This is the browser-native equivalent of a mutex. It eliminates the need for userland lock implementations based on localStorage or IndexedDB sentinel keys.

### Worker Communication Patterns

**Fire-and-forget** — `postMessage()` with no response expected. Used for logging, analytics, and cache warming.

**Request/Response** — A `MessageChannel` is created per request. One `MessagePort` is sent to the worker with the request; the other is retained by the caller. The worker posts its response on the received port. This pattern allows multiple concurrent in-flight requests to the same worker without conflating their responses.

**Streaming** — A `ReadableStream` is transferred to the worker for consumption, or a `TransformStream` is passed through for pipeline-style processing. Streams are `Transferable`, enabling zero-copy data transfer between contexts.

---

---

# 13. storage.md

## Storage Architecture

### Storage Taxonomy

The browser provides five distinct storage mechanisms, each with different persistence, capacity, performance, and API characteristics:

**`localStorage` / `sessionStorage`**  
Synchronous key/value storage. `localStorage` is limited to approximately 5–10MB per origin. Its synchronous nature makes it unsuitable for large data operations, as it blocks the main thread. Its only remaining appropriate use case is for small, frequently-read configuration values that must be available synchronously on first load. All other state should use IndexedDB.

**IndexedDB**  
Asynchronous, transactional, indexed object store. Quota is origin-based and typically 50–80% of available disk space, subject to browser eviction policy. IndexedDB is the correct storage mechanism for all structured application data. It supports indexes for efficient querying, transactions for atomicity, and cursors for large dataset iteration. Its callback-based API is typically wrapped with Promises for ergonomic use.

**Cache API**  
Key/value store where keys are `Request` objects and values are `Response` objects. Designed for caching HTTP responses. Available in Service Workers, Web Workers, and the main thread. Quota is shared with IndexedDB under the Storage Standard.

**StorageManager API**  
Provides `navigator.storage.estimate()` for querying available quota and `navigator.storage.persist()` for requesting persistent (non-evictable) storage. Persistent storage is required for production offline-first applications that cannot tolerate silent data loss from browser eviction.

**File System Access API**  
Provides read/write access to the user's actual file system (with explicit permission). Used for document editors, media tools, and any application that needs to open and save files as if it were a native application. The API is permission-gated; the user must explicitly grant access. Handles are persisted via IndexedDB for re-access in subsequent sessions.

### core.storage Unified Façade

The storage layer exposes a unified interface that abstracts the implementation details of each storage mechanism. Application code interacts with `core.storage` and does not directly call `indexedDB.open()` or `caches.open()`:

```
core.storage.get(key)
core.storage.set(key, value)
core.storage.delete(key)
core.storage.query(index, range)
core.storage.estimate()
core.storage.persist()
```

Under the hood, `core.storage` routes operations to the appropriate storage mechanism based on data type and declared persistence tier. Reads are served from an in-memory LRU cache before hitting IndexedDB. Writes are journalled for durability before being applied asynchronously.

### Storage Quota Management

Production applications must handle quota exhaustion gracefully. The StorageManager's `estimate()` method is polled at application startup and during heavy write operations. When usage approaches a configurable threshold (e.g., 80% of estimated quota), the application:

1. Notifies the user that storage is filling
2. Triggers a cleanup of stale cached resources via Cache API
3. Prunes least-recently-used records from IndexedDB based on access timestamps
4. Re-requests persistent storage if not already granted

### IndexedDB Schema Versioning

IndexedDB schema changes are managed through the `onupgradeneeded` callback on `IDBOpenDBRequest`. Each schema version is an integer. Upgrades are applied sequentially from the current version to the target version. Object store creation, index creation, and data migrations all occur within the `onupgradeneeded` callback, which runs inside a versionchange transaction — the only context where schema changes are permitted.

---

---

# 14. performance.md

## Performance Architecture

### Performance Measurement

**PerformanceObserver**  
`PerformanceObserver` is used throughout the application to measure real user performance against the Core Web Vitals: Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and Interaction to Next Paint (INP). Measurements are collected in a Dedicated Worker and batched for remote telemetry to avoid measurement overhead on the main thread.

`PerformanceObserver` observes entries of type `'longtask'` to detect main thread blocking tasks exceeding 50ms. When a long task is detected, the task's attribution (which script, which event handler) is logged for debugging.

### Rendering Performance

**Forced Layout Prevention**  
Reading layout-triggering properties (`offsetWidth`, `getBoundingClientRect()`, `scrollTop`) after writing to the DOM in the same execution frame triggers a forced synchronous layout, which is among the most expensive operations a web application can perform. All layout reads are batched before writes (read-then-write pattern), or scheduled in a `requestAnimationFrame` callback where the browser guarantees a consistent layout state.

**`content-visibility: auto`**  
This CSS property instructs the layout engine to skip rendering for elements not in the viewport. Combined with `contain-intrinsic-size`, it preserves document layout while dramatically reducing rendering cost for off-screen content. It is the most impactful single-line rendering optimisation available in the platform.

**`will-change`**  
Used sparingly and only on elements that will animate. Declaring `will-change: transform` or `will-change: opacity` before an animation allows the compositor to prepare a separate composited layer. Overuse of `will-change` increases GPU memory consumption; it must be removed after the animation completes.

### Network Performance

**Speculation Rules API**  
**Spec:** WICG Speculation Rules  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API`  
**Status:** Chrome/Edge only as of mid-2026; not in Firefox or Safari

For MPA navigations, the Speculation Rules API enables prerendering of likely next pages. Shopify's production deployment demonstrated page load improvements of up to 180ms across loading metrics. Rules are configured with four eagerness levels (`immediate`, `eager`, `moderate`, `conservative`), allowing fine-grained control over when speculation begins.

For SPA navigations, `<link rel="modulepreload">` is used during idle time to prefetch likely-needed route modules. Speculation Rules target document URLs; module preload targets individual scripts.

**Compression Streams API**  
`CompressionStream` and `DecompressionStream` provide native gzip and deflate compression/decompression without a library. Used for compressing large state snapshots before writing to IndexedDB, and for decompressing compressed responses from the network.

### Memory vs. Performance Tradeoffs

Caching improves performance by avoiding recomputation but increases memory usage. Every cache in the system uses one of:

- `WeakMap` keyed by object reference — GC-eligible when keys are unreachable
- Bounded LRU cache with explicit eviction — fixed maximum size, oldest entries evicted
- Time-bounded cache with TTL — entries expire after a defined duration

Unbounded caches are prohibited. Every cache must document its maximum size and eviction policy.

---

---

# 15. memory-management.md

## Memory Management

### The Principal Causes of Memory Leaks in Web Applications

1. **Orphaned event listeners** — Listeners registered on global objects (`window`, `document`, `EventTarget` singletons) that are never removed when the subscribing component is destroyed
2. **Detached DOM subtrees** — DOM nodes removed from the document but still referenced in JavaScript (e.g., stored in an array or closure)
3. **Unbounded caches** — Maps, Sets, or arrays that grow indefinitely as the application runs
4. **Circular references in closures** — Less common in modern engines (V8's GC handles these) but relevant in older environments
5. **Worker leaks** — Workers created but never terminated; `MessagePort`s created but never closed

### WeakRef and FinalizationRegistry

`WeakRef` holds a reference to an object without preventing its garbage collection. `FinalizationRegistry` allows registering a callback that fires after a target object is GC'd. Together, these primitives enable cache architectures where cached values are automatically invalidated when their source objects are collected.

Caution: `FinalizationRegistry` callbacks are not guaranteed to fire promptly or even at all in some edge cases. They must not be relied upon for correctness; they are a best-effort performance optimisation only.

### Component Memory Lifecycle

The component memory lifecycle has three phases:

1. **Allocation** — Constructor creates local state, Shadow DOM, and template clone. No external subscriptions.
2. **Active** — `connectedCallback` subscribes to state, observers, and event sources. All subscriptions hold a reference to the component, preventing GC.
3. **Cleanup** — `disconnectedCallback` aborts all subscriptions via `AbortController.abort()`. External references to the component are dropped. The component becomes GC-eligible.

A component that completes phase 3 cleanly holds no external references and can be collected. A component that skips phase 3 (by failing to call `abort()`) will not be collected as long as any external system holds a reference to it — this is the prototype of the web app memory leak.

### Long-Lived Application Memory

In a long-lived SPA, routes are navigated repeatedly. If route components leak on each navigation, memory grows without bound. The router layer ensures that outgoing route components have their `disconnectedCallback` called before the new route's component is connected. The View Transition API's `startViewTransition()` wrapper is the point at which this handover occurs, and it must be instrumented to verify that disconnection fires reliably.

`PerformanceObserver` observing `'measure'` entries can be combined with explicit memory sampling via `performance.measureUserAgentSpecificMemory()` (where available) to verify that memory is not growing between route navigations during development.

---

---

# 16. security.md

## Security Architecture

### Web Crypto API

**Spec:** W3C Web Cryptography API Level 2  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API`  
**Status:** Widely available. Accessible via `window.crypto.subtle`.

`SubtleCrypto` provides cryptographic primitives: HMAC, AES-GCM, RSA-OAEP, ECDH, ECDSA, SHA-256/384/512, and more. All operations are asynchronous and run off the main thread in the browser's cryptography implementation. No third-party cryptography library is needed for common use cases.

Key management uses `CryptoKey` objects — non-extractable by default, which means the key material cannot be read from JavaScript even by the application itself. Keys can be exported in JWK format where key portability is required, or stored in IndexedDB as `CryptoKey` objects (they are structured-cloneable).

### Permissions API

**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Permissions_API`  
**Status:** Widely available

`navigator.permissions.query({ name: 'permission-name' })` returns a `PermissionStatus` object with a `state` of `'granted'`, `'denied'`, or `'prompt'`. The status object is `EventTarget`-based; subscribing to its `change` event allows the application to react when the user revokes a permission.

All permission-gated features (Clipboard, Notifications, Geolocation, Persistent Storage, File System Access) must query permission status before invoking the feature and handle all three states gracefully.

### Content Security Policy

The application's CSP header is the primary XSS mitigation. The system architecture enables a strict CSP:

- No `unsafe-inline` for scripts — all scripts are external module files
- No `unsafe-eval` — no dynamic code evaluation anywhere in the codebase
- `script-src` restricted to the application's origin and trusted CDN origins declared in the Import Map
- `style-src` allows inline styles only within Shadow DOM (which is scope-isolated anyway)

### Sanitizer API

**Status as of mid-2026:** Under active development. Chrome has experimental support; the specification is still evolving.

The Sanitizer API provides a native HTML sanitisation mechanism: `setHTMLUnsafe()` with a `Sanitizer` configuration object that whitelists allowed elements and attributes. Until this API achieves cross-browser Baseline status, `DOMParser` with manual XSS filtering or a well-audited third-party sanitiser (DOMPurify) must be used for any scenario where user-generated HTML is rendered.

No user-provided string may be inserted via `innerHTML` or `insertAdjacentHTML` without sanitisation. The system's template system renders exclusively via DOM API calls (`createElement`, `textContent`, attribute setters) for all non-user-generated content, which is inherently XSS-safe.

### Cross-Origin Security

Requests carrying credentials (cookies, HTTP auth) must declare `credentials: 'include'` explicitly. Same-origin policy is not configured or weakened in the application layer; CORS headers are a server concern. The application layer must not attempt to work around CORS restrictions.

`Trusted Types` API (where supported) provides a mechanism to enforce that strings cannot be used as HTML without passing through a declared policy. Implementing Trusted Types eliminates an entire class of DOM XSS vulnerabilities at the infrastructure level.

---

---

# 17. internal-api.md

## Internal API Specification

### Namespace Design Philosophy

The `core.*` namespace is the internal platform of this application. It exposes browser capabilities through ergonomic, consistent interfaces. Every module in the namespace is independently importable, tree-shakeable, and carries no dependency on any other `core.*` module unless explicitly declared. The namespace does not create a closed world; application code is free to call browser APIs directly when the abstraction adds no value.

### core.api — Networking

```
core.api.get(url, options?)          → Promise<T>
core.api.post(url, body, options?)   → Promise<T>
core.api.put(url, body, options?)    → Promise<T>
core.api.patch(url, body, options?)  → Promise<T>
core.api.delete(url, options?)       → Promise<T>
core.api.stream(url, options?)       → AsyncIterable<Chunk>
```

Options include: `signal` (AbortSignal), `cache` (strategy), `retries` (count), `timeout` (ms), `interceptors` (array), `priority` (scheduler priority).

### core.router — Navigation

```
core.router.navigate(url, state?)    → void
core.router.replace(url, state?)     → void
core.router.back()                   → void
core.router.forward()                → void
core.router.on(pattern, handler)     → Disposer
core.router.match(url)               → RouteMatch | null
core.router.currentEntry()           → NavigationHistoryEntry
```

### core.state — Reactive State

```
core.state.create(initialState)      → ReactiveStore
store.get(key)                       → value
store.set(key, value)                → void
store.subscribe(key, callback)       → Disposer
store.derived(keys, computeFn)       → ComputedValue
store.snapshot()                     → PlainObject
store.hydrate(snapshot)              → void
```

### core.events — Event Bus

```
core.events.emit(type, detail?)      → void
core.events.on(type, handler, signal?) → void
core.events.once(type)               → Promise<Event>
```

### core.storage — Persistence

```
core.storage.get(key)                → Promise<T | null>
core.storage.set(key, value)         → Promise<void>
core.storage.delete(key)             → Promise<void>
core.storage.query(store, query)     → Promise<T[]>
core.storage.estimate()              → Promise<StorageEstimate>
core.storage.persist()               → Promise<boolean>
```

### core.workers — Worker Management

```
core.workers.create(scriptUrl)       → ManagedWorker
core.workers.shared(name)            → SharedWorkerConnection
core.workers.broadcast(channel, msg) → void
core.workers.subscribe(channel, fn)  → Disposer
```

### core.ui — Component Utilities

```
core.ui.define(tag, Class)           → void
core.ui.transition(fn)               → Promise<ViewTransition>
core.ui.template(id)                 → DocumentFragment
core.ui.schedule(fn, priority?)      → Promise<void>
core.ui.observe.resize(el, fn)       → Disposer
core.ui.observe.intersection(el, fn, opts?) → Disposer
core.ui.observe.mutation(el, fn, opts?)     → Disposer
```

### core.security — Cryptography and Permissions

```
core.security.hash(data, algorithm?)          → Promise<ArrayBuffer>
core.security.hmac(key, data)                 → Promise<ArrayBuffer>
core.security.encrypt(key, data)              → Promise<ArrayBuffer>
core.security.decrypt(key, data)              → Promise<ArrayBuffer>
core.security.generateKey(algorithm, usage)   → Promise<CryptoKey>
core.security.permission(name)                → Promise<PermissionState>
core.security.sanitize(html, config?)         → string
```

---

---

# 18. native-platform-capabilities.md

## Native Platform Capabilities Assessment

### Most Powerful Underutilised APIs

**Scheduler API (`scheduler.postTask`, `scheduler.yield`)**  
Few production applications use this API despite its Baseline Widely Available status. Most still use `setTimeout(fn, 0)` for deferred work — a pattern with no priority semantics and no cancellation support. `scheduler.postTask` with its three priority levels and `AbortSignal` integration is a strictly superior replacement.

**URLPattern**  
Baseline Newly Available as of September 2025. Eliminates the need for any routing library for pattern matching. Works in Web Workers, making it available in the Service Worker layer for URL-based routing without bundling the router. Still largely unknown in the community.

**Navigation API**  
Baseline Newly Available as of January 2026. Provides a dramatically cleaner model for SPA navigation than the History API it replaces. The `navigate` event's ability to intercept all navigation types (including browser-initiated back/forward) is a capability that previously required extensive workarounds.

**View Transitions API**  
Baseline Newly Available as of October 2025. Makes animated page transitions trivially easy. Still widely unknown outside the Chromium developer community, partly because it only recently achieved cross-browser support.

**Web Locks API**  
Available in all modern browsers. Provides mutex-like coordination across tabs without any userland implementation. Almost never used outside PWA toolkits.

**BroadcastChannel**  
Fully supported everywhere. Eliminates the need for SharedWorker-based tab communication for simple use cases. Underused because developers are unaware of it.

**Compression Streams**  
Native gzip/deflate without a library. Relevant for any application that compresses state for storage or decompresses fetched archives.

**`content-visibility: auto`**  
A CSS property with a rendering impact comparable to a virtual scroll library, at zero JavaScript cost. Adoption is low because it requires understanding of browser rendering internals.

### Baseline Status Summary (as of mid-2026)

| API | Baseline Status |
|-----|-----------------|
| Web Components / Custom Elements v1 | Widely Available |
| Shadow DOM (Declarative) | Newly Available (Aug 2024) |
| HTML Templates | Widely Available |
| View Transitions API (same-doc) | Newly Available (Oct 2025) |
| Navigation API | Newly Available (Jan 2026) |
| URLPattern | Newly Available (Sep 2025) |
| Scheduler API | Widely Available |
| Web Locks API | Widely Available |
| BroadcastChannel | Widely Available |
| Fetch API / AbortController | Widely Available |
| Streams API (ReadableStream) | Widely Available |
| IndexedDB | Widely Available |
| Service Workers | Widely Available |
| Background Sync | Chromium only |
| Periodic Background Sync | Chromium/PWA only |
| Speculation Rules API | Chromium only |
| Web Crypto API | Widely Available |
| Compression Streams | Widely Available |
| File System Access API | Chromium + Safari (limited) |
| Sanitizer API | Experimental |

---

---

# 19. browser-api-research.md

## Browser API Research and Evaluation

### Web Components Three-Pillar Assessment

The three Web Components standards (Custom Elements, Shadow DOM, HTML Templates) are now simultaneously in Baseline Widely Available status. Declarative Shadow DOM — the capability that makes server-side rendering of Web Components practical — reached Baseline Newly Available in August 2024. Its specification changed in 2023, renaming the attribute from `shadowroot` to `shadowrootmode`; implementations before Chrome 124 use the older attribute name.

Shadow DOM's encapsulation model requires careful attention to accessibility. The flat tree (the composed tree including slotted content) is what assistive technologies traverse. ARIA attributes must be applied correctly in both the shadow tree and on the host element. Form participation through `attachInternals()` and `FormAssociated` is the correct approach for custom form controls; attempts to hack native form submission without this mechanism produce unreliable results across browsers.

### Navigation API vs History API: Architectural Comparison

The History API's fundamental design flaws are:

- `popstate` does not fire for `pushState()` calls — applications must fire it manually or use a custom event
- No programmatic interception of link-click-initiated navigations
- No unified model for push, replace, and traversal navigation types
- History state is limited to serialisable data but there is no size limit enforcement across browsers

The Navigation API resolves all of these. Its `navigate` event fires for every navigation type. `event.intercept()` converts a navigation to a client-managed one. `event.navigationType` distinguishes push/replace/reload/traverse. `window.navigation.entries()` provides full history access.

The Navigation API is a browser primitive that higher-level routers (React Router, TanStack Router) are exploring as a backend, per the InfoQ analysis from May 2026. This architecture builds directly on it rather than waiting for framework adoption.

### Streams API: Architectural Value

The Streams API's internal backpressure mechanism — where a slow consumer signals upstream producers to slow their production rate via `desiredSize` — is one of the most architecturally significant platform features for data-intensive applications. It eliminates the need for manual flow control in streaming pipelines. A `TransformStream` inserted between a `ReadableStream` and a `WritableStream` handles all buffering and timing automatically.

`ReadableStream` is now the return type of `response.body` from `fetch()`. This makes streaming HTTP responses a zero-additional-abstraction operation: the response body is already a stream.

### TC39 Signals: Pre-Ship Analysis

The TC39 Signals proposal (Stage 2 as of mid-2026) defines `Signal.State`, `Signal.Computed`, and `Signal.subtle.*`. The proposal is influenced by SolidJS, Angular 17+'s signal architecture, and Preact's signals. The proposal does not include built-in effects (DOM-linked reactions); those are intentionally left to framework-level integration.

The key architectural insight from the signals discussion: fine-grained reactivity without a virtual DOM (as in SolidJS) outperforms both the React model (component re-renders + VDOM diffing) and the "add signals to a VDOM framework" hybrid approach. The VDOM diffing step is the bottleneck; eliminating it rather than optimising it is the correct architectural direction.

This architecture's Proxy-based reactive layer is positioned to be migration-compatible with native signals when they ship, since both models express reactivity as "computed values that re-execute when their declared state dependencies change."

---

---

# 20. limitations-and-polyfills.md

## Limitations, Browser Gaps, and Polyfill Strategy

### Honest Assessment of Platform Limitations

**Background Sync — Firefox and Safari**  
Background Sync API is Chromium-only. For Firefox and Safari users, offline-queued operations must be retried synchronously when connectivity is detected via `navigator.onLine` changes and `online` event listeners. This is less reliable (the tab must be open) but functions as a fallback. Any application that uses Background Sync must implement this manual retry path as a first-class feature, not an afterthought.

**Speculation Rules API — Chromium Only**  
As of mid-2026, the Speculation Rules API is not in Firefox or Safari. Its absence means that MPA-style prefetch/prerender optimisations are Chromium-exclusive. The progressive enhancement approach: apply Speculation Rules in Chromium browsers via feature detection, rely on traditional `<link rel="prefetch">` (widely supported) for other browsers.

**Sanitizer API — Experimental**  
The Sanitizer API is not yet in Baseline. Until it is, DOMPurify or the `DOMParser`-based manual sanitisation pattern must be used for untrusted HTML. The architecture is designed with a sanitisation interface (`core.security.sanitize`) that can swap from a userland implementation to the native API when available, without changing call sites.

**File System Access API — Limited Safari Support**  
The File System Access API's `showOpenFilePicker()` and `showSaveFilePicker()` methods are Chromium-only. Safari supports a subset of the Origin Private File System (OPFS) but not the user-facing file picker. Applications requiring direct file system access must provide a `<input type="file">` fallback for non-Chromium browsers.

**Periodic Background Sync — PWA-Only**  
Periodic Background Sync requires the application to be installed as a PWA on Android Chrome. It is not available in desktop browsers or iOS. It cannot be used as a general-purpose background update mechanism; it is a native-app-tier feature for installed PWAs only.

### Import Maps and Polyfill Strategy

Import Maps are Baseline Widely Available. For the approximately 4% of users on older browsers (per `es-module-shims` benchmark data), the `es-module-shims` polyfill provides Import Map support at 1.4–1.5x native performance overhead. This polyfill adds ~13KB compressed and adds ~5ms initialisation overhead for the majority of users who pass through without needing the polyfill.

The progressive enhancement decision for Import Maps: ship with a native Import Map and include `es-module-shims` as a no-op passthrough for supported browsers, activating only for the polyfill-needing minority.

### Framework Comparison: Where Native Wins and Where It Struggles

**Where native wins:**

- Routing: Navigation API + URLPattern is as capable as any framework router and requires zero JavaScript library
- Styling: Shadow DOM + CSS custom properties is superior to CSS-in-JS for encapsulation
- Animation: View Transitions API is superior to Framer Motion for navigation transitions
- Streaming: Fetch + ReadableStream is competitive with any framework streaming solution
- Offline: Service Worker + IndexedDB is the same infrastructure any framework uses

**Where native requires more discipline:**

- Reactivity: Without signals, reactive state requires explicit subscription management. Frameworks abstract this; native code must be deliberate about it.
- Server-side rendering: Declarative Shadow DOM enables it, but the tooling ecosystem is thin compared to Next.js or Nuxt.
- Large-team ergonomics: Conventions must be enforced by code review and linting rather than by the framework itself. This increases the onboarding burden.
- TypeScript integration: Custom Elements are not type-inferred by default in TypeScript's JSX/DOM types. Type declarations for custom elements must be maintained manually or via a type generation tool.

### Long-Term Maintainability Considerations

This architecture's primary long-term maintenance advantage is that it builds on browser standards rather than framework APIs. Browser standards do not break; they only extend. A React application written against React 16's API is not forward-compatible with React 18 without migration work. A Web Components-based application written against the Custom Elements v1 specification is as valid today as it will be in ten years.

The primary maintenance risk is the discipline requirement: without framework-imposed conventions, architectural consistency depends on human convention-following. This risk is mitigated through a documented architecture (this document), automated linting rules enforcing module boundary constraints, and lifecycle auditing tooling that verifies `disconnectedCallback` cleanup coverage.

---

*End of Native-First Web Platform Architecture Specification*

---

**References and Standards:**

- WHATWG HTML Living Standard: `html.spec.whatwg.org`
- W3C CSS View Transitions Module Level 1: `w3.org/TR/css-view-transitions-1`
- W3C Web Cryptography API Level 2: `w3c.github.io/webcrypto`
- MDN Web Docs — Web Components: `developer.mozilla.org/en-US/docs/Web/API/Web_components`
- MDN Web Docs — Navigation API: `developer.mozilla.org/en-US/docs/Web/API/Navigation_API`
- MDN Web Docs — URL Pattern API: `developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API`
- MDN Web Docs — Scheduler API: `developer.mozilla.org/en-US/docs/Web/API/Scheduler`
- MDN Web Docs — Web Locks API: `developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API`
- MDN Web Docs — Streams API: `developer.mozilla.org/en-US/docs/Web/API/Streams_API`
- MDN Web Docs — BroadcastChannel: `developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API`
- Chrome for Developers — Speculation Rules: `developer.chrome.com/docs/web-platform/implementing-speculation-rules`
- web.dev — Declarative Shadow DOM: `web.dev/articles/declarative-shadow-dom`
- TC39 Signals Proposal: `github.com/tc39/proposal-signals`
- WICG Navigation API: `github.com/WICG/navigation-api`
- WICG URL Pattern API: `github.com/WICG/urlpattern`
- WICG Prioritized Task Scheduling: `wicg.github.io/scheduling-apis`
- InfoQ — Navigation API Baseline January 2026: `infoq.com/news/2026/05/navigation-api-browser`