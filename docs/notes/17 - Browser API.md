## Browser API Research and Evaluation

**Version:** 1.0  
**Status:** Working Specification  
**Date:** May 2026  
**Authority:** MDN Web Docs, WHATWG Living Standard, W3C Specifications, Chrome Platform Status, web.dev Baseline, InfoQ, CanIUse

---

## Table of Contents

1. [Research Methodology](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#1-research-methodology)
2. [Navigation API — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#2-navigation-api--deep-evaluation)
3. [URLPattern API — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#3-urlpattern-api--deep-evaluation)
4. [View Transitions API — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#4-view-transitions-api--deep-evaluation)
5. [Web Animations API — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#5-web-animations-api--deep-evaluation)
6. [Scheduler API — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#6-scheduler-api--deep-evaluation)
7. [Streams API — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#7-streams-api--deep-evaluation)
8. [Web Locks API — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#8-web-locks-api--deep-evaluation)
9. [BroadcastChannel API — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#9-broadcastchannel-api--deep-evaluation)
10. [SubtleCrypto API — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#10-subtlecrypto-api--deep-evaluation)
11. [Popover API + CSS Anchor Positioning — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#11-popover-api--css-anchor-positioning--deep-evaluation)
12. [content-visibility CSS Property — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#12-content-visibility-css-property--deep-evaluation)
13. [Speculation Rules API — Deep Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#13-speculation-rules-api--deep-evaluation)
14. [TC39 Signals — Pre-Ship Research](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#14-tc39-signals--pre-ship-research)
15. [Sanitizer API — Status Assessment](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#15-sanitizer-api--status-assessment)
16. [Service Worker Module Support — Status Update](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#16-service-worker-module-support--status-update)
17. [CSS Container Queries and Scope — Evaluation](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#17-css-container-queries-and-scope--evaluation)
18. [Web Components Three-Pillar Assessment](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#18-web-components-three-pillar-assessment)
19. [Comparative Analysis: Native vs Framework APIs](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#19-comparative-analysis-native-vs-framework-apis)
20. [Emerging APIs on the Horizon](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#20-emerging-apis-on-the-horizon)

---

## 1. Research Methodology

This document is a research dossier. It differs from `18. native-platform-capabilities.md` in intent: where the capabilities document catalogues what the platform provides and its architectural role in this system, this document provides the detailed evaluation reasoning behind each architectural decision — the specific design choices, the edge cases, the cross-browser discrepancies, the comparison with library alternatives, and the forward-looking position on proposals not yet in Baseline.

Every API evaluated here is either directly used in this architecture, considered and rejected, or tracked as a near-future dependency. The evaluation framework applied to each:

**Correctness model** — Does the API's contract behave predictably across all four major engines? Where are the discrepancies?

**Performance model** — Does the API execute on the compositor thread, the main thread, a background thread? What is the memory allocation model? What are the GC implications?

**Composability** — Can the API be combined with AbortSignal, ReadableStream, MessagePort, Promises, and other platform primitives in the expected way?

**Failure semantics** — What happens when the API is unsupported? What happens when it fails? Is failure silent, thrown, or communicated via event?

**Standards trajectory** — Is this API in the WHATWG/W3C/TC39 mainstream? Is it on a standards track, a WICG incubation, or an origin trial? Is the specification stable?

---

## 2. Navigation API — Deep Evaluation

**Spec authority:** WHATWG HTML Living Standard, WICG Navigation API specification  
**Baseline:** Newly Available — January 2026 (Chrome, Edge, Firefox 147, Safari 26.2)

### Design Motivation

The History API was designed for document navigation in the Web 1.0 era. Its misuse as a SPA routing primitive created a category of subtle bugs that every framework router has had to work around independently for over a decade:

`pushState()` does not fire `popstate`. A developer who calls `history.pushState()` to navigate programmatically must also manually dispatch a `popstate` event or use a custom event to notify the application that the URL has changed. Frameworks such as React Router maintained wrapper code around `history.pushState()` that performed this notification manually.

There is no interception of link-click navigations. The History API provides no mechanism for intercepting a navigation that originates from a user clicking an `<a>` element. Frameworks had to attach a document-level `click` event listener, identify `<a>` elements via `event.target.closest('a')`, inspect the href, determine whether it is a same-origin SPA navigation, call `event.preventDefault()`, then call `history.pushState()` manually. This delegation pattern is fragile and misses navigations triggered by non-`<a>` elements (form submissions, `window.location = ...` assignments).

The history stack is opaque. `history.length` and `history.state` are the only programmatic introspection points. There is no way to enumerate the entries in the history stack, determine whether a back navigation will exit the origin, or read the URL of any entry other than the current one.

### Navigation API Architecture

The Navigation API resolves all of these. The core model is:

Every navigation that originates in the current browsing context fires a `navigate` event on `window.navigation`. "Every navigation" includes: link clicks, form submissions, `navigation.navigate()` programmatic calls, browser back/forward traversal, and page reloads. The event fires before the navigation completes, giving the application the opportunity to intercept.

`event.intercept({ handler })` converts the navigation into a client-managed one. The browser commits the URL update and calls the handler. The handler's returned Promise represents the completion of the navigation's async work — data fetching, component mounting, scroll restoration. While the Promise is pending, the browser shows its native loading indicator. This is the correct model for SPA navigation: the browser handles all the bookkeeping (URL update, history entry creation, focus management) and the application provides only the async work.

`event.canIntercept` indicates whether the navigation can be intercepted. Cross-origin navigations and some user-gesture-gated navigations cannot be intercepted. Application code must check this before calling `intercept()`.

`event.signal` is an `AbortSignal` that fires if the navigation is superseded by another navigation while the handler is still pending. This integrates naturally with `fetch()` and other abort-aware APIs: data fetching initiated during a navigation can be cancelled automatically if the user navigates again before the first navigation completes.

`navigation.entries()` returns a full, enumerable array of `NavigationHistoryEntry` objects. Each entry has `.url`, `.key` (a stable identifier), `.id` (a per-visit identifier), `.index`, `.sameDocument`, and `.getState()`. This enables detecting whether a back navigation will leave the SPA's history domain (checking whether `entries()[0].url` is same-origin) and implementing custom per-route scroll position restoration.

### Cross-Engine Discrepancies

The Navigation API reached Baseline in January 2026 when Firefox 147 and Safari 26.2 shipped their implementations. Prior to that, only Chromium-based browsers had the API. As of mid-2026, the implementation is substantially interoperable, but the following edge cases merit attention:

The specification explicitly states that `navigate` does not fire for the initial page load. This is by design for SSR-rendered applications, but it means SPA applications that rely entirely on the `navigate` event for route rendering must also perform an initial render outside of the event handler.

The Navigation API operates only within a single frame's same-origin context. Navigations inside `<iframe>` elements do not expose events to the parent frame's Navigation API instance. This is architecturally correct — cross-frame navigation interference would be a security concern — but must be accounted for in applications that embed iframes.

The `focus` and `scroll` options on `event.intercept()` control whether the browser automatically manages focus and scroll position after the navigation completes. These defaults are sensible (`focus: 'auto'`, `scroll: 'after-transition'`) but may need explicit override for applications with custom scroll restoration logic.

### Relationship to Framework Routers

The Navigation API is the substrate that higher-level framework routers (React Router, TanStack Router, Vue Router) are evaluating as their underlying navigation primitive. As reported by InfoQ in May 2026, these frameworks are exploring building on the Navigation API for future major versions. This architecture builds directly on the Navigation API rather than waiting for framework adoption, which means it gets the native capabilities (complete navigation interception, full history access) without framework overhead.

### Design Decisions for `core/router`

`core/router` registers a single `navigate` event listener on `window.navigation`. The listener performs route matching using `URLPattern` instances, calls `event.intercept()` with a handler that fetches route data, instantiates the route component, mounts it, and resolves. The `event.signal` is passed to all `fetch()` calls initiated by the handler, enabling automatic cancellation on superseded navigations.

The fallback for pre-Navigation-API browsers (detected via `'navigation' in window`) uses a document-level `click` listener, `history.pushState()`, and `popstate` handling. This fallback is less capable (cannot intercept all navigation types) but provides the basic SPA routing contract.

---

## 3. URLPattern API — Deep Evaluation

**Spec authority:** WICG URLPattern  
**Baseline:** Newly Available — September 2025 (Chrome, Edge, Firefox, Safari)

### Design

URLPattern brings the expressiveness of popular routing library pattern syntaxes (Express-style, path-to-regexp) to the browser platform itself. The pattern syntax is a superset of URL structure matching:

Named parameters (`:paramName`) capture a URL segment as a named group. Validation can be attached: `:id(\\d+)` matches only numeric IDs. Optional segments use `{:paramName}?`. Wildcards use `*` for remainder capture.

URLPattern matches against any or all of the eight URL components independently. A single pattern can specify constraints on `pathname`, `hostname`, and `search` simultaneously. This is more expressive than most routing libraries, which typically match only on pathname.

**`test(input)`** — Returns a boolean. Fast path for route existence checks.  
**`exec(input)`** — Returns a full match result with captured groups, or `null` on no match. Groups are accessible via `result.pathname.groups`, `result.hostname.groups`, etc.

### Worker Availability

URLPattern is available in Web Workers and Service Workers. This is the key architectural advantage over all JavaScript routing libraries: the Service Worker can use the same URLPattern instances (or reconstructed instances from serialised pattern definitions) for fetch routing without bundling any library code. Pattern definitions are serialisable plain objects.

### Relationship to `path-to-regexp`

`path-to-regexp` (the pattern syntax engine used by Express.js, React Router v5/6, and many others) is a 1.5 KB library that provides functionally similar path matching. URLPattern's pattern syntax is explicitly inspired by `path-to-regexp`. The key difference is that URLPattern is a platform primitive — it requires no download, adds no bundle size, and is available in all execution contexts including Service Workers.

For the ~4% of users on browsers pre-dating September 2025 (pre-URLPattern), a minimal polyfill based on `path-to-regexp` provides compatibility. The polyfill adds ~1.5KB compressed and is entirely transparent to calling code.

---

## 4. View Transitions API — Deep Evaluation

**Spec authority:** W3C CSS View Transitions Module Level 1  
**Baseline:** Same-document — Newly Available October 2025 (Chrome 111+, Edge 111+, Firefox 133+, Safari 18+)  
**Cross-document (MPA):** Chrome 126+, Safari 18.2+; Firefox not yet implemented as of mid-2026

### The Core Mechanism

A view transition captures the visual state of the document before a DOM update, updates the DOM, captures the visual state after, and composites an animation between the two states. The browser manages all screenshot capture, compositing, and timing. The application provides only: the DOM update callback, and optionally, CSS declarations for custom animation behaviour.

The animation model: the browser generates a `::view-transition` pseudo-element tree above all page content. `::view-transition-old(name)` is a screenshot of the old state of a named element; `::view-transition-new(name)` is a live rendering of the new state. The browser's default animation fades old out and new in. Overriding these with custom `@keyframes` is purely declarative CSS.

### Naming Elements for Morph Transitions

`view-transition-name` is the CSS property that identifies an element as a named transition participant. Elements with the same name on both sides of a DOM update participate in a morph transition: the browser interpolates their position, size, and clip between old and new states.

Critical constraint: `view-transition-name` must be unique across all currently-visible elements at the moment of capture. Two elements with the same `view-transition-name` visible simultaneously will throw an error and skip the transition. For list items or repeated elements, `view-transition-name` must be set dynamically (e.g., to an item's unique ID) rather than statically in CSS.

### SPA Integration Model

With the Navigation API, view transitions integrate naturally: the `navigate` event handler initiates a view transition, and the DOM update happens inside `document.startViewTransition()`. The Navigation API's `event.intercept()` handler is the correct place for this: fetch data, start view transition, update DOM inside the transition callback, resolve.

`document.activeViewTransition` — The `:active-view-transition` pseudo-class added in January 2026 targets the root while a transition is active, and `document.activeViewTransition` is the JavaScript accessor. This enables calling `skipTransition()` programmatically if conditions change during the transition (e.g., the user navigates again).

### Cross-Document MPA Transitions

For MPA applications where each navigation fetches a new HTML document from the server, view transitions are declared in CSS rather than JavaScript. The `@view-transition { navigation: auto }` at-rule in both the outgoing and incoming page stylesheets opts both pages into cross-document transitions. No JavaScript required.

The browser captures the old page before unloading it, fetches and renders the new page, then animates between them. Named elements with matching `view-transition-name` values on both pages morph between their positions.

As of mid-2026, cross-document view transitions are in Chrome 126+, Edge 126+, and Safari 18.2+. Firefox does not yet implement `@view-transition`. Progressive enhancement is straightforward: the `@supports (view-transition-name: none)` query can guard MPA transition CSS, and the browser simply performs a hard navigation in unsupported contexts.

### `prefers-reduced-motion` Obligation

View transitions must respect the `prefers-reduced-motion` user preference. The correct implementation strategy for this architecture is to check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and call `viewTransition.skipTransition()` if the preference is active, rather than providing a stripped-down animation. Users who prefer reduced motion should receive instant state changes, not a slow fade — a slow fade may still trigger vestibular symptoms.

### Comparison with Framer Motion

Framer Motion adds approximately 45KB compressed to a bundle. For its primary use case in React applications — animated page transitions — the View Transitions API provides equivalent or superior capability at zero bundle cost, as long as the browser supports it. Framer Motion provides a broader animation toolset (spring physics, gesture recognition, layout animations without explicit naming) that goes beyond what View Transitions covers. The View Transitions API does not replace Framer Motion for physics-based or gesture-driven animations; it does replace it for navigation transitions.

---

## 5. Web Animations API — Deep Evaluation

**Spec authority:** W3C Web Animations  
**Baseline:** Widely Available (core API); some features vary

### Position in the Animation Stack

The animation capabilities of the web platform form a hierarchy:

CSS Transitions — Declarative, state-driven, two-state interpolation. Cannot be controlled programmatically mid-transition. Best for simple interactive state changes.

CSS Animations (`@keyframes`) — Declarative, timeline-based, multi-keyframe. Limited programmatic control (play/pause via `animation-play-state`). Best for self-contained looping or enter/exit animations.

Web Animations API — Imperative, the JavaScript interface to the same engine that executes CSS animations and transitions. Full programmatic control. Best for animations that need runtime values, sequencing, reversal, or scrubbing.

CSS Scroll-Driven Animations — Declarative or WAAPI-based, driven by scroll position instead of time. Executes on the compositor thread. Best for parallax, progress indicators, and reveal-on-scroll effects.

View Transitions API — Captures before/after DOM states and animates between them. Best for state-change and navigation animations.

### `Animation.commitStyles()`

This is an underrated WAAPI feature. It takes the current animated state — the values being applied at this moment of the animation timeline — and commits them to the element's inline `style`. This enables animating from a calculated intermediate value rather than from the element's initial CSS value, which is essential for interrupting and reversing in-progress animations gracefully.

### `getAnimations()`

`document.getAnimations()` (all animations in the document) and `element.getAnimations()` (all animations targeting a specific element) enable interrogating running animation state. This is essential for the "return to rest" pattern: before starting a new animation, checking whether an existing animation is mid-flight and using its current position as the new animation's start value.

### Performance: Compositor vs Main Thread

WAAPI animations of `transform` and `opacity` execute on the compositor thread and are not affected by main-thread JavaScript execution. Animating any other CSS property — `background-color`, `width`, `height`, `left`, `top`, `border-radius` — requires main-thread involvement and can produce jank during heavy JavaScript execution.

The `will-change` CSS property hints to the browser that an element will be animated, allowing it to promote the element to its own compositor layer in advance. This trades memory (each promoted layer requires GPU memory) for paint performance. The correct application is narrow: elements that are about to be animated with `transform` or `opacity`, not "anything that might move."

### Scroll-Driven Animations (CSS + WAAPI)

CSS `@keyframes` animations can be given a `ScrollTimeline` or `ViewTimeline` instead of a time-based duration. When a `ScrollTimeline` is specified, the animation's progress is driven by a container element's scroll position. When a `ViewTimeline` is specified, the animation's progress is driven by an element's position relative to the viewport.

These timeline-driven animations execute on the compositor thread, producing scroll-linked effects that are not affected by JavaScript execution. This replaces a large category of `IntersectionObserver` + class-toggle patterns that used to require JavaScript to trigger scroll-linked animations.

---

## 6. Scheduler API — Deep Evaluation

**Spec authority:** WICG Prioritized Task Scheduling  
**Baseline:** Widely Available

### Why `setTimeout(fn, 0)` Is Insufficient

`setTimeout(fn, 0)` schedules a macrotask with a minimum delay of 1ms (4ms after recursive nesting thresholds are reached per the HTML spec). It has no priority semantics, no cancellation mechanism, and no ordering guarantee relative to other pending work. Using it for deferred UI work means the deferred work competes equally with all other pending tasks, including user input handling.

### Priority Model

`user-blocking` tasks are expected to complete within the current frame (16ms at 60Hz). They block subsequent frames from rendering if they do not complete. This priority is for input handling and state updates that gate the next visible frame.

`user-visible` (the default) tasks are expected to complete within a reasonable time for the user to perceive them as responsive (under 200ms). This is the correct priority for most rendering work that is not gating input.

`background` tasks have no deadline. They are scheduled at lower priority than user interaction and rendering. Analytics batching, non-critical prefetching, and maintenance operations belong here.

### `scheduler.yield()` — The Critical Primitive

A function that executes a long loop of operations can call `await scheduler.yield()` between iterations to yield control back to the browser. The browser may then process pending input events, fire pending timers, or perform rendering work before returning control to the function.

Crucially, when called from within a `postTask()` callback, the resumed execution after `yield()` inherits the original task's priority. This prevents yielded background work from being accidentally promoted to `user-visible` priority on resumption.

This is the native implementation of the "long task chunking" pattern that was previously implemented manually with `requestIdleCallback` and `setTimeout` interleaving — with none of those methods' priority guarantees.

### `AbortSignal` Integration

A `postTask()` callback can be cancelled by passing an `AbortSignal` in the options. This integrates directly with the component lifecycle model: when a component is disconnected and its lifecycle `AbortController` fires, all pending `postTask()` callbacks registered by that component are automatically cancelled, preventing stale work from executing after the component is gone.

---

## 7. Streams API — Deep Evaluation

**Spec authority:** WHATWG Streams Living Standard  
**Baseline:** Widely Available (ReadableStream, WritableStream, TransformStream)

### The Backpressure Model

Backpressure is the mechanism by which a slow consumer signals to a fast producer to slow down. Without backpressure, a fast producer fills unbounded buffers, consuming memory proportional to the production rate times the consumer's lag. The Streams API implements backpressure through the `desiredSize` property of the stream controller.

A stream's internal queue has a target size defined by its `QueuingStrategy`. When the queue's size exceeds the high-water mark, `desiredSize` drops below zero. A well-implemented source checks `desiredSize` before producing — if it is negative, the source pauses. When the consumer drains the queue below the high-water mark, `desiredSize` rises and the source resumes.

For sources that cannot pause (e.g., a live data feed), the queue will grow unboundedly if the consumer is slower than the source. The `ByteLengthQueuingStrategy` and `CountQueuingStrategy` built-in strategies handle the common cases; custom strategies can implement application-specific buffering logic.

### `ReadableStream` as the Response Body

`fetch()` returns a `Response` object, and `response.body` is a `ReadableStream`. This is specified by the WHATWG Fetch standard and is the reason that streaming HTTP responses require zero additional abstraction in this architecture — the stream is already there.

For AI-generated content (token streaming), server-sent report generation, or any response where progressive rendering is preferable to a complete-body wait, the pattern is to read from `response.body` via a `TextDecoderStream` `TransformStream` and emit chunks as they arrive.

### Transferability

All three stream types — `ReadableStream`, `WritableStream`, `TransformStream` — are `Transferable`. This means they can be moved (not copied) from the main thread to a Worker via `postMessage()` with the `transfer` option. The stream ceases to be accessible in the sending context and becomes accessible only in the receiving context.

This enables pipeline architectures where data flows through multiple Worker contexts: network fetch → main thread stream → transfer to processing worker → processing worker stream → transfer back to main thread for rendering. Each context only sees the data relevant to its processing step.

### NDJSON and Structured Streaming

For structured data endpoints that stream newline-delimited JSON (NDJSON) responses, the correct composition is: `response.body` → `TextDecoderStream` → `TransformStream` that buffers until newline boundaries → JSON.parse per line. This is a three-stage pipeline, entirely composable with standard Streams API primitives, with zero library dependencies.

---

## 8. Web Locks API — Deep Evaluation

**Spec authority:** WICG Web Locks  
**Baseline:** Widely Available

### The Multi-Tab Coordination Problem

A progressive web application with offline-first storage can have multiple tabs open simultaneously, each with their own JavaScript execution context, each capable of reading from and writing to the same IndexedDB database. When connectivity is restored and multiple tabs attempt to replay their offline queues concurrently, the result without coordination is interleaved or duplicate writes.

The Web Locks API solves this by providing a named mutex that spans all same-origin contexts. Only one context can hold a lock with a given name at a time. Other contexts requesting the same lock are queued and executed in order after the current holder releases it.

### Comparison with Legacy Patterns

Before the Web Locks API, cross-tab coordination was typically implemented using:

**`localStorage` sentinel keys:** Write a value to `localStorage` indicating ownership; check the value before proceeding. This is non-atomic — two tabs can both read "no lock" and both write simultaneously. Also synchronous, blocking the main thread.

**IndexedDB locking patterns:** Create a dedicated object store as a lock register; use a transaction to atomically check and set. This works but is complex, verbose, and error-prone.

The Web Locks API is a first-class browser primitive that eliminates both alternatives. Its `request()` method is atomic by construction — the lock is either granted exclusively or queued.

### Lock Modes

`exclusive` — The default. Only one context holds the lock; all others queue. Appropriate for writes, schema migrations, and sync operations.

`shared` — Multiple contexts can hold a shared lock simultaneously. A shared lock blocks exclusive lock acquisition, but not other shared lock acquisitions. Appropriate for concurrent readers with exclusive writers.

This is the standard readers-writer lock model, provided as a browser primitive.

---

## 9. BroadcastChannel API — Deep Evaluation

**Spec authority:** WHATWG HTML Living Standard  
**Baseline:** Widely Available

### Model

`BroadcastChannel` is a named publish-subscribe bus for same-origin contexts. Creating a `BroadcastChannel` with a given name subscribes to that channel. Posting a message to the channel delivers it to all other contexts that have opened a channel with the same name. The sender does not receive its own messages.

Messages are structured-cloned, supporting the same types as `postMessage()`: most JavaScript values including `ArrayBuffer`, `Blob`, `Date`, `Map`, `Set`, and nested objects. Non-cloneable values (like functions or DOM nodes) cannot be posted.

### Cross-Context Reach

A `BroadcastChannel` created in the main thread of Tab A reaches: the main thread of Tab B (same origin), Dedicated Workers in both tabs, Shared Workers, and the Service Worker. This is broader than `SharedWorker.port.postMessage()` (which requires a direct `MessagePort` reference) and simpler than `clients.matchAll()` in the Service Worker (which requires enumerating controlled clients).

### Architectural Use: State Consistency Across Tabs

When a user performs an action in one tab that modifies shared application state — updating their profile, changing their preferences, submitting a form — the state change is applied locally, persisted to IndexedDB, and broadcast to all other tabs via a named channel. Each tab's reactive state layer receives the message and applies the update in its local state graph. The result is eventual consistency across tabs without a server round-trip for the secondary tabs.

The channel name convention for this architecture is `core:state-sync`, with a message envelope containing a `type` (the state domain) and `payload` (the state update). Subscribers filter on `type` to receive only the updates relevant to their domain.

---

## 10. SubtleCrypto API — Deep Evaluation

**Spec authority:** W3C Web Cryptography API Level 2  
**Baseline:** Widely Available

### The "Subtle" Warning

The API is named `SubtleCrypto` deliberately. The specification itself warns that "many of these algorithms have subtle usage requirements in order to provide the required algorithmic security guarantees." This is not a marketing warning — it reflects genuine complexity.

The most common subtle misuse:

**AES-GCM IV reuse:** AES-GCM requires a unique Initialization Vector (IV/nonce) for every encryption operation using the same key. Reusing an IV with the same key is catastrophic: it allows an attacker to recover the plaintext and the authentication key. The correct mitigation is generating a fresh random IV for every encryption via `crypto.getRandomValues()`.

**Weak PBKDF2 iterations:** `PBKDF2` for password-based key derivation requires enough iterations to make brute-force infeasible. The current NIST recommendation (as of 2023) is at least 600,000 iterations for HMAC-SHA256. Applications that implement their own PBKDF2 wrapper must enforce a minimum iteration count.

**Not using authenticated encryption:** Using AES-CBC or AES-CTR without a MAC provides confidentiality but no integrity — an attacker can modify ciphertext without detection. AES-GCM provides both confidentiality and integrity; it is the standard choice.

### Key Non-Extractability

`CryptoKey` objects generated with `extractable: false` cannot be exported to raw key material. They can only be used for their declared operations (`['encrypt', 'decrypt']`, `['sign', 'verify']`, etc.). This is the correct model for application keys: the key material never appears in JavaScript, preventing exfiltration via XSS.

For keys that must persist across sessions (e.g., a per-device encryption key), the non-extractable `CryptoKey` object can be stored directly in IndexedDB. IndexedDB supports structured cloning of `CryptoKey` objects; the key material remains in the browser's secure key storage and is never exposed to JavaScript.

### Algorithm Coverage

The Web Crypto API Level 2 specification expands on Level 1. Notably, `crypto.subtle.sign()` and `verify()` support `ECDSA` with `P-256`, `P-384`, and `P-521` curves, and `Ed25519` (added in Level 2, now Baseline). RSA-PSS and RSA-OAEP remain available with modulus lengths up to 4096 bits.

ChaCha20-Poly1305 is available in Node.js 26's Web Crypto implementation but is not in browser implementations as of mid-2026. Cross-environment code that might run in both browser and Node.js should check for algorithm support before using it.

### `crypto.randomUUID()`

UUID v4 generation using cryptographically secure randomness, available directly on `crypto` without going through `subtle`. Available in all modern browsers. This replaces all userland UUID generation libraries for ID generation purposes.

---

## 11. Popover API + CSS Anchor Positioning — Deep Evaluation

**Popover API Baseline:** Newly Available — January 2025  
**CSS Anchor Positioning Baseline:** Newly Available — January 2026

### The Popover Problem Space

Popovers, tooltips, dropdowns, context menus, and floating panels are among the most complex UI patterns on the web — not because the visual design is complex, but because of three interconnected challenges:

**Z-index management:** A floating element must render above all other content, including fixed-position headers, sticky elements, and absolutely-positioned ancestors with `overflow: hidden`. This historically required carefully managed z-index layers or portal rendering (teleporting the DOM node to `document.body`).

**Positioning relative to a trigger:** A dropdown must appear adjacent to the button that opened it, not at the `document.body` position. Calculating this position requires JavaScript that reads layout — `getBoundingClientRect()` — and positions the floating element absolutely or fixed.

**Viewport edge detection and flipping:** A dropdown that would overflow the viewport's right edge should appear to the left of its trigger. Detecting and handling this requires more JavaScript layout reading and conditional repositioning.

The Popover API solves the first problem natively (top-layer placement). CSS Anchor Positioning solves the second and third.

### Top Layer Model

The browser maintains a _top layer_ — a rendering layer above all page content, z-index stacking contexts, `overflow: hidden` ancestors, and `transform` contexts. Elements in the top layer render on top of everything. The top layer currently hosts: `<dialog>` (modal), Popover elements, and fullscreen elements.

Previously, achieving "always on top" rendering required either assigning an extremely high `z-index` value (fragile) or moving the element to `document.body` (breaking encapsulation and introducing focus management complexity). The top layer model is deterministic and requires no CSS management.

### Popover Light Dismiss

`popover="auto"` elements implement _light dismiss_: clicking anywhere outside the popover closes it, and pressing Escape closes it. This behaviour previously required JavaScript event listeners with careful handling of event bubbling and focus management. The Popover API implements it natively.

The _top layer stack_ rule for `auto` popovers: a new `auto` popover dismisses all other open `auto` popovers below it in the stack. This implements the correct behavioural model for nested menus — opening a sub-menu does not dismiss the parent menu; opening an unrelated menu dismisses all open menus.

### CSS Anchor Positioning: Position Try Fallbacks

The `position-try-fallbacks` CSS property is architecturally significant. It accepts an ordered list of positioning alternatives that the browser tries sequentially. The first position that does not cause viewport overflow is used. This is the "smart positioning" feature that positioning libraries like Floating UI provide via JavaScript — now declarative CSS executed by the layout engine.

Position tries can be named (`@position-try` at-rules) or use implicit flip keywords. The flip keywords — `flip-block`, `flip-inline`, `flip-start` — instruct the browser to try the mirrored position along the specified axis if the primary position overflows.

This resolves the remaining technical justification for JavaScript-based positioning libraries in tooltip and dropdown scenarios. The key caveat: CSS Anchor Positioning reached Baseline in January 2026. There is still a segment of users on browsers released before January 2026 who need a fallback. For this architecture's progressive enhancement strategy, Floating UI (3.5 KB compressed) serves as the fallback for browsers without anchor positioning support.

---

## 12. `content-visibility` CSS Property — Deep Evaluation

**Spec authority:** W3C CSS Containment Module Level 2  
**Baseline:** Newly Available — confirmed September 2024 across all engines

### The Rendering Bottleneck

In a page with many off-screen elements, the browser performs layout calculations, painting, and compositing for all of them regardless of whether they are visible. This is the fundamental cause of slow initial load rendering on content-heavy pages — all that invisible content below the fold is still costing render work.

`content-visibility: auto` instructs the browser to apply CSS containment to an element and skip its layout and paint work when it is not in or near the viewport. The browser applies `contain: style layout paint size` automatically. The rendering is performed on demand as the element approaches the viewport.

### Measured Impact

Google's case study on their own pages found up to a 7x rendering performance improvement on initial load for pages with significant below-the-fold content. The improvement scales with the amount of off-screen content: a page that is 90% off-screen on load sees the most dramatic improvement.

### `contain-intrinsic-size`

The browser does not layout `content-visibility: auto` elements when they are off-screen, which means their layout dimensions are unknown. This creates a problem for scrollbars: the browser cannot calculate the correct total page height. `contain-intrinsic-size` provides a size hint that the browser uses as a placeholder dimension for off-screen elements. Without it, scrollbars jitter as the user scrolls and elements gain their actual dimensions upon entering the viewport.

`auto` value for `contain-intrinsic-size` — Recently standardised. `contain-intrinsic-size: auto 300px` means "use the most recently computed dimension if available, otherwise use 300px as the initial estimate." This reduces scrollbar jitter for elements that have been in the viewport at least once.

### Integration with IntersectionObserver

`content-visibility: auto` and `IntersectionObserver` are complementary. `IntersectionObserver` is still needed for:

Triggering JavaScript-based lazy-loading (images, iframes, heavy custom elements). Firing analytics events for element visibility. Activating expensive JavaScript components on first viewport entry.

`content-visibility: auto` is better than `IntersectionObserver` for:

Skipping layout and paint work entirely for off-screen elements without any JavaScript. Achieving virtual-scroll-level rendering performance without a virtual scroll library.

The `contentvisibilityautostatechange` event bridges both: it fires when the browser starts or stops rendering an element with `content-visibility: auto`, enabling JavaScript activation without a separate `IntersectionObserver`.

---

## 13. Speculation Rules API — Deep Evaluation

**Browser support:** Chrome 105+ (prefetch), Chrome 109+ (prerender), Edge equivalents; Safari 26.2 (disabled by default); Firefox — no support as of mid-2026  
**Baseline Status:** Not Baseline

### Model

The Speculation Rules API is a declarative, browser-managed system for speculatively prefetching or prerendering pages before the user navigates to them. The browser decides whether to honour a speculation rule based on available memory, network conditions, CPU load, and battery status — it applies these as resource governors that prevent speculation from harming the device.

**Prefetch** — The browser fetches the HTML of the target page and its critical subresources. The page is not executed. On navigation, the browser serves the already-fetched content, eliminating network latency. Equivalent to `<link rel="prefetch">` but more powerful (supports document rules with CSS selector matching).

**Prerender** — The browser fetches the target page and executes its JavaScript in a hidden rendering context. On navigation, the pre-rendered page is instantly displayed. INP, LCP, and FID are effectively zero for pre-rendered navigations.

### Eagerness Levels

`immediate` — Speculate as soon as the rules are observed. Suitable for pages the user will very likely visit (e.g., the hero CTA on a landing page).

`eager` — On desktop: hover for 10ms. On mobile (from January 2026): triggered 50ms after an anchor enters the viewport. Suitable for high-probability next pages.

`moderate` — Hover for 200ms (or pointerdown, whichever is first). The default-and-recommended setting for most use cases. Balances resource usage with preload probability.

`conservative` — On pointer down (mousedown/touchstart) only. The most resource-conservative option. Suitable for any links on the page without prediction.

### Browser Resource Limits

Chrome enforces limits on concurrent speculations: up to 50 concurrent prefetches and 10 concurrent prerenders for `immediate`/`eager` rules. For `moderate`/`conservative` rules, limits are 2 prefetches and 2 prerenders, operating on a FIFO basis (new speculations replace the oldest when the limit is reached). These limits prevent excessive memory usage and server load.

### Progressive Enhancement Pattern

Because Firefox has no support and Safari has it disabled by default, Speculation Rules must be treated as a progressive enhancement that provides performance benefits only for Chromium users. The standard pattern:

The `<script type="speculationrules">` element is silently ignored by browsers that do not support it. No error, no degraded behaviour. Traditional `<link rel="prefetch">` provides prefetch capability for non-Chromium browsers.

### Prerender vs Prefetch: Architectural Considerations

Prerender's JavaScript execution in the hidden context means that any side effects of page load (analytics events, session recording initialisation, cookie writes) fire for the pre-rendered page even if the user never navigates to it. Applications with analytics that must fire only on actual navigation must defer analytics initialisation until `document.prerendering === false` (synchronous) or until the `prerenderingchange` event fires.

---

## 14. TC39 Signals — Pre-Ship Research

**Spec:** tc39/proposal-signals on GitHub  
**Stage:** Stage 1 as of mid-2026  
**Browser shipping:** No browser has shipped as of mid-2026

### Proposal Overview

The TC39 Signals proposal defines `Signal.State`, `Signal.Computed`, and `Signal.subtle.*`. It is not a framework reactivity API — it is a core semantics specification for the reactive graph model that framework authors (Angular, Vue, Solid, Preact, Svelte) have all independently implemented in similar but incompatible ways.

The proposal's stated goal is to decouple the reactive model from the rendering layer. A `Signal.State` stores a mutable value. A `Signal.Computed` derives a value from one or more signals, re-running its computation when any input signal changes. `Signal.subtle.Watcher` provides the low-level "what changed and needs reacting to" mechanism that framework rendering engines build on.

Notably absent from the proposal: _effects_ (DOM-linked reactions that run when a computed value changes). The proposal intentionally leaves effect scheduling to framework-level integration. The reasoning: different frameworks have different scheduling models (micro-task, batched, synchronous), and standardising scheduling would prevent frameworks from optimising.

### Relationship to the Architecture's Reactive Layer

This architecture's `core/state` reactive layer is built on `Proxy` and `EventTarget`. The `Proxy` trap model and the TC39 Signals model are both forms of fine-grained dependency tracking — they share the fundamental insight that a computed value should only re-execute when its declared dependencies change, not when unrelated state changes.

The `Proxy`-based implementation is migration-compatible with native Signals: both express the same semantic contract (computed values that re-execute on dependency changes). When TC39 Signals reach browser implementations, `core/state` can be re-implemented on top of them without changing the API surface exposed to components.

### Architectural Implication of No Built-In Effects

The deliberate omission of effects from the proposal means that even when native Signals ship, applications will still need a scheduling layer (analogous to `core/state`'s `subscribe` mechanism) that connects signal changes to DOM updates. This is the correct separation: the signal graph is the data model; the scheduling and rendering layer is the view concern.

### Timeline Assessment

TC39 Stage 1 means the proposal is under consideration — the committee has accepted the problem statement. Progression from Stage 1 to Stage 2 requires a stable specification; Stage 2 to Stage 3 requires complete specification review and at least two implementations. For a complex proposal touching JavaScript engine internals, Stage 1 to browser shipping typically takes 2–4 years. This architecture should not plan for native Signals before 2028 at the earliest; the `Proxy`-based layer will remain the production mechanism for the foreseeable future.

---

## 15. Sanitizer API — Status Assessment

**Spec:** WICG Sanitizer API  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/HTML_Sanitizer_API`  
**Baseline Status:** Not Baseline as of mid-2026. Chrome ships it; Firefox and Safari status unclear

### Design

The Sanitizer API provides a native, configurable HTML sanitiser integrated with the browser's HTML parser. Because it uses the actual browser parser rather than a separate parsing step, it is more resilient to parser-differential attacks (where a sanitiser's parser and the browser's parser interpret the same string differently, allowing malicious constructs to survive sanitisation but activate on rendering).

`element.setHTML(htmlString, { sanitizer: mySanitizer })` — The primary API. Sets the element's innerHTML via a sanitiser, ensuring the sanitiser runs before DOM insertion. When Trusted Types are active, `setHTML` is the correct integration point.

`new Sanitizer(config)` — Creates a reusable sanitiser configuration. The `config` specifies allowed elements, allowed attributes, and blocks. The default configuration (no config argument) is a safe baseline that allows standard HTML elements and safe attributes while blocking all event handlers and dangerous attributes.

### Current Production Strategy

Until the Sanitizer API reaches Baseline, this architecture uses DOMPurify. DOMPurify is the industry standard for client-side HTML sanitisation: ~14 KB compressed, DOM-based parsing (uses the browser's parser via `DOMParser`), ~7 million weekly npm downloads, actively maintained, and handles parser-differential attack vectors by using the browser's own parser for its sanitisation step.

Mozilla has maintained a `sanitizer-polyfill` library that bridges the Sanitizer API configuration format to DOMPurify, enabling forward-compatible code that will transparently upgrade to native Sanitizer API when available.

The `core.security.sanitize(html, config)` interface abstracts the implementation:

- If native `Sanitizer` API is available → use `setHTML()` with a `Sanitizer` instance
- Else → use DOMPurify with equivalent configuration

This ensures application code does not change when the native API becomes universally available.

A notable 2026 security note: CVE-2026-7939, a UXSS vulnerability in Chrome's built-in Sanitizer API (patched in Chrome 148.0.7778.96), demonstrated that even native browser APIs require security updates. Defense-in-depth with server-side validation remains essential regardless of the sanitisation approach.

---

## 16. Service Worker Module Support — Status Update

**Baseline:** Newly Available — January 2026 (all major engines)

The inability to use `import` statements in Service Workers was a long-standing architectural friction point for this architecture. Pre-January-2026, a Service Worker had to be written as a bundled script or use `importScripts()` (a synchronous, non-module-compatible script loading mechanism from the Web Worker spec).

As of January 2026, `navigator.serviceWorker.register(url, { type: 'module' })` registers a module-type Service Worker that supports `import` and `export` natively. This means:

The Service Worker can `import` from `core/router` (for URLPattern instances), `core/storage` (for IndexedDB access), and other shared modules without bundling them into the Service Worker script.

The same module graph used by the application can be shared with the Service Worker, eliminating duplication of utility functions and constants.

The `import.meta.url` and `import.meta.resolve()` functions are available in module-type Service Workers.

**Migration from `importScripts`:** Existing non-module Service Workers cannot be incrementally converted — the `type: 'module'` option changes the script's module environment, and `importScripts()` is not available in module Service Workers. This is a complete replacement, not an incremental upgrade.

---

## 17. CSS Container Queries and Scope — Evaluation

**Container Queries (size):** Widely Available  
**Container Queries (style):** Newly Available 2024  
**`@scope`:** Newly Available 2024

### Container Size Queries

`@container` rules apply CSS based on the dimensions of a containing element, not the viewport. This is the correct primitive for reusable components that adapt to their context: a card component that switches from horizontal to vertical layout when its container is narrow, regardless of viewport width.

Container queries replace a large fraction of the use cases that were previously handled by viewport media queries in combination with JavaScript-based component resize detection. A component using container queries works correctly regardless of where it is placed in the layout, without any JavaScript.

The containment setup is minimal: the container element needs `container-type: inline-size` (or `size`, or `normal`) declared. This makes the element a _query container_; its descendants can then use `@container` rules.

### Container Style Queries

Style queries (`@container style(--theme: dark)`) apply CSS based on the computed value of a CSS custom property on the query container. This enables behaviour previously requiring JavaScript: a component that renders differently based on a theme custom property set on a parent element.

### `@scope`

`@scope` limits the reach of CSS rules to a specific DOM subtree without using Shadow DOM. `@scope (.card) to (.card__footer)` applies the scoped rules only to elements inside `.card` but not inside `.card__footer`. This provides a lighter-weight scoping mechanism than Shadow DOM for cases where full encapsulation is unnecessary.

---

## 18. Web Components Three-Pillar Assessment

### Custom Elements v1 — Production Status

Custom Elements v1 (`customElements.define()`) is Widely Available and stable. The specification has not had breaking changes since v1 was standardised. Applications using Custom Elements today will continue to work without modification on future browsers. This is the standards stability guarantee that framework APIs cannot provide.

**Customised built-in elements (`is` attribute):** The elephant in the room. Safari does not implement customised built-in elements and has explicitly objected to the design in the standards process, preferring autonomous custom elements. The `builtin-element-polyfill` provides compatibility, but the additional dependency and uncertain standards trajectory make autonomous Custom Elements the preferred approach for new code.

### Shadow DOM — Encapsulation Model

Shadow DOM's encapsulation model is _one-directional CSS isolation with intentional escape hatches_. CSS does not cross shadow boundaries by default. CSS custom properties do cross shadow boundaries by inheritance. `::part()` provides an intentional external styling surface. `::slotted()` styles slotted content from inside.

**Accessibility model:** The _flat tree_ (the composed tree including slotted content) is what assistive technologies traverse. ARIA roles and properties must be applied in the correct tree context. The host element's ARIA attributes (via `ElementInternals`) represent the component's semantic role. Child elements inside the shadow tree that have semantic meaning must have their own ARIA attributes independent of the host.

The `aria-owns` attribute can reference elements across shadow boundaries by ID. However, IDs must be globally unique; shadow DOM does not isolate IDs.

### Declarative Shadow DOM — SSR Model

Declarative Shadow DOM (`<template shadowrootmode="open">`) is the server-side rendering model for Web Components. It was Newly Available as of August 2024 (the spec attribute name `shadowrootmode` replacing the earlier `shadowroot`).

The SSR model: the server renders a component's shadow DOM as a `<template shadowrootmode="open">` element inside the custom element's light DOM markup. The browser parses this during HTML parsing, attaches the shadow root, and renders the component without waiting for JavaScript. The JavaScript upgrade (`connectedCallback`) runs after the shadow root is already attached — it does not need to re-render the shadow DOM, it only needs to add event listeners and subscribe to data.

This model produces the correct server-rendered first paint without requiring a Declarative Shadow DOM polyfill (the polyfill converts template elements with the old `shadowroot` attribute for browsers pre-dating August 2024).

---

## 19. Comparative Analysis: Native vs Framework APIs

### Routing: Navigation API vs React Router / Vue Router

**Native (Navigation API + URLPattern):**

- Zero bundle cost
- Complete navigation interception including back/forward
- Full history stack access
- `AbortSignal` integration for cancellable navigations
- Available in Service Worker (URLPattern)

**Framework routers:**

- React Router v7: ~15KB. Provides data loading conventions, error boundaries, form submission handling
- Vue Router v4: ~25KB. Deep integration with Vue's reactivity system
- TanStack Router: ~20KB. Type-safe route definitions, built-in data loaders

**Assessment:** Navigation API + URLPattern provides a routing primitive that is more capable at the platform level than History API-based framework routers. Framework routers add value through conventions (data loaders, error boundaries), not through routing capability that the platform lacks. An application with `core/router` built on the Navigation API needs userland conventions for data loading and error handling — these are provided by `core/state` and component lifecycle conventions, not by a routing library.

### Animation: View Transitions API vs Framer Motion

**Native (View Transitions API):**

- Zero bundle cost
- Works for both SPA and MPA (with limitations)
- CSS-controlled animation definitions
- Compositor-managed screenshots and compositing

**Framer Motion (~45KB compressed):**

- Spring physics (natural deceleration curves, not available in CSS)
- Gesture recognition (drag, hover, focus state tracking)
- Layout animations (auto-detecting layout changes without `view-transition-name`)
- Complex orchestration (stagger, shared layout, exit animations outside of transitions)

**Assessment:** For navigation transitions, View Transitions API is a complete replacement for Framer Motion. For physics-based and gesture-driven animations, Framer Motion (or GSAP) remains necessary. This architecture uses View Transitions for navigation; Web Animations API for programmatic component animations; CSS for state-based transitions. Framer Motion is not a dependency.

### Styling: Shadow DOM + CSS Custom Properties vs CSS-in-JS

**Native:**

- Style encapsulation via Shadow DOM
- Theming via CSS custom properties (cross-boundary inheritance)
- Zero JavaScript cost for style computation
- Browser-managed specificity

**CSS-in-JS (styled-components, emotion):**

- Dynamic styles based on JavaScript values
- Full JavaScript expression power in style declarations
- Runtime style injection (potential performance cost)

**Assessment:** For component encapsulation and theming, Shadow DOM + CSS custom properties is superior to CSS-in-JS. CSS-in-JS provides dynamic style computation from JavaScript values, which is occasionally necessary but often overused. CSS custom properties with `@property` registered types (with type validation and inheritance control) cover most legitimate CSS-in-JS use cases.

### State: Proxy Reactive Store vs Redux / Zustand

**Native (Proxy-based reactive store):**

- Zero bundle cost for the reactive primitive
- Direct property-assignment mutation syntax
- Fine-grained subscription model

**Redux Toolkit (~12KB), Zustand (~2KB), Jotai (~3KB):**

- Established conventions for action/reducer model
- DevTools integration (time-travel debugging)
- Middleware ecosystems

**Assessment:** The `core/state` reactive layer provides sufficient capability for this architecture's state management needs. Redux's added value (time-travel debugging, audit trail of actions) is available through custom middleware on top of `core/state`'s snapshot mechanism. For very large teams or applications with complex audit requirements, the Redux action model has legitimate ergonomic advantages that are difficult to replicate without adopting its conventions wholesale.

---

## 20. Emerging APIs on the Horizon

The following APIs are under active development and should be tracked for potential adoption.

**CSS `@mixin` and `@apply`** — Shipping in Chrome 146 (2026). Native CSS mixins with parameter support. Eliminates the last major use case for CSS preprocessors. Tracking for adoption once cross-browser Baseline is reached.

**CSS `interpolate-size: allow-keywords`** — Emerging. Enables animating to `height: auto`, `width: min-content`, etc. Eliminates JavaScript-measured height animation. Not Baseline; track for adoption.

**Navigation API Enhancements** — The WICG Navigation API spec continues to evolve. Features such as `navigationPreload` integration and improved `IDBStorageManager` interaction are under discussion.

**CSS Custom Functions (`@function`)** — Beyond mixins, native CSS functions that can compute values declaratively are in early discussion. Not close to Baseline.

**TC39 Temporal** — The `Temporal` API (a modern replacement for `Date`) is Stage 3 and has a polyfill. Browser shipping is in progress. Once Baseline, this should replace all `Date` usage in this architecture's event timestamping and conflict resolution logic.

**Import Defer (`import defer`)** — A proposal for deferred module evaluation (parse the module graph at startup, but execute modules on first access). This enables faster startup without code-splitting. In early browsers behind flags.

**CSS Houdini — Partial Coverage** — `CSS.paintWorklet` and `CSS.layoutWorklet` are Chromium-only and not on a Baseline trajectory. `CSS.registerProperty()` (part of Houdini's `@property`) is Baseline. Only registered custom properties from Houdini are used in this architecture.

---

_This document is part of the Native-First Web Platform Architecture Specification._  
_Cross-references: `18. native-platform-capabilities.md`, `20. limitations-and-polyfills.md`_

---