## Worker Architecture

**Spec Authorities:** WHATWG HTML Living Standard · W3C Service Workers · WICG Web Locks · TC39 SharedArrayBuffer · CSS Houdini (W3C TAG)  
**Status:** Working Specification — May 2026  
**Baseline Coverage:** Dedicated Worker (Widely Available) · Shared Worker (Widely Available) · Service Worker (Widely Available) · Web Locks (Widely Available) · BroadcastChannel (Widely Available) · SharedArrayBuffer (COOP/COEP required) · CSS Paint Worklet (Chromium)

---

## Overview and Design Thesis

The browser is a multi-threaded runtime. The main thread — where the DOM lives, where user input is handled, where rendering is orchestrated — has a budget of approximately 50ms per task before input latency becomes perceptible to users. Any computation that exceeds this budget belongs off the main thread.

The worker architecture governs how this system distributes work across the browser's concurrent execution contexts. It establishes three principles:

**1. The main thread is a rendering thread.** Its responsibility is UI interaction, DOM updates, and event coordination. CPU-intensive computation, I/O orchestration, and background synchronisation are always delegated to Workers.

**2. Each Worker type has a defined, non-overlapping role.** Dedicated Workers own task-level computation. Shared Workers maintain persistent cross-tab resources. Service Workers own network interception and background operation. Worklets own rendering-pipeline integration. These roles are enforced structurally, not by convention.

**3. Communication contracts are explicit and typed.** Every inter-Worker and Worker-to-main-thread message has a declared shape. The unstructured `postMessage` API is wrapped by the `core.workers` layer, which enforces message routing, lifecycle management, and cleanup.

---

## Worker Type Taxonomy

### Dedicated Worker

**Spec:** WHATWG HTML Living Standard — Worker  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Worker`  
**Status:** Baseline Widely Available  
**Ownership:** Single document (page/tab). Terminated when its owner document is closed or navigated away.

A Dedicated Worker is a separate JavaScript execution context running on a background thread, owned by exactly one document. It has no access to the DOM, `window`, `document`, or `localStorage`. It has full access to `fetch()`, `IndexedDB`, `WebSockets`, `Cache API`, OPFS (synchronous access handle mode), `crypto.subtle`, `performance`, and `console`.

**Assigned roles in this architecture:**

- Cryptographic operations (hashing, encryption, key generation via SubtleCrypto)
- Large JSON / CSV / binary parsing and transformation
- Data compression and decompression (Compression Streams)
- Canvas rendering via OffscreenCanvas
- Image decoding and manipulation
- OPFS synchronous file I/O (the OPFS Worker is a long-lived Dedicated Worker)
- Heavy state computation (derived aggregates, computed views over large datasets)
- PDF/document processing

**Module Workers:** Workers support ES Module syntax (`new Worker(url, { type: 'module' })`). Module Workers enable `import`/`export` statements, dynamic `import()`, and Import Map resolution within the Worker scope. All Workers in this architecture are module Workers.

**Worker lifecycle:** Workers are created lazily (at first need) and reused via the `core.workers` pool manager. A Worker that becomes idle for longer than a configurable timeout is terminated to reclaim memory. Workers are never created unconditionally on application startup.

### Shared Worker

**Spec:** WHATWG HTML Living Standard — Shared Worker  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/SharedWorker`  
**Status:** Baseline Widely Available (note: limited in some mobile browsers)  
**Ownership:** Multiple same-origin browsing contexts. Persists as long as at least one context holds an active `MessagePort` connection to it.

A Shared Worker is a single Worker instance that multiple tabs, iframes, and other Workers from the same origin can connect to. Connections are established via `new SharedWorker(url)`, which exposes a `port` property (a `MessagePort`). Each connecting context has its own `MessagePort`; the Shared Worker's `onconnect` handler receives each new port.

The `SharedWorkerGlobalScope` persists independently of any single tab — it outlives individual tab closes and persists until every connecting context disconnects. This persistence model makes it the correct choice for resources that must be shared and maintain continuity across tabs.

**Assigned roles in this architecture:**

