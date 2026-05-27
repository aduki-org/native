## Browser Runtime Model

**Spec Authorities:** WHATWG HTML Living Standard · WICG Prioritized Task Scheduling · W3C Web Performance Working Group · TC39 ECMAScript  
**Status:** Working Specification — May 2026  
**Baseline Coverage:** Scheduler API (Widely Available) · `scheduler.yield()` (Widely Available) · `requestIdleCallback` (Widely Available) · Long Animation Frames API (Chromium, Limited) · ES Modules (Widely Available) · Import Maps (Widely Available)

---

## Overview

Understanding the browser runtime model is not background knowledge — it is the prerequisite to every performance and correctness decision in this architecture. The browser is not an abstract JavaScript execution environment. It is a precisely specified, multi-threaded runtime with a defined scheduling model, a rendering pipeline with deterministic stage ordering, and a module system with strong caching semantics. Every architectural choice in `core.*` — scheduling, task decomposition, Worker offloading, module loading strategy — is derived from this model.

The single most consequential fact in the model: **the main thread is shared between JavaScript execution, layout calculation, painting, and user input processing.** Any JavaScript task that holds the main thread longer than approximately 50ms delays the browser's ability to respond to user input. The resulting latency is measured by the Interaction to Next Paint (INP) Core Web Vital, which replaced First Input Delay as the responsiveness metric in Google's ranking signals in March 2024. INP is the p75 interaction latency across all interactions on a page. A "good" INP score is under 200ms. An INP score above 500ms is "poor."

The runtime model is the reason this architecture does not accept "we'll optimise it later" as a design posture. A system that blocks the main thread at the architecture level cannot be fixed at the performance-tuning level. The scheduling model is a constraint on how code is structured from the start.

---

## The Event Loop — Formal Model

### Specification Basis

The event loop is defined in the WHATWG HTML Living Standard, §8.1.7 "The event loop." It is not defined by the JavaScript engine (V8, SpiderMonkey, JavaScriptCore). The engine evaluates JavaScript; the event loop is the host's (the browser's) mechanism for deciding when to invoke the engine and with which code.

Every JavaScript execution environment — a `Window`, a `Worker` global scope, a `ServiceWorkerGlobalScope` — has exactly one associated event loop. The event loop for a `Window` is the **window event loop**, shared among all same-agent windows (typically all same-origin documents within the same browser process). The event loops for Workers are **worker event loops**, one per worker, independent of the window event loop. This independence is the mechanism by which workers achieve concurrent execution without thread-safety requirements on the DOM.

### Structure of an Event Loop Iteration

A single iteration of the window event loop executes in this order, per specification:

**1. Select and execute one task from a task queue.**

The event loop selects one task from one task queue. The selection algorithm is implementation-defined, but implementations are expected to give priority to user-interaction tasks over timer tasks. Once selected, the task runs to completion — the browser cannot interrupt it mid-execution. This is the run-to-completion guarantee of JavaScript. No other task can preempt a running task on the same thread.

**2. Perform a microtask checkpoint — drain the microtask queue completely.**

Immediately after the task completes (and after the JavaScript call stack empties), the microtask queue is drained. Every microtask that is queued — including any microtasks queued by previously executing microtasks — runs before the event loop proceeds to step 3. The microtask queue has no concept of "run one, check if there are rendering opportunities, run the next." It is drained atomically until empty.

This is not merely an implementation detail. It has a correctness implication: Promise continuations (`.then`, `.catch`, `.finally`, `await` resume points), `queueMicrotask()` callbacks, and `MutationObserver` callbacks all run in the microtask checkpoint — before any rendering, before any new task. Code that resolves a Promise and expects the DOM to update before the next microtask runs will not see the update, because rendering has not yet occurred.

**3. Evaluate whether a rendering update is due.**

The browser evaluates whether a rendering opportunity has arrived. This is not every iteration — the browser targets approximately 60 rendering updates per second (one per ~16.66ms), but the actual rate is vsync-dependent and subject to the browser's own heuristics. If the document is not visible (background tab, minimised window), rendering updates are typically suspended entirely.

**4. Rendering update pipeline (if rendering is due):**

If the browser determines a rendering update is needed, it executes the following stages in order:

- **Run `requestAnimationFrame` callbacks** — All `rAF` callbacks registered since the last frame are executed.
- **Run `ResizeObserver` callbacks** — Observers for elements whose size has changed since the last frame.
- **Run `IntersectionObserver` callbacks** — Observers for elements that have entered or left their monitored intersection thresholds.
- **Style recalculation** — The browser recomputes the computed style of every element whose style properties have been invalidated since the last frame.
- **Layout** — The browser computes the geometry (position, size) of every element in the layout tree whose geometry has been invalidated. Layout cascades: changing a parent's dimensions may invalidate the layout of its children.
- **Paint** — The browser rasterises invalidated areas of the page into a layer bitmap. Paint uses the CPU (via Skia in Chromium) or the GPU, depending on the layer type.
- **Composite** — The compositor thread (separate from the main thread in Chromium) takes the painted layers and blends them together into the final frame, applying GPU transforms. This is dispatched off-main-thread.

**5. Return to step 1.**

### Task Sources and Multiple Task Queues

The specification defines multiple **task sources**, each associated with a distinct logical queue within the event loop. Each task is associated with exactly one task source. Examples of task sources:

- **User interaction** — `click`, `keydown`, `pointerdown`, `scroll` events fired in response to user actions
- **DOM manipulation** — Events fired as a result of DOM changes (e.g., `DOMNodeInserted`, element load events)
- **Timer** — `setTimeout` and `setInterval` callbacks when their delay has elapsed
- **Networking** — Fetch completion callbacks, WebSocket message events
- **History traversal** — Navigation API events
- **Rendering** — The rendering update itself (treated as a task source in some implementations)

**Crucially:** the event loop does not enforce strict FIFO ordering across all task sources. It is permitted — and in practice all modern browsers do — to give priority to user-interaction tasks over timer tasks. A `click` handler that has been waiting will be scheduled before a `setTimeout(fn, 0)` callback, even if the `setTimeout` timer fired first. This is the browser's pragmatic acknowledgement that user responsiveness is the priority constraint.

This prioritisation by task source is the informal predecessor to the explicit priority model formalised by the Prioritized Task Scheduling API.

---

## The Microtask Queue

### What Uses It

The microtask queue is populated by:

- Promise `.then()`, `.catch()`, `.finally()` handlers and `await` continuations
- `queueMicrotask(fn)` — the explicit API for scheduling a microtask
- `MutationObserver` callbacks

### The Critical Correctness Property

The microtask queue is drained **after every task and after every time the JavaScript call stack empties**, not once per event loop iteration. This has a consequence that trips developers repeatedly:

Microtasks can starve the rendering pipeline. A chain of microtasks that continuously enqueues new microtasks (a microtask loop) will never relinquish control to the event loop, preventing rendering updates from occurring and making the page completely unresponsive. Unlike tasks — where the event loop processes one per iteration before checking for rendering — the microtask checkpoint drains until empty with no interruption.

A long synchronous Promise chain where each `.then()` queues the next `.then()` is not "asynchronous" in any meaningful performance sense. It occupies the microtask queue continuously, blocking the rendering pipeline for as long as the chain runs. Promise-based APIs are asynchronous with respect to the task queue, not with respect to the rendering pipeline.

### Correct Use

Use `queueMicrotask()` for work that must run after the current synchronous execution context but before the next task. Its correct use cases are narrow: notifying observers after a synchronous state change, coalescing multiple synchronous mutations into a single asynchronous notification. It is not a yielding mechanism. It does not give the browser an opportunity to render.

For work that should yield to rendering and user input, use the Prioritized Task Scheduling API (`scheduler.yield()` or `scheduler.postTask()`).

---

## The Rendering Pipeline in Detail

### The Pixel Pipeline

Every visual update to the page flows through five stages. Understanding which stages are triggered by which CSS property changes is a prerequisite for writing performant animation and layout code.

**Stage 1 — Style recalculation:** The browser computes the resolved value of every CSS property for every affected element. Triggered by any CSS class addition/removal, inline style change, attribute change affecting CSS selectors, or pseudo-class state change (`:hover`, `:focus`).

**Stage 2 — Layout (Reflow):** The browser computes the geometry (position, width, height) of every element in the layout tree. Triggered by any change to a property that affects an element's size or position relative to other elements: `width`, `height`, `margin`, `padding`, `border`, `top`, `left`, `font-size`, `display`, `position`, `flex-*`, `grid-*`. Layout changes cascade — modifying a parent element may require re-laying out its entire subtree. **Layout is the most expensive stage.** Its cost scales with the number of elements in the affected subtree.

**Stage 3 — Paint (Rasterisation):** The browser rasterises the visual appearance of elements into layer bitmaps. Triggered by any change to a paint property that does not affect geometry: `color`, `background-color`, `background-image`, `box-shadow`, `border-color`, `outline`. Paint can be skipped when only geometry changes to compositor-promoted layers.

