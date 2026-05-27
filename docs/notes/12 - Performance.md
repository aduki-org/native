## Performance Architecture

**Spec Authority:** W3C Web Performance Working Group · WHATWG HTML Living Standard · WICG Scheduling APIs · WICG Speculation Rules · W3C Long Tasks · W3C Long Animation Frames  
**MDN References:** PerformanceObserver · Scheduler API · View Transition API · Speculation Rules API · Long Tasks API · Long Animation Frames API  
**Baseline Status:** PerformanceObserver — Widely Available · LCP + INP APIs — Newly Available (December 2025) · CLS — Chromium-only · content-visibility — Newly Available (September 2025) · scheduler.yield — Chrome + Firefox (August 2025), Safari pending · View Transitions (same-document) — Newly Available (October 2025) · Speculation Rules — Chromium-only

---

## Design Principles for Performance

Performance in this architecture is not a phase of development that begins after features are complete. It is a structural property of the system, enforced at the architectural level through platform-native mechanisms. The goal is not to pass a benchmark; it is to produce a user experience that is fast at all meaningful interaction points for all users on all representative devices.

**Measure before optimising.** Every performance decision must be grounded in observed data from real users, not synthetic benchmarks run on a developer machine. The architecture provides a real-user measurement (RUM) pipeline using `PerformanceObserver` as the instrumentation layer. Optimisation targets are set against real-user p75 values, not laboratory medians.

**The main thread is the bottleneck; protect it.** All JavaScript runs on the main thread by default. The main thread also runs layout, style calculation, painting, and event dispatch. Any long-running JavaScript task directly competes with these operations. The architectural response is not to try to write faster JavaScript; it is to systematically move computation off the main thread into Workers, break long tasks into yielded microbatches using `scheduler.yield()`, and never block the main thread for I/O.

**Platform-native beats userland.** The browser's compositor, layout engine, animation scheduler, and image decoder are written in optimised C++ and have access to hardware that JavaScript does not. Delegating to them — via View Transitions instead of custom JS transitions, via `will-change` hints to pre-promote compositor layers, via `content-visibility: auto` instead of virtual scroll libraries — is always the correct first choice. A userland solution is only warranted when the platform API provably cannot meet the need.

**Progressive enhancement applies to performance too.** Some performance APIs (Speculation Rules, Long Animation Frames) are not yet universally available. Features built on these APIs must function at acceptable performance levels without them. The speculative features are additive; their absence degrades the experience marginally, not catastrophically.

**Perceived performance matters as much as actual performance.** A navigation that begins instantly and progressively renders feels faster than one that shows nothing for 800ms and then paints everything at once, even if the total data transferred is identical. The View Transitions API and the Speculation Rules API both address perceived performance directly: they make the navigation feel instant to the user.

---

## Core Web Vitals: The Measurement Contract

The Core Web Vitals are the application's performance contract with its users. They are standardised metrics, measured from real user sessions, that Google uses as search ranking signals and that the industry has adopted as the canonical web performance vocabulary.

As of 2026, the three Core Web Vitals are: **Largest Contentful Paint (LCP)**, **Interaction to Next Paint (INP)**, and **Cumulative Layout Shift (CLS)**. INP replaced First Input Delay (FID) in March 2024. FID only measured the first interaction; INP measures the worst interaction across the entire page visit, making it a significantly stricter and more representative responsiveness metric.

### Largest Contentful Paint (LCP)

LCP measures the time from navigation start to when the largest visible content element — typically the hero image, a large text block, or a video poster — is fully rendered in the viewport. It represents the user's perception of when the page's primary content is available.

**Threshold:** Good below 2.5 seconds. Needs Improvement 2.5–4.0 seconds. Poor above 4.0 seconds. These are measured at the 75th percentile of real user sessions (p75), meaning 75% of visits must achieve the threshold, not just the median.

**Why LCP is hard to achieve:** The LCP element is typically an image. Images are low-priority by default in the browser's loading scheduler. They are often discovered late — behind stylesheets, behind render-blocking scripts, sometimes loaded dynamically after JavaScript executes. They frequently come from third-party CDN origins, requiring additional DNS and TLS handshake time. Each of these factors adds directly to LCP.

**LCP baseline status:** The `largest-contentful-paint` PerformanceObserver entry type is now Baseline Newly Available as of December 2025, when Safari 26.2 shipped support as part of the Interop 2025 project. All major browsers can now measure and surface LCP to developers.

### Interaction to Next Paint (INP)