- Single `WebSocket` connection shared across all tabs (see WebSocket connection pool below)
- Shared authentication token cache (avoids multiple tabs each making separate token refresh requests)
- Shared rate limiter (one rate-limit counter across all tabs, preventing aggregate over-limit requests)
- Shared leader election (one tab acts as the "active" synchronisation leader at a time)
- Cross-tab state consistency coordinator (receives state mutations and fans them out)

**Lifecycle complexity:** When a Shared Worker has zero connected ports, it should self-terminate. The `onconnect` handler increments a reference counter; each port's `close` event decrements it. When the counter reaches zero, the Shared Worker calls `close()` on itself. Without explicit self-termination, Shared Workers can persist indefinitely in a browser session, accumulating in memory.

**Safari limitation:** Safari supports Shared Workers but their behaviour in certain edge cases (Service Worker co-existence, cross-context access from extensions) differs from Chrome and Firefox. The `core.workers.shared()` utility includes browser detection to route to alternative coordination strategies (BroadcastChannel + Web Locks) when Shared Worker behaviour is unreliable.

### Service Worker

**Spec:** W3C Service Workers  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API`  
**Status:** Baseline Widely Available  
**Ownership:** The browser. Not owned by any tab. Its lifecycle is browser-managed.

The Service Worker is fully addressed in `offline-engine.md`. Its role in the worker architecture is defined as:

- **Network proxy** — Intercepts all `fetch()` events matching its registered scope
- **Cache manager** — Reads from and writes to the Cache API on behalf of all pages
- **Background Sync executor** — Receives `sync` events from the browser and replays queued offline operations
- **Push notification handler** — Receives push messages and displays notifications
- **Cross-tab communication relay** — Can message specific clients via `clients.get()` / `clients.matchAll()`

Communication from the main thread to the Service Worker follows specific patterns. Direct method calls on the Service Worker are not possible. The correct patterns are:

- **Fire-and-forget:** `navigator.serviceWorker.controller.postMessage(payload)`
- **Request/Response:** Create a `MessageChannel`, pass one port to the Service Worker in the message, retain the other. The Service Worker posts its reply on the received port.

### Houdini Worklets — Rendering Pipeline Integration

**Spec:** CSS Houdini (W3C Working Group Note) — Worklet API, CSS Painting API, CSS Layout API, CSS Animation Worklet  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Houdini_APIs`  
**Status:** CSS Paint API — Chromium only (widely deployed in production). CSS Layout API — experimental. Animation Worklet — experimental.

Worklets are fundamentally different from Workers. A Worker is a fully isolated JavaScript execution context. A Worklet is a short-lived, stateless script fragment that executes at a specific stage of the browser's rendering pipeline. Worklets do not have event loops, cannot make network requests, cannot use `setTimeout`, and have no persistent state between invocations. They receive their inputs from the rendering engine and return outputs to the rendering engine.

**CSS Paint API (Paint Worklet):**

The Paint Worklet runs on the browser's compositor thread during the paint phase of the rendering pipeline. It exposes a `CanvasRenderingContext2D`-compatible API for drawing custom backgrounds, borders, and masks. A Paint Worklet registered via `CSS.paintWorklet.addModule(url)` can be referenced in CSS via `background-image: paint(worklet-name)`.

Paint Worklets are re-executed whenever the element's geometry or the CSS custom properties they declare interest in change. They are stateless across invocations. Stateful effects (animations, reactive graphics) are driven by CSS custom properties that are animated via CSS Transitions or the Web Animations API, with the Worklet re-painting in response to the changing property value.

**CSS Layout API (Layout Worklet):**

The Layout Worklet hooks into the browser's layout phase, enabling custom layout algorithms — masonry grids, spiral layouts, reading-direction-aware layouts — that cannot be expressed with existing CSS layout models (Flexbox, Grid, Multicol). As of mid-2026, the Layout API has experimental support in Chromium Canary only and is not available for production use. Its design is documented here for architectural completeness and future readiness.

**CSS Animation Worklet:**

The Animation Worklet enables custom animation logic that runs on the compositor thread, decoupled from the main thread. Unlike `requestAnimationFrame`-based animations, an Animation Worklet runs even when the main thread is busy, producing animations that remain smooth under main thread load. It is used for scroll-linked animations, physics-based motion, and complex procedural effects that must maintain 60+ fps independently of JS execution.