**Stage 4 — Composite:** The compositor thread (independent of the main thread in Chromium) takes rasterised layer bitmaps, applies GPU-based transforms, and blends them into the final frame. Only `transform` and `opacity` changes on promoted layers trigger compositing without layout or paint. These properties are hardware-accelerated and do not block the main thread.

**Performance implications by property class:**

|Change type|Stages triggered|Cost|
|---|---|---|
|`width`, `height`, `margin`, `padding`, `font-size`, any layout property|Style → Layout → Paint → Composite|Highest|
|`color`, `background-color`, `box-shadow`, any paint-only property|Style → Paint → Composite|Medium|
|`transform`, `opacity` on promoted layer|Composite only|Minimal — GPU-only, main thread free|

The correct animation strategy follows directly from this table: animate `transform` and `opacity` rather than `top/left/width/height`. Use `will-change: transform` (sparingly) to promote elements to their own compositor layer before the animation begins, preventing layout invalidation during animation.

### Forced Synchronous Layout (Layout Thrashing)

Layout is a lazy process — the browser batches geometry changes and computes layout once, at the layout stage. However, if JavaScript **reads** a geometry property (such as `element.offsetWidth`, `element.getBoundingClientRect()`, `element.scrollTop`, `window.innerWidth`) while there are pending, unprocessed layout-invalidating writes, the browser is forced to perform layout immediately — synchronously, on the main thread, mid-task — to return a valid computed value.

This synchronous layout interruption is called **forced synchronous layout** (also "forced reflow"). It is one of the most common sources of long tasks and jank. The pattern that produces it is alternating reads and writes:

```
el.style.width = '100px';        // write — invalidates layout
const h = el.offsetHeight;       // read — forces immediate layout
el.style.height = h + 'px';      // write — invalidates layout again
const w = other.offsetWidth;     // read — forces layout again
```

The correct pattern batches all reads before any writes:

```
const h = el.offsetHeight;       // read — layout already valid
const w = other.offsetWidth;     // read — still valid from same frame
el.style.width = '100px';        // write — invalidate, will batch with below
el.style.height = h + 'px';      // write — same batch
```