INP measures the total duration from a user interaction (click, tap, keyboard input) to when the browser commits the next frame in response to that interaction. Unlike FID, which only captured input delay on the first interaction, INP captures every interaction during the entire page session and reports the worst (or near-worst) value observed. A single slow interaction after 30 seconds of use degrades the INP for the entire session.

INP has three components: **input delay** (time waiting for the main thread to become available), **processing time** (time executing event handlers), and **presentation delay** (time for layout, paint, and composite to produce a new frame). All three must be minimised.

**Threshold:** Good below 200ms. Needs Improvement 200–500ms. Poor above 500ms. Measured at the p75 of all user sessions.

**INP baseline status:** The `event` PerformanceObserver entry type, required for INP measurement, is Baseline Newly Available as of December 2025 alongside LCP.

### Cumulative Layout Shift (CLS)

CLS measures the sum of all unexpected layout shift scores during the page's lifespan. A layout shift occurs when a visible element changes its position in the viewport without user initiation — a common symptom of images loading without reserved dimensions, late-loading ads displacing content, or fonts swapping after initial render.

**Threshold:** Good below 0.1. Needs Improvement 0.1–0.25. Poor above 0.25. Measured at p75.

**CLS baseline status:** As of mid-2026, CLS (the `layout-shift` PerformanceObserver entry type) remains Chromium-only. It was proposed for Interop 2026 but not included. Applications requiring cross-browser CLS measurement must use field data from Chromium-based browsers.

---

## Performance Measurement Infrastructure

### PerformanceObserver: The Instrumentation API

**Spec:** W3C Performance Timeline Level 2  
**Baseline:** Widely Available

`PerformanceObserver` is the universal instrumentation mechanism for the web platform's performance data. It provides a callback-based subscription to performance entry types without polling. The `buffered: true` option on `observe()` delivers entries that occurred before the observer was instantiated — essential for capturing LCP and other early-lifecycle metrics that may fire before application code runs.

The full set of observable entry types:

- `largest-contentful-paint` — LCP candidates as they occur during page load
- `event` — User interaction timing, required for INP calculation
- `layout-shift` — Individual layout shift events, required for CLS
- `longtask` — Main thread tasks exceeding 50ms
- `long-animation-frame` — Animation frames exceeding 50ms (supersedes longtask for diagnosis)
- `navigation` — Full navigation lifecycle timing (TTFB, DOMContentLoaded, load)
- `resource` — Per-resource timing (DNS, TCP, TLS, TTFB, transfer) for every loaded asset
- `measure` — Custom application timing marks via `performance.mark()` / `performance.measure()`
- `paint` — First Paint and First Contentful Paint
- `element` — Element Timing API timing for individually annotated elements

### Measurement Collection in a Worker

All `PerformanceObserver` callbacks in this architecture execute on the main thread (PerformanceObserver is a main-thread API), but the processing of collected entries and their transmission to the analytics backend is delegated to a Dedicated Worker. The main thread callback is minimal: it copies the entry data and posts it to the Worker via `postMessage` using structured cloning. The Worker accumulates entries in a buffer, applies sampling (to control telemetry volume), and batches submissions to the analytics endpoint using `fetch()`.

This design ensures that RUM data collection adds negligible overhead to the main thread. Telemetry submission is a background operation that does not compete with rendering or user interaction.

### INP Attribution: Processing Time Decomposition

INP alone is insufficient for diagnosis. When a session reports a poor INP value, the actionable question is: which interaction caused it, and which of the three INP components (input delay, processing time, presentation delay) was responsible? The `event` observer entry exposes `processingStart`, `processingEnd`, and the entry `startTime` and `duration`, enabling exact decomposition. Long task attribution (`entry.attribution`) identifies the script and container responsible for the input delay component.

The measurement Worker receives these decomposed values and logs them with the session's interaction timeline, providing an actionable diagnosis without requiring reproduction in a lab environment.

### Long Tasks API vs Long Animation Frames API

**Long Tasks API** (`longtask` entry type) fires for any main thread task exceeding 50ms. It provides minimal attribution: the frame or context responsible for the task, but not the specific function or code path. It has been the standard tool for main thread blocking detection since its introduction.

**Long Animation Frames API** (`long-animation-frame` entry type, Chrome 123+) is the evolution of Long Tasks. It observes complete rendering frames (from the start of script execution to the next frame commit) that exceed 50ms, not just individual tasks. Its attribution is substantially richer: it identifies the specific scripts that ran during the frame, their invocation type (event handler, timer, promise callback, animation frame), and their duration. This makes it directly actionable in a way that Long Tasks attribution is not.