---

## Communication Protocols

### Structured Clone Algorithm

When `postMessage()` sends data between a Worker and the main thread (or between Workers), the data is serialised using the Structured Clone Algorithm. This algorithm handles:

- Primitive values, Objects, Arrays, Maps, Sets
- TypedArrays (ArrayBuffer, Int32Array, Float64Array, etc.)
- Blobs, Files
- ImageData, OffscreenCanvas
- Error objects
- CryptoKey objects
- `MessagePort`, `ReadableStream`, `WritableStream`, `TransformStream` (as Transferable, not cloned)

The Structured Clone Algorithm does **not** handle:

- Functions (including arrow functions, class instances with methods)
- DOM nodes
- Property descriptors, getters, setters
- Prototype chains (class methods are lost; only own enumerable properties are cloned)
- `Symbol`-keyed properties
- WeakMap, WeakSet, WeakRef

**Architectural implication:** Worker API surfaces must speak in plain data objects (POJOs), arrays, typed arrays, Maps, Sets, and primitive values. Domain model classes that carry methods must be serialised to plain data before crossing a Worker boundary and deserialised after. The `core.workers` layer provides serialisation/deserialisation hooks for this purpose.

### Transferable Objects — Zero-Copy Data Transfer

For large binary data, cloning via structured clone is expensive — it copies every byte. Transferable objects transfer ownership instead of copying. The sending context loses access to the object immediately after transfer; the receiving context gains sole ownership. The operation is O(1) regardless of buffer size.

**Transferable types in modern browsers:**

- `ArrayBuffer` — The primary binary data primitive. Transferred by passing it in the `transfer` array argument of `postMessage`.
- `MessagePort` — Transfer a port to establish a direct communication channel to a specific Worker or thread.
- `OffscreenCanvas` — Transfer a canvas element's rendering context to a Worker for off-main-thread rendering.
- `ReadableStream`, `WritableStream`, `TransformStream` — Transfer an entire streaming pipeline into a Worker.
- `ImageBitmap` — Transfer decoded image data without re-decoding.
- `AudioData`, `VideoFrame` — For WebCodecs-based media pipelines.

After an `ArrayBuffer` is transferred, attempts to use it in the sending context throw a `TypeError` — the backing memory has been surrendered. This ownership transfer semantic must be considered when designing Worker communication: once data is transferred, the sender cannot reference it.

### MessageChannel — Per-Request Private Communication Channels

The base `postMessage` API on Workers mixes all responses into a single message handler. When multiple concurrent requests are in-flight to the same Worker, matching responses to their originating requests requires manual correlation ID management.

`MessageChannel` provides a cleaner solution: a pair of linked `MessagePort` objects. For each logical request-response cycle, the caller creates a new `MessageChannel`, attaches a response handler to `port1`, and sends `port2` to the Worker with the request payload. The Worker posts its response on `port2` and closes it. The response arrives exclusively on `port1`, eliminating the need for correlation IDs entirely.

This pattern naturally supports concurrent requests to the same Worker without interference. It is the correct pattern for all request/response communication in `core.workers`.

### Streaming via Transferable Streams

The Streams API and the Transferable mechanism compose cleanly. A `ReadableStream` can be transferred to a Worker, where it is consumed directly. A `TransformStream` can be transferred to a Worker for pipeline-stage processing. A `WritableStream` can be transferred to a Worker that will write to it.

This enables zero-copy streaming pipelines that span thread boundaries. A network response's `ReadableStream` (from `response.body`) can be transferred to a processing Worker, processed through a `TransformStream`, and the output piped into a `WritableStream` that persists to OPFS — all without the main thread holding any intermediate buffer.

---

## SharedArrayBuffer and Atomics

