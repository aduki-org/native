## Native Platform Capabilities — Comprehensive Assessment

**Version:** 1.0  
**Status:** Working Specification  
**Date:** May 2026  
**Authority:** MDN Web Docs, WHATWG Living Standard, W3C Specifications, Chrome Platform Status, web.dev Baseline

---

## Table of Contents

1. [Philosophy of Native-First Capability Mapping](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#1-philosophy-of-native-first-capability-mapping)
2. [Navigation and Routing Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#2-navigation-and-routing-capabilities)
3. [Rendering and UI Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#3-rendering-and-ui-capabilities)
4. [Animation Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#4-animation-capabilities)
5. [Scheduling and Performance Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#5-scheduling-and-performance-capabilities)
6. [Communication and Concurrency Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#6-communication-and-concurrency-capabilities)
7. [Storage Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#7-storage-capabilities)
8. [Networking Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#8-networking-capabilities)
9. [Offline and Background Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#9-offline-and-background-capabilities)
10. [Security Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#10-security-capabilities)
11. [Observation and Measurement Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#11-observation-and-measurement-capabilities)
12. [Component Model Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#12-component-model-capabilities)
13. [CSS Platform Capabilities](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#13-css-platform-capabilities)
14. [Capability Baseline Matrix](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#14-capability-baseline-matrix)
15. [Underutilised API Assessment](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#15-underutilised-api-assessment)
16. [Capability Gap Analysis](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#16-capability-gap-analysis)

---

## 1. Philosophy of Native-First Capability Mapping

The browser is not a rendering surface. It is a complete application runtime with a mature, expanding, standards-governed API surface. The purpose of this document is to exhaustively inventory what the platform already provides across every domain that a production-grade application requires — routing, rendering, animation, scheduling, storage, networking, security, communication, and observation.

Every capability listed here is a direct substitute for one or more common third-party library dependencies. The assessment for each capability includes its Baseline status (the interoperability signal maintained by web.dev and MDN, reflecting support across Chrome, Edge, Firefox, and Safari), its architectural role in this system, and the design principles that govern its use.

A capability's Baseline status has two tiers:

**Baseline Widely Available** — Feature has been available in all major engines for at least 30 months. Safe for production use without feature detection in new projects targeting modern browsers.

**Baseline Newly Available** — Feature has landed across all four major engines (Chrome, Edge, Firefox, Safari) but within the past 30 months. Safe for production use with feature detection and a defined fallback strategy. Progressive enhancement is the required pattern.

APIs that are in only one or two engines are not Baseline and must be treated as progressive enhancements for that engine's user base only.

---

## 2. Navigation and Routing Capabilities

### 2.1 Navigation API

**Spec:** WHATWG HTML Living Standard — Navigation API  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Navigation_API`  
**Baseline Status:** Newly Available — January 2026  
**Browser support:** Chrome, Edge, Firefox 147, Safari 26.2

The Navigation API is the correct foundation for all client-side routing in this architecture. It replaces the History API comprehensively.

**Core interface:** `window.navigation` — a singleton `Navigation` object that centralises all navigation control for the current browsing context.

**Key capabilities:**

The `navigate` event is the cornerstone. It fires for every navigation type originating in the current browsing context: link clicks, form submissions, programmatic `navigation.navigate()` calls, browser back/forward traversal, and reloads. This unified event model eliminates the fundamental flaw of the History API, where `popstate` did not fire for programmatic `pushState()` calls.

`event.intercept()` converts a browser-native navigation into a client-managed one. The handler function passed to `intercept()` returns a Promise; while that Promise is pending, the browser displays its built-in loading indicator and manages focus appropriately. When the Promise resolves, the navigation is committed and the URL is updated. This is a complete single-page application navigation model requiring zero library infrastructure.

`event.navigationType` distinguishes between `push`, `replace`, `reload`, and `traverse` navigation types. This distinction is architecturally significant: push and replace navigations require route rendering; reload navigations may be optimised to avoid redundant data fetching; traverse navigations may require animated transitions in the opposite direction.

`navigation.entries()` returns the full array of `NavigationHistoryEntry` objects for the current origin's history session. Unlike the History API, which provides no programmatic access to the history stack beyond the current index and length, the Navigation API exposes every entry with its URL, state, and a stable `key` identifier.

`event.destination` describes the navigation target before it completes. This enables pre-navigation data prefetching and validation.

**Architectural constraint:** The Navigation API operates only within a single origin's same-document context. Cross-origin navigations are not interceptable. Navigations within embedded `<iframe>` elements are not exposed to the parent frame's Navigation API instance.

**Design principle for this system:** The `navigate` event handler in `core/router` is the single point of routing control. No component should directly call `history.pushState()` or `location.assign()`. All programmatic navigations flow through `core.router.navigate()`, which delegates to `navigation.navigate()`.

---

### 2.2 URLPattern API

**Spec:** WICG URLPattern  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/URLPattern`  
**Baseline Status:** Newly Available — September 2025  
**Browser support:** Chrome, Edge, Firefox, Safari

URLPattern provides declarative URL matching with named capture groups, regex-compatible segment patterns, optional segments, and wildcard matching — all as a first-class browser primitive.

**Components matched independently:** A single `URLPattern` instance matches against all eight URL components independently: `protocol`, `username`, `password`, `hostname`, `port`, `pathname`, `search`, and `hash`. This enables precise matching rules such as restricting a route to a specific subdomain, a specific path prefix, and a specific query parameter pattern — in a single pattern definition.

**Named capture groups:** Match results expose captured groups by name via the `.exec()` method. For a pathname pattern of `/users/:userId/posts/:postId`, the match result contains `groups.userId` and `groups.postId` as resolved strings. No manual regex parsing required.

**Worker availability:** URLPattern is available in Web Workers and Service Workers. This is architecturally significant: the Service Worker's fetch handler can perform URL-based routing decisions using the same pattern language as the main-thread router, without bundling any routing library into the Service Worker.

**Validation semantics:** Patterns validate their inputs at construction time. An invalid pattern throws at instantiation, not at match time, providing early failure rather than silent mismatch at runtime.

**Design principle:** `core/router` builds all route matching on `URLPattern` instances. The same `URLPattern` objects used by the main-thread router are reused in the Service Worker for fetch routing decisions.

---

### 2.3 History API — Legacy Baseline

**Spec:** WHATWG HTML Living Standard — History API  
**Baseline Status:** Widely Available

The History API remains the fallback for browsers that have not yet shipped the Navigation API. The `core/router` layer detects Navigation API support via `'navigation' in window` and conditionally delegates to the History API for the minority of users on pre-January-2026 browser versions. The History API fallback implements the same route-matching logic but with the known limitations: `popstate` must be dispatched manually for programmatic navigation; intercepting link-click navigations requires document-level click delegation.

---

## 3. Rendering and UI Capabilities

### 3.1 Custom Elements v1

**Spec:** WHATWG HTML Living Standard — Custom Elements  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements`  
**Baseline Status:** Widely Available (all major engines since 2019)

Custom Elements is the component primitive of this architecture. A Custom Element is a standard HTML element subclass registered with `customElements.define()`. It participates in the same lifecycle as built-in elements: parsing, construction, connection, disconnection, attribute observation, and document adoption.

**Autonomous custom elements** extend `HTMLElement` directly and define entirely new element semantics. These are the primary component type in this architecture.

**Customised built-in elements** extend specific built-in elements (`HTMLButtonElement`, `HTMLInputElement`, etc.) via the `is` attribute. These inherit the built-in's accessibility semantics, form participation, and UA styling. Note: Safari requires a polyfill for customised built-in elements (the `builtin-element-polyfill`) as of mid-2026; autonomous custom elements have no such requirement.

**`observedAttributes`** — The static getter declares which attribute names trigger `attributeChangedCallback`. Only declared attributes are observed; undeclared attribute changes are silent. This is a deliberate design — unlimited attribute observation would impose a performance cost proportional to attribute mutation frequency.

**`formAssociated`** — The static boolean property enables a custom element to participate in native HTML form submission via `ElementInternals`. `attachInternals()` returns an `ElementInternals` object exposing `setFormValue()`, `setValidity()`, `reportValidity()`, and ARIA attribute setters. This is the correct mechanism for custom form controls; it replaces legacy patterns involving hidden `<input>` elements.

**Element upgrade:** An element encountered in HTML before its definition is registered is an "undefined" element. When `customElements.define()` is called, all existing instances are upgraded, and `connectedCallback` is invoked on those already in the document. This enables progressive enhancement of server-rendered HTML.

**`customElements.whenDefined()`** — Returns a Promise that resolves when a given tag name is defined. This enables safe upgrade-waiting patterns for elements whose upgrade may be deferred.

---

### 3.2 Shadow DOM

**Spec:** WHATWG HTML Living Standard — Shadow DOM  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow`  
**Baseline Status:** Widely Available (Level 1); Declarative Shadow DOM — Newly Available, August 2024

Shadow DOM provides style encapsulation and DOM tree isolation. A shadow root is a sub-document attached to a host element. Styles defined inside the shadow root do not leak out; external styles do not penetrate in (with the exception of CSS custom properties, which cross shadow boundaries by design).

**`attachShadow({ mode: 'open' | 'closed' })`** — `open` mode exposes the shadow root via `element.shadowRoot`; `closed` mode does not. For this architecture, `open` mode is standard. `closed` mode provides marginal security obscurity at significant debugging cost and breaks third-party accessibility tooling.

**Slots and composition:** `<slot>` elements distribute light DOM children into the shadow tree. Named slots (`<slot name="icon">`) enable structured composition. The _composed tree_ (the tree including slotted content) is what the browser renders and what assistive technologies traverse; the flat tree model requires understanding when designing accessible components.

**CSS custom properties cross shadow boundaries:** Variables defined on the host element are accessible inside the shadow DOM. This is the intended theming mechanism: the host's CSS custom properties are the theming API; shadow internals use `var(--token-name)` to consume them. No CSS-in-JS, no attribute-based theming required.

**`::slotted()`** — The CSS pseudo-element that targets slotted content from inside the shadow root. Specificity is limited: `::slotted()` can only match top-level slotted elements, not their descendants. For deep styling of slotted content, CSS custom properties are the correct mechanism.

**`::part()`** — Exposes named parts of a shadow tree for external styling. `element::part(header)` targets any element inside the shadow root marked with `part="header"`. This is the intentional styling escape hatch for component library consumers.

**Declarative Shadow DOM:** A `<template shadowrootmode="open">` element inside a Custom Element's markup in server-rendered HTML causes the browser to attach the template's contents as a shadow root during HTML parsing — before JavaScript runs. This enables server-side rendering of Web Components with hydration: the SSR output includes the shadow DOM; the client JavaScript upgrades the element in place without re-rendering the shadow DOM. The attribute name changed from `shadowroot` to `shadowrootmode` in the 2023 spec revision; Chrome 124+ uses the new name.

---

### 3.3 HTML Templates

**Spec:** WHATWG HTML Living Standard — `<template>` element  
**Baseline Status:** Widely Available

`<template>` elements hold inert HTML fragments that are parsed but not rendered. The template's `content` property is a `DocumentFragment` that can be cloned with `importNode()` or `cloneNode()` for instantiation. Templates are the correct primitive for repeating UI patterns that require DOM instantiation rather than string interpolation.

**`<template>` with `shadowrootmode`** — As described above, this is the Declarative Shadow DOM mechanism.

**Template instantiation proposal:** The WICG template instantiation proposal (not yet Baseline) defines a `<template>` with parameterised binding syntax. It would bring native data-binding to templates. Until it ships, `DocumentFragment` cloning with manual property assignment remains the correct pattern for this architecture.

---

### 3.4 Popover API

**Spec:** WHATWG HTML Living Standard — Popover  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Popover_API`  
**Baseline Status:** Newly Available — January 2025

The Popover API provides a native mechanism for displaying transient UI that overlays other content. Popover elements are placed in the _top layer_ — a browser-managed rendering layer above all page content, z-index stacking contexts, and `overflow: hidden` boundaries. This eliminates the entire class of z-index management problems in application UIs.

**`popover` attribute** — Applied to any element, it makes the element a popover. Popovers are hidden by default and shown only when invoked. The `popovertarget` and `popovertargetaction` attributes enable zero-JavaScript popover control via HTML.

**Popover types:** `auto` popovers close when clicking outside or pressing Escape, and implement _light dismiss_. Only one `auto` popover can be open at a time (the _top layer stack_ model). `manual` popovers require explicit JavaScript control and do not light-dismiss.

**JavaScript API:** `.showPopover()`, `.hidePopover()`, `.togglePopover()` — programmatic control when declarative HTML attributes are insufficient.

**`toggle` event** — Fires when a popover opens or closes, with `newState` indicating the direction. Essential for cleaning up state associated with a popover's open/closed lifecycle.

**Top layer and accessibility:** Because popovers render in the top layer, focus management, ARIA roles, and keyboard navigation must be applied explicitly. A `role="dialog"` popover requires `aria-modal`, appropriate labelling, and focus trapping in its open state.

**Integration with CSS anchor positioning:** The Popover API integrates with CSS anchor positioning (Baseline — January 2026). A popover can be tethered to its invoking element using `position-anchor` and `position-area` CSS properties, enabling JavaScript-free tooltip and dropdown positioning that automatically handles viewport edge-flipping.

---

### 3.5 Dialog Element

**Spec:** WHATWG HTML Living Standard — `<dialog>`  
**Baseline Status:** Widely Available

The `<dialog>` element provides native modal and non-modal dialogs. `dialog.showModal()` opens a modal dialog in the top layer with a built-in `::backdrop` pseudo-element, focus trapping, and Escape key close behaviour, all managed by the browser. `dialog.show()` opens a non-modal dialog. The `<dialog>` element is the correct primitive for confirmation dialogs, alert dialogs, and complex modal interactions.

---

## 4. Animation Capabilities

### 4.1 View Transitions API

**Spec:** W3C CSS View Transitions Module Level 1  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/View_Transition_API`  
**Baseline Status:** Newly Available — October 2025 (same-document); cross-document Chromium + Safari only as of mid-2026, Firefox pending

The View Transitions API provides native animated transitions between DOM states. The browser captures screenshots of the before and after states, then composites an animation between them. No layout thrashing, no FLIP (First Last Invert Play) manual calculation, no animation library required.

**Same-document transitions:** `document.startViewTransition(callback)` — the callback function modifies the DOM; the browser handles the screenshot capture, DOM update, and animated transition. The default animation is a cross-fade. Custom transitions are defined by targeting the `::view-transition-old(name)` and `::view-transition-new(name)` CSS pseudo-elements.

**`view-transition-name`** — A CSS property applied to any element that identifies it as a "named transition participant." Named elements animate between their old and new positions, sizes, and shapes — not just opacity. This enables morph-style transitions: a card thumbnail that expands into a detail view, a navigation item that grows into a header.

**Promises for transition lifecycle:** The `ViewTransition` object returned by `startViewTransition()` exposes `.ready` (the animation is about to begin), `.updateCallbackDone` (the DOM update callback has completed), and `.finished` (the transition animation is complete). These enable composing transitions with data fetching: begin the transition when data arrives, skip the transition if data takes too long.

**Cross-document (MPA) transitions:** For traditional multi-page applications where each navigation loads a new HTML document, view transitions are declared with the `@view-transition { navigation: auto }` CSS at-rule on both the outgoing and incoming pages. No JavaScript is required. The browser automatically captures and animates between pages on same-origin navigation. As of mid-2026, cross-document transitions are supported in Chrome 126+ and Safari 18.2+ but not yet in Firefox; a progressive enhancement approach is required.

**`:active-view-transition` pseudo-class:** Newly Available — January 2026. Targets the document root specifically while a view transition is in progress. Useful for applying global transition overlay styles.

**`prefers-reduced-motion` integration:** View transitions should respect `prefers-reduced-motion`. The recommended pattern is to detect reduced-motion preference and skip the transition entirely by calling `viewTransition.skipTransition()`, or to define a reduced-motion-safe alternative animation via the media query.

---

### 4.2 Web Animations API (WAAPI)

**Spec:** W3C Web Animations  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API`  
**Baseline Status:** Widely Available

WAAPI is the JavaScript-level interface to the browser's animation engine — the same engine that executes CSS animations and transitions. It fills the gap between declarative CSS animations (no runtime control) and imperative `requestAnimationFrame` loops (manual timing management, main-thread-only execution).

**`element.animate(keyframes, options)`** — The primary entry point. Returns an `Animation` object representing the running animation.

**`Animation` object controls:** `.play()`, `.pause()`, `.reverse()`, `.finish()`, `.cancel()` — full playback control. `.currentTime` — read/write access to the animation's current time position, enabling programmatic scrubbing. `.playbackRate` — read/write speed multiplier. `.commitStyles()` — commits the current computed styles of the animation to the element's inline style, enabling handoff from animation to static state.

**`getAnimations()`** — Returns all animations currently targeting a given element. This enables dynamic interrogation of animation state, which is necessary for safely interrupting and reversing in-progress animations.

**Performance characteristics:** Animations using only `transform` and `opacity` — the two properties that operate on the compositor thread — run off the main thread. They are not affected by main-thread JavaScript execution and will not drop frames during CPU-intensive JavaScript work. WAAPI animations of these properties share this performance characteristic with equivalent CSS animations.

**`KeyframeEffect`** — The separable representation of an animation's visual description, decoupled from its target element and playback control. Enables reusing animation definitions across multiple elements and constructing complex grouped effects.

**`GroupEffect` and `SequenceEffect`** — Available in Chrome but not yet Baseline. These provide declarative grouping and sequencing of multiple `KeyframeEffect` objects without manual timing calculations. Until they reach Baseline, sequencing is achieved by chaining Promise callbacks on `Animation.finished`.

**Scroll-driven animations (CSS Scroll Timelines):** While technically a CSS feature, `AnimationTimeline`, `ScrollTimeline`, and `ViewTimeline` are the WAAPI-level interfaces for driving animations with scroll position. These run on the compositor thread, producing silky-smooth scroll-linked effects without any JavaScript reading `scrollTop`. As of mid-2026, CSS scroll-driven animations are Widely Available; the `ScrollTimeline` and `ViewTimeline` JavaScript constructors are also widely available.

---

### 4.3 CSS Animations and Transitions

**Spec:** W3C CSS Animations Level 1, CSS Transitions Level 1  
**Baseline Status:** Widely Available

CSS animations and transitions remain the correct tool for state-based visual changes that do not require runtime JavaScript control. A button's hover transition, a component's conditional visibility toggle, an accordion's expand/collapse — these are declared in CSS and execute on the compositor thread without any JavaScript involvement.

**`prefers-reduced-motion`** — Animations and transitions must be gated behind a `prefers-reduced-motion: no-preference` media query or explicitly overridden for `reduce` preference. Motion can be a vestibular trigger for certain users; respecting this preference is a non-negotiable accessibility requirement.

**`interpolate-size: allow-keywords`** — Newly landing in browsers in 2025–2026. This CSS property enables animating to and from intrinsic size keywords like `auto`, `min-content`, and `max-content` — historically impossible without JavaScript-measured intermediate heights. It enables native accordion and expand/collapse animations without WAAPI.

---

## 5. Scheduling and Performance Capabilities

### 5.1 Prioritized Task Scheduling API

**Spec:** WICG Prioritized Task Scheduling  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Scheduler`  
**Baseline Status:** Widely Available

`scheduler.postTask(callback, options)` is the standards-compliant replacement for all `setTimeout(fn, 0)` deferred task patterns. It accepts three priority levels — `user-blocking`, `user-visible`, and `background` — and an `AbortSignal` for cancellation.

**`scheduler.yield()`** — Equally or more important than `postTask()`. It yields control from the currently executing task back to the browser's event loop, allowing pending input events, rendering work, and higher-priority tasks to execute before the current task resumes. This is the correct mechanism for breaking up long-running synchronous work into resumable chunks. Critically, `yield()` called from within a `postTask()` callback inherits the callback's priority level — yielded work does not get demoted to background priority.

**Task controller:** `TaskController` extends `AbortController` and adds the ability to change a posted task's priority after it has been scheduled. A task scheduled at `user-visible` priority can be promoted to `user-blocking` if it becomes blocking to user interaction.

**Relationship to `requestAnimationFrame` and `requestIdleCallback`:** These two platform primitives remain relevant but have narrower appropriate use cases than they historically held. `requestAnimationFrame` is correct only for work that must be synchronised with the browser's rendering pipeline — specifically, work that reads layout and immediately writes to the DOM to avoid forced layout. `requestIdleCallback` is correct for genuinely idle-time work, but must always include a `timeout` option to prevent indefinite deferral when the browser is continuously busy.

---

### 5.2 PerformanceObserver and Web Vitals

**Spec:** W3C Performance Timeline  
**Baseline Status:** Widely Available

`PerformanceObserver` is the browser's native performance instrumentation interface. It subscribes to performance entries by type without blocking the main thread for measurement.

**Entry types for Core Web Vitals monitoring:**

`largest-contentful-paint` — The `LCPCandidateEntry` sequence, where the last entry before user interaction is the LCP measurement. Observation must begin before the first user interaction.

`layout-shift` — Cumulative Layout Shift (CLS) is computed by summing `value` properties of all `layout-shift` entries that are not within 5 seconds of a user interaction (the session window model).

`event` — Interaction to Next Paint (INP) is derived from `event` entries with non-zero `processingStart` delay. The 98th percentile `duration` across all interactions is the INP score.

`longtask` — Tasks exceeding 50ms. The `attribution` object on a long task entry identifies the responsible script, frame, and container. Essential for root-causing jank.

`navigation` — Full navigation timing: DNS lookup, TCP connection, TLS handshake, first byte (TTFB), DOM content loaded, load event.

`resource` — Per-resource fetch timing, enabling detection of slow third-party resources.

---

## 6. Communication and Concurrency Capabilities

### 6.1 BroadcastChannel API

**Spec:** WHATWG HTML Living Standard — BroadcastChannel  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API`  
**Baseline Status:** Widely Available

`BroadcastChannel` provides a named publish-subscribe bus accessible from any same-origin context: tabs, dedicated workers, shared workers, service workers, and iframes. Any context that creates a `BroadcastChannel` with the same name joins the same channel.

**Architectural role:** Cross-tab state synchronisation. When a user modifies authentication state, theme preferences, or collaborative document state in one tab, the change is posted to a named channel and received by all other open tabs. Each tab's reactive state layer applies the update locally. This eliminates stale state across multiple open instances of the same application.

**`messageerror` event:** Fires when a message cannot be deserialized (e.g., due to a structured clone error). Well-written code handles this event to avoid silent message loss.

**Lifecycle:** A `BroadcastChannel` instance holds a reference to the channel until explicitly `close()`d. Channels must be closed in component `disconnectedCallback` or equivalent cleanup paths; unclosed channels constitute a resource leak and may prevent garbage collection of associated contexts.

---

### 6.2 Web Locks API

**Spec:** WICG Web Locks  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API`  
**Baseline Status:** Widely Available

`navigator.locks.request(name, callback)` acquires a named mutex across all same-origin contexts. The callback executes with exclusive access to the named resource and releases the lock when it returns (or when its returned Promise resolves). This is the browser-native equivalent of a mutex.

**`mode: 'exclusive' | 'shared'`** — Exclusive locks prevent any concurrent access. Shared locks allow multiple concurrent readers while blocking exclusive writers. The reader/writer model is appropriate for IndexedDB read/write coordination.

**`AbortSignal` integration:** The lock request accepts an `AbortSignal` as an option. If the signal fires before the lock is acquired, the request is cancelled. This prevents lock requests from waiting indefinitely when the user has navigated away.

**`ifAvailable: true`** — Requests a lock but does not queue if it cannot be immediately acquired. The callback is invoked with `null` if the lock is unavailable. Appropriate for opportunistic operations.

**`query()`** — Returns the current state of all held and pending locks for the origin. Used for diagnostic tooling and deadlock detection.

**Architectural role:** Serialising IndexedDB writes during Background Sync replay. When multiple tabs attempt to flush offline-queued operations simultaneously, a named lock prevents concurrent writes from producing inconsistent database state.

---

### 6.3 Worker Architecture — Dedicated, Shared, Service

See full specification in `12. worker-architecture.md`. Summary of native platform capabilities:

**Dedicated Workers** use `postMessage()` with structured cloning for data transfer. `Transferable` objects (`ArrayBuffer`, `MessagePort`, `OffscreenCanvas`, `ReadableStream`, `WritableStream`, `TransformStream`) are transferred with zero-copy semantics — the data is moved to the worker's context rather than copied, eliminating the overhead of cloning large buffers.

**`OffscreenCanvas`** — A `Transferable` that enables GPU-accelerated canvas rendering entirely in a Dedicated Worker, without any involvement from the main thread. Appropriate for data visualisation, game rendering, and image processing pipelines where main-thread involvement would introduce frame drops.

**SharedArrayBuffer and Atomics** — Available in cross-origin-isolated contexts (requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers). Enable shared memory with atomic read/write operations between workers. Appropriate for high-frequency data sharing (audio processing, simulation) where `postMessage()` overhead is measurable.

**Shared Workers** persist across all tabs from the same origin. Their `SharedWorkerGlobalScope` lifetime is the lifetime of the longest-running connected tab. Appropriate for maintaining a single WebSocket connection, a shared in-memory cache, or a shared rate-limiter.

**`MessageChannel`** — Creates a direct peer-to-peer channel between any two contexts. One `MessagePort` is retained; the other is sent to the remote context. Each port sends and receives on its own endpoint, enabling true request/response patterns with multiple concurrent in-flight messages.

---

## 7. Storage Capabilities

### 7.1 IndexedDB

**Spec:** W3C Indexed Database API 3.0  
**Baseline Status:** Widely Available

IndexedDB is the correct storage mechanism for all structured application data. Its key characteristics are: transactional atomicity, indexed querying, cursor-based iteration over large datasets, and an origin-based quota that typically represents 50–80% of available disk space.

**Object stores** — Named collections of records. A record is any structured-cloneable JavaScript value (not limited to serialisable values). `Date`, `ArrayBuffer`, `Map`, `Set`, and `Blob` objects can be stored natively without serialisation.

**Indexes** — Each object store can define multiple indexes over any keypath. Indexes enable efficient equality and range queries without full-table iteration. Compound indexes over multiple keypaths enable efficient multi-criteria queries.

**Transactions** — All reads and writes occur within transactions. Transactions are scoped to one or more object stores and have a mode (`readonly`, `readwrite`, `versionchange`). A `readwrite` transaction holds a lock on its object stores for its duration; concurrent `readonly` transactions on the same stores execute concurrently.

**`onupgradeneeded`** — The schema migration handler. It executes inside a `versionchange` transaction, the only context in which `createObjectStore()`, `createIndex()`, `deleteObjectStore()`, and `deleteIndex()` are valid. Migration is applied sequentially through version numbers.

**Quota management via StorageManager:** `navigator.storage.estimate()` returns the quota and usage for the origin. `navigator.storage.persist()` requests durable storage — storage that the browser will not evict under storage pressure without explicit user consent. Persistent storage is required for offline-first applications.

---

### 7.2 Cache API

**Spec:** WHATWG Service Worker Living Standard — Cache Storage  
**Baseline Status:** Widely Available

The Cache API is a `Request`/`Response` store for caching HTTP responses. Available in Service Workers, Dedicated Workers, and the main thread. `caches.open(name)` returns a named cache; `cache.put(request, response)`, `cache.match(request)`, `cache.delete(request)`, and `cache.keys()` provide CRUD operations.

Quota is shared with IndexedDB under the Storage Standard — both consume from the same origin quota pool.

---

### 7.3 Origin Private File System (OPFS)

**Spec:** WHATWG File System Living Standard  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system`  
**Baseline Status:** Widely Available (OPFS); user-facing file pickers — Chromium only

OPFS is a private, origin-scoped virtual file system with high-performance synchronous access available in Web Workers. `navigator.storage.getDirectory()` returns the root `FileSystemDirectoryHandle` of the OPFS. In a Dedicated Worker, `FileSystemFileHandle.createSyncAccessHandle()` provides synchronous read/write access without the asynchronous overhead of IndexedDB — appropriate for databases (SQLite via WASM), large binary files, and any application requiring file-system semantics.

The user-facing file pickers (`showOpenFilePicker()`, `showSaveFilePicker()`, `showDirectoryPicker()`) require Chromium and must have `<input type="file">` fallbacks for Safari and Firefox.

---

## 8. Networking Capabilities

### 8.1 Fetch API

**Spec:** WHATWG Fetch Living Standard  
**Baseline Status:** Widely Available

`fetch()` is the comprehensive HTTP client primitive. Its design principles that govern this architecture's use:

**`response.body` is a `ReadableStream`:** Every Fetch response body is a stream. Large responses — reports, bulk data exports, AI streaming responses — should be consumed as streams rather than awaited as complete buffers. `response.body.getReader()` returns a `ReadableStreamDefaultReader` for progressive consumption.

**`AbortSignal` and `AbortController`:** Every `fetch()` call in this architecture receives an `AbortSignal` derived from the initiating component's lifecycle controller. When the component is disconnected, all its in-flight requests are automatically aborted, preventing stale-response state mutations.

**`Request` object:** `fetch()` accepts a `Request` object as well as a URL string. The `Request` constructor enables constructing and cloning request descriptors before dispatch, which is the correct foundation for the interceptor pipeline in `core/api`.

**`Headers` API:** Immutable (`Headers` on a `Response`) and mutable (`Headers` on a `Request`) header collections. `entries()`, `keys()`, `values()` iterators enable introspection.

---

### 8.2 Streams API

**Spec:** WHATWG Streams Living Standard  
**Baseline Status:** Widely Available (ReadableStream, WritableStream, TransformStream)

**Backpressure:** The Streams API's internal backpressure mechanism propagates from consumer to producer via `desiredSize`. When a slow consumer's buffer fills (desiredSize drops to zero or below), the stream controller signals the source to slow or pause. This eliminates manual flow control in streaming pipelines.

**`TransformStream`:** A `ReadableStream` connected to a `WritableStream` via a transform function. Inserting a `TransformStream` into a pipeline handles decoding, parsing, or transformation without buffering the entire payload.

**Transferability:** All three stream types are `Transferable`. A stream can be transferred from the main thread to a Worker (or between Workers) via `postMessage()`, enabling zero-copy stream processing pipelines.

**`ReadableStream.from(iterable)`** — Converts any async iterable into a `ReadableStream`. Enables adapting EventSource, WebSocket message streams, and generator functions into the Streams API model.

---

### 8.3 EventSource

**Spec:** WHATWG HTML Living Standard — Server-Sent Events  
**Baseline Status:** Widely Available

`EventSource` provides a persistent HTTP connection for server-to-client push. The protocol is simple (text over HTTP), the connection automatically reconnects with exponential backoff, and the browser manages the connection lifecycle. No custom reconnection logic required. Messages are dispatched as events: `source.addEventListener('event-type', handler)`.

**Limitations vs WebSocket:** Unidirectional (server to client only); text only; HTTP/1.1 connection limit per origin (HTTP/2 multiplexing eliminates this concern in modern deployments).

---

### 8.4 WebSocket

**Spec:** WHATWG WebSockets Living Standard  
**Baseline Status:** Widely Available

Full-duplex binary/text messaging over a persistent TCP connection. In this architecture, WebSocket connections are managed by a Shared Worker, not by individual tabs, so that multiple tabs share a single connection. Distribution of messages to tabs uses `BroadcastChannel`.

---

## 9. Offline and Background Capabilities

### 9.1 Service Worker API

**Spec:** WHATWG HTML Living Standard — Service Workers  
**Baseline Status:** Widely Available

The Service Worker is the cornerstone of offline capability and the single point of network interception for an origin's scope. As of January 2026, Service Workers support JavaScript ES Modules natively (`type: 'module'` in the registration options) across all major engines — this is also Baseline Newly Available as of January 2026. Previously, Service Workers were restricted to script concatenation patterns that could not use `import` statements.

**Service Worker Static Routing API:** Available in Chrome 123+ (not yet Baseline). Allows declarative routing rules defined at install time that bypass Service Worker fetch event handling for matched URL patterns — directly serving from cache or network without executing the Service Worker's fetch handler. This eliminates Service Worker startup latency for statically-routable requests.

---

### 9.2 Background Sync API

**Spec:** WICG Background Sync  
**Browser support:** Chromium only (Firefox disabled; Safari not implemented)  
**Baseline Status:** Not Baseline

Background Sync allows registering a sync event that the browser will fire in the Service Worker when the device regains connectivity — even if the page is closed. This is the correct mechanism for offline mutation queuing: mutations are stored in IndexedDB, a sync is registered, and the Service Worker replays the queue when connectivity returns.

The critical constraint: Firefox and Safari do not implement Background Sync. The architecture always provides a manual fallback: listening to the `online` event and replaying the queue when the tab is open and connectivity returns.

---

### 9.3 Push Notifications

**Spec:** W3C Push API  
**Baseline Status:** Widely Available (except iOS Safari until PWA installation)

`PushManager.subscribe()` in the Service Worker registers a push subscription with the browser's push service. Push messages are received by the Service Worker's `push` event handler. Notifications are displayed via `ServiceWorkerRegistration.showNotification()`. User permission must be explicitly requested; the platform's permission prompt is controlled by `Notification.requestPermission()`.

---

## 10. Security Capabilities

### 10.1 SubtleCrypto API

**Spec:** W3C Web Cryptography API Level 2  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto`  
**Baseline Status:** Widely Available

`crypto.subtle` provides access to low-level cryptographic operations: hashing, signing, verification, encryption, decryption, key generation, key derivation, key import, and key export.

**`CryptoKey`** — The non-extractable key representation. Keys generated or derived via `SubtleCrypto` are represented as opaque `CryptoKey` objects. Setting `extractable: false` at key generation prevents the raw key material from ever being exported to JavaScript — the key can only be used for cryptographic operations, not read. This is the correct model for application keys.

**Important algorithms available:**

`AES-GCM` — Authenticated encryption. The standard algorithm for encrypting application data. Produces authentication tag as part of ciphertext; decryption fails if ciphertext has been tampered with.

`ECDSA` / `ECDH` — Elliptic curve digital signatures and key agreement. P-256 and P-384 are the standard named curves.

`RSA-PSS` / `RSA-OAEP` — RSA signature and encryption. Larger key sizes (2048, 4096 bits).

`HMAC` — Hash-based message authentication. Used for request signing and integrity verification.

`PBKDF2` / `HKDF` — Key derivation functions. `PBKDF2` derives keys from passwords; `HKDF` derives additional keys from existing key material.

`SHA-256`, `SHA-384`, `SHA-512` — Hash functions via `subtle.digest()`.

**`crypto.getRandomValues()`** — Cryptographically secure random number generation. Fills a `TypedArray` with random bytes. This is the only correct source of random values for security-sensitive operations; `Math.random()` is not cryptographically secure.

**`crypto.randomUUID()`** — Generates a standards-compliant UUID v4 using cryptographically secure randomness. Available in all modern browsers without `subtle`.

**Security warning from the specification itself:** The naming of `SubtleCrypto` is intentional — it reflects that these algorithms have subtle usage requirements that make misuse easy and silent. Key management, IV uniqueness for AES-GCM, and password hashing iteration counts require specialist security review. The `core.security` wrapper in this architecture enforces correct defaults and prevents direct exposure of SubtleCrypto to application code.

---

### 10.2 Permissions API

**Spec:** W3C Permissions  
**Baseline Status:** Widely Available (query); push permission — partial

`navigator.permissions.query({ name: 'permission-name' })` returns a `PermissionStatus` with a `state` of `granted`, `denied`, or `prompt`. The `change` event on `PermissionStatus` notifies when permission state changes without requiring a re-query. This enables UI that dynamically reflects permission state.

**Queryable permissions include:** `camera`, `microphone`, `geolocation`, `notifications`, `persistent-storage`, `clipboard-read`, `clipboard-write`, `storage-access`, `midi`, `background-fetch`, and others depending on the browser.

---

### 10.3 Trusted Types

**Spec:** W3C Trusted Types  
**Browser support:** Chrome, Edge (Chromium); Firefox and Safari have partial or no support as of mid-2026  
**Baseline Status:** Not Baseline

Trusted Types is a browser enforcement mechanism that prevents DOM XSS by restricting which string values can be assigned to dangerous DOM sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, script `src`, etc.). A Content Security Policy header (`require-trusted-types-for 'script'`) activates enforcement. Application code must produce `TrustedHTML`, `TrustedScript`, or `TrustedScriptURL` objects from registered policies rather than raw strings.

The architecture's sanitisation interface (`core.security.sanitize`) is designed with Trusted Types compatibility in mind: when the Sanitizer API and Trusted Types are both available, `setHTML()` is used, which accepts a `Sanitizer` and integrates natively with Trusted Types enforcement.

---

## 11. Observation and Measurement Capabilities

### 11.1 IntersectionObserver

**Spec:** W3C Intersection Observer  
**Baseline Status:** Widely Available

`IntersectionObserver` delivers callbacks when a target element enters or leaves the viewport (or a specified root element's bounds). Callbacks are batched and delivered asynchronously, ensuring they do not block the main thread or layout.

**`thresholds`** — An array of intersection ratios (0.0 to 1.0) at which to fire callbacks. Multiple thresholds enable tracking degrees of visibility, not just binary in/out.

**`rootMargin`** — Expands or contracts the effective intersection root boundary. A positive `rootMargin` fires callbacks before an element reaches the viewport, enabling preemptive loading.

**`trackVisibility`** — When `true`, additionally checks whether the element is actually visible (not covered by overlapping elements, not behind a filter, not opacity-zero). This is computationally intensive; use sparingly and pair with a `delay` option.

**Architectural uses:** Lazy-loading images and components below the fold; triggering CSS entrance animations; activating `content-visibility: auto` area rendering; firing analytics events for element visibility.

---

### 11.2 ResizeObserver

**Spec:** W3C Resize Observer  
**Baseline Status:** Widely Available

`ResizeObserver` delivers callbacks when a target element's content box, border box, or device-pixel content box dimensions change. This is the correct, performant replacement for all patterns that poll `getBoundingClientRect()` or listen to `window.resize` to detect component dimension changes.

**`box` option:** `content-box` (default), `border-box`, or `device-pixel-content-box`. The `device-pixel-content-box` value provides physical pixel dimensions, necessary for canvas sizing to avoid blurry rendering on high-DPI displays.

**`ResizeObserverEntry`:** Each callback receives an array of `ResizeObserverEntry` objects. The `contentRect`, `borderBoxSize`, and `contentBoxSize` properties expose the new dimensions.

---

### 11.3 MutationObserver

**Spec:** WHATWG DOM Living Standard — Mutation Observers  
**Baseline Status:** Widely Available

`MutationObserver` delivers callbacks for DOM mutations: child node additions/removals, attribute changes, and text content changes. Callbacks are batched into a microtask, not delivered per-mutation, which makes them efficient for observing rapidly-changing DOM trees.

**Architectural uses:** Observing external attribute changes on a Custom Element's host from inside its shadow DOM (when `attributeChangedCallback` is insufficient); detecting dynamic content insertions for accessiblity tree updates; observing third-party DOM modifications.

---

## 12. Component Model Capabilities

### 12.1 ElementInternals and Form Association

`ElementInternals` is returned by `element.attachInternals()`. It provides:

**Form participation:** `setFormValue()`, `setValidity()`, `reportValidity()`, `willValidate`, `validity`, `validationMessage` — the complete form control interface. Custom form controls using `ElementInternals` participate natively in `<form>` submission, constraint validation UI, and `form.elements` enumeration.

**ARIA delegation:** `ariaLabel`, `ariaRole`, `ariaDescribedBy` etc. — setting ARIA semantics on the host element from within the component definition, without requiring authors to manually set ARIA attributes. This is the correct model for components that have meaningful semantic roles.

**`states` (Custom State Pseudo-Class API):** `ElementInternals.states` is a `CustomStateSet`. States added to this set can be targeted with `:state(name)` CSS pseudo-class selectors from outside the shadow DOM. This enables CSS hooks for component states (`:state(loading)`, `:state(error)`) without class-list manipulation. Baseline Newly Available — 2024.

---

## 13. CSS Platform Capabilities

### 13.1 CSS Custom Properties (Variables)

**Baseline Status:** Widely Available

CSS custom properties (`--property-name: value`) are the theming API of the component system. Custom properties cross shadow DOM boundaries by inheritance, making them the correct mechanism for distributing design tokens from the application shell to deeply nested components.

**`@property`** — Registers a custom property with a syntax, initial value, and inheritance control. Registered properties participate in CSS transitions and animations; unregistered custom properties do not. `@property` is Baseline Newly Available as of 2024.

---

### 13.2 CSS Container Queries

**Baseline Status:** Widely Available (size queries); Style queries — Newly Available

Container queries (`@container`) enable CSS rules based on the dimensions of a containing element rather than the viewport. This is the correct primitive for truly reusable components that adapt to their context rather than the global viewport.

---

### 13.3 `content-visibility: auto`

**Spec:** W3C CSS Containment Module Level 2  
**MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/content-visibility`  
**Baseline Status:** Newly Available — September 2024 (MDN/web.dev show 2024; web.dev article confirms September 2025 for full Baseline)

`content-visibility: auto` instructs the browser to skip layout and paint of off-screen elements entirely. The browser treats the element as having CSS containment (`contain: content`) and does not perform layout work for it until it approaches the viewport. The performance impact is substantial: a page with many off-screen content areas can achieve up to 7x rendering performance improvement on initial load.

**`contain-intrinsic-size`:** Because a `content-visibility: auto` element has no layout performed off-screen, the browser does not know its dimensions. `contain-intrinsic-size` provides a placeholder size estimate that the browser uses for scrollbar calculations and scroll position stability. Without it, scrollbars jitter as elements come into view.

**`contentvisibilityautostatechange` event:** Fires on the element when its rendering work starts or stops being skipped. This enables lazy-mounting expensive child components, deferring image decoding, or pausing embedded media without requiring an `IntersectionObserver`.

---

### 13.4 CSS Anchor Positioning

**Spec:** W3C CSS Anchor Positioning  
**Baseline Status:** Newly Available — January 2026

CSS Anchor Positioning enables positioning an element relative to another arbitrary element in the document — not just its CSS containing block. This is the native solution to the tooltip/dropdown positioning problem that previously required JavaScript libraries (Floating UI, Popper.js) to solve.

**`anchor-name`** — Declares an element as a named anchor.  
**`position-anchor`** — Connects a positioned element to a named anchor.  
**`position-area`** — Declaratively places the positioned element in a grid area around the anchor (top-start, bottom-end, etc.).  
**`position-try-fallbacks`** — An ordered list of alternative positions to try when the primary position would overflow the viewport. The browser automatically selects the first non-overflowing position. This is the viewport-edge-flipping behaviour that previously required ~500 lines of JavaScript.

---

### 13.5 CSS Nesting

**Baseline Status:** Widely Available — 2024

Native CSS nesting (`&` selector) eliminates the need for a CSS preprocessor (Sass/Less/Stylus) for structural nesting, which was historically one of the primary reasons for adopting a preprocessor.

---

### 13.6 CSS Mixins (`@mixin` / `@apply`)

**Status:** Shipping in Chrome 146 (expected 2026); not Baseline

Native CSS mixins (`@mixin --name { ... }` and `@apply --name`) are landing in Chrome as of 2026. These provide reusable declaration blocks with parameter support — the final remaining primary use case for CSS preprocessors. Not yet Baseline; use with feature detection and a preprocessor fallback.

---

## 14. Capability Baseline Matrix

|Capability Domain|API|Baseline Status|
|---|---|---|
|**Routing**|Navigation API|Newly Available — Jan 2026|
|**Routing**|URLPattern|Newly Available — Sep 2025|
|**Routing**|History API (fallback)|Widely Available|
|**Components**|Custom Elements v1|Widely Available|
|**Components**|Shadow DOM|Widely Available|
|**Components**|Declarative Shadow DOM|Newly Available — Aug 2024|
|**Components**|HTML Templates|Widely Available|
|**Components**|ElementInternals / Form Association|Widely Available|
|**Components**|Custom State Pseudo-Class|Newly Available — 2024|
|**UI Primitives**|Popover API|Newly Available — Jan 2025|
|**UI Primitives**|Dialog element|Widely Available|
|**UI Primitives**|CSS Anchor Positioning|Newly Available — Jan 2026|
|**Animation**|View Transitions (same-doc)|Newly Available — Oct 2025|
|**Animation**|View Transitions (cross-doc)|Chromium + Safari only|
|**Animation**|Web Animations API|Widely Available|
|**Animation**|CSS Scroll-Driven Animations|Widely Available|
|**Animation**|View Transition Type targeting|Newly Available — Jan 2026|
|**Scheduling**|Scheduler API (postTask / yield)|Widely Available|
|**Scheduling**|requestAnimationFrame|Widely Available|
|**Scheduling**|requestIdleCallback|Widely Available|
|**Scheduling**|PerformanceObserver (vitals)|Widely Available|
|**Concurrency**|Web Workers (Dedicated)|Widely Available|
|**Concurrency**|Shared Workers|Widely Available|
|**Concurrency**|Service Workers + ES Modules|Newly Available — Jan 2026|
|**Concurrency**|BroadcastChannel|Widely Available|
|**Concurrency**|Web Locks API|Widely Available|
|**Concurrency**|MessageChannel|Widely Available|
|**Concurrency**|SharedArrayBuffer + Atomics|Widely Available (cross-origin-isolated)|
|**Concurrency**|OffscreenCanvas|Widely Available|
|**Storage**|IndexedDB|Widely Available|
|**Storage**|Cache API|Widely Available|
|**Storage**|StorageManager (estimate/persist)|Widely Available|
|**Storage**|OPFS (Origin Private File System)|Widely Available|
|**Storage**|File System Access (user-facing picker)|Chromium only|
|**Storage**|localStorage / sessionStorage|Widely Available|
|**Networking**|Fetch API|Widely Available|
|**Networking**|Streams API (ReadableStream etc.)|Widely Available|
|**Networking**|AbortController / AbortSignal|Widely Available|
|**Networking**|EventSource (SSE)|Widely Available|
|**Networking**|WebSocket|Widely Available|
|**Networking**|Compression Streams|Widely Available|
|**Offline**|Background Sync|Chromium only|
|**Offline**|Periodic Background Sync|Chromium/PWA only|
|**Offline**|Push API|Widely Available (iOS PWA-only)|
|**Performance**|content-visibility: auto|Newly Available — Sep 2024/2025|
|**Performance**|Speculation Rules API|Chromium; Safari 26.2 disabled by default|
|**Security**|SubtleCrypto (Web Crypto API)|Widely Available|
|**Security**|Permissions API|Widely Available|
|**Security**|Sanitizer API|Not Baseline (Chrome available; Firefox/Safari pending)|
|**Security**|Trusted Types|Not Baseline|
|**Observation**|IntersectionObserver|Widely Available|
|**Observation**|ResizeObserver|Widely Available|
|**Observation**|MutationObserver|Widely Available|
|**CSS**|Custom Properties + @property|Widely Available|
|**CSS**|Container Queries (size)|Widely Available|
|**CSS**|CSS Nesting|Widely Available|
|**CSS**|CSS Anchor Positioning|Newly Available — Jan 2026|
|**CSS**|CSS Mixins (@mixin/@apply)|Chrome 146 only — not Baseline|
|**CSS**|interpolate-size|Emerging — not Baseline|
|**Module System**|ES Modules (static import)|Widely Available|
|**Module System**|Dynamic import()|Widely Available|
|**Module System**|Import Maps|Widely Available|
|**Module System**|modulepreload|Widely Available|
|**Reactivity**|Proxy (for reactive state)|Widely Available|
|**Reactivity**|TC39 Signals|Stage 1 — no browser shipping|

---

## 15. Underutilised API Assessment

The following APIs are production-ready and architecturally significant but see low adoption in the wild, primarily due to unfamiliarity rather than technical limitation.

**`scheduler.postTask()` and `scheduler.yield()`** — Baseline Widely Available, yet most production code still uses `setTimeout(fn, 0)` for deferred work. The priority model and `AbortSignal` integration of `postTask()` are strictly superior. `scheduler.yield()` is arguably the most important single scheduling improvement available: it enables long tasks to be broken into resumable chunks without the priority demotion of `setTimeout`.

**URLPattern** — Newly Available since September 2025. Eliminates routing libraries for URL matching. Available in Service Workers, enabling unified routing logic across contexts.

**Navigation API** — Newly Available since January 2026. Replaces History API entirely. The `navigate` event model is dramatically superior to `popstate`-based routing.

**Web Locks API** — Widely Available. Provides browser-native mutex semantics across tabs and workers. Almost entirely absent from production codebases outside PWA toolkits.

**BroadcastChannel** — Widely Available. One-to-many cross-tab messaging with no setup beyond a channel name. Consistently overlooked in favour of SharedWorker-based approaches that require significantly more infrastructure.

**`content-visibility: auto`** — Newly Available. Provides virtual-scroll-level rendering performance at zero JavaScript cost. Requires understanding of browser rendering internals to use correctly, but the technique is entirely declarative CSS once understood.

**`ElementInternals.states` (Custom State Pseudo-Class)** — Newly Available 2024. Eliminates class-list manipulation as the mechanism for CSS-hookable component states.

**CSS Anchor Positioning** — Newly Available January 2026. Eliminates the need for Popper.js and Floating UI in all tooltip/dropdown positioning scenarios.

**Compression Streams** — Widely Available. Native gzip/deflate in the browser without a library. Directly applicable to compressing state for storage or decompressing fetched archives.

**`OffscreenCanvas`** — Widely Available. Full GPU-accelerated canvas rendering in a Dedicated Worker. Eliminates an entire category of main-thread paint work.

---

## 16. Capability Gap Analysis

The platform is not uniformly complete. The following capability domains have gaps that require documented fallback strategies or explicit acknowledgement:

**Reactive primitives** — The TC39 Signals proposal is at Stage 1 as of mid-2026. No browser ships native signals. The architecture's Proxy-based reactive layer is designed for migration compatibility with native signals when they eventually ship (see `6. reactivity.md`), but userland reactive infrastructure is required today.

**Server-side rendering of Web Components** — Declarative Shadow DOM enables SSR, but tooling ecosystem support is thin compared to Next.js or Nuxt. Projects requiring SSR with Web Components must invest in custom SSR infrastructure.

**Background Sync** — Chromium-only. Firefox and Safari users require the manual `online` event retry path. This is not a progressive enhancement gap; it requires a complete alternative code path.

**Cross-document View Transitions** — Chromium and Safari as of mid-2026; Firefox pending. MPA transition animations are a progressive enhancement only.

**Speculation Rules API** — Chromium-dominant. Safari 26.2 ships it but with it disabled by default. Firefox has no support. The progressive enhancement fallback (`<link rel="prefetch">`) provides prefetch behaviour without prerender on non-Chromium browsers.

**Sanitizer API** — Chrome has it, but it is not yet Baseline. DOMPurify remains the production sanitisation library until the Sanitizer API reaches cross-browser Baseline. The architecture's `core.security.sanitize` abstraction is designed to swap implementations transparently when the native API is universally available.

**CSS `interpolate-size`** — Not yet Baseline. Animating to `height: auto` requires WAAPI with JavaScript-measured intermediate heights until this property reaches Baseline.

**Customised built-in elements** — The `is` attribute for extending built-in elements requires a polyfill in Safari. Autonomous Custom Elements have no such requirement.

---

_This document is part of the Native-First Web Platform Architecture Specification._  
_Cross-references: `2. architecture.md`, `3. runtime.md`, `4. component-lifecycle.md`, `17. internal-api.md`_

---