Where Long Animation Frames is available, it is the preferred observation target. Both observers run concurrently — Long Tasks provides cross-browser coverage, Long Animation Frames provides detailed attribution in Chromium.

### Custom Application Timing

`performance.mark(name)` stamps a high-resolution timestamp in the browser's performance timeline. `performance.measure(name, startMark, endMark)` computes the duration between two marks and records it as a `measure` entry observable via `PerformanceObserver`. This is the correct mechanism for instrumenting application-specific events: time to first meaningful data render, time to interactive (custom definition), route transition duration, IndexedDB query time.

Custom marks and measures are named, queryable from the Worker via structured clone, and visible in browser DevTools' Performance timeline — making them useful for both RUM telemetry and local profiling without any third-party tooling.

---

## Task Scheduling: INP Optimisation at the Scheduler Level

INP's processing time component is directly controlled by how the application schedules work in response to user interactions. The browser's event loop processes tasks sequentially — every task must complete before the next one begins. A 500ms event handler executing synchronously blocks all rendering for 500ms, producing an INP value of at least 500ms for that interaction.

### scheduler.postTask: Priority-Aware Task Scheduling

**Spec:** WICG Prioritized Task Scheduling  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Scheduler/postTask`  
**Baseline:** Chrome + Firefox; Safari pending

`scheduler.postTask()` schedules an async task at one of three explicit priority levels:

**`user-blocking`** — Highest priority. Executes before any other scheduled work. Used exclusively for work that directly gates the next rendered frame: updating visible UI state in direct response to user input, cancelling pending operations the user has superseded. This is not a general-purpose "run this soon" bucket — it is reserved for work that, if delayed even one task, would produce an observable input latency.

**`user-visible`** — Default priority. Used for rendering work that the user will see but that doesn't directly gate input response: populating secondary UI regions, updating derived state, background content loading triggered by user action.

**`background`** — Lowest priority. Executes when the main thread is otherwise idle. Used for analytics, telemetry, cache warming, prefetch operations, and any work where latency is acceptable. The browser may defer background tasks indefinitely under sustained load.

Tasks are cancellable via `AbortSignal` passed in the options. A cancelled task's callback never executes. This is the correct mechanism for superseding stale work: when the user initiates a new interaction before a previous task completes, the previous task is cancelled before the new task is scheduled.

### scheduler.yield: Task Decomposition

**Spec:** WICG Prioritized Task Scheduling  
**Baseline:** Chrome + Firefox (August 2025); Safari pending

`scheduler.yield()` is the correct mechanism for breaking up long-running event handlers into yielded chunks without losing the execution context. It pauses the current task at the `await` point, yields control to the browser's event loop (allowing input handling and rendering to proceed), and schedules the continuation at a priority that matches the originating task. This last property — priority inheritance — is the critical distinction from `setTimeout(fn, 0)`.

`setTimeout` continuations run at the browser's default task priority, behind any already-queued tasks. `scheduler.yield()` continuations run before newly-queued tasks at the same priority, ensuring that a yielded `user-blocking` task resumes as soon as the browser has handled any pending input — not after all background tasks have finished.

The pattern for long event handlers is: do the minimum work needed to produce visible feedback, then `await scheduler.yield()`, then continue with the remaining work. The visible feedback makes the interaction feel instantly responsive even if the full computation takes many more milliseconds.

For Safari compatibility while `scheduler.yield` is pending, the fallback is `await new Promise(resolve => setTimeout(resolve, 0))` wrapped in a feature-detection branch. This provides yielding semantics without priority inheritance, which is acceptable for non-critical yielding scenarios.

### The requestAnimationFrame Contract

`requestAnimationFrame` callbacks execute at the start of the browser's rendering pipeline for a frame. They are the correct location for any DOM mutations that are intended to be visually synchronised — mutations placed here are guaranteed to be included in the next paint, without the risk of triggering an intermediate forced layout.

`requestAnimationFrame` is not a scheduling primitive for general asynchronous work. It fires approximately 60 times per second (or at the display refresh rate on high-refresh-rate screens). Placing expensive computation inside a `requestAnimationFrame` callback that doesn't produce a DOM change wastes a render opportunity and delays the paint.

The read-then-write discipline within `requestAnimationFrame` callbacks eliminates forced layout: all layout reads (`getBoundingClientRect()`, `offsetWidth`, `scrollTop`, `clientHeight`) are batched before all writes. Reading after writing within the same frame triggers a forced synchronous layout recalculation — one of the most expensive single operations in the rendering pipeline.

---

## Rendering Performance

### CSS Containment: content-visibility and contain-intrinsic-size

**Spec:** W3C CSS Containment Module Level 2  
**Baseline:** `content-visibility: auto` — Newly Available (September 2025)

`content-visibility: auto` instructs the layout engine to skip rendering (layout, style calculation, paint) for elements that are not within or near the viewport. The browser tracks which elements are on- or off-screen and re-renders them lazily as they approach the viewport during scrolling. This is the platform's equivalent of virtualised list rendering, but implemented at the CSS level without any JavaScript, without any scroll position tracking, and without any item height estimation.

The performance impact is substantial. For pages with large off-screen content — long article bodies, long comment threads, paginated product listings — applying `content-visibility: auto` produces 7x rendering performance improvements on initial load, as measured in web.dev case studies. Off-screen elements do not participate in layout calculation for the visible portion of the page, reducing the rendering work proportionally.

`contain-intrinsic-size` is the required companion property. When `content-visibility: auto` skips rendering an off-screen element, the browser needs a size estimate for that element to correctly calculate scroll dimensions and maintain a stable scrollbar. Without `contain-intrinsic-size`, skipped elements collapse to zero height, causing scrollbar jumps as elements come into view. The `auto` keyword in `contain-intrinsic-size: auto Npx` tells the browser to use a developer-provided fallback estimate initially, and then remember the actual rendered size once the element has been rendered, using the remembered size in subsequent off-screen passes. This eliminates scrollbar jumping after the first scroll-through.

#### The contentvisibilityautostatechange Event

When `content-visibility: auto` starts or stops skipping an element's rendering, the `contentvisibilityautostatechange` event fires on that element. This event is the correct hook for managing the lifecycle of content-dependent resources — pausing video playback or suspending animations for off-screen elements, and resuming them when the element re-enters the viewport. Without this event, media elements and animation timers would continue consuming resources while completely invisible.

### CSS Containment Model: contain Property

The `contain` property declares that an element's subtree is independent of the rest of the document in the specified dimensions. `content-visibility: auto` implicitly applies `contain: layout style paint` — the key containment properties that prevent an element's internals from affecting the rest of the page layout. Understanding containment is prerequisite to understanding why `content-visibility` works: the browser can skip an element's rendering entirely precisely because containment guarantees that the element's contents cannot affect elements outside it.

### Compositor Layers and will-change

The browser's compositor executes GPU-accelerated animations — specifically `transform` and `opacity` animations — on a separate thread from the main thread. Elements animated via `transform` and `opacity` do not trigger layout or paint; only the compositor step runs, making them genuinely jank-free regardless of main thread load.

`will-change: transform` (or `will-change: opacity`) signals to the browser that an element will animate, allowing it to promote the element to a dedicated GPU compositor layer before the animation begins. Promoting a layer at animation start causes a one-frame compositor commit delay (the promotion itself). Declaring `will-change` in advance eliminates this delay.

`will-change` is not a general performance flag. Maintaining a compositor layer requires GPU memory proportional to the element's pixel area. Applying it to many elements simultaneously increases GPU memory pressure and can worsen overall performance. The correct lifecycle is: apply `will-change` immediately before an animation, remove it immediately after the animation completes. Persistent `will-change` on static elements that never animate is always incorrect.

Animated properties other than `transform` and `opacity` — `width`, `height`, `left`, `top`, `background-color`, `border-radius` — trigger layout or paint on each frame. These cannot be composited and produce proportionally more rendering work. Where an animation needs to move an element, `transform: translate()` is always the correct choice over animating `left`/`top`. Where an animation needs to resize, `transform: scale()` is correct over animating `width`/`height`.

### View Transitions API: Perceived Navigation Performance

**Spec:** W3C CSS View Transitions Module Level 1  
**Baseline:** Same-document transitions — Newly Available (October 2025, Firefox 144). Cross-document transitions — Chrome 126+, Safari 18.2+, Firefox in development.

The View Transitions API produces hardware-accelerated, GPU-composited animated transitions between DOM states (same-document, for SPA navigations) and between full document loads (cross-document, for MPA navigations). Its performance significance is in perceived latency reduction: even when a navigation takes 400ms to settle, a 150ms crossfade transition that begins immediately makes the navigation feel instantaneous because the user's attention is occupied by the animation rather than the absence of content.

#### Same-Document Transitions (SPA)

`document.startViewTransition(callback)` accepts a callback that performs the DOM update. The browser captures a screenshot of the current state, executes the callback, then captures the new state, and animates between them using a CSS animation (a crossfade by default). The animation runs entirely on the compositor — off the main thread — making it immune to main thread jank during the transition.

`view-transition-name` CSS property on specific elements enables element-level morphing transitions (shared element transitions): the browser independently animates the named element from its old position/size to its new position/size, while crossfading the rest of the page. This enables the "native app card expansion" pattern — tapping a list item causes it to animate expanding into the detail view — with no JavaScript animation code.

The `startViewTransition()` callback must be synchronous or return a Promise that resolves when the new DOM state is ready. If it is asynchronous, the browser holds the captured screenshot of the old state until the Promise resolves, then captures the new state and begins the animation.

#### Cross-Document Transitions (MPA)

For MPA navigations, the `@view-transition { navigation: auto; }` CSS at-rule, present in both the source and destination page's CSS, opts both pages into cross-document transitions. No JavaScript is required. The browser automatically captures the current page before navigation and animates to the new page after it loads. Elements with matching `view-transition-name` values on both pages participate in shared element transitions across the full navigation.

Cross-document transitions are architecturally significant for this platform because they make full-page navigations — where each route is a separate HTML document with a full HTTP response — visually indistinguishable from SPA client-side transitions. Combined with the Speculation Rules API (which can make the navigation itself near-instant), the combination eliminates the historic performance argument for client-side routing.

#### Performance Constraints

View transition animations occupy the compositor thread, not the main thread, so they do not affect INP. However, the callback or Promise inside `startViewTransition()` does execute on the main thread. Complex synchronous operations inside the callback — DOM queries, forced layouts, synchronous storage reads — extend the interval between the old screenshot and the new state capture, producing a visible freeze. The callback must complete rapidly; heavy work is pre-computed or deferred outside the transition.

The `prefers-reduced-motion` media query must gate all View Transition animations. When the user has expressed a preference for reduced motion, transitions should be instantaneous (no animation, just a cut) or use a non-animated alternative. The `@media (prefers-reduced-motion: reduce)` rule on `::view-transition-*` pseudo-elements is the correct implementation.

---

## Network Performance

### Speculation Rules API: Pre-Navigation Loading

**Spec:** WICG Speculation Rules  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API`  
**Status:** Chrome and Edge only as of mid-2026. Firefox and Safari do not support it.