**Spec:** TC39 ECMAScript — SharedArrayBuffer · Atomics  
**Prerequisites:** `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (cross-origin isolation)

`SharedArrayBuffer` provides a fixed-length region of raw memory that multiple threads (main thread + Workers) read and write simultaneously. Unlike `ArrayBuffer` (which is copied on `postMessage`) or transferred `ArrayBuffer` (which changes ownership), a `SharedArrayBuffer` is not copied or transferred — it represents shared physical memory visible to all agents that hold a reference to it.

### Cross-Origin Isolation Requirement

After the Spectre side-channel attack disclosure (2018), `SharedArrayBuffer` was disabled in all browsers. It was re-enabled behind a mandatory security requirement: the document must be cross-origin isolated.

Cross-origin isolation requires two HTTP response headers on the top-level document:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

`COOP: same-origin` places the page in its own browsing context group, severing the relationship with any cross-origin opener that could exploit shared memory timing.

`COEP: require-corp` blocks all cross-origin subresources (images, scripts, iframes) that do not respond with an explicit `Cross-Origin-Resource-Policy` header. This prevents a page from loading adversarial cross-origin resources that could exploit shared memory.

**Architectural consequence:** Enabling `SharedArrayBuffer` requires auditing every cross-origin resource the application loads. CDN-hosted scripts, third-party analytics, and embeds must add `Cross-Origin-Resource-Policy: cross-origin` to their responses, or they will be blocked. The `COEP: credentialless` variant relaxes this for anonymous subresource requests (credentials are stripped), enabling `SharedArrayBuffer` in environments with third-party resources that cannot be modified.

### Atomics for Lock-Free Synchronisation

The `Atomics` namespace provides synchronisation primitives that operate safely on `Int32Array` or `BigInt64Array` views over a `SharedArrayBuffer`. Atomic operations are guaranteed to be indivisible — no other agent can observe the memory in a partially-modified state.

**Primary Atomics operations:**

- `Atomics.load(view, index)` — Read a value atomically.
- `Atomics.store(view, index, value)` — Write a value atomically.
- `Atomics.add()`, `Atomics.sub()`, `Atomics.and()`, `Atomics.or()`, `Atomics.xor()` — Read-modify-write operations. All atomic.
- `Atomics.compareExchange(view, index, expectedValue, replacementValue)` — The compare-and-swap (CAS) primitive. Replaces the value only if it currently equals `expectedValue`. Returns the old value. This is the foundation for building lock-free data structures.
- `Atomics.wait(view, index, value, timeout?)` — Blocks the calling thread until the value at `index` differs from `value` or the timeout expires. **Only valid in Workers, not the main thread.**
- `Atomics.waitAsync(view, index, value, timeout?)` — Non-blocking wait. Returns a Promise. Valid on the main thread. Added for the case where the main thread needs to wait on a Worker's signal without blocking.
- `Atomics.notify(view, index, count?)` — Wakes `count` threads waiting on `index`.

**Use cases in this architecture:**

`SharedArrayBuffer` + `Atomics` is not the default communication mechanism — it is used exclusively where the overhead of structured clone is demonstrably insufficient for the performance requirement. The primary use cases:

- **Worker thread pools with shared task queues:** A ring buffer in a `SharedArrayBuffer` holds pending task descriptors. Worker threads compete for tasks using CAS (`Atomics.compareExchange`). The main thread enqueues tasks with `Atomics.notify`.
- **Real-time audio/video processing:** `AudioWorklet` and `VideoWorklet` processing loops require zero-copy, zero-latency data transfer with the main thread. SharedArrayBuffer is the only mechanism that meets this requirement.
- **WebAssembly thread communication:** WASM modules compiled for multi-threaded execution (`-pthread` flag) use SharedArrayBuffer as the WASM linear memory. Atomics provide the WASM threading model's synchronisation primitives.

---

## BroadcastChannel — Cross-Context Pub/Sub

**Spec:** WHATWG HTML Living Standard — BroadcastChannel  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel`  
**Status:** Baseline Widely Available

`BroadcastChannel` provides a publish/subscribe message bus for all same-origin contexts: tabs, iframes, Dedicated Workers, Shared Workers. A named channel is created by instantiating `new BroadcastChannel('channel-name')`. Any context that creates a `BroadcastChannel` with the same name receives all messages posted to that channel.

`BroadcastChannel` does not require a direct reference to the target. Any context can join the channel and receive messages without being registered with the sender. This makes it the correct mechanism for broadcasting state changes that multiple independent contexts need to react to.

**Architectural uses:**