When geometry reads and writes cannot be separated in the natural flow of application code, use `requestAnimationFrame` to move reads to the beginning of the next frame (after the browser's own layout pass) and writes to within the same `rAF` callback. `FastDOM` and similar utility libraries formalise this pattern, though the principle is platform-native and requires no library.

### `requestAnimationFrame` — Synchronisation with the Rendering Pipeline

`requestAnimationFrame(callback)` schedules `callback` to execute at the beginning of the browser's next rendering update, after the previous composited frame has been presented and before style recalculation, layout, and paint for the new frame. It is the only scheduling primitive that is precisely timed to the browser's rendering cycle.

`rAF` is the correct scheduling mechanism exclusively for work that **must be visible in the next frame** and that involves DOM mutations. Every DOM mutation applied outside of a `rAF` callback risks triggering multiple intermediate layout and paint passes per frame, wasting computation. Batching DOM mutations inside `rAF` ensures they are applied once per frame, aligning with the browser's compositing rate.

`rAF` should not be used as a general-purpose task deferrall mechanism. It fires at screen refresh rate (60–144 Hz) regardless of whether the work involves DOM changes. Using `rAF` for non-rendering work steals time from the rendering budget. For non-rendering deferred work, use `scheduler.postTask()`.

`rAF` callbacks are queued at registration time. If multiple `rAF` calls are made before the next frame, all their callbacks execute in that frame, in registration order. A `rAF` callback that calls `rAF` again schedules for the **next** frame, not the current one — this is the pattern for continuous animation loops.

### `ResizeObserver` and `IntersectionObserver` in the Rendering Phase

Both `ResizeObserver` and `IntersectionObserver` callbacks fire during the rendering update phase, after `rAF` callbacks but before paint. This placement is intentional: by the time observers fire, style recalculation has occurred and geometry is valid without forcing synchronous layout. Reading geometry properties inside `ResizeObserver` or `IntersectionObserver` callbacks is safe — layout has been computed by the time the callback runs.

`ResizeObserver` uses a per-frame depth-based processing model to prevent infinite loops: observers that write to an element's size in response to observing that element's size change will not fire again in the same frame (the depth system prevents this). Observers at a deeper depth in the DOM than the element that caused the resize fire first; shallower observers fire next. This traversal guarantees that resize changes do not re-trigger observers on their own ancestors within the same frame.

---

## The Prioritized Task Scheduling API

**Spec:** WICG Prioritized Task Scheduling  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Scheduler`  
**Baseline:** Widely Available  
**`scheduler.yield()`:** Widely Available

### The Problem it Solves

Before the Scheduler API, JavaScript had two scheduling primitives for asynchronous work:

- `setTimeout(fn, 0)` — defers work to the next task. Priority-unaware. All `setTimeout(fn, 0)` callbacks compete in the same undifferentiated timer task queue.
- `requestIdleCallback` — defers work to idle periods. Has no priority system beyond "idle." Provides a deadline but cannot express urgency.

Neither mechanism expresses relative importance. A critical UI update and a background analytics batch sit in the same queue and are scheduled in FIFO order. The browser cannot distinguish them.

`scheduler.postTask()` introduces a named, explicit priority model.

### `scheduler.postTask()` — Priority Queues

`scheduler.postTask(callback, options)` schedules `callback` as a task with an explicit priority. Options include:

- `priority: 'user-blocking' | 'user-visible' | 'background'` — the task's priority level
- `signal: AbortSignal | TaskSignal` — for cancellation and dynamic priority adjustment
- `delay: number` — minimum millisecond delay before the task becomes eligible (analogous to `setTimeout`'s second argument)

**`user-blocking`** — The highest priority. The browser schedules these tasks before `user-visible` and `background` tasks. Reserved for work that directly gates rendering in response to user input: updating a reactive store after a user action, invalidating components that must paint before the next frame. Overuse of `user-blocking` degrades its intended effect — it is meaningful only when used sparingly for genuinely input-responsive work.

**`user-visible`** — The default priority. Used for all work that affects what the user sees but does not gate immediate input handling. Rendering pipeline work, state propagation that produces visual updates, lazy component hydration. This is the correct default for most scheduled work.

**`background`** — The lowest priority. The browser will run these tasks when `user-blocking` and `user-visible` queues are empty. Used for analytics, telemetry, prefetching, cache warming, and any operation that the user would not notice if delayed by several seconds.

Tasks at the same priority level are scheduled in FIFO order relative to each other. Tasks at a higher priority level will always be scheduled before tasks at a lower priority level, regardless of queue order.

**TaskController and dynamic priority:** A `TaskController` is the mutable equivalent of `AbortController` for the Scheduler API. It controls a `TaskSignal`. In addition to aborting scheduled tasks, it can change their priority after they have been posted but before they have run. This enables a deferred task to be elevated to `user-blocking` if user input that depends on it occurs while it is in the queue.

### `scheduler.yield()` — Resumable Work with Priority Inheritance

`scheduler.yield()` is the tool for breaking long-running tasks into yielding chunks without losing priority context. Its semantics differ importantly from `setTimeout(fn, 0)`.

Calling `await scheduler.yield()` inside a `postTask()` callback:

1. Suspends the current execution, returning control to the event loop.
2. Gives the browser a slot to process user input, render a frame, or run higher-priority tasks.
3. Re-queues the continuation at a priority **higher** than newly posted tasks at the same priority level.

Point 3 is the key design decision: a task that yields does not lose its place in the queue to tasks that were posted after it. The continuation is prioritised ahead of freshly posted peers. This prevents a pathological scenario where a well-behaved task that yields frequently ends up perpetually deferred by a stream of newly arriving tasks.

**`scheduler.yield()` inherits priority from its calling `postTask()` context.** Yielding inside a `user-blocking` task resumes at `user-blocking`. Yielding inside a `background` task resumes at `background`. The developer does not need to manually re-specify the priority on resumption.

**Correct chunking pattern:** For any operation that processes an array of items (large data transformation, virtual list rendering, search index update), the loop body should call `scheduler.yield()` at regular intervals. A practical heuristic: yield when the accumulated work for the current chunk has consumed more than a target time budget (typically 5ms for `user-visible` tasks, measured via `performance.now()`). This keeps the chunk size adaptive to actual execution speed rather than a fixed item count, which varies with device capability.

**Comparison with `setTimeout(fn, 0)` — the definitive replacement:**

|Property|`setTimeout(fn, 0)`|`scheduler.yield()`|
|---|---|---|
|Priority|Undifferentiated timer queue|Inherits calling context priority|
|Cancellation|Via `clearTimeout`|Via `AbortSignal` on the parent `postTask`|
|Re-ordering|FIFO with all other timers|Prioritised ahead of new same-priority tasks|
|Specification|Specified as at least 4ms in nested calls|Specified with deterministic priority semantics|
|Composability with priorities|None|Full|

### `requestIdleCallback` — Cooperative Idle Scheduling

**Spec:** W3C Web Performance Working Group — requestIdleCallback  
**Baseline:** Widely Available (not available in older Safari, but acceptable as a progressive enhancement)

`requestIdleCallback(callback, { timeout })` schedules a callback for execution during periods when the browser's main thread is otherwise idle — no tasks pending, no frames due imminently. The callback receives a `deadline` argument with:

- `deadline.timeRemaining()` — milliseconds remaining before the browser expects to need the thread again. Decreases in real-time as the idle period elapses. Returns 0 when the idle window is closing.
- `deadline.didTimeout` — `true` if the callback was forced to run because the `timeout` option elapsed before a genuine idle period occurred.

**The cooperative contract:** `requestIdleCallback` implements cooperative (not preemptive) scheduling. The browser cannot forcibly interrupt a running idle callback, even if `timeRemaining()` reaches zero. The callback developer must respect the deadline voluntarily: check `deadline.timeRemaining()` in the work loop and yield before it reaches zero. Ignoring the deadline and running for 200ms inside an idle callback produces the exact jank that idle scheduling is meant to prevent.

**The mandatory `timeout` option:** Without a `timeout`, a `requestIdleCallback` may never fire in a busy application — if the main thread is always occupied with higher-priority work, idle periods never occur. The `timeout` provides a deadline: after `timeout` milliseconds, the browser will schedule the callback regardless of whether a genuine idle period has occurred, setting `deadline.didTimeout = true`. Always include a timeout. A common default is 1000–2000ms for non-critical but not indefinitely deferrable work.

**Appropriate use cases:**

- Pre-fetching and cache warming for routes the user may visit next
- Serialising application state to IndexedDB during quiet periods
- Sending batched analytics telemetry
- Pre-rendering off-screen components before they scroll into view
- Pruning expired LRU cache entries from in-memory structures

**Where it fits relative to the Scheduler API:** `requestIdleCallback` and `scheduler.postTask({ priority: 'background' })` are not equivalent. `scheduler.postTask({ priority: 'background' })` will run background tasks during non-idle periods, just behind higher-priority work. `requestIdleCallback` runs only during genuine idle periods. For work that should never compete with any foreground work, `requestIdleCallback` is the stricter primitive. For work that should run "soon, but not urgently," `background` priority in the Scheduler API is appropriate.

`scheduler.yield()` composes with `requestIdleCallback`: calling `await scheduler.yield()` inside an idle callback inherits `background` priority, ensuring that resumption of the idle work is appropriately deprioritised relative to user-visible and user-blocking tasks.

### The Scheduling Decision Map

When selecting a scheduling primitive for a given task:

```
Does the work involve DOM mutations for the current frame?
  → requestAnimationFrame

Does the work directly gate user input responsiveness?
  → scheduler.postTask({ priority: 'user-blocking' })

Is the work a long-running loop that should yield to input?
  → await scheduler.yield() inside the loop body
  (within a postTask or rAF if needed)

Does the work produce visible UI but not urgently?
  → scheduler.postTask({ priority: 'user-visible' }) [default]

Should the work run only during idle periods?
  → requestIdleCallback({ timeout: 2000 })

Is the work purely background with no user impact?
  → scheduler.postTask({ priority: 'background' })
  or requestIdleCallback({ timeout: indefinite })

Is the work CPU-intensive regardless of priority?
  → Dedicated Worker via core.workers
```

---

## Long Tasks and the Long Animation Frames API

### Long Tasks — The Original Diagnostic

**PerformanceObserver for `longtask` entries** was the first platform API for detecting main thread blockage. A long task is any task that takes longer than 50ms. `longtask` entries report the task's start time, duration, and basic attribution (which script, which container). The 50ms threshold is derived from the RAIL model's input response budget: a user can perceive a delay greater than 100ms; a 50ms task leaves 50ms for the browser to process the event and present feedback.

**Limitation:** The Long Tasks API measures tasks, not frames. It does not include the rendering phases (style, layout, paint) that occur after the task completes. A 40ms task followed by a 30ms layout pass is a 70ms frame that the Long Tasks API would not flag.

### Long Animation Frames API (LoAF)

**Spec:** W3C Long Animation Frames  
**Baseline Status:** Chromium (Chrome 123+), limited — not yet in Firefox or Safari as of mid-2026  
**PerformanceObserver entry type:** `long-animation-frame`

The Long Animation Frames API (LoAF) is the evolutionary successor to Long Tasks. Rather than measuring tasks, LoAF measures **animation frames** — the complete unit from when the main thread begins work to when it is ready to paint. A long animation frame is one that takes longer than 50ms from start to paint.

LoAF entries expose a richer set of timing properties than Long Tasks:

- `startTime` — when the animation frame work began
- `duration` — total frame duration (excluding presentation time)
- `renderStart` — when the rendering cycle started (rAF callbacks, style recalculation, ResizeObserver)
- `styleAndLayoutStart` — when style and layout calculation began specifically
- `firstUIEventTimestamp` — the timestamp of the first UI event (mouse/keyboard) that was processed during this frame
- `desiredRenderStart` — when the animation frame was queued (indicates scheduling latency)
- `scripts[]` — per-script attribution: source URL, invoker (element selector + event type for event handlers), execution duration, forced layout duration

The `scripts[]` attribution is the critical advancement. Where the Long Tasks API could identify that a long task came from "some script," LoAF can identify that a specific event handler on a specific button element consumed 80ms of the 120ms frame duration, including 30ms of forced synchronous layout triggered from within that handler.

**Integration with INP diagnostics:** The web-vitals library's `onINP()` handler includes `attribution.longAnimationFrameEntries` in its report — the LoAF entries that overlapped the measured INP interaction. This gives field-collected real-user data that identifies specific scripts and interactions responsible for poor INP scores.

**Architectural use:** LoAF monitoring runs in a Dedicated Worker. `PerformanceLongAnimationFrameTiming` entries are observed via `PerformanceObserver` on the main thread, serialised to plain objects (stripping non-cloneable properties), and transferred to the Worker for batched telemetry reporting. The Observer itself imposes negligible overhead. Batching prevents the telemetry overhead from itself appearing in LoAF measurements.

---

## Execution Contexts and Thread Topology

### Window Event Loop — The Main Thread

The window event loop runs on the browser's main thread. All DOM access, style computation, layout, and synchronous JavaScript execution happen here. This thread has a budget of ~10ms of JavaScript execution per frame (the rest of the 16.66ms is consumed by browser overhead, style, layout, and paint). Long tasks — tasks exceeding 50ms — block the thread for multiple frames.

**Shared across tabs (same-agent):** The window event loop is typically shared among all same-origin documents within the same browser process. In Chromium's site-isolation model, cross-origin documents may run in separate renderer processes, each with their own event loops. Same-origin documents within a tab, and iframes from the same origin, share an event loop. This means a long task in one iframe blocks input handling in all other same-origin documents in the same process.

### Worker Event Loops — Concurrent Execution

Workers (Dedicated, Shared, Service) each have their own event loop, running on separate OS threads. They are not subject to the main thread's rendering constraints, have no access to the DOM, and cannot be blocked by main thread activity. Their event loops process `postMessage` tasks, timer tasks, and fetch events (Service Workers).

The worker event loop is architecturally simpler than the window event loop — it has no rendering update phase. There is no `requestAnimationFrame`, no `ResizeObserver`, no style or layout computation. The loop processes tasks and microtasks. `scheduler.postTask()` is available in Workers (post-Baseline confirmation) for priority-aware task scheduling within a Worker's own event loop.

### The Compositing Thread

In Chromium's architecture, the compositor thread runs independently of the main thread. Its job is to composite rasterised layer bitmaps into the final frame for display. When an animation involves only `transform` and `opacity` changes on promoted layers, the compositor thread can produce frames without involving the main thread at all. This is the mechanism by which CSS animations using only compositable properties remain smooth even when the main thread is blocked by a long task — the compositor keeps running.

`will-change: transform` hints to the browser to promote an element to its own compositor layer before animation begins. This avoids a paint at animation start time. Overuse of `will-change` creates excessive layers, consuming GPU memory and potentially degrading composite performance.

---

## Module Loading and Caching

### ES Module Registry

ES Modules loaded via `<script type="module">` or `import` statements are cached in the browser's **module registry** — a per-browsing-context mapping from module URL to module record. A module URL that has been evaluated once will not be re-fetched, re-parsed, or re-evaluated on subsequent imports within the same browsing context. This is specified behaviour, not an implementation optimisation.

**Singleton semantics:** The module registry's caching behaviour provides natural singletons. Any module that exports a mutable object (a store, a service instance, a configuration record) will share that exact object instance across every importer within the same browsing context. Explicit singleton factories, `getInstance()` patterns, and global registries are not necessary. The ES Module system is the singleton system.

**Module evaluation is synchronous and sequential.** When a module graph is imported, the browser resolves all `import` declarations, fetches all modules in the graph (potentially in parallel, subject to HTTP/2 multiplexing), and evaluates them in post-order (dependencies before dependants). Top-level `await` in a module suspends evaluation of that module and all modules that depend on it until the awaited Promise resolves. This can significantly delay the availability of module exports. Top-level `await` in deeply-shared dependency modules is an anti-pattern that can serialise the entire module graph loading process.

### Import Maps — Specifier Resolution Without a Bundler

**Spec:** WHATWG HTML Living Standard — Import Maps  
**MDN:** `developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap`  
**Baseline:** Widely Available

An Import Map declared in `<script type="importmap">` establishes the resolution table for bare module specifiers. Without an Import Map, bare specifiers (`import from 'lodash'`) are invalid in native ES Modules — only URLs and relative paths are valid. With an Import Map, bare specifiers are resolved to URLs before the browser's module fetching pipeline begins.

Import Maps support:

- **Bare specifier mapping:** `"lodash": "/vendor/lodash@4.17.21.js"` — resolves `import _ from 'lodash'` to the specified URL
- **Scoped mappings:** `"scopes": { "/legacy/": { "lodash": "/vendor/lodash@3.10.js" } }` — applies a different resolution within a specific path scope, enabling multiple versions of a module in the same application without global conflicts
- **Trailing slash mappings:** `"lodash/": "/vendor/lodash/"` — resolves imports from a module subtree

**Constraints:** Only one Import Map per document is permitted. The Import Map must appear before any `<script type="module">` elements that use its specifiers. The Import Map cannot be injected dynamically after modules have begun loading. Import Maps apply only to the current document; Workers use separate Import Map declarations via `importmap` option in `new Worker()` (where supported) or via explicit URL resolution.

**es-module-shims polyfill:** For browsers without Import Map support (approximately 4% of users as of mid-2026), `es-module-shims` provides a passthrough polyfill that adds ~13KB and ~5ms overhead for the majority of users who have native support, activating the full shim only for the polyfill-needing minority.

### `<link rel="modulepreload">` — Loading Waterfalls

**Baseline:** Widely Available (September 2023)

The native ES Module loading process is sequential in its discovery phase: the browser cannot know which modules a module depends on until it has fetched and parsed that module. A module graph five levels deep requires five sequential round-trips before all modules are available for evaluation — a "loading waterfall."

`<link rel="modulepreload" href="/module.js">` instructs the browser to fetch and parse (but not evaluate) a module and its dependencies during page load, before the importing script requests them. This collapses the loading waterfall into a single parallel fetch burst, provided all critical-path modules are preloaded.

**What modulepreload does not do:** It does not evaluate the module. Evaluation happens when the importer's `import` declaration is reached. modulepreload only fills the module registry's fetch cache. The evaluation cost still occurs at import time.

**Preload scope decisions:** Preload the modules that constitute the critical path for the initial render. Dynamic `import()` loads for routes that may never be visited should not be preloaded — they compete for bandwidth with critical-path resources. A clear preload boundary is: modules imported statically in the main entry point and its direct dependencies are candidates for preloading; modules imported dynamically by the router are not.

### Dynamic `import()` — Code Splitting at the Platform Level

`import(specifier)` is a platform-native code-splitting mechanism. It returns a Promise that resolves when the named module and all its static dependencies have been fetched, parsed, and evaluated. The browser's module registry caches the result — subsequent `import()` calls for the same specifier return the cached module record without re-fetching.

`import()` is the only loading mechanism for route-level and conditionally-needed modules in this architecture. Static imports at the top level of any module create a loading dependency that delays the evaluation of the importing module. Module graph expansion through static imports should be deliberate; `import()` provides an explicit boundary.

**Top-level `await` and dynamic imports:** An `await import(specifier)` at the top level of a module suspends that module's evaluation. When this module is itself a dependency of other modules, those modules cannot complete evaluation until the dynamic import resolves. Top-level `await` + dynamic `import()` should only appear at the application entry point or at explicit splitting boundaries, never in deep shared dependencies.

### `import defer` — Deferred Module Evaluation (TC39 Stage 3, mid-2026)

The TC39 Deferring Module Evaluation proposal (Stage 3 as of July 2025 TC39 meeting) introduces `import defer * as ns from './module.js'`. The module graph is fetched and linked (placed in the module cache, all dependencies resolved) but evaluation is deferred until the first property access on the namespace object `ns`.

This separates the two costs of module loading:

- **Network cost** (fetch + parse): incurred eagerly, parallel to other loading
- **CPU cost** (evaluation, execution of top-level code): deferred until genuinely needed

For large dependencies that are imported by many modules but used infrequently (heavy analytics libraries, complex UI components loaded speculatively), `import defer` avoids paying the evaluation cost during the critical path while still ensuring the module is fully network-cached.

`import defer` cannot be used with modules that use top-level `await`, since deferred evaluation must be synchronous (evaluation occurs on first property access, which cannot be async). This constraint is intentional.

No production browser ships `import defer` natively as of mid-2026, but tooling (Webpack, Rollup, esbuild) is beginning to implement it as a compile target, and browser implementations are in progress.

### Module Workers

Workers support ES Module syntax via `new Worker(url, { type: 'module' })`. Module Workers:

- Can use `import`/`export` statements (no `importScripts()` required)
- Respect the page's Import Map for specifier resolution (where the browser supports it)
- Support dynamic `import()` for lazy loading within the Worker
- Support top-level `await` in the Worker module's global scope

All Workers in this architecture are module Workers. Service Workers authored as ES Modules use `{ type: 'module' }` in the registration call. Module semantics in Workers are identical to those on the main thread, with the same module registry caching semantics within each Worker's own context.

---

## Runtime Correctness Constraints

Several runtime behaviours follow from the event loop model and must be treated as hard constraints on code structure, not edge cases to handle defensively.

**Constraint 1 — No synchronous blocking of the main thread above 50ms.** Any operation that holds the main thread for more than 50ms is a long task. Long tasks degrade INP. There is no operation in application logic that justifies a synchronous main thread block above this threshold. Data transformation, cryptography, parsing, and complex computation belong in Workers.

**Constraint 2 — No read/write interleaving of DOM geometry.** All geometry reads in a task must precede all geometry writes, or be batched into separate `rAF` callbacks where reads happen at the start. Violations cause forced synchronous layout. `PerformanceLongAnimationFrameTiming`'s `scripts[].forcedStyleAndLayoutDuration` field directly measures the cost of this error.

**Constraint 3 — No infinite microtask loops.** A Promise chain that recursively enqueues microtasks without yielding to the event loop stalls the rendering pipeline indefinitely. Long-running async work must use `scheduler.yield()` to give the browser rendering opportunities.

**Constraint 4 — No top-level `await` in shared dependency modules.** Top-level `await` in a module suspends evaluation of every importer. In shared infrastructure modules (routing, state, storage), this delays the entire application startup. Top-level `await` is acceptable only at the application entry point where it is the explicit intention to delay execution.

**Constraint 5 — `rAF` is not a general deferrall mechanism.** Scheduling non-rendering work in `requestAnimationFrame` steals from the 16.66ms frame budget. Use the Scheduler API for non-rendering deferred work.

---

## Integration with core.*

- **`core.ui.schedule(fn, priority)`** — wraps `scheduler.postTask()` with the architecture's priority enum. All non-rAF scheduled work in `core.*` and application code goes through this API.
- **`core.ui.scheduleFrame(fn)`** — wraps `requestAnimationFrame`. Used exclusively for DOM mutations that must be visible in the next frame.
- **`core.workers.*`** — the offloading boundary for tasks that would violate Constraint 1. All CPU-intensive operations route to Dedicated Workers through this API.
- **`core.ui.observe.performance(entryTypes, callback)`** — wraps `PerformanceObserver` with lifecycle-coupled cleanup, enabling the application to observe both `longtask` and `long-animation-frame` entries.
- **`core/platform/supports.js`** — exposes `supports.scheduler`, `supports.schedulerYield`, `supports.longAnimationFrames`, and `supports.modulePreload` as feature-detected constants, enabling fallback paths for the minority of users without full Scheduler API support.

---

_References:_  
_WHATWG HTML Living Standard — Event loop processing model: `html.spec.whatwg.org/#event-loop-processing-model`_  
_WHATWG HTML Living Standard — Microtask checkpoint: `html.spec.whatwg.org/#perform-a-microtask-checkpoint`_  
_WICG Prioritized Task Scheduling: `wicg.github.io/scheduling-apis`_  
_MDN — Scheduler.postTask(): `developer.mozilla.org/en-US/docs/Web/API/Scheduler/postTask`_  
_MDN — Scheduler.yield(): `developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield`_  
_MDN — queueMicrotask(): `developer.mozilla.org/en-US/docs/Web/API/Window/queueMicrotask`_  
_W3C requestIdleCallback: `w3.org/TR/requestidlecallback`_  
_W3C Long Animation Frames API: `github.com/w3c/long-animation-frames`_  
_Chrome for Developers — Long Animation Frames: `developer.chrome.com/docs/web-platform/long-animation-frames`_  
_web.dev — Rendering Performance: `web.dev/articles/rendering-performance`_  
_WHATWG HTML Living Standard — Import Maps: `html.spec.whatwg.org/#import-maps`_  
_MDN — modulepreload: `developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/modulepreload`_  
_Chrome for Developers — Use scheduler.yield(): `developer.chrome.com/blog/use-scheduler-yield`_  
_TC39 Deferring Module Evaluation (Stage 3): `github.com/tc39/proposal-defer-import-eval`_  
_Forced Synchronous Layout reference (Paul Irish): `gist.github.com/paulirish/5d52fb081b3570c81e3a`_