The Speculation Rules API enables the browser to prefetch or fully prerender likely-next-page URLs before the user initiates navigation, making those navigations near-instant. It is the successor to `<link rel="prerender">` and `<link rel="prefetch">`, and surpasses both in capability: it supports full JavaScript execution and style application during prerender (the prefetched page becomes a fully rendered, ready-to-activate background tab), URL pattern matching, and precisely configurable eagerness levels.

Rules are declared in a `<script type="speculationrules">` element as JSON. The two speculation types are:

**Prefetch** — Downloads only the HTML document for the speculated URL. Resources (images, scripts, CSS) referenced by that document are not fetched. Prefetch populates the HTTP cache, benefiting subsequent network requests. Its resource cost is low — essentially one HTTP request. Prefetch is the appropriate starting point for most sites.

**Prerender** — Fetches the HTML, executes JavaScript, applies CSS, and renders the page into a hidden background browsing context, exactly as if the user had navigated but the result were not yet shown. When the user does navigate, the activation is near-instant — the browser swaps the active browsing context without any loading delay. Prerender's resource cost is proportionally higher (CPU, memory, and network for the full page) and must be used judiciously.

#### Eagerness Levels

Eagerness controls when speculation begins, independently of which URLs are speculated:

**`immediate`** — Speculation begins as soon as the rule is parsed. The browser does not wait for any user signal. Appropriate only for URLs with very high certainty of being navigated to (the next step in a wizard, the checkout flow from a shopping cart).