- **Cross-tab state synchronisation:** When the user modifies their profile in Tab A, the reactive state layer emits the change on a BroadcastChannel. Tab B and Tab C receive the message and update their local state views. All tabs reflect the same data without a network round-trip.
- **Service Worker → Tab communication:** The Service Worker can broadcast cache update notifications, sync completion events, and push notification receipts to all open tabs via BroadcastChannel (in addition to `clients.matchAll()` for targeted messaging).
- **Cache invalidation signals:** When the OPFS Worker completes a write, it broadcasts an invalidation message on the `opfs-updates` channel. The in-memory LRU caches in all contexts flush the affected keys.

**Cleanup:** `BroadcastChannel` instances must be explicitly closed via `channel.close()` when the context no longer needs them. Unclosed channels accumulate as a memory leak. In component lifecycles, channel closure belongs in `disconnectedCallback()`.

**Contrast with `storage` event:** The `storage` event fires on `window` when another tab modifies `localStorage`. It is narrow (localStorage only), unidirectional, and cannot be sent from Workers. BroadcastChannel is general-purpose, bi-directional, and available in all contexts. BroadcastChannel is always preferred.

---

## Web Locks API — Cross-Context Mutex

**Spec:** WICG Web Locks  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API`  
**Status:** Baseline Widely Available

The Web Locks API provides named, async-acquired mutex-like locks that coordinate access to shared resources across all same-origin contexts (tabs, Workers, Service Workers). It is the browser-native equivalent of an OS mutex.

### Lock Modes

**Exclusive (default):** Only one holder at a time. While held, no other request for the same lock name can be granted. Used for write operations, leader election, and single-consumer processing.

**Shared:** Multiple holders simultaneously. Shared locks for the same name are all granted concurrently. An exclusive lock request for the same name waits until all shared locks are released. Models a read/write lock: many concurrent readers, exclusive writers.

### Request Semantics

A lock is requested via `navigator.locks.request(name, options?, callback)`. The callback is called when the lock is granted; the lock is held for the duration of the async callback's execution and released automatically when the Promise returned by the callback settles. This RAII-like (Resource Acquisition Is Initialisation) model prevents lock leaks — there is no explicit `lock.release()` call to forget.

Options:

- `mode: 'exclusive' | 'shared'` — Lock mode.
- `signal: AbortSignal` — Cancels the lock request if the signal fires before the lock is granted. Enables timeout semantics.
- `ifAvailable: boolean` — Grants the lock only if it is immediately available; otherwise calls the callback with `null`. Enables non-blocking "try-lock" semantics.
- `steal: boolean` — Forces the lock grant even if another holder holds it. Reserved for recovery scenarios (crashed tab cleanup). Not for normal operation.

### Core Use Cases in This Architecture

**IndexedDB write coordination (multi-tab):** When multiple tabs may concurrently attempt to write to the same IndexedDB object store (e.g., applying offline sync results), a lock prevents races. The convention: acquire an exclusive lock named `indexeddb:write:{storeName}` before opening a `readwrite` transaction. The lock is released when the transaction completes.

**OAuth token refresh (single-issuer pattern):** When a token expires, all tabs detect it simultaneously. Without coordination, each tab independently requests a new token — wasteful and potentially conflicting. With Web Locks: the first tab to acquire `auth:token-refresh` makes the request; other tabs wait, then read the fresh token that the winner wrote to IndexedDB.

**OPFS file access (concurrent readers/exclusive writer):** When the OPFS Worker services reads from multiple consumers while the application may occasionally write, use shared locks for readers and an exclusive lock for writers.

**Leader election:** One tab assumes responsibility for background synchronisation while others remain passive. The leader tab holds an exclusive lock named `sync:leader`. When it closes or crashes, the lock is released and another tab acquires it. `navigator.locks.query()` can be used to inspect current lock state.

### Contrast with Alternatives

|Approach|Mechanism|Limitation|
|---|---|---|
|localStorage polling|`storage` event + sentinel key|Race-prone; not atomic; workers excluded|
|IndexedDB sentinel|IDB `readwrite` transaction|Heavy; not cross-worker|
|BroadcastChannel protocol|Custom message-passing|Reactive, not preventive; no blocking semantics|
|SharedWorker coordinator|MessagePort routing|Shared Worker lifecycle complexity; mobile browser gaps|
|Web Locks API|Native OS-level browser primitive|Correct; available everywhere|

---

## Worker Pool Design

### Pool Architecture

The `core.workers` module maintains a pool of reusable Dedicated Workers for CPU-intensive tasks. The pool manages:

- **Maximum concurrency:** The pool size is bounded by `navigator.hardwareConcurrency - 1` (reserving one logical core for the main thread), with a practical minimum of 2 and a configurable maximum. On low-end devices, `hardwareConcurrency` may be 2; on high-end desktops, 16+.
- **Task routing:** Each task declaration includes a declared task type. The pool routes task types to specific Workers that have been pre-warmed with the relevant module imports. General-purpose tasks go to any available Worker.
- **Queue management:** When all Workers are busy, tasks are enqueued with a priority level (`user-blocking`, `user-visible`, `background`). Higher-priority tasks preempt lower-priority ones in the queue.
- **Worker health:** Workers that throw unhandled errors are marked unhealthy. The pool replaces them with a fresh Worker. Error details are forwarded to the main thread's error reporting pipeline.

### Worker Lifecycle States

```
IDLE → BUSY → IDLE (normal cycle)
IDLE → TERMINATED (idle timeout)
BUSY → ERROR → TERMINATED → REPLACED
IDLE → TERMINATED (application shutdown / page unload)
```

All Workers are terminated deterministically on page unload. The `pagehide` event (not `unload`, which is deprecated and suppresses BFCache) triggers pool shutdown. Workers are terminated in reverse priority order (least critical first).

---

## OffscreenCanvas — Off-Main-Thread Rendering

**Spec:** WHATWG HTML Living Standard — OffscreenCanvas  
**Status:** Baseline Widely Available

`OffscreenCanvas` decouples canvas rendering from the main thread. A `<canvas>` element's rendering context can be transferred to a Worker, where all drawing operations execute without blocking the main thread. The browser composites the Worker's rendering results into the page's display automatically.

This is the correct architecture for:

- Data visualisation that involves significant computation (D3-like rendering of large datasets)
- Game rendering loops
- Real-time video processing pipelines
- PDF rendering to canvas

The transfer is one-way: once `canvas.transferControlToOffscreen()` is called and the `OffscreenCanvas` is transferred to a Worker, the main thread loses the ability to call drawing APIs on that canvas. The Worker owns the rendering context for the canvas's lifetime.

---

## Module Worker Pattern

All Workers in this architecture are instantiated with `{ type: 'module' }`. This enables:

- `import` / `export` statements within Worker scripts — no `importScripts()` required
- Import Map resolution applies in Workers, enabling the same bare specifiers used in page-level modules
- Dynamic `import()` for lazy-loading Worker sub-modules
- Top-level `await` in Worker module scope

Module Workers were added to the Service Worker specification as well. Service Worker scripts authored as ES Modules use the `type: 'module'` option in `navigator.serviceWorker.register()`.

---

## Worker Security Boundaries

Workers provide a meaningful security boundary with defined exceptions:

Workers **cannot** access: `window`, `document`, `DOM APIs`, `localStorage`, `sessionStorage`, `alert()`, `confirm()`, `prompt()`.

Workers **can** access: `fetch()`, `IndexedDB`, `Cache API`, `OPFS`, `WebSockets`, `crypto.subtle`, `performance`, `navigator` (subset), `location` (read-only), `BroadcastChannel`, `MessageChannel`, `WebAssembly`, `Atomics` (with SharedArrayBuffer).

A Worker that is compromised through an XSS payload in serialised data cannot directly manipulate the DOM. This isolation, while not a security guarantee in itself, reduces the blast radius of injection vulnerabilities that affect Worker-processed data.

---

## Cross-Origin Isolation and the Worker Tier

Enabling SharedArrayBuffer requires COOP + COEP headers on the top-level document. This decision propagates across the entire application:

- Every cross-origin resource (CDN assets, third-party scripts, analytics, embeds) must serve `Cross-Origin-Resource-Policy: cross-origin` or be blocked.
- Third-party iframes (OAuth flows, payment widgets, video embeds) are affected and require `credentialless` COEP or explicit CORP headers.
- The `coi-serviceworker` polyfill provides a Service Worker-based approach that injects COEP/COOP headers without server-side configuration, enabling cross-origin isolation in environments where server headers cannot be modified.

The architectural decision: cross-origin isolation is opt-in per deployment environment. The `core.workers` module detects `self.crossOriginIsolated` at runtime and enables `SharedArrayBuffer`-based optimisations only when the isolation context is present. All SharedArrayBuffer paths have `ArrayBuffer + postMessage` fallbacks.

---

## BroadcastChannel, Web Locks, and Shared Worker Interaction Model

These three APIs form a complementary triad for multi-tab coordination:

|Responsibility|Mechanism|
|---|---|
|Inform other tabs that something happened|BroadcastChannel|
|Prevent other tabs from doing something concurrently|Web Locks|
|Maintain persistent shared state across tabs|Shared Worker|

A complete multi-tab workflow for sync coordination:

1. The Shared Worker holds the sync state and exposes query/update endpoints via MessagePort.
2. The tab that wins the leader election lock (`Web Locks` — exclusive, `sync:leader`) performs the sync operation.
3. On sync completion, the leader broadcasts completion via `BroadcastChannel` (`sync:complete`).
4. All tabs receive the broadcast and query the Shared Worker for updated state.

---

## Error Handling and Recovery

### Worker Error Events

Unhandled errors in Workers surface via the `error` event on the Worker instance in the creating context. The event carries `message`, `filename`, `lineno`, and `colno`. Workers can also fire `messageerror` when a `postMessage` fails to deserialise (structured clone failure, detached port, etc.).

All unhandled Worker errors are routed to the application's telemetry pipeline. The Worker is marked unhealthy and removed from the pool. A replacement Worker is spawned. In-flight tasks that were assigned to the failed Worker are either re-queued (idempotent tasks) or returned with error responses (non-idempotent tasks).

### Service Worker Update Handling

When a new Service Worker version is detected (byte change in the SW script), the browser installs the new SW and places it in the waiting state. The `waiting` SW will not activate until all controlled tabs are closed or `skipWaiting()` is called.

The `core.workers` Service Worker bridge listens for update events and presents the user with a non-intrusive "Update available — reload to apply" notification. Silently calling `skipWaiting()` without user consent is discouraged: it can break in-flight transactions and confuse users who observe state changes mid-session.

---

## Relationship to Other Architecture Modules

- **storage.md:** The OPFS Worker is a Dedicated Worker that exclusively manages synchronous OPFS access. Web Locks coordinates cross-tab IndexedDB writes.
- **offline-engine.md:** The Service Worker executes Background Sync, manages Cache API strategies, and handles push events. The SW bridge in `core.workers` provides the main-thread communication interface.
- **networking.md:** WebSocket connections in multi-tab scenarios are managed by a Shared Worker. The Shared Worker distributes incoming messages to all tabs via BroadcastChannel.
- **internal-api.md:** `core.workers` is one of the seven primary namespaces. It exposes `create()`, `shared()`, `broadcast()`, and `subscribe()` to all other core modules and to application code.
- **performance.md:** Worker-based computation is the primary mechanism for keeping the main thread free. PerformanceObserver's `longtask` entries correlate with missed Worker offloading opportunities.

---

_References:_  
_WHATWG HTML Living Standard — Workers: `html.spec.whatwg.org/#workers`_  
_W3C Service Workers: `w3.org/TR/service-workers`_  
_WICG Web Locks: `w3.org/TR/web-locks`_  
_TC39 SharedArrayBuffer: `tc39.es/ecma262/#sec-sharedarraybuffer-objects`_  
_MDN — Transferable objects: `developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects`_  
_MDN — SharedArrayBuffer: `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer`_  
_web.dev — COOP/COEP cross-origin isolation: `web.dev/articles/coop-coep`_  
_MDN — Houdini APIs: `developer.mozilla.org/en-US/docs/Web/API/Houdini_APIs`_  
_MDN — BroadcastChannel: `developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel`_  
_W3C Web Locks Explainer: `github.com/w3c/web-locks/blob/main/EXPLAINER.md`_