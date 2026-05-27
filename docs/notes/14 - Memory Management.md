## Memory Management

**Version:** 1.0  
**Status:** Working Specification  
**Date:** May 2026  
**Authority:** MDN Web Docs, WHATWG Living Standard, W3C Specifications, TC39 Proposals  
**Companion documents:** component-lifecycle.md, performance.md, worker-architecture.md, storage.md

---

## Table of Contents

1. [The JavaScript Memory Model](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#1-the-javascript-memory-model)
2. [Principal Causes of Memory Leaks in Web Applications](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#2-principal-causes-of-memory-leaks-in-web-applications)
3. [Weak Collection Primitives](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#3-weak-collection-primitives)
4. [AbortController and AbortSignal as the Canonical Cleanup Mechanism](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#4-abortcontroller-and-abortsignal-as-the-canonical-cleanup-mechanism)
5. [Component Memory Lifecycle](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#5-component-memory-lifecycle)
6. [Observer API Cleanup Contracts](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#6-observer-api-cleanup-contracts)
7. [Worker Memory Management](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#7-worker-memory-management)
8. [Cache Architecture and Bounding Rules](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#8-cache-architecture-and-bounding-rules)
9. [Long-Lived SPA Memory — The Navigation Leak Problem](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#9-long-lived-spa-memory--the-navigation-leak-problem)
10. [Storage-Layer Memory Pressure](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#10-storage-layer-memory-pressure)
11. [Cross-Context Memory — Shared Workers and BroadcastChannel](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#11-cross-context-memory--shared-workers-and-broadcastchannel)
12. [Memory Measurement APIs](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#12-memory-measurement-apis)
13. [Device-Class Memory Budgeting](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#13-device-class-memory-budgeting)
14. [Detached DOM Subtrees](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#14-detached-dom-subtrees)
15. [Reactive State and Subscription Accounting](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#15-reactive-state-and-subscription-accounting)
16. [Anti-Patterns Catalogue](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#16-anti-patterns-catalogue)
17. [Memory Audit and Tooling Strategy](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#17-memory-audit-and-tooling-strategy)
18. [Design Rules Summary](https://claude.ai/chat/8b5c5cf3-99c7-48f5-95b2-24ed9ffff956#18-design-rules-summary)

---

---

## 1. The JavaScript Memory Model

### Automatic Management and Its Limits

JavaScript is a garbage-collected language. The developer does not `malloc` or `free`; the engine allocates memory when objects are created and reclaims it when those objects become unreachable. In V8 (the engine behind Chromium and Node.js), SpiderMonkey (Firefox), and JavaScriptCore (Safari/WebKit), the garbage collector runs periodically and non-deterministically, meaning the developer cannot force or predict collection timing.

This automatic model eliminates a wide class of errors — dangling pointers, double-free bugs, buffer overflows — that plague lower-level languages. However, it does not eliminate memory leaks. In JavaScript, a memory leak is not a freed-too-early object; it is an object that the developer believes is no longer needed but that the engine correctly keeps alive because there exists at least one reachable reference to it. The garbage collector is always right; the leak is always a reference-accounting error by the developer.

### Reachability as the Foundational Concept

The garbage collector uses a **mark-and-sweep** algorithm (with generational refinements). Starting from a set of root objects — `window`, `globalThis`, the current call stack, and static module exports — the collector traverses every reference chain transitively. Any object reachable from at least one root is live and will not be collected. Any object unreachable from all roots is dead and eligible for reclamation.

The implication is absolute: to allow an object to be collected, every strong reference to it must be dropped. A single forgotten reference — an event listener, an entry in a module-level Map, a closure over a variable in an outer scope — is sufficient to keep an object alive indefinitely.

### Generational Collection

V8 and other modern engines use a generational heap. The heap is divided into:

- **Young generation (nursery):** Most objects are allocated here. Short-lived objects (temporaries, intermediate values) are collected in minor GC cycles, which are fast and frequent.
- **Old generation (tenured heap):** Objects that survive one or more young-generation collections are promoted here. Major GC cycles sweep the old generation less frequently but more expensively.

A web application's memory profile is characterised by the ratio of objects that remain in the old generation. A healthy SPA should have a stable old-generation footprint after warm-up; continuously growing old-generation memory is the signature of a leak. Long-lived components — routing infrastructure, global event buses, the reactive state graph — will legitimately live in the old generation. The concern is whether removed route components and their subscriptions are correctly leaving the old generation after navigation.

### The Cost of GC Pauses

Major GC cycles cause pauses in JavaScript execution. V8's incremental and concurrent GC reduces these pauses significantly, but they are not zero. In memory-intensive applications, excessive object allocation (and subsequent collection) creates GC pressure that manifests as jank — irregular frame-time spikes visible to users. Reducing allocation rate, pooling frequently created objects, and avoiding the construction of large transient object graphs all reduce GC pressure independently of preventing full leaks.

---

---

## 2. Principal Causes of Memory Leaks in Web Applications

### 2.1 Orphaned Event Listeners

The most common cause of leaks in long-lived SPAs. A listener registered on a global target — `window`, `document`, the application event bus — holds a closure that typically references the subscribing component. As long as the listener is attached, both the listener and its closure targets are reachable from the root (`window`), regardless of whether the component has been removed from the DOM.

The correct model: every `addEventListener` call made after component construction must be paired with an `removeEventListener` call in the component's `disconnectedCallback`, or the listener must be registered with an `AbortSignal` that is aborted in `disconnectedCallback`.

### 2.2 Detached DOM Subtrees

A DOM node is "detached" when it has been removed from the document — via `removeChild`, `replaceWith`, `innerHTML` reassignment, or similar — but a JavaScript reference to it (or any of its descendants) still exists. The entire subtree remains in memory for as long as any reference to any node in it persists.

Common sources: arrays used to cache previously rendered lists, component instances stored in a module-level Map keyed by route, component base classes that log their instances, and event targets that were children of removed nodes but whose listeners hold references from external scopes.

### 2.3 Unbounded In-Memory Caches

Any `Map`, `Set`, or plain object that is written to unconditionally and never pruned will grow without bound over the application's lifetime. In a long-running SPA, this category of leak is particularly insidious because the growth rate is often low — hundreds of bytes per navigation — making the leak invisible during testing but significant after hours of use.

Every cache in this system must declare a maximum size and an eviction policy. Unbounded caches are prohibited by design rule.

### 2.4 Closure-Captured Object References

A closure — a function that closes over variables from an enclosing scope — holds strong references to those variables for its entire lifetime. If a long-lived function (a timer callback, an event handler, a promise chain continuation) closes over a large object, that object will live as long as the function does. The object itself may be logically "done," but the reference in the closure keeps it alive.

This pattern is most frequently problematic with: animation frame callbacks that capture component state, promise chains that capture request objects containing DOM references, and `setInterval` callbacks in global scope.

### 2.5 Uncleared Timers and Animation Frames

`setInterval`, `setTimeout`, and `requestAnimationFrame` all register callbacks in the browser's task queue. These callbacks are reachable from the browser runtime itself, and so are their closures. A `setInterval` that is never cleared runs forever and keeps all of its captured references alive forever. A recurring `requestAnimationFrame` loop that is never terminated via `cancelAnimationFrame` does the same.

### 2.6 Worker Leaks and Unclosed MessagePorts

A `Worker` created with `new Worker(url)` allocates a dedicated thread and a JavaScript realm. If the worker is never terminated via `worker.terminate()`, that thread and realm persist until the page is unloaded. Similarly, a `MessagePort` created via `new MessageChannel()` must be explicitly closed with `port.close()` when no longer needed; an open, unreferenced port is itself a leak.

`SharedWorker` instances persist as long as any context holds a connection. Failing to close the connection from a context that is being torn down may keep a shared worker alive longer than intended, consuming memory across all tabs.

### 2.7 Promise Chains Holding DOM References

A pending promise is reachable from the microtask queue. If a promise captures a reference to a DOM element in its executor or in a `.then()` handler, that element stays alive until the promise settles. This is particularly relevant for long-polling patterns, streaming responses, and any retry logic with exponential backoff — the initial request closure may hold references to elements that were removed between retries.

The correct mitigation: register an `AbortSignal` from the component's lifecycle controller with every long-running async operation. When the component is disconnected and the signal is aborted, the operation rejects, the promise chain settles, and the references are released.

### 2.8 Module-Level Side Effects and Global State

ES Module scope is persistent. Variables, Maps, and objects declared at the top level of a module remain alive for the life of the browsing context. Any component instance or DOM reference stored at module level — even accidentally, through a logging utility, a debug registry, or a development-only introspection tool — will never be collected. Module-level side effects that store references to application objects are a design violation and are prohibited by this architecture's module boundary rules.

---

---

## 3. Weak Collection Primitives

### The Problem Weak Collections Solve

Strong references — regular variables, `Map` entries, `Set` members, array elements — keep their target objects alive. This is correct when the reference is intentional. But in cache architectures and metadata-tracking systems, the desired semantics are: "hold this reference unless nothing else holds the target, in which case discard the cache entry automatically." This semantics cannot be expressed with strong references; it requires weak references.

The platform provides four weak-reference primitives, each with a distinct role.

### 3.1 WeakMap

**Spec:** ECMAScript 2015+  
**MDN:** `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap`  
**Baseline:** Widely Available

A `WeakMap` is a collection of key/value pairs where the keys must be objects (or registered symbols) and where the keys are held weakly. If an object used as a key is collected, its `WeakMap` entry is automatically removed. `WeakMap` does not prevent its keys from being garbage collected.

Critical constraint: `WeakMap` is not iterable. There is no `.keys()`, `.values()`, or `.entries()`. This is intentional — iteration would require materialising live keys, which would itself create strong references. The inability to iterate is not a limitation; it is the correct consequence of the semantics.

**Canonical use cases in this architecture:**

- Per-element metadata: attaching internal state to DOM nodes without creating a strong reference from the metadata store to the node
- Computed value caches: storing a derived value computed from a component without preventing the component from being collected
- Private instance data: implementing genuinely private fields before the `#field` syntax was universally available (still relevant for computed associations between two external objects)
- Observer registrations: tracking which observers are attached to which elements, so that the tracking structure does not prevent element collection

The key architectural insight: when a component is removed from the DOM and all strong references to it are dropped, any `WeakMap` entries keyed by that component are automatically invalidated. No explicit cleanup is required for the WeakMap; the GC performs it. This is the correct pattern for metadata that should "follow" an object without owning it.

### 3.2 WeakSet

**Spec:** ECMAScript 2015+  
**MDN:** `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet`  
**Baseline:** Widely Available

A `WeakSet` is a set of objects where membership is held weakly. If an object in the set is collected, it is automatically removed from the set. Like `WeakMap`, `WeakSet` is not iterable.

**Canonical use cases:**

- Tracking which objects have been "processed" without preventing their collection (visited node tracking in tree traversal)
- Preventing duplicate processing in a batch operation where the objects may be short-lived
- Guard flags: "is this component currently in a connecting state?" without requiring explicit cleanup of the guard

### 3.3 WeakRef

**Spec:** TC39 WeakRef Proposal — ECMAScript 2021  
**MDN:** `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakRef`  
**Baseline:** Widely Available

A `WeakRef` wraps an object with a weak reference. The wrapped object is accessed via `weakRef.deref()`, which returns the object if it is still alive or `undefined` if it has been collected. The `WeakRef` itself does not prevent collection of its target.

**Critical contract:** the result of `deref()` is only guaranteed to be stable within a single synchronous execution turn (task). Across `await` boundaries, the GC may collect the target. Correct usage always checks the result of `deref()` before use and handles the `undefined` case explicitly. Treating `deref()` as a nullable pointer is the correct mental model.

**Canonical use cases:**

- Manual cache entries where the value may be collected: the cache holds a `WeakRef` to the value; when `deref()` returns `undefined`, the cache miss path is taken and the value is recomputed
- Observer callback targets: a system that needs to call back on an object can hold a `WeakRef` rather than a strong reference, allowing the callback target to be collected if it goes out of use
- Subscription registries that should not prevent subscriber collection

**Important non-use-case:** `WeakRef` must not be used as the primary mechanism for cleanup. It is not a replacement for `disconnectedCallback`. The GC may defer collection indefinitely under memory pressure, meaning a `WeakRef`-based cleanup strategy may produce long-lived leaks in low-memory situations. `WeakRef` is a performance optimisation, not a correctness mechanism.

### 3.4 FinalizationRegistry

**Spec:** TC39 WeakRef Proposal — ECMAScript 2021  
**MDN:** `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry`  
**Baseline:** Widely Available

`FinalizationRegistry` allows registering a callback — a finalizer — that fires after a registered target object is garbage collected. The finalizer receives a held value (a token provided at registration time, not the collected object itself — passing the object as its own held value would be a strong reference and would prevent collection).

**Non-determinism guarantee (negative):** The specification explicitly states that finalizer callbacks:

- Are not guaranteed to run promptly after collection
- Are not guaranteed to run at all in some edge cases (e.g., page unload)
- Will not run on the microtask queue — they run on the task queue, typically during or after a GC cycle
- May be interleaved arbitrarily with other tasks

These constraints establish a hard boundary on the use of `FinalizationRegistry`. It must never be used for correctness-critical cleanup — releasing a lock, committing a write, sending a network request, or updating a data structure that other code depends on. Finalizers are appropriate only as a best-effort backstop.

**Correct use cases:**

- Detecting and logging leaked component instances during development (the held value carries a component type name and ID; the callback logs "Component X was GC'd without clean disconnection")
- Releasing native resources (WebAssembly memory, `GPU.Device` objects) as a safety net when the explicit cleanup path was not reached
- Cache housekeeping: when a `WeakRef`-valued cache entry's target is collected, the finalizer can remove the now-dead key from the cache to prevent the key set from growing unboundedly

**The Cloudflare insight (June 2025):** Cloudflare Workers added `FinalizationRegistry` support primarily to enable Emscripten and wasm-bindgen toolchains to automatically free WebAssembly heap allocations. The guidance from their engineering blog is explicit: ship `FinalizationRegistry` as a safety net and implement deterministic resource cleanup (Explicit Resource Management, `using` declarations) as the primary path. This is the correct posture for any system that uses `FinalizationRegistry`.

### Weak Collection Decision Matrix

|Scenario|Correct Primitive|
|---|---|
|Metadata attached to DOM nodes|`WeakMap` (key = node)|
|Tracking which objects have been visited|`WeakSet`|
|Cache where values can be collected|`WeakRef` inside `Map` with `FinalizationRegistry` for cleanup|
|Safety net for missed cleanup|`FinalizationRegistry`|
|Primary cleanup mechanism|**None** — use `AbortController` + `disconnectedCallback`|

---

---

## 4. AbortController and AbortSignal as the Canonical Cleanup Mechanism

### Design Rationale

`AbortController` and `AbortSignal` are the platform's built-in mechanism for cooperative cancellation and cleanup. In this architecture, they serve as the primary instrument for component lifecycle teardown — not a supplementary pattern but the mandatory first tool.

The reason for this primacy is ergonomic and correctness-preserving simultaneously. A single `AbortController` per component can cascade its cancellation signal to:

- All `addEventListener` calls (via the `{ signal }` option)
- All `fetch` requests initiated during the component's active period
- All `scheduler.postTask()` tasks (via the `signal` option)
- All custom async operations that accept and respect an `AbortSignal`
- All Streams API consumers that use `signal` for backpressure release

This means the entirety of a component's external relationship graph can be severed with a single `controller.abort()` call in `disconnectedCallback`. No arrays of cleanup functions, no explicit `removeEventListener` calls, no manual tracking of in-flight requests.

### Signal Propagation and Composition

`AbortSignal.any([signal1, signal2, ...])` (Baseline Widely Available as of 2024) creates a new signal that aborts when any of its constituent signals abort. This enables signal composition: a component-level signal can be combined with a route-level signal, so that cleanup occurs at the earliest of component disconnection or route exit — whichever happens first.

`AbortSignal.timeout(ms)` creates a signal that aborts after a duration. This replaces `setTimeout`-based timeouts on fetch requests and is cancellable, unlike a timeout implemented with `setTimeout`.

### AbortController and the AbortError Contract

When `controller.abort()` is called, every operation registered with `controller.signal` receives an `AbortError` (a `DOMException` with `name === 'AbortError'`). Correct code treats `AbortError` as a normal termination path — it does not log it as an error, does not display an error UI, and does not retry the operation. The signal was aborted intentionally; the `AbortError` is the mechanism by which that intention propagates to all registered operations.

All error handling code in this architecture must explicitly distinguish `AbortError` from genuine failures before deciding whether to log, alert, or retry.

### Signal as a Lifecycle Token

The idiomatic pattern in this architecture:

- One `AbortController` is created at the start of `connectedCallback` and stored as a private field on the component
- The controller's signal is passed to every subscription established during the active phase
- `disconnectedCallback` calls `controller.abort()` — one call cleans up everything
- If `connectedCallback` can fire multiple times (element moved in DOM), a new controller is created each time `connectedCallback` runs, and the previous one is aborted first if it exists

This pattern produces a determistic, auditable cleanup path. If `disconnectedCallback` is instrumented to verify that `controller.abort()` was called, automated testing can verify that every component subclass correctly cleans up.

---

---

## 5. Component Memory Lifecycle

### The Three-Phase Model

The Custom Elements lifecycle maps directly to a three-phase memory ownership model. Every component must travel through all three phases without exception.

**Phase 1 — Allocation (constructor)**

The constructor is the only phase where external subscriptions are prohibited. Memory allocated here — the Shadow DOM, template clones, initial property values, the `AbortController` declaration — is owned entirely by the component. No external system holds a reference to the component yet (beyond its insertion into the DOM, which is managed by the parser or by the connecting code). GC-eligibility is trivially achievable if the component is created and immediately discarded without being inserted into a document.

Objects created in the constructor: Shadow root, template clone, `AbortController` instance (declared but not yet active), initial reactive state properties. All are private to the component.

**Phase 2 — Active (connectedCallback)**

`connectedCallback` transitions the component from isolated to subscribed. After this callback, the component has established references into external systems and, critically, external systems have established references back into the component (through event listener closures, observer callbacks, state subscription callbacks). The component is now strongly reachable from external roots and will not be collected regardless of whether any external code holds an explicit reference to the element.

Every subscription established in `connectedCallback` must pass `controller.signal` (or another signal derived from it). This requirement is non-negotiable; subscriptions without a signal have no deterministic cleanup path.

`connectedCallback` may fire more than once if the element is moved in the DOM. The implementation must either:

- Guard with a flag (`if (this.#connected) return`) for subscriptions that should only fire once
- Abort the previous controller and create a new one, re-establishing all subscriptions, for subscriptions that should re-establish after a move

**Phase 3 — Cleanup (disconnectedCallback)**

`disconnectedCallback` terminates the active phase. Its entire responsibility is to call `this.#controller.abort()`. This single call propagates cancellation to every event listener, every fetch request, every scheduled task, and every observer callback registered during the active phase.

After `disconnectedCallback` completes:

- The component holds no strong references to external systems (listeners are removed, observers are disconnected, requests are cancelled)
- External systems hold no strong references to the component (listener closures are released from their `EventTarget`s, observer callbacks are no longer registered)
- The component is GC-eligible

A component that fails Phase 3 — that never calls `controller.abort()`, or that calls it but left subscriptions outside the signal's scope — will remain alive as long as any external system references it. This is the canonical web application memory leak.

### Lifecycle Audit Requirement

Every component class must be auditable for Phase 3 coverage. The audit checks:

- `disconnectedCallback` is defined (not inherited from a base class without explicit override if the subclass adds subscriptions)
- `controller.abort()` is the first call in `disconnectedCallback` (or is delegated to a `super.disconnectedCallback()` that does this)
- No subscriptions in `connectedCallback` bypass the signal (no `addEventListener` without `{ signal }`, no fetch without `signal`, no `postTask` without `signal`)

This audit is automatable via static analysis. A linting rule that flags `addEventListener` calls without a `signal` option inside any `connectedCallback` method is a first-order implementation priority.

---

---

## 6. Observer API Cleanup Contracts

The browser provides five observer APIs that create long-lived callbacks into component code. Each requires explicit disconnection; none respects the `AbortSignal` pattern (as of mid-2026 — none of these APIs has adopted the `signal` convention). This means each observer must be stored as a private field and explicitly disconnected in `disconnectedCallback`, in addition to the `AbortController`-based cleanup.

### 6.1 IntersectionObserver

**Spec:** W3C IntersectionObserver  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver`  
**Baseline:** Widely Available

`IntersectionObserver` calls back when the intersection ratio between an observed element and a root changes. It holds a strong reference to the callback function, which typically closes over the component. Cleanup requires calling `observer.disconnect()`, which stops all observations and releases the callback.

The component's `disconnectedCallback` must call `this.#intersectionObserver.disconnect()` and then set `this.#intersectionObserver = null` to release the observer itself. If the observer was created lazily (only when the component was connected), the null check before disconnect is required.

### 6.2 ResizeObserver

**Spec:** W3C ResizeObserver  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/ResizeObserver`  
**Baseline:** Widely Available

`ResizeObserver` calls back when the content rectangle of an observed element changes. Its cleanup contract is identical to `IntersectionObserver`: call `observer.disconnect()` in `disconnectedCallback`.

A single `ResizeObserver` instance can observe multiple elements with `observer.observe(el)`. `observer.unobserve(el)` removes a single element from observation. `observer.disconnect()` removes all observed elements. The pattern of one observer instance per component (observing the component's own shadow host or a key internal element) is preferred over per-element observers.

### 6.3 MutationObserver

**Spec:** DOM Living Standard  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/MutationObserver`  
**Baseline:** Widely Available

`MutationObserver` calls back when specified DOM mutations occur on an observed node. The observer holds a strong reference to the callback and to the observed nodes. Cleanup requires `observer.disconnect()`.

A important subtlety: `MutationObserver` queues its callbacks as microtasks. If `observer.disconnect()` is called while a callback is already queued, the queued callback still runs. Code in the callback must check whether the component is still connected before performing DOM mutations or state updates in response, to avoid acting on a component that has just been disconnected.

### 6.4 PerformanceObserver

**Spec:** W3C Performance Timeline  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver`  
**Baseline:** Widely Available

`PerformanceObserver` calls back when performance entries of specified types are added to the timeline. Cleanup requires `observer.disconnect()`. Performance observers used for component-level measurement (e.g., measuring the render time of a heavy list component) must be disconnected when the component is disconnected.

Application-level `PerformanceObserver` instances — those monitoring Core Web Vitals, long tasks, or memory at the page level — are intentionally long-lived and are managed by the platform layer, not by individual components.

### 6.5 ReportingObserver

**Spec:** W3C Reporting API  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/ReportingObserver`  
**Baseline:** Limited (Chromium-only as of mid-2026)

`ReportingObserver` observes browser-generated reports (CSP violations, deprecated API usage, interventions). Cleanup requires `observer.disconnect()`. Application-level `ReportingObserver` instances are managed by the security layer.

### Observer Storage Pattern

Each component that uses observers stores them as private class fields. The `disconnectedCallback` has a defined cleanup section that disconnects every stored observer. The pattern is invariant and not conditional — every observer stored in a field gets disconnected, regardless of whether it has any active observations:

```
Private fields: #controller, #resizeObserver, #intersectionObserver
disconnectedCallback: abort controller → disconnect each observer → null each field
```

The nulling of fields after disconnect serves two purposes: it releases the observer object from the component's own reference, making the observer GC-eligible, and it produces a `NullPointerException`-equivalent (`Cannot read properties of null`) if code incorrectly tries to use the observer after disconnection — making bugs loudly visible rather than silently incorrect.

---

---

## 7. Worker Memory Management

### 7.1 Dedicated Worker Lifecycle

A `Worker` instantiated with `new Worker(scriptUrl)` allocates a dedicated thread and JavaScript execution context. The worker's memory is logically separate from the main thread heap but contributes to the process's total memory consumption.

**Termination obligation:** A worker that is no longer needed must be terminated via `worker.terminate()`. This forcibly stops the worker's execution, closes its event loop, and allows its heap to be reclaimed. There is no auto-termination for dedicated workers; the browser does not clean them up when the main thread drops its reference — or rather, it does eventually, but only via the GC noticing the worker object is unreachable, which is non-deterministic.

The correct pattern: every dedicated worker is created with an associated `AbortController`. When the feature that uses the worker is deactivated — a route transition, a dialog close, a feature flag toggle — the signal is aborted, the worker receives a "terminate" message, the worker self-terminates via `self.close()`, and the main thread calls `worker.terminate()` as a safety net.

**Transferable objects:** Passing large `ArrayBuffer` objects to a worker via `postMessage` without using `transfer` copies the buffer — creating a duplicate in both heaps. Using the transferable mechanism (`postMessage(data, [data.buffer])`) transfers ownership, zeroing the buffer in the sending context and making it live only in the receiving context. This is not an optimisation; it is the correct memory model for large binary data passed to workers. Copy-based transfer is a design error for buffers above a few kilobytes.

### 7.2 Shared Worker Lifecycle

A `SharedWorker` persists as long as at least one context (tab, iframe, worker) holds an open `MessagePort` connection to it. When the last connection is closed, the browser may terminate the shared worker — but this is implementation-defined and not guaranteed to be prompt.

Every context that opens a connection to a shared worker must close the connection when the context is torn down. For tab-level connections, this means closing the port in the `beforeunload` or `pagehide` event handler — but these handlers are not always reliable for all exit paths (process kill, crash, iOS tab backgrounding). The architecture must tolerate a shared worker persisting longer than expected.

**Memory isolation consideration:** A shared worker that accumulates state (a WebSocket connection pool, an authentication token, a rate limiter state) must have explicit eviction paths for that state. Entries that correspond to closed contexts must be removed when those contexts disconnect, not retained indefinitely.

### 7.3 Service Worker Memory

Service workers are managed by the browser and are not subject to the same explicit termination requirement as dedicated workers. The browser will start and stop service workers according to its own policy, typically terminating idle service workers after 30–60 seconds to reclaim memory. Code in a service worker must be written to tolerate being started cold at any point — there is no persistent in-memory state across service worker activations.

Any state that the service worker needs between invocations must be stored externally — in IndexedDB, the Cache API, or `self.caches`. In-memory caches in a service worker context are volatile and should only be used as a performance layer over durable storage, not as the authoritative store.

### 7.4 MessagePort Management

`MessageChannel` creates two linked `MessagePort` objects. When a request/response pattern uses a channel per request, the ports from completed exchanges must be explicitly closed with `port.close()`. An unclosed `MessagePort` keeps the channel alive and prevents GC of any objects captured in its event handlers.

The pattern: create a `MessageChannel`, pass one port to the worker with the request, retain the other port. When the response arrives on the retained port, close both ports. If no response arrives within a timeout, close both ports regardless. Leaked ports are a category of resource leak that does not appear in standard memory profiling because ports are OS-level resources, not just heap memory.

---

---

## 8. Cache Architecture and Bounding Rules

### The Prohibition on Unbounded Caches

Every cache in this system must be bounded. An unbounded cache is a slow memory leak: its growth rate may be low (kilobytes per navigation), but over hours or days of use, it accumulates to the point of browser-imposed throttling, tab killing, or user-visible performance degradation.

Bounding requires two decisions: maximum size and eviction policy. The three permissible cache architectures are:

### 8.1 WeakMap-Based Cache (GC-Eligible Values)

The simplest bounded cache: a `WeakMap` keyed by object reference. The cache is automatically bounded because the GC evicts entries when their keys are no longer strongly referenced elsewhere. No explicit eviction logic is required.

**Correct for:** per-object computed values (derived state, formatted output, layout measurements), per-node metadata, per-request response bodies.

**Incorrect for:** caches keyed by strings or primitives (WeakMap requires object keys), caches where the keying object is long-lived (the entry will never be evicted), caches that need to be iterable for bulk operations.

### 8.2 Bounded LRU Cache

A fixed-capacity Map that, when full, evicts the least recently used entry to make room for new entries. The LRU invariant is maintained efficiently with a doubly-linked list for O(1) eviction and a hash map for O(1) access.

**Capacity declaration is mandatory.** The capacity must be declared at construction time and documented with a rationale for the chosen size. The rationale must address worst-case memory consumption per entry.

**Eviction notification:** When an entry is evicted from the LRU cache, any cleanup associated with the entry (closing a connection, cancelling a fetch, unsubscribing from a state store) must be performed. The eviction callback pattern — a function called by the cache on eviction — is the correct mechanism.

**Correct for:** API response caches, computed value caches keyed by strings or IDs, route-level component state, image data caches.

### 8.3 Time-Bounded (TTL) Cache

A cache where entries expire after a defined time-to-live, regardless of access frequency. Stale entries are evicted lazily on access (the entry is present but expired; it is removed and a cache miss is signalled) or eagerly via a periodic sweep.

Eager sweeping uses `scheduler.postTask()` with `background` priority to avoid impacting foreground work. The sweep interval must be significantly longer than the TTL to avoid the sweep running more frequently than entries expire.

**Correct for:** API responses with defined freshness semantics (`Cache-Control: max-age`), rate-limiter state, permission check results.

### 8.4 Cache Eviction Policy Documentation Standard

Every cache in this codebase must be documented with:

- Maximum entry count or maximum byte size
- Eviction policy (LRU, TTL, GC-driven, or explicit)
- Entry cleanup callback (if entries hold resources)
- The rationale for the chosen capacity

Cache declarations without this documentation are treated as incomplete during code review, regardless of their functional correctness.

### 8.5 The Cache/Memory Tradeoff

Caching trades memory for computation. The optimal cache size is not "as large as possible" — it is the size at which the hit rate plateaus while memory consumption remains within the device's capability tier. For low-memory devices (see §13), cache sizes must be reduced proportionally. A cache configured for a desktop browser with 8GB of RAM is not appropriate for a mobile device with 2GB.

---

---

## 9. Long-Lived SPA Memory — The Navigation Leak Problem

### The Accumulation Pattern

In a SPA, the user navigates between routes without triggering full page reloads. Each navigation:

1. Disconnects the outgoing route's component tree
2. Connects the incoming route's component tree

If every disconnection correctly cleans up all subscriptions and releases all references, the memory profile after navigation stabilises — the old route's memory is collected, and only the new route's memory is live. A healthy SPA's memory profile is flat across navigations.

If any component in the outgoing tree fails Phase 3 cleanup, it leaves a retained subgraph in memory. On the next navigation to the same route, a second instance of that component is created. On the navigation after that, a third. Over dozens of navigations, even a small per-navigation leak accumulates into a significant footprint — a pattern sometimes called a "navigation leak."

### The View Transition Handover Point

In this architecture, navigations are mediated by the View Transitions API (`document.startViewTransition()`). The callback passed to `startViewTransition` is the precise point at which the outgoing tree is disconnected and the incoming tree is connected. This handover must be instrumented in development builds to verify that disconnection fires reliably for every outgoing component.

The instrumentation strategy: a development-mode `FinalizationRegistry` registers each component instance on `connectedCallback` (held value: component type + ID string). When a component is collected after navigation, the registry logs the collection. If a component that should have been collected (because it was in the outgoing route tree) is never logged as collected after a navigation, it has leaked — it is being held alive by an unreleased reference.

This is the correct use of `FinalizationRegistry`: as a development-mode leak detector, not as a cleanup mechanism.

### Route-Level Component Caching

Some architectures intentionally cache outgoing route components — retaining them in a hidden state rather than destroying and recreating them on return navigation, for performance. This pattern is architecturally valid but fundamentally changes the memory model. A cached-but-hidden component is intentionally retained in memory; it must not register external subscriptions while hidden (because those subscriptions would keep it alive even if the cache were flushed). The lifecycle model for cached routes requires a fourth phase: "suspended," during which the component is alive but has aborted its active subscriptions.

This architecture does not implement route caching in its base form. If route caching is added as an enhancement, it must be accompanied by a documented "suspend/resume" lifecycle that correctly manages subscription state.

### Memory Growth Monitoring Between Routes

`performance.measureUserAgentSpecificMemory()` — where available (Chromium only, requires `crossOriginIsolated` headers) — can be called before and after a navigation round trip to quantify whether memory is growing. A script that navigates the SPA through its full route set and measures memory before and after each navigation provides a regression test for navigation leaks.

In environments where `measureUserAgentSpecificMemory` is not available, the legacy `performance.memory.usedJSHeapSize` (Chromium-only, no isolation requirement) provides a coarser but accessible signal. Neither API is standards-compliant for production use, but both are acceptable in development and CI test environments.

---

---

## 10. Storage-Layer Memory Pressure

### IndexedDB and the In-Memory Buffer Layer

IndexedDB is a disk-backed store, but the browser maintains an in-memory buffer of recently accessed records. This buffer contributes to the page's memory footprint. For applications with large IndexedDB datasets, this buffer can be significant.

The `core.storage` layer maintains an LRU cache in front of IndexedDB (see §8.2). The relationship between this in-memory LRU and IndexedDB's own buffer layer must be understood: the LRU cache bounds the application-managed in-memory footprint, but it does not control the browser-managed IndexedDB buffer. Applications that read a large proportion of the IndexedDB dataset should expect browser-managed buffering to contribute to memory usage beyond what the LRU cache alone accounts for.

### Cache API Storage and Quota

The Cache API stores `Response` objects. Each cached response occupies memory proportional to its body size. For Service Workers that cache large assets (fonts, images, large JSON bundles), the cache's memory footprint can be substantial. The Cache API's storage is quota-shared with IndexedDB; the `navigator.storage.estimate()` API returns a combined quota estimate for both.

The `core.storage` layer monitors quota usage at startup and during heavy write periods. When usage exceeds a configurable threshold (default: 80% of estimated quota), the system triggers:

1. Eviction of stale Cache API entries (entries older than their declared TTL, or the oldest entries in order of access time)
2. Pruning of least-recently-accessed IndexedDB records based on access-time metadata
3. Re-request of persistent storage if not already granted

This is a reactive pressure response. Proactive memory management in the storage layer involves sizing the initial cache capacities based on device memory tier (§13).

### Compression for Storage-Bound Data

The Compression Streams API (`CompressionStream`, `DecompressionStream`) provides native gzip and deflate compression without a library. For large data structures written to IndexedDB — state snapshots, bulk export data, offline-queued operations — compressing before write and decompressing after read can reduce storage footprint by 60–80% for typical JSON payloads.

Compression is CPU work and must be offloaded to a `Dedicated Worker` to avoid blocking the main thread. The pattern: write path sends the raw data to the worker, the worker compresses and returns the compressed `ArrayBuffer` (transferred, not copied), the main thread writes the compressed buffer to IndexedDB. The read path reverses this.

This pattern reduces both storage consumption and the memory footprint of the IndexedDB in-memory buffer, since the engine buffers the smaller compressed representation.

---

---

## 11. Cross-Context Memory — Shared Workers and BroadcastChannel

### BroadcastChannel Lifecycle

A `BroadcastChannel` is created by name: every context that creates a channel with the same name joins the same logical channel. Messages posted to the channel are delivered to all other contexts. The channel holds a strong reference to its `onmessage` handler (or to all handlers added via `addEventListener`).

**Cleanup obligation:** `channel.close()` must be called when a context is being torn down. For a component that subscribes to cross-tab state updates via `BroadcastChannel`, the channel must be closed in `disconnectedCallback`. Failure to close the channel does not prevent the component from being collected (the channel is local to the component's context), but it leaves an open OS-level resource and continues receiving messages that are silently ignored — a resource waste pattern.

For application-level broadcast channels (opened at module scope, persisting for the page's lifetime), closure is managed on `pagehide` or `beforeunload`. These are page-lifecycle events, not component lifecycle events; they are managed by the core platform layer, not by individual components.

### SharedWorker Port Cleanup

When a tab opens a connection to a `SharedWorker`, it receives a `MessagePort`. This port must be closed when the tab no longer needs the shared worker's services. For tabs that use the shared worker for their entire lifetime (e.g., maintaining a WebSocket connection), the port is closed on `pagehide`.

The `SharedWorkerGlobalScope` itself should listen for `connect` and track port disconnections via the `messageerror` event pattern. When a port is closed by its context, the `message` event fires with an error; the worker should remove the port from its active port set. A shared worker that never cleans up its internal port registry will accumulate dead ports indefinitely.

---

---

## 12. Memory Measurement APIs

### 12.1 performance.measureUserAgentSpecificMemory()

**Spec:** WICG Performance Measure Memory  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory`  
**Status:** Chromium only. Not Baseline. Requires `crossOriginIsolated` context (COOP + COEP headers).

This API estimates the total memory used by the web page, including all iframes and workers. Unlike the legacy `performance.memory.usedJSHeapSize`, it accounts for memory shared across tabs and provides a breakdown by attribution (URL, frame URL, worker URL) and type (JS, DOM, Wasm).

Calling `measureUserAgentSpecificMemory()` may trigger a garbage collection cycle, which is why Chrome waits up to 20 seconds before resolving the promise (GC is triggered, then the measurement is taken). This behaviour makes it unsuitable for continuous high-frequency monitoring; it is appropriate for periodic sampling (every 5–15 minutes in production, after each route navigation in development).

The recommended sampling strategy: use a randomised exponential interval to avoid synchronising with other periodic work and to smooth the measurement distribution. The WICG specification itself recommends this pattern.

The `crossOriginIsolated` requirement means this API is only available on pages served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. This is a real deployment constraint; applications that embed third-party iframes without explicit `crossOriginEmbedderPolicy: 'credentialless'` support cannot enable `crossOriginIsolated`.

**Use in this architecture:** Development builds and CI environments where `crossOriginIsolated` is enabled use this API for navigation leak regression testing. Production builds may use it where the COOP/COEP headers are deployed. It is never used as a hard dependency for correctness.

### 12.2 PerformanceObserver for Memory-Related Metrics

**Spec:** W3C Performance Timeline  
**Baseline:** Widely Available

While `PerformanceObserver` does not directly measure heap size, it provides several entry types relevant to memory-pressure diagnosis:

- `longtask` entries: long tasks (>50ms) on the main thread that are often caused by GC pauses in memory-pressured sessions
- `measure` entries: user-defined performance marks bracketing suspected memory-intensive operations
- `resource` entries: large resource downloads that, if not released correctly, contribute to detached DOM and large buffer leaks

The system uses `PerformanceObserver` observing `longtask` entries in a `Dedicated Worker` to detect GC-induced jank without adding measurement overhead to the main thread. When the observer fires more than a configurable threshold of long tasks per minute, the telemetry layer logs a potential memory pressure event alongside the current `navigator.deviceMemory` value (for context).

### 12.3 navigator.deviceMemory

**Spec:** W3C Device Memory API (Working Draft, updated March 2026)  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory`  
**Status:** Limited Availability — Chromium and Edge support it; Firefox and Safari do not (as of mid-2026). Requires a secure context (HTTPS).

`navigator.deviceMemory` returns an approximation of the device's RAM in gigabytes, coarsened to the nearest power of two and clamped to protect privacy. Typical values: `0.25`, `0.5`, `1`, `2`, `4`, `8`. The value is a hint, not a benchmark — a device reporting `4` may have exactly 4GB or any value in the range `[3, 7]`.

The value is available in both `Window` and `WorkerNavigator` contexts, making it usable in workers for device-tier decisions.

**Fingerprinting constraint:** The coarsening is intentional privacy protection. The Device Memory API must not be combined with other device-identifying signals in a way that enables user tracking; it is a progressive enhancement hint, not an identity signal.

### 12.4 The Legacy performance.memory API

The non-standard `performance.memory` object — which exposes `usedJSHeapSize`, `totalJSHeapSize`, and `jsHeapSizeLimit` — is Chromium-only and has been in a state of "to be removed" for years without actual removal. It remains accessible in Chromium as of mid-2026.

Its limitations: it reflects only the JavaScript heap, not DOM memory, CSS memory, or worker memory. It returns the shared heap size in multi-origin contexts (where Chromium shares a renderer process), making its values ambiguous. It has no equivalent in Firefox or Safari.

This architecture does not rely on `performance.memory` for production monitoring. It is acceptable as a coarse, quick signal in development console debugging. For any measurement used to make architectural decisions or file performance regressions, `performance.measureUserAgentSpecificMemory()` (with its `crossOriginIsolated` requirement) is the correct tool.

---

---

## 13. Device-Class Memory Budgeting

### The Device Tier Model

Not all users run on devices with abundant RAM. A native application on iOS targets a specific device class; a web application must serve all devices from a low-end Android phone with 2GB of RAM to a desktop workstation with 64GB. Memory budget decisions that are correct for high-end devices can produce out-of-memory kills on low-end devices.

This architecture defines three device memory tiers based on `navigator.deviceMemory`:

|Tier|`deviceMemory` value|Strategy|
|---|---|---|
|Low|`< 2` (values: 0.25, 0.5, 1)|Minimum caches, aggressive eviction, reduced worker count|
|Mid|`2` or `4`|Standard caches, standard eviction|
|High|`≥ 8`|Larger caches, less aggressive eviction, full feature set|

When `navigator.deviceMemory` is unavailable (Firefox, Safari), the system defaults to Mid tier.

### Tier-Based Cache Sizing

Cache capacity declarations are expressed as tier-relative multipliers, not absolute values. The base capacity is defined for Mid tier; Low tier uses a multiplier of 0.5 and High tier uses a multiplier of 2.0.

This approach ensures that cache size decisions remain rational across device classes. A cache that holds 200 entries on Mid tier holds 100 on Low and 400 on High. If 200 entries is the "right" size for a Mid device, halving it for Low and doubling for High is a reasonable proportional policy.

### Reducing Worker Count on Low-Memory Devices

Dedicated workers consume separate heap memory. On Low tier devices, worker instantiation should be deferred or pooled. A worker pool with a maximum count of 1 (serialised work) is appropriate on Low tier; the default pool of 2–4 workers is appropriate on Mid and High tiers. The `scheduler.postTask()` API can absorb work that would have gone to a worker by chunking it with `scheduler.yield()` on the main thread — a less ideal but memory-cheaper fallback.

### Adaptive Image and Asset Handling

The Device Memory API's primary documented use case is adaptive asset serving: requesting lower-resolution images, smaller fonts, or simplified visual assets for Low tier devices. In this architecture, the `core.api` layer can include a `Sec-CH-Device-Memory` Client Hint header in requests when the application is served with `Accept-CH: Sec-CH-Device-Memory`, allowing the server to respond with device-appropriate assets without requiring client-side logic beyond the feature-detection guard.

---

---

## 14. Detached DOM Subtrees

### Definition and Detection

A detached DOM node is a node that has been removed from the live document (the tree rooted at `document`) but that is still reachable from JavaScript. The node is "detached" from the DOM but "attached" to the JavaScript heap. The entire subtree descended from a detached node is also detached, even if only the root is directly referenced.

Detached nodes are a distinct category of leak because they combine JavaScript heap retention (via the direct reference) with DOM memory retention (the browser's layout and style information for each node). Chrome DevTools' Memory profiler can surface detached DOM trees explicitly in heap snapshots; they appear under the "Detached" filter in the constructor column.

### Common Sources

**Stale list item caches:** A component that renders a list and stores rendered `<li>` elements in an array for later reuse. When the list is re-rendered and the old elements are replaced, the array retains the old nodes. If the array is not cleared, every re-render of the list adds to the detached node count.

**Removed dialog elements:** A dialog component that is `remove()`d from the DOM but whose element reference is held in a module-level variable ("in case we need to show it again"). The dialog and its entire shadow tree are detached.

**Event delegation ancestors:** A container element used for event delegation that is removed from the document but whose reference is held in the closure of the event handler (which is still attached to a parent that is still in the document). The container is detached but kept alive by the handler closure.

**Template clone residue:** A `DocumentFragment` cloned from a `<template>` that is partially inserted into the DOM (some nodes from the fragment are inserted; others are not). The non-inserted nodes remain in the fragment, which is held by the variable that received the `cloneNode()` result. If that variable lives beyond the insertion operation, the unused nodes are retained.

### Prevention Design Rules

- DOM node references must not be stored in module-level variables unless they reference nodes that are intentionally long-lived (e.g., the application shell element)
- Lists of rendered elements must be discarded when the list is cleared or re-rendered, not retained in arrays for "later reuse"
- `DocumentFragment` variables must be explicitly set to `null` after their contents are inserted into the document, or scoped such that they go out of scope immediately after insertion
- Event delegation must be set up on ancestors that remain in the document for the duration of the delegation's use — not on elements that will be removed before the delegation is no longer needed

---

---

## 15. Reactive State and Subscription Accounting

### The Subscription Reference Graph

The reactive state layer (`core.state`) maintains a graph of subscriptions: each subscriber (a component callback) holds a reference to its source (the reactive state store), and the store holds a reference back to the subscriber (to deliver updates). This bidirectional reference is unavoidable — the store must hold a reference to each subscriber to notify it, and the subscriber must hold a reference to the store to read values.

The consequence: every active subscription holds two strong references — one from subscriber to store, one from store to subscriber. Neither can be collected while the subscription is active. This is correct during Phase 2 (Active); the problem arises if the subscription is not removed during Phase 3 (Cleanup).

An unreleased subscription in a long-lived state store is one of the most common navigation leak patterns. The store survives across navigations (it is a module-level singleton); the subscriber (the component) does not. If the subscriber does not unsubscribe before being discarded, the store retains its callback, which retains the component, which retains its shadow DOM, which retains all of its children — an entire route-level subgraph kept alive by a single forgotten unsubscribe call.

### Disposer Pattern

Every subscription method in `core.state` returns a `Disposer` — a zero-argument function that, when called, removes the subscription and drops both sides of the bidirectional reference. The `Disposer` is the subscription's handle; losing it means losing the ability to unsubscribe.

The canonical pattern: store all `Disposer` functions returned during `connectedCallback` as a private array on the component. In `disconnectedCallback`, iterate the array and call each disposer, then clear the array.

This pattern is not in conflict with the `AbortController` pattern described in §4; they are complementary. `AbortController` handles Web API subscriptions (event listeners, fetch, scheduler). The `Disposer` pattern handles userland subscriptions (reactive state, custom event buses, SDK callbacks). Both must be exercised in `disconnectedCallback`.

### Derived Values and Computed Memory

Computed/derived values in the reactive state layer (`store.derived(keys, computeFn)`) hold references to the source keys and to the computation function. If the computation function closes over a large object, that object is retained for the lifetime of the derived value. Derived values must be created with narrow closure scopes — capturing only the minimal context needed for the computation, not entire component instances.

---

---

## 16. Anti-Patterns Catalogue

The following patterns are prohibited in this codebase. Each entry names the pattern, describes the memory consequence, and states the correct alternative.

**Pattern: Subscribing on `connectedCallback` without a cleanup path**  
Consequence: The subscription holds a reference to the component indefinitely after disconnection. The component leaks.  
Correct: Every subscription uses `{ signal: this.#controller.signal }` or returns a `Disposer` that is called in `disconnectedCallback`.

**Pattern: Storing DOM element references at module scope**  
Consequence: Module-level references persist for the entire page lifetime. Elements can never be collected.  
Correct: DOM references belong in component instance fields or local function variables.

**Pattern: Growing a Map or Set indefinitely as the application runs**  
Consequence: Unbounded memory growth. The collection accumulates entries for every object ever touched.  
Correct: Use a bounded LRU cache, a `WeakMap`, or a TTL-bounded cache.

**Pattern: Using `setInterval` without storing the interval ID for cleanup**  
Consequence: The interval and its closure run forever, keeping all captured references alive.  
Correct: Store the interval ID as a private field; call `clearInterval` in `disconnectedCallback`.

**Pattern: Creating workers without a termination path**  
Consequence: Worker threads accumulate over time; each holds its own heap.  
Correct: Every worker has an associated `AbortController` whose abort handler terminates the worker.

**Pattern: Treating `FinalizationRegistry` as a cleanup mechanism**  
Consequence: Cleanup may be deferred indefinitely or never run. Resources are not reliably released.  
Correct: `FinalizationRegistry` is a development-mode leak detector and a best-effort safety net only. `disconnectedCallback` and `AbortController` are the cleanup mechanisms.

**Pattern: Cloning templates into a variable and inserting only part of the fragment**  
Consequence: Uninserted fragment nodes are retained as detached DOM.  
Correct: Insert the entire fragment, or set the fragment variable to `null` immediately after insertion.

**Pattern: Passing large `ArrayBuffer`s to workers via `postMessage` without transfer**  
Consequence: The buffer is copied; both contexts hold the full allocation simultaneously.  
Correct: Use the transferable mechanism: `worker.postMessage(data, [data.buffer])`.

**Pattern: Not closing `MessagePort` objects after a request/response exchange**  
Consequence: Ports and their event handler references accumulate indefinitely.  
Correct: Call `port.close()` on both ends of the channel after the exchange completes.

**Pattern: Awaiting a promise in a component callback without an AbortSignal guard**  
Consequence: If the component disconnects before the promise settles, the resolved value attempts to update a disconnected component, and the promise chain holds the component alive until it settles.  
Correct: Every `await` in component code that interacts with external APIs passes `this.#controller.signal`; all handling code checks `this.#controller.signal.aborted` before performing DOM or state mutations.

---

---

## 17. Memory Audit and Tooling Strategy

### Chrome DevTools Memory Panel

The Chrome DevTools Memory panel provides three memory investigation tools:

**Heap Snapshot:** A point-in-time snapshot of the JavaScript heap. Objects are listed by constructor, with retained size (the total memory that would be freed if the object were collected). Use heap snapshots before and after a navigation round trip to identify objects that should have been collected but were not — their retained size will appear in the "after" snapshot but not the "before."

The "Detached" filter in the constructor column directly surfaces detached DOM nodes. A healthy application after navigation should show zero or near-zero detached nodes from the previous route.

**Allocation instrumentation on timeline:** Records heap allocation over time, showing which call stacks are responsible for allocations that persist (grey bars in the timeline are allocations that survived to the end of the recording). This is the correct tool for identifying which code paths are causing accumulation.

**Allocation sampling:** A low-overhead sampling profiler that identifies which functions are allocating the most heap memory over time. Used to identify allocation hotspots that increase GC pressure even if they do not cause leaks.

### The Snapshot Comparison Workflow

The canonical leak investigation workflow:

1. Take a heap snapshot (baseline)
2. Perform the suspected-leaking action N times (e.g., navigate to a route and back N times)
3. Force a garbage collection (DevTools Memory panel → "Collect garbage" button)
4. Take a second heap snapshot
5. Compare snapshots: filter by objects that appear in snapshot 2 but not snapshot 1, sorted by retained size descending
6. Identify the shortest retaining path from each leaked object to a GC root — this path identifies the leak's source

This workflow is deterministic and repeatable. It requires no special API access; it works in any Chromium-based browser.

### Automated Regression Testing

The architecture's memory regression test suite:

- Navigates the full route set programmatically (using `window.navigation.navigate()`)
- After each round trip, forces GC via the DevTools protocol (in headless Chrome CI)
- Reads `performance.measureUserAgentSpecificMemory()` before and after each trip (where `crossOriginIsolated` is available)
- Asserts that memory growth per navigation round trip does not exceed a configurable threshold (e.g., 500KB)
- Surfaces failures as test failures in CI, with the heap snapshot delta as an artefact

This test suite provides continuous protection against navigation leaks introduced by new component code.

### FinalizationRegistry as a Development-Mode Leak Detector

As described in §9, a `FinalizationRegistry` in development builds logs component collections. The development configuration wraps the component base class's `connectedCallback` to register each new instance with the registry (held value: `{ type: element.tagName, id: uniqueId }`), and `disconnectedCallback` to mark the instance as "intentionally disconnected."

The registry callback fires when a component is collected. If a component was marked "intentionally disconnected" before collection, the log is informational. If it was not — if the collection fires for a component that was not explicitly disconnected — the log is a warning: the component was collected by the GC without going through `disconnectedCallback`, which typically indicates it was removed from the DOM by a parent replacement without the lifecycle firing correctly.

This tooling imposes no production cost; the registry is conditionally created only when the build target is `development`.

---

---

## 18. Design Rules Summary

The following rules are design-level requirements for this architecture. They are not suggestions; compliance is verified during code review and, where automatable, via linting.

**Rule 1 — Every subscription has a signal.**  
No `addEventListener`, `postTask`, or `fetch` call inside a component's connected phase may omit an `AbortSignal`. The signal must derive from or be identical to the component's lifecycle controller.

**Rule 2 — `disconnectedCallback` is always defined.**  
Every component class that establishes any subscription in `connectedCallback` must define `disconnectedCallback`. Reliance on an inherited `disconnectedCallback` that was defined before the subclass added subscriptions is a design error.

**Rule 3 — No module-level DOM references.**  
DOM element references must not be stored in ES module scope unless they reference nodes that are permanently part of the application shell.

**Rule 4 — Every cache is bounded.**  
No `Map`, `Set`, or array used as a cache may grow without bound. Every cache declares its maximum size and eviction policy at construction.

**Rule 5 — Every worker has a termination path.**  
Every `new Worker()` call must be paired with a `worker.terminate()` call that fires when the worker's owning feature is deactivated.

**Rule 6 — `FinalizationRegistry` is a detector, not a cleanup mechanism.**  
No correctness-critical cleanup may be placed in a `FinalizationRegistry` callback. Finalizers are development-mode detectors and production safety nets only.

**Rule 7 — Large binary data is transferred, not copied.**  
Any `ArrayBuffer` or `TypedArray` passed to a worker via `postMessage` that exceeds 8KB must use the transferable mechanism.

**Rule 8 — Cache sizes are tier-relative.**  
Cache capacity declarations use the tier-relative multiplier pattern (§13). Hard-coded absolute capacities that ignore device memory class are a design error.

**Rule 9 — AbortError is not an error.**  
Every `try/catch` around an operation that accepts an `AbortSignal` must check for `AbortError` and handle it as a normal termination path, not as an error.

**Rule 10 — Memory-relevant changes require a snapshot comparison.**  
Any pull request that introduces a new long-lived data structure, a new subscription pattern, or a new caching mechanism must include evidence (snapshot comparison, memory regression test result) that it does not introduce unbounded growth.

---

---

## References

- WHATWG HTML Living Standard — Custom Elements lifecycle: `html.spec.whatwg.org/#custom-elements`
- WHATWG HTML Living Standard — AbortController / AbortSignal: `html.spec.whatwg.org/#abortcontroller`
- MDN — WeakRef: `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakRef`
- MDN — FinalizationRegistry: `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/FinalizationRegistry`
- MDN — WeakMap: `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap`
- MDN — IntersectionObserver: `developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver`
- MDN — ResizeObserver: `developer.mozilla.org/en-US/docs/Web/API/ResizeObserver`
- MDN — MutationObserver: `developer.mozilla.org/en-US/docs/Web/API/MutationObserver`
- MDN — PerformanceObserver: `developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver`
- MDN — performance.measureUserAgentSpecificMemory: `developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory`
- MDN — Navigator.deviceMemory: `developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory`
- MDN — BroadcastChannel: `developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel`
- MDN — MessageChannel / MessagePort: `developer.mozilla.org/en-US/docs/Web/API/MessageChannel`
- WICG — Performance Measure Memory: `github.com/WICG/performance-measure-memory`
- W3C — Device Memory API Working Draft (January 2026): `w3.org/TR/2026/WD-device-memory-1-20260119/`
- TC39 — WeakRef Proposal: `github.com/tc39/proposal-weakrefs`
- web.dev — Monitor total page memory: `web.dev/articles/monitor-total-page-memory-usage`
- Cloudflare Blog — FinalizationRegistry in Workers (June 2025): `blog.cloudflare.com/we-shipped-finalizationregistry-in-workers-why-you-should-never-use-it`
- WHATWG DOM — AbortCallback proposal (Jake Archibald, November 2025): `github.com/whatwg/dom/pull/1425`
- W3C Compression Streams: `wicg.github.io/compression-streams/`

---

_End of 15. memory-management.md_