**`eager`** — On desktop: speculation begins when the cursor has been over a link for 10 milliseconds. On mobile (from January 2026): 50ms after the link enters the viewport. Appropriate for links the user has clearly expressed interest in.

**`moderate`** — On desktop: 200ms hover or `pointerdown`, whichever is sooner. On mobile: 500ms after the user stops scrolling, for anchors within the bottom 30% of viewport vertical distance from the last pointer-down position, and where the anchor is at least half the size of the largest anchor in the viewport. Appropriate for most internal links on content sites.

**`conservative`** — Speculation begins on `pointerdown` or `touchstart`. This is the last moment before the navigation fires, providing the smallest lead time but the most conservative resource usage. Appropriate for high-uncertainty navigations or resource-constrained scenarios.

Chrome enforces concurrent speculation limits: `immediate` and `eager` allow up to 50 prefetches and 10 prerenders simultaneously. `moderate` and `conservative` allow 2 prefetches and 2 prerenders, using FIFO replacement (new speculations replace the oldest ones). Chrome automatically disables all speculation when the device has Save Data enabled, is in Energy Saver mode with low battery, or the user has disabled "Preload pages" in browser settings.

#### Prerender-until-Script (Experimental)

A third speculation type — `prerender_until_script` — is in Chrome origin trial as of early 2026. It prerenders a page up to the point where parser-blocking scripts are encountered, pausing before they execute. This allows the browser to complete the rendering work (HTML parse, CSS application, non-blocking JS) without the risk of side effects from the page's full script execution running before the user has navigated. This extends prerender to pages that previously could not be safely prerendered due to script side effects.

#### Progressive Enhancement for Non-Chromium Browsers

For Firefox and Safari, where Speculation Rules are not available, `<link rel="prefetch" href="/likely-next-page">` provides the document-prefetch fallback. `<link rel="modulepreload" href="/route-module.js">` prefetches JavaScript modules into the module map, eliminating their network fetch on navigation. These hints do not trigger JavaScript execution or full rendering; they are resource-level fetches only. They represent a meaningfully smaller performance gain than Speculation Rules' prerender, but require no feature detection and are widely supported.

### fetchpriority: Resource Loading Priority Control

**Spec:** WHATWG Fetch  
**Baseline:** Widely Available

`fetchpriority` is an HTML attribute and Fetch API option that overrides the browser's default resource loading priority. Browsers apply heuristic priorities to resources based on their type and position in the document, but these heuristics are designed for the general case. Site authors know which specific resource is the LCP element and can override the heuristic.

The critical use case is the LCP image: by default, images are discovered and fetched at low or medium priority. After layout completes and the browser confirms the image is in the viewport, priority is upgraded — but this layout-dependency means the image fetch cannot begin at full priority until layout has run, which may be hundreds of milliseconds into the page load. `fetchpriority="high"` on the LCP image element (or on its `<link rel="preload">`) tells the browser to fetch it at high priority immediately, without waiting for layout. In a Google Flights case study, this single attribute reduced LCP from 2.6s to 1.9s.

`fetchpriority="low"` deprioritises competing resources — non-LCP above-fold images, decorative assets, background API requests — freeing bandwidth headroom for the LCP element.

`fetchpriority` is a hint, not a directive. The browser may override it based on internal constraints. It does not guarantee ordering, only intent.

### Resource Hints Hierarchy

Resource hints are declarative signals in `<head>` or HTTP headers that guide the browser's loading scheduler. Their correct usage significantly reduces Time to First Byte for critical resources without requiring any JavaScript execution:

**`<link rel="preconnect" href="https://cdn.example.com">`** — Instructs the browser to complete DNS resolution, TCP handshake, and TLS negotiation for a third-party origin before any resource from that origin is requested. Eliminates the connection overhead (which can be 200–300ms on mobile) when the first resource request arrives.

**`<link rel="preload" href="..." as="...">`** — Instructs the browser to fetch a specific resource at high priority before it would be naturally discovered. Appropriate for late-discovered resources: LCP images that are CSS backgrounds (which cannot use `fetchpriority` directly), custom fonts, critical scripts loaded dynamically. The `as` attribute specifies the resource type, ensuring the correct fetch mode, cache behaviour, and priority.

**`<link rel="modulepreload" href="...">`** — Fetches and evaluates a JavaScript module (and its full dependency graph) into the browser's module registry before it is imported. Unlike `<link rel="preload">` for scripts, `modulepreload` executes the module, populating the module map. This makes subsequent `import()` calls for that module synchronous in the module registry, with zero network cost.

**`<link rel="dns-prefetch" href="https://third-party.example.com">`** — Performs only the DNS lookup for a third-party origin. The lowest-cost resource hint, appropriate for origins that may be needed but where the full connection setup is not certain enough to justify `preconnect`.

### Compression Streams API

**Spec:** Compression Streams  
**Baseline:** Widely Available

`CompressionStream` and `DecompressionStream` provide native gzip, deflate, and deflate-raw compression/decompression as `TransformStream` objects, requiring no library. They integrate directly into the Streams API pipeline.

Compression is applied in this architecture to two scenarios: compressing large state snapshots before writing to IndexedDB (reducing storage consumption by 60–80% for JSON data, bringing large payloads under IndexedDB's optimal serialisation thresholds), and decompressing compressed responses from the network where the Streams API pipeline is handling the response body progressively.

Because `CompressionStream` is a `TransformStream`, it participates in the Streams API's automatic backpressure mechanism. A slow consumer naturally slows the compression producer without any explicit flow control — making it composable with other stream-based pipelines without manual buffering logic.

---

## Memory vs Performance Tradeoffs

Performance and memory exist in a fundamental tradeoff: caching eliminates recomputation at the cost of retained memory. This architecture defines three permitted cache archetypes and prohibits all others. Every cache in the system must document which archetype it uses, its maximum size, and its eviction policy. Unbounded caches are prohibited without exception.

### WeakMap: Garbage-Collection-Eligible Caching

`WeakMap` keys are held weakly — they do not prevent their keys from being garbage collected. When a `WeakMap` key object becomes unreachable from any other live reference, the browser's garbage collector may collect it, and the corresponding entry is automatically removed from the `WeakMap`. This makes `WeakMap` the correct cache for associations between objects and computed values where the cache entry should live exactly as long as the key object.

Typical use: caching computed layout measurements keyed by DOM element references, caching parsed configuration keyed by raw config objects, caching processed data keyed by the source record. When the DOM element is removed, the layout cache entry is collected automatically — no explicit cleanup required.

`WeakMap` cannot be iterated, its size cannot be queried, and it cannot hold primitive keys. It is not a general-purpose cache; it is specifically for ephemeral associations between object lifetimes and computed values.

### Bounded LRU: Fixed-Capacity Application Cache

For caches that need iteration, size bounds, or non-object keys, a bounded LRU (Least Recently Used) cache is the correct archetype. The LRU cache has a declared maximum entry count. When adding an entry would exceed the maximum, the entry with the longest time since its last access is evicted first. This ensures the cache self-regulates to a fixed memory ceiling regardless of how long the application runs or how many distinct keys are accessed.

The data structure is a combination of a `Map` (for O(1) key lookup) and a doubly-linked list (for O(1) LRU eviction tracking). Every access to a key moves it to the front of the list; the entry at the tail is the eviction candidate.

Every LRU cache in this system specifies its maximum size at construction and exposes its current size through an accessor. Size limits are set in terms of entry count rather than byte size for simplicity, with byte-size limits added where the value type has significantly variable size (e.g., the in-memory storage layer's LRU, which stores arbitrary application data, tracks an approximate byte estimate).

### TTL Cache: Time-Bounded Validity

For data that is valid only for a finite duration — API responses, permission states, computed values derived from network data — a Time-to-Live cache associates each entry with an expiry timestamp. Entries past their TTL are considered stale and are re-fetched on the next access, even if they are present in the cache.

TTL caches do not proactively evict entries; eviction is lazy, occurring on access. This avoids timer-based cleanup overhead at the cost of potentially holding stale data in memory. Proactive cleanup is run during `requestIdleCallback` to bound memory growth for long-running sessions.

TTL values are tuned per data category: permission states have a short TTL (minutes), to ensure revoked permissions are re-queried promptly. Configuration data has a long TTL (hours). API responses use the `Cache-Control: max-age` value from the server response, translated into a TTL at fetch time.

---

## Memory Measurement

### performance.measureUserAgentSpecificMemory

**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory`  
**Requirement:** Cross-origin isolation (COOP + COEP headers). Available in Chrome; browser availability varies.

`performance.measureUserAgentSpecificMemory()` returns an estimate of the web application's total memory usage, partitioned by attribution (which frame, which worker, which URL) and type (JS heap, DOM, other). It is the replacement for the deprecated `performance.memory` property, which provided only JS heap figures without attribution.

This API is used in development and staging environments (not production by default) to verify that memory is not growing across route navigations. The measurement is taken at a consistent point in the application lifecycle — after a navigation completes and the route component has settled — and compared against the previous measurement. A consistent upward trend in memory across navigations indicates a leak in the component cleanup path.

`performance.measureUserAgentSpecificMemory()` must not be polled at a fixed interval in production; the call itself has a non-trivial cost and its results are non-deterministic (the browser may delay or approximate the response). The correct usage is periodic sampling at a randomised interval, with the results compared statistically over many samples rather than individually.

For memory measurement outside of cross-origin isolated contexts, `PerformanceObserver` observing `measure` entries around explicit `performance.mark()` calls provides a coarser but universally available proxy: measure time (not memory) across navigations, and use time growth as a proxy for memory growth (a leak typically manifests in slower clean-up paths over time).

---

## Performance Budget and Continuous Monitoring

A performance budget defines the maximum acceptable values for key performance indicators, measured against real-user data. The budget is not aspirational — it is a hard limit that triggers investigation when exceeded.

**LCP budget:** p75 under 2.0 seconds on mobile (below the "Good" threshold of 2.5 seconds, with margin for regression).  
**INP budget:** p75 under 150ms on mobile (below the "Good" threshold of 200ms).  
**CLS budget:** p75 under 0.05 (half the "Good" threshold of 0.1).  
**Long task rate:** Fewer than 2 long tasks (>50ms) per page session at p75.  
**Bundle size:** Route-level modules under 50KB gzipped per route chunk.  
**Total blocking time:** Under 200ms (lab metric, correlated with INP).

The RUM pipeline in the measurement Worker posts aggregated percentile data to the telemetry backend on every session end (via `navigator.sendBeacon()` to ensure delivery even on page close). A monitoring dashboard tracks these values against the budget, and alerts fire when a deployment causes a p75 regression exceeding 10% of the budget ceiling.

---

## Browser Support Matrix

|API / Feature|Chrome|Firefox|Safari|Edge|Status|
|---|---|---|---|---|---|
|PerformanceObserver|Full|Full|Full|Full|Baseline Widely Available|
|LCP (largest-contentful-paint)|Full|Full|26.2+|Full|Baseline Newly Available (Dec 2025)|
|INP (event timing)|Full|Full|26.2+|Full|Baseline Newly Available (Dec 2025)|
|CLS (layout-shift)|Full|No|No|Full|Chromium only|
|Long Tasks API|Full|No|No|Full|Chromium + some others|
|Long Animation Frames|Full|No|No|Full|Chromium only|
|scheduler.postTask|Full|Full|No|Full|Chrome + Firefox; Safari pending|
|scheduler.yield|Full|Full (Aug 2025)|No|Full|Chrome + Firefox; Safari pending|
|content-visibility: auto|Full|Full|Full|Full|Baseline Newly Available (Sept 2025)|
|View Transitions (same-doc)|Full|144+|18+|Full|Baseline Newly Available (Oct 2025)|
|View Transitions (cross-doc)|126+|In dev|18.2+|126+|Partial — Firefox pending|
|Speculation Rules API|Full|No|No|Full|Chromium only|
|fetchpriority attribute|Full|Full|17.2+|Full|Baseline Widely Available|
|Compression Streams|Full|Full|16.4+|Full|Baseline Widely Available|
|performance.measureUserAgentSpecificMemory|Full|No|No|Full|Chromium only|

---

## Standards and References

- W3C Performance Timeline Level 2: `w3.org/TR/performance-timeline`
- W3C Long Tasks API: `w3c.github.io/longtasks`
- W3C Long Animation Frames API: `w3c.github.io/long-animation-frames`
- WICG Prioritized Task Scheduling: `wicg.github.io/scheduling-apis`
- WICG Speculation Rules: `wicg.github.io/nav-speculation/speculation-rules.html`
- W3C CSS View Transitions Module Level 1: `w3.org/TR/css-view-transitions-1`
- W3C CSS Containment Module Level 2: `w3.org/TR/css-contain-2`
- web.dev — content-visibility: `web.dev/articles/content-visibility`
- web.dev — LCP and INP now Baseline: `web.dev/blog/lcp-and-inp-are-now-baseline-newly-available`
- web.dev — optimize long tasks: `web.dev/articles/optimize-long-tasks`
- web.dev — fetch priority: `web.dev/articles/fetch-priority`
- Chrome Developers — Speculation Rules: `developer.chrome.com/docs/web-platform/prerender-pages`
- Chrome Developers — Use scheduler.yield: `developer.chrome.com/blog/use-scheduler-yield`
- Chrome Developers — Long Animation Frames: `developer.chrome.com/docs/web-platform/long-animation-frames`
- MDN — PerformanceObserver: `developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver`
- MDN — Scheduler API: `developer.mozilla.org/en-US/docs/Web/API/Scheduler`
- MDN — View Transition API: `developer.mozilla.org/en-US/docs/Web/API/View_Transition_API`
- MDN — content-visibility: `developer.mozilla.org/en-US/docs/Web/CSS/content-visibility`
- Core Web Vitals thresholds: `web.dev/articles/vitals`
- corewebvitals.io — Speculation Rules in production: `corewebvitals.io/pagespeed/speculation-rules`