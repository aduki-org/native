# Native-First Web Platform Architecture — Volume 2
## Deep API Research, Extended Specifications, and Exhaustive Platform Survey

**Version:** 1.0  
**Status:** Working Specification  
**Date:** May 2026  
**Continues from:** `native-web-platform-architecture.md`  
**Authority:** MDN Web Docs, WHATWG Living Standard, W3C Specifications, WICG, TC39, Chrome Platform Docs, web.dev

---

## Table of Contents

1. [animations.md](#1-animations) — Web Animations API, Scroll-Driven Animations, View Transitions deep-dive
2. [css-architecture.md](#2-css-architecture) — Cascade Layers, @scope, Custom Properties, Houdini
3. [ui-primitives.md](#3-ui-primitives) — Popover API, CSS Anchor Positioning, Dialog, `<select>` customisation
4. [media-codecs.md](#4-media-codecs) — WebCodecs, OffscreenCanvas, MediaStream, VideoFrame pipelines
5. [transport-layer.md](#5-transport-layer) — WebTransport, WebSockets architecture, Server-Sent Events
6. [storage-extended.md](#6-storage-extended) — OPFS deep-dive, FileSystemObserver, SQLite in the browser
7. [device-platform.md](#7-device-platform) — Screen Wake Lock, Idle Detection, Screen Orientation, Gamepad
8. [authentication.md](#8-authentication) — WebAuthn, Credential Management API, Passkeys
9. [observability.md](#9-observability) — PerformanceObserver deep-dive, Long Tasks, INP, CLS measurement
10. [css-rendering-engine.md](#10-css-rendering-engine) — Contain, ContentVisibility, CSS Typed OM, Paint Worklet
11. [push-and-notifications.md](#11-push-and-notifications) — Push API, Notification API, VAPID, SW integration
12. [platform-integration.md](#12-platform-integration) — Payment Request, Share API, Badging API, Protocol Handlers
13. [module-system.md](#13-module-system) — Import Maps deep-dive, Module Workers, CSS/JSON modules
14. [advanced-networking.md](#14-advanced-networking) — Fetch Priority API, Resource Timing, Navigation Preload
15. [design-tokens-system.md](#15-design-tokens-system) — Complete design token architecture using native CSS
16. [accessibility-platform.md](#16-accessibility-platform) — ARIA, ElementInternals, AOM, shadow DOM accessibility
17. [testing-architecture.md](#17-testing-architecture) — Native testing patterns, Custom Elements testing, web-test-runner
18. [project-structure.md](#18-project-structure) — Directory layout, module conventions, toolchain philosophy
19. [interoperability.md](#19-interoperability) — Embedding in existing apps, integrating with server-rendered HTML
20. [future-roadmap.md](#20-future-roadmap) — In-flight proposals, TC39 pipeline, WICG incubations

---

---

# 1. animations.md

## Web Animations, Scroll-Driven Timelines, and View Transitions — Deep Specification

### Web Animations API (WAAPI)

**Spec:** W3C Web Animations  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API`  
**Status:** Widely Available

The Web Animations API is the browser's native animation engine, exposed as a JavaScript interface. It unifies what was previously split between CSS Transitions, CSS Animations, and manual `requestAnimationFrame` loops. All CSS animation features run through WAAPI internally; the API is the common model, not a separate implementation.

#### Conceptual Architecture

WAAPI operates on two orthogonal models that compose:

**Timing Model** — Governs how far along a timeline a given animation has progressed. The central concept is `DocumentTimeline`, which starts at page load and advances with the passage of real time. In the future (and experimentally now via Scroll-Driven Animations), timelines can be driven by scroll position, element view progress, or any other monotonically advancing source. Every `Animation` object has a `startTime` that anchors it to a position on its timeline. Adjusting the animation's `currentTime`, `playbackRate`, or `startTime` directly manipulates its position on the timeline — this is how scrubbing, reversing, and speed changes work.

**Animation Model** — Governs what the animated object looks like at a given timeline position. This is described by `KeyframeEffect`: a target element, an array of keyframes (each a plain object of CSS property/value pairs), and timing options (duration, easing, iterations, fill). `KeyframeEffect` is composable — multiple effects can be applied to the same element and they compose via the `composite` option (`add`, `accumulate`, `replace`).

#### Element.animate() — The Primary Interface

The most ergonomic entry point. Returns an `Animation` instance immediately, already running:

```js
const anim = element.animate(
  [{ opacity: 0, transform: 'translateY(20px)' },
   { opacity: 1, transform: 'translateY(0)' }],
  { duration: 300, easing: 'ease-out', fill: 'forwards' }
);
```

The returned `Animation` object exposes:

- `anim.pause()` / `anim.play()` / `anim.reverse()` / `anim.cancel()` / `anim.finish()` — full playback control
- `anim.currentTime` (r/w) — current position in ms; set directly to scrub
- `anim.playbackRate` (r/w) — set to negative to play in reverse
- `anim.ready` — a Promise that resolves when the animation is ready to begin playing (after the next frame)
- `anim.finished` — a Promise that resolves when the animation has finished
- `anim.commitStyles()` — writes the computed animated styles back to the element's inline style, allowing the animation to be removed while preserving its final state

#### Memory and Lifecycle Implications

`Animation` objects created via `element.animate()` are associated with the element through its `getAnimations()` list. When the animation is cancelled, finished, or the element is removed from the document, the animation becomes unreferenced and is eligible for garbage collection — provided no external reference is held. Storing animations in a component's instance state and calling `cancel()` in `disconnectedCallback()` is the correct cleanup pattern, consistent with AbortSignal-based cleanup for other resources.

`fill: 'forwards'` (retaining the final state after the animation ends) holds a reference to the effect and prevents garbage collection of the animation's data until `commitStyles()` and `cancel()` are called. This is a common subtle memory leak in production codebases.

#### Compositing Animations

Multiple animations on the same element compose according to the CSS cascade and animation compositing rules. The `composite` option on `KeyframeEffect` controls how values from multiple concurrent effects are combined: `replace` (default, last value wins), `add` (values are summed — `transform: translateX(10px)` + `transform: translateX(5px)` = `translateX(15px)`), or `accumulate` (iterative addition). Compositing enables complex motion that would require complex math if done via a single keyframe set.

---

### Scroll-Driven Animations

**Spec:** W3C CSS Scroll-Driven Animations Module Level 1  
**MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations`  
**W3C Draft:** `drafts.csswg.org/scroll-animations-1/`  
**Status:** Chrome/Edge/Opera widely available; Firefox behind flag (`layout.css.scroll-driven-animations.enabled` in `about:config`); Safari support in progress. Not yet Baseline.

Scroll-Driven Animations replace the common `IntersectionObserver` + `requestAnimationFrame` scroll-tracking pattern with a zero-JavaScript declarative or programmatic mechanism. The animation's progress is driven by scroll position rather than clock time.

#### Two Timeline Types

**ScrollTimeline** — Progress is mapped to a scroll container's scroll offset from 0% (scroll start) to 100% (scroll end). The source element and scroll axis (block/inline) are specified. Any animation attached to a `ScrollTimeline` scrubs forward and backward as the user scrolls.

**ViewTimeline** — Progress is mapped to a subject element's entry and exit through a scrollport (the visible portion of a scroll container). This enables reveal animations, parallax effects, and element-level scroll interactions without any JavaScript. The `inset` option adjusts where within the scrollport the 0% and 100% positions are calculated, enabling animations that start before an element fully enters view.

#### CSS API

```css
@keyframes reveal {
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
}

.hero-text {
  animation: reveal linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 50%;
}
```

`animation-timeline: view()` binds the animation to a `ViewTimeline` for the element itself. `animation-range` scopes the 0%–100% progress to a named range within the full timeline. Named ranges (`entry`, `contain`, `exit`, and their `start`/`end` variants) describe the element's relationship to the scrollport without specifying pixel offsets.

#### JavaScript API

`ScrollTimeline` and `ViewTimeline` are constructible. They can be passed to `element.animate()` as the `timeline` option, combining WAAPI's programmatic control with scroll-driven progress:

```js
const timeline = new ViewTimeline({ subject: targetElement, axis: 'block' });
targetElement.animate(keyframes, { timeline, rangeStart: 'entry 0%', rangeEnd: 'entry 50%' });
```

#### Architectural Significance

The elimination of scroll-event-based animation is architecturally significant. Scroll event listeners execute on the main thread and can block rendering. Scroll-Driven Animations run entirely in the browser's compositor thread — the same thread that handles native scroll physics — at zero main-thread cost. This removes one of the most common sources of scroll janking in complex web applications.

The `IntersectionObserver` pattern for triggering class-based CSS transitions should be replaced with `ViewTimeline` + `animation-range` wherever the animation is tightly coupled to scroll position. `IntersectionObserver` remains appropriate for triggering discrete one-time events (lazy loading, analytics) that are not continuous animations.

#### Browser Gap Strategy

Until Scroll-Driven Animations achieve Baseline status, a progressive enhancement wrapper is appropriate: detect `'ScrollTimeline' in window`, apply scroll animations if supported, and fall back to a simplified static state for unsupported browsers. The `@supports (animation-timeline: scroll())` CSS feature query gates the CSS API. Do not polyfill Scroll-Driven Animations with JavaScript — that defeats the entire performance rationale.

---

### View Transitions API — Extended Architecture

**Spec:** W3C CSS View Transitions Module Level 1 and Level 2  
**Status:** Same-document transitions: Baseline Newly Available as of October 2025. Cross-document transitions: Chrome 126+, not yet in Firefox or Safari.

#### Same-Document Transitions

`document.startViewTransition(callback)` is the entry point. The API:

1. Captures a screenshot of the current state of all elements that have `view-transition-name` declared
2. Calls the `callback` synchronously
3. Captures a screenshot of the new state
4. Creates a `::view-transition` pseudo-element tree containing `::before` (old state) and `::after` (new state) layers for each named element
5. Animates between them using a CSS animation (cross-fade by default)

The `::view-transition-image-pair(name)`, `::view-transition-old(name)`, and `::view-transition-new(name)` pseudo-elements provide targeted CSS control over each transition group's animation. This is how custom animations per-element (slide, zoom, morph) are specified.

The `ViewTransition` object returned by `startViewTransition()` exposes:

- `transition.ready` — Promise resolving when pseudo-elements are created and CSS animations are about to begin; use to programmatically control animations via WAAPI
- `transition.finished` — Promise resolving when all animations have completed and pseudo-elements have been removed
- `transition.updateCallbackDone` — Promise resolving when the callback passed to `startViewTransition()` has finished
- `transition.skipTransition()` — Immediately jumps to the end state, useful for reduced-motion preferences

#### Reduced Motion Handling

The `prefers-reduced-motion` media query gates the animation:

```css
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none;
  }
}
```

This must be applied globally. The transition still executes (DOM update is preserved), but the visual interpolation is suppressed. Checking `window.matchMedia('(prefers-reduced-motion: reduce)').matches` before calling `startViewTransition()` allows skipping the transition entirely.

#### Cross-Document (MPA) Transitions

Level 2 enables transitions between full page navigations in MPAs via the `@view-transition` CSS at-rule:

```css
@view-transition {
  navigation: auto;
}
```

Applied on both the outgoing and incoming page, this activates the platform's cross-document view transition engine. Named elements on both pages are automatically matched and animated. This represents the most significant architectural simplification for MPA applications since the introduction of `pushState` — full page transitions at zero JavaScript cost.

---

---

# 2. css-architecture.md

## Native CSS Architecture — Cascade Layers, @scope, Houdini, and Typed OM

### CSS Cascade Layers (@layer)

**Spec:** W3C CSS Cascade 5  
**MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/@layer`  
**Status:** Widely available since Chrome 99, Firefox 97, Safari 15.4 (early 2022)

`@layer` resolves the fundamental problem of large-scale CSS architecture: specificity conflicts. Before cascade layers, managing which styles win in a complex codebase required increasingly specific selectors, `!important` overrides, and strict file-ordering discipline — all of which are fragile at scale.

#### Layer Priority Model

Layers are declared in priority order. Later-declared layers have higher cascade priority than earlier ones, regardless of selector specificity. A `.simple` selector in a higher-priority layer overrides a `.complex.nested .selector` in a lower-priority layer:

```css
/* Declaration order establishes priority — reset < base < components < utilities */
@layer reset, base, components, utilities;
```

Styles outside any layer sit above all layers in the cascade and always win. This means third-party CSS that does not use layers can be demoted into a layer at import time:

```css
@import 'third-party.css' layer(vendor);
```

This is architecturally transformative for integrating external CSS into a layered architecture.

#### Recommended Layer Architecture for Large Applications

A production-scale layer ordering that mirrors the design system hierarchy:

```
@layer
  reset,         /* Opinionated browser-default removal */
  tokens,        /* CSS custom properties, design token declarations */
  base,          /* Typographic and element defaults */
  components,    /* Component-level styles from the component library */
  layouts,       /* Page-level layout primitives */
  utilities,     /* Single-purpose atomic overrides */
  themes,        /* Theme overrides (dark mode, brand variants) */
  overrides;     /* Emergency per-page or per-feature overrides */
```

Layers can be nested. A component library can wrap all its styles in `@layer ui.*`, exposing named sub-layers for customisation:

```css
@layer ui.base, ui.components, ui.hooks;
```

Consumer applications import the library's layer at a specific position in their own layer stack, gaining full control over the library's cascade precedence without any build-time configuration.

#### Integration with Shadow DOM

Shadow DOM has its own cascade scope. `@layer` inside a shadow root is local to that shadow root and does not affect the document's layer order. This enables component-level layer architectures that are fully encapsulated. The shadow root inherits CSS custom properties from the document (which cross shadow boundaries), providing the design token bridge.

---

### CSS @scope

**Spec:** W3C CSS Cascading and Inheritance Level 6  
**Status:** Chrome 118+, Safari 17.4+, Firefox (in progress). Approaching Baseline.

`@scope` allows scoping CSS rules to a subtree of the document, providing light-DOM style encapsulation without Shadow DOM. The `@scope` at-rule accepts two arguments: the scoping root (required) and an optional scoping limit (stop point):

```css
@scope (.card) to (.card-content) {
  p { font-size: 0.875rem; }
}
```

Styles inside `@scope (.card)` apply only to elements inside `.card`. The optional `to (.card-content)` argument excludes the content of nested `.card-content` elements — stopping the scope at a nested boundary.

`@scope` complements Shadow DOM. For components that do not require full DOM isolation (no JavaScript behaviour, accessible without shadow root) but need style encapsulation, `@scope` provides a lighter-weight alternative. The combination of `@scope` and `@layer` provides a fully native CSS architecture that covers the use cases previously filled by CSS Modules, BEM, and many CSS-in-JS solutions.

---

### CSS Houdini

CSS Houdini is a W3C umbrella for a collection of low-level APIs that expose the browser's CSS engine to JavaScript developers. It allows extending CSS at the engine level rather than the rendering-after-the-fact level.

#### CSS Properties and Values API (@property)

**Status:** Widely available (Chrome 85+, Firefox 128+, Safari 16.4+)

`@property` registers a CSS custom property with a declared type, inheritance behaviour, and initial value. This is more powerful than an unregistered custom property in several ways:

- Typed transitions: animating between two values of a registered `<color>` or `<length>` property produces smooth interpolation. Animating an unregistered custom property produces a binary snap at 50% because the browser cannot interpret it as a type.
- Initial value guarantee: if a registered property is unset, the declared `initial-value` is used, preventing invalid-value fallback cascades.
- Inheritance control: `inherits: true/false` determines whether the property participates in the normal CSS inheritance mechanism.

```css
@property --brand-hue {
  syntax: '<angle>';
  inherits: true;
  initial-value: 220deg;
}
```

This enables animated theme transitions, polished dark/light mode switches, and custom animated properties that were previously impossible in pure CSS.

#### CSS Typed Object Model (Typed OM)

**Status:** Widely available (Chrome 66+, Firefox 119+, Safari 16.4+)

Traditional CSSOM represents all CSS values as strings: `element.style.opacity` is the string `"0.5"`. Typed OM exposes CSS values as structured JavaScript objects: `element.attributeStyleMap.get('opacity')` returns a `CSSUnitValue(0.5, 'number')`.

This has two concrete benefits:

- **Performance**: Setting styles via `element.attributeStyleMap.set(...)` is measurably faster than `element.style.setProperty(...)` because it bypasses the string parsing step. This matters in tight animation loops.
- **Correctness**: Math on CSS values is done using `CSSMathValue` operations rather than string concatenation, eliminating a class of parsing bugs. Unit conversion between `px`, `em`, `vw` etc. is handled by the engine.

#### CSS Paint API (Houdini Worklets)

**Status:** Chrome/Edge (Chromium 65+). Firefox and Safari do not yet support it.

The CSS Paint API allows defining custom `<image>` values implemented in JavaScript, executed in a `PaintWorklet` thread separate from the main thread. A paint worklet receives a `PaintRenderingContext2D` (a canvas-like 2D drawing API), the element's dimensions, and declared CSS custom property values. It renders directly into the browser's painting pipeline.

This enables CSS features like custom borders, backgrounds, and pseudo-elements that have no native CSS equivalent. Practical applications include: animated gradient borders, noise texture backgrounds, complex custom shape fills driven by CSS variables.

The architectural constraint: the Paint API is Chromium-only. Use it as a progressive enhancement only, with a CSS fallback. Given the limited browser support, it should not be used for features that affect usability.

---

---

# 3. ui-primitives.md

## Native UI Primitives — Popover, Anchor Positioning, Dialog, and Customisable Select

### Popover API

**Spec:** WHATWG HTML Living Standard  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Popover_API`  
**Status:** Baseline Newly Available as of January 2025 (all major engines)

The Popover API provides declarative, accessible, zero-JavaScript popovers via the `popover` HTML attribute. A button with `popovertarget="id"` toggles the element with `id` as its popover without any JavaScript.

Key behaviours provided by the platform at zero cost:

- **Top-layer rendering**: Popovers render in the browser's top layer, above all other content including `z-index: 9999` stacks, fixed headers, and modals. The stacking context problem that drove generations of z-index hacks is solved at the platform level.
- **Light dismiss**: Clicking outside a `popover="auto"` element closes it. No click-outside listener required.
- **Escape key dismissal**: The browser handles this automatically.
- **One-at-a-time**: Opening a new `popover="auto"` closes any previously open auto-popover in the same stack. Nested popovers are supported and maintain their own stack.
- **`::backdrop` pseudo-element**: Styleable backdrop layer appears between the popover and the rest of the document.
- **Implicit ARIA**: The browser creates `aria-expanded`, `aria-controls`, and `aria-haspopup` relationships between the trigger and the popover automatically when using `popovertarget`.
- **Implicit anchor reference**: The invoking button becomes the popover's implicit CSS anchor, enabling anchor-relative positioning without additional markup.

The `toggle` event fires on the popover element when it opens or closes, enabling JavaScript reactions without event listeners on the triggering button. The `beforetoggle` event fires before the state change and is cancellable.

**Architectural implication**: Tooltip libraries (Tippy.js, Floating UI used purely for top-layer rendering), dropdown libraries, and custom modal-over-modal stacking logic should be replaced with the Popover API. Floating UI remains relevant for the positioning logic only (see Anchor Positioning below).

---

### CSS Anchor Positioning

**Spec:** W3C CSS Anchor Positioning Module Level 1  
**Status:** Baseline 2026 — Chrome 125+, Firefox 147+, Safari 26. Fully cross-browser as of 2026.

CSS Anchor Positioning eliminates the need for JavaScript-based tooltip/dropdown positioning libraries (Floating UI, Popper.js, Tippy.js positional logic) for the overwhelming majority of use cases.

#### The Three Core Properties

**`anchor-name`** — Declares an element as a named anchor:
```css
.trigger-button { anchor-name: --my-menu-trigger; }
```

**`position-anchor`** — Associates a positioned element with its anchor:
```css
.dropdown { position: absolute; position-anchor: --my-menu-trigger; }
```

**`position-area`** — A 3×3 grid describing where the positioned element should appear relative to its anchor:
```css
.dropdown { position-area: bottom span-all; }
```

The `position-area` shorthand replaces the coordinate calculations that Floating UI performs in JavaScript.

#### @position-try Fallbacks

When the positioned element would overflow the viewport, `@position-try` rules specify alternate placements to attempt, in order:

```css
.dropdown {
  position-try-fallbacks: flip-block, flip-inline, flip-start;
}

@position-try --fallback-top {
  position-area: top span-all;
}
```

This replicates the overflow-aware automatic repositioning that Floating UI provides — the feature that most commonly justifies its inclusion. The browser handles this natively, in the compositor, without JavaScript layout queries.

#### Integration with Popover API

When a popover is opened using `popovertarget`, the triggering button becomes the popover's implicit anchor. No `anchor-name` or `position-anchor` declaration is needed — only a `position-area` on the popover to describe where it should appear relative to its implicit anchor. This is the zero-JavaScript tooltip/dropdown pattern:

```html
<button popovertarget="menu">Open Menu</button>
<ul id="menu" popover style="position-area: bottom span-all; margin: 0;">...</ul>
```

#### Architectural Displacement

The combination of Popover API + CSS Anchor Positioning eliminates the need for any tooltip, dropdown, combobox-positioning, or popover-positioning JavaScript library for standard UI patterns. The browser solves top-layer rendering, overflow avoidance, viewport-edge detection, and ARIA relationships. The only remaining reason to use Floating UI is for advanced positioning scenarios (weighted placement, middleware pipelines) that the CSS API does not yet express.

---

### The `<dialog>` Element

**Status:** Widely available

The native `<dialog>` element provides a fully accessible modal and non-modal dialog pattern. `dialog.showModal()` opens it in the top layer (like popover), traps focus within it, and handles `Escape` key dismissal. `dialog.close(returnValue)` closes it.

The `<dialog>` element manages focus trapping — historically a complex JavaScript concern requiring libraries — at zero cost. `autofocus` on an element within the dialog directs initial focus appropriately.

`::backdrop` styles the page overlay. `dialog.returnValue` carries the value passed to `close()`, enabling form-like workflows where a dialog communicates the user's selection back to its opener.

---

### Customisable `<select>`

**Status:** Chrome 135+, behind `appearance: base-select`. Approaching Baseline.

The long-awaited customisable select (`<selectlist>`, now implemented via `appearance: base-select` on `<select>`) enables full CSS styling of the `<select>` element and its options, integrated with the Popover API for the dropdown and CSS Anchor Positioning for its placement. This eliminates one of the longest-standing reasons to reach for a custom dropdown component library.

---

---

# 4. media-codecs.md

## WebCodecs, OffscreenCanvas, and Low-Level Media Pipelines

### WebCodecs API

**Spec:** W3C WebCodecs  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API`  
**Status:** Baseline Newly Available. Full support: Chrome 94+, Edge 94+, Firefox 130+, Safari 26+ (full). Safari 16.4–18.7: video only.

#### Architectural Purpose

Before WebCodecs, JavaScript applications that needed low-level video processing (custom video players, live streaming, screen capture, AR/VR overlays, video editors) had no choice but to:

- Download codec implementations in JavaScript/WebAssembly, increasing bandwidth
- Rely on `<video>` element constraints, losing frame-level control
- Use the opaque `MediaRecorder` API, which provides no access to individual encoded/decoded frames

WebCodecs exposes the browser's built-in hardware-accelerated codecs directly. Hardware acceleration kicks in automatically when the system codec is GPU-backed; the browser transparently falls back to software decode if not. This eliminates redundant codec downloads and enables frame-level control at native performance.

#### Core Interfaces

**`VideoEncoder` / `VideoDecoder`**  
Encode a sequence of `VideoFrame` objects into `EncodedVideoChunk` objects and vice versa. Both operate as asynchronous queues: frames/chunks are enqueued via `encode()`/`decode()`, and results arrive in the `output` callback. The `decodeQueueSize` property reflects backpressure. A `dequeue` event fires when the queue decreases, allowing the producer to refill without unbounded memory growth.

**`AudioEncoder` / `AudioDecoder`**  
The audio equivalents. Support Opus (recommended, cross-browser) and AAC. MP3 and other formats require a third-party library as WebCodecs does not include them.

**`ImageDecoder`**  
Decodes image files (JPEG, PNG, WebP, AVIF, GIF, and others based on browser support) into `VideoFrame` objects without creating a DOM element. Useful for extracting animation frames from GIFs or APIF files for manipulation.

**`VideoFrame`**  
Represents a single video frame. Contains pixel data in GPU memory, metadata (timestamp, duration, format, coded size, display size). Can be constructed from: `<canvas>`, `<video>`, `ImageBitmap`, `OffscreenCanvas`, `HTMLImageElement`, `VideoFrame` itself. Can be rendered to a canvas using `ctx.drawImage(frame)`. Must be explicitly closed via `frame.close()` — GPU memory is held until this call. Failure to close frames is a GPU memory leak.

#### Threading Architecture

The most performant WebCodecs pipeline runs entirely in a `Worker`, keeping all codec work off the main thread:

1. Main thread captures `MediaStream` from camera/screen
2. `MediaStreamTrackProcessor` converts the track to a `ReadableStream<VideoFrame>`
3. The stream (or the track itself) is transferred to a `Worker` via `postMessage` with Transferable objects
4. Worker processes frames (encode, transform, decode) using WebCodecs
5. Processed frames are rendered to an `OffscreenCanvas`, which was created by transferring control from a `<canvas>` on the main thread
6. The `OffscreenCanvas`'s rendering updates the main-thread `<canvas>` automatically

`OffscreenCanvas` enables GPU-accelerated canvas rendering in a Worker context — the canvas is detached from the main thread's DOM, and its drawing commands execute in the Worker, then commit to the screen without a round-trip to the main thread.

#### Resource Management

Each `VideoFrame` holds GPU-resident memory. Each `EncodedVideoChunk` holds CPU memory. Both are not GC'd by the garbage collector — they must be closed manually. In a high-framerate video processing pipeline (60fps = one frame every ~16ms), forgetting to close frames causes memory to fill at several megabytes per second.

The correct pattern: close each frame at the end of its processing. If frames are passed between async stages, ownership must be clearly defined and close() called exactly once.

---

---

# 5. transport-layer.md

## WebTransport, WebSocket Architecture, and Real-Time Communication

### WebTransport

**Spec:** W3C WebTransport  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/WebTransport_API`  
**Status:** Baseline Newly Available as of March 2026 (Chrome 97+, Firefox, Safari 26.4+)

#### Architectural Position

WebTransport is the successor to WebSockets for applications that require low-latency, multiplexed, bidirectional communication. It runs over HTTP/3 and QUIC (UDP-based), which resolves WebSockets' head-of-line blocking problem: in WebSockets over TCP, a lost packet stalls all subsequent messages until it is retransmitted. In WebTransport over QUIC, each stream is independent — a lost packet in one stream does not block others.

WebTransport exposes two communication modes:

**Reliable streams** — `ReadableStream`/`WritableStream`-backed bidirectional or unidirectional channels with guaranteed delivery and ordering. Semantics equivalent to WebSocket but without head-of-line blocking across multiple streams.

**Unreliable datagrams** — UDP-like message delivery via `transport.datagrams.readable` and `transport.datagrams.writable`. No delivery or ordering guarantee. Zero queuing — if the network is congested, datagrams are dropped rather than queued. This is the correct transport for real-time state that is rendered obsolete by the next update (game positions, cursor locations, sensor readings).

#### Use Case Matrix

| Use case | Transport |
|----------|-----------|
| Multiplayer game state | Unreliable datagrams |
| Chat messages | Reliable unidirectional stream |
| File upload | Reliable bidirectional stream |
| Real-time telemetry | Unreliable datagrams |
| RPC calls | Reliable bidirectional stream |
| Streaming media chunks | Reliable unidirectional stream |

#### Fallback Architecture

WebTransport fails in environments that block UDP on port 443 (common in corporate networks and hotels). A robust implementation must detect WebTransport failure at the connection level and fall back to WebSocket automatically. The connection attempt should be raced with a timed fallback:

```js
// Pseudocode
const wtPromise = openWebTransport(url).catch(() => null);
const fallback = new Promise(r => setTimeout(() => r(null), 2000));
const wt = await Promise.race([wtPromise, fallback]);
const transport = wt ?? openWebSocket(wsUrl);
```

This pattern is analogous to the "Happy Eyeballs" algorithm for IPv4/IPv6 fallback. Do not indefinitely wait for WebTransport to fail — the fallback delay must be bounded.

---

### WebSocket Architecture

WebSockets remain widely supported and appropriate for environments where QUIC may be blocked. The architectural concern for large applications is connection management across multiple tabs.

**The SharedWorker Connection Pattern**

A naive implementation opens a separate WebSocket connection per tab. For applications with authenticated users and many open tabs, this multiplies server-side connection load proportionally. The correct architecture:

1. A `SharedWorker` holds the single WebSocket connection for the origin
2. Each tab connects to the SharedWorker via a `MessagePort`
3. The SharedWorker distributes received messages to all connected ports
4. Tabs send messages through their port; the SharedWorker sends to the server

When all tabs are closed, the SharedWorker terminates and the connection closes. When the first tab opens, the SharedWorker starts and opens the connection.

`BroadcastChannel` is simpler but cannot hold the WebSocket connection itself (it has no persistent lifecycle). For WebSocket, SharedWorker is the correct primitive. For distributing already-received messages to tabs, BroadcastChannel is sufficient and simpler.

---

### Server-Sent Events (SSE)

**MDN:** `developer.mozilla.org/en-US/docs/Web/API/EventSource`  
**Status:** Widely available

`EventSource` provides a persistent HTTP connection where the server can push events to the client. Unlike WebSockets, SSE is unidirectional (server to client only) and built on standard HTTP — it works through HTTP/2 multiplexing, proxies, and load balancers without the WebSocket upgrade negotiation.

SSE automatically reconnects with exponential backoff if the connection drops. The `Last-Event-ID` header, sent on reconnection, allows the server to replay missed events.

For applications that push updates from server to client (live dashboards, notification feeds, real-time data displays) but do not need client-to-server streaming, SSE is architecturally simpler than WebSockets and more infrastructure-compatible. The tradeoff: one SSE connection per tab (no SharedWorker equivalent), and SSE connections count against the HTTP/1.1 per-origin connection limit (6 connections) — use HTTP/2 to avoid this constraint.

---

---

# 6. storage-extended.md

## OPFS Deep Dive, FileSystemObserver, and SQLite in the Browser

### Origin Private File System (OPFS)

**Spec:** WHATWG File System Living Standard  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system`  
**Status:** Widely available across all major browsers

OPFS is a private, origin-scoped virtual file system that lives in the browser's storage quota. It is not visible to the user through the OS file browser. It provides file handles with two access modes:

**Asynchronous API (main thread)** — `FileSystemFileHandle.createWritable()` returns a `FileSystemWritableFileStream`. Operations are Promise-based. Suitable for infrequent reads and writes.

**Synchronous API (Worker only)** — `FileSystemFileHandle.createSyncAccessHandle()` returns an object with synchronous `read()`, `write()`, `flush()`, `truncate()`, and `close()` methods. These execute synchronously within a Worker, using `SharedArrayBuffer`-backed zero-copy I/O. Performance is reported at 3–4× faster than IndexedDB for raw byte throughput. The synchronous API is accessible only in Dedicated Workers and Service Workers, not the main thread.

#### OPFS as a SQLite Backend

The synchronous OPFS API is the performance primitive that enables running SQLite in a Worker in the browser. `sqlite3` compiled to WebAssembly, pointed at an OPFS file via the synchronous access handle, behaves identically to native SQLite. This provides:

- Full SQL query capability in the browser
- Relational joins, aggregates, and transactions
- WAL mode for concurrent reads
- A familiar developer experience for teams with SQL expertise
- Substantially higher query performance than IndexedDB for complex queries involving multiple object stores

The `sqlite.org/wasm` project and `wa-sqlite` are the two primary WebAssembly SQLite ports optimised for OPFS. They are not browser-native but they run entirely on the browser platform's available primitives (WASM + OPFS).

#### FileSystemObserver

**Spec:** Under active development (WHATWG `fs` repository)  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver`  
**Status:** Experimental. Available in some Chromium versions. Not yet in Firefox or Safari.

`FileSystemObserver` provides a `MutationObserver`-style interface for reacting to changes in the file system — both the OPFS and (on supported platforms) the user-visible file system. Instead of polling the file system for changes, the application registers a callback that fires when files or directories change.

For document-editing applications that use OPFS as their save format, this enables collaborative editing patterns where the application watches its own OPFS files for external modification signals.

---

---

# 7. device-platform.md

## Device APIs — Wake Lock, Idle Detection, Orientation, Gamepad, Sensors

### Screen Wake Lock API

**Spec:** W3C Screen Wake Lock  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API`  
**Status:** Baseline Newly Available as of March 2025 (all major engines)

`navigator.wakeLock.request('screen')` returns a Promise that fulfils with a `WakeLockSentinel`. While the sentinel is held, the browser instructs the OS to prevent the screen from turning off. The sentinel is released automatically when the document loses visibility (`visibilitychange` event), when the user navigates away, or when the device enters a power-saving mode.

The release event on the sentinel fires when the lock is released by any means. Applications that require continuous wake lock (a cooking app showing recipe steps, a presentation, a video player) must re-request the lock in the `release` event handler:

```js
async function requestWakeLock() {
  const sentinel = await navigator.wakeLock.request('screen');
  sentinel.addEventListener('release', () => {
    if (!document.hidden) requestWakeLock(); // re-request if still visible
  });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) requestWakeLock();
});
```

This is a rare but high-value API for specific application categories. It is the web-platform replacement for the `video { pointer-events: none }` hack that developers used to prevent screen sleep via fake video playback.

---

### Idle Detection API

**Spec:** WICG Idle Detection  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/IdleDetector`  
**Status:** Chrome/Edge only (behind Permissions Policy). Not in Firefox or Safari baseline.

`IdleDetector` monitors user inactivity: no keyboard or mouse events within a declared threshold. It reports `userState` (`'active'` or `'idle'`) and `screenState` (`'locked'` or `'unlocked'`). The permission `'idle-detection'` must be granted.

Use cases: chat presence status, auto-locking sensitive content, pausing expensive background operations when the user is not active. Not to be used for tracking user behaviour — the permission model and cross-browser gaps make this appropriate only for functional features.

---

### Gamepad API

**Status:** Widely available

`navigator.getGamepads()` returns an array of `Gamepad` objects when called inside a `requestAnimationFrame` callback (the only time the state is freshly populated). Each Gamepad reports button states (`pressed`, `value`) and axis values. The `gamepadconnected` and `gamepaddisconnected` events fire on `window` when controllers are connected/disconnected.

The polling-within-rAF model is intentional: the browser does not dispatch events for every axis change (which would be hundreds per second for analog sticks). Applications query the gamepad state in their render loop.

---

### Device Orientation and Motion

`DeviceOrientationEvent` reports the device's physical orientation (alpha, beta, gamma Euler angles) relative to the Earth's coordinate system. `DeviceMotionEvent` reports acceleration and rotation rate. Both are permission-gated on iOS (Safari). On Android, they are available without a prompt.

These APIs underpin augmented reality overlays, level/compass utilities, and gesture-based interactions. The coordinate system follows the W3C DeviceOrientation spec. Alpha is measured relative to magnetic north; beta and gamma relative to gravity.

---

---

# 8. authentication.md

## WebAuthn, Passkeys, and Credential Management API

### Web Authentication API (WebAuthn)

**Spec:** W3C Web Authentication Level 3  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API`  
**Status:** Widely available

WebAuthn is the browser-native standard for phishing-resistant, passwordless authentication. It is the web platform implementation of the FIDO2 specification. The API is accessed via `navigator.credentials.create()` (registration) and `navigator.credentials.get()` (authentication).

#### Registration

During registration, the browser generates a new asymmetric key pair on the user's authenticator (platform authenticator: Face ID, Touch ID, Windows Hello; roaming authenticator: hardware security key). The public key is sent to the server and stored. The private key never leaves the authenticator.

#### Authentication

During sign-in, the server provides a challenge (random bytes). The browser presents the authenticator (biometric prompt, security key tap). The authenticator signs the challenge with the private key. The browser sends the signature to the server. The server verifies the signature against the stored public key.

There is no credential to phish. Even if the server's public key database is stolen, there is nothing to brute-force.

#### Passkeys

Passkeys are multi-device WebAuthn credentials synced through the platform's credential manager (Apple Keychain, Google Password Manager, Windows Hello). A passkey created on one device is available on all the user's signed-in devices. From the WebAuthn API's perspective, passkeys are discoverable credentials (also called resident keys), identified by `residentKey: 'required'` in the authenticator selection criteria.

The `core.security` namespace in this architecture wraps WebAuthn for consistent integration with the application's authentication flow.

### Credential Management API (PasswordCredential)

**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Credential_Management_API`  
**Status:** Widely available (Chrome/Edge fully; limited Safari support for `store()`)

`navigator.credentials.get({ password: true })` retrieves stored credentials from the browser's password manager without displaying a UI, enabling automatic sign-in for returning users. `navigator.credentials.store(new PasswordCredential(...))` saves a credential after successful authentication.

This API bridges the web application with the browser's built-in credential storage, reducing the incentive for users to choose weak or reused passwords by making strong saved passwords frictionless to use.

---

---

# 9. observability.md

## Performance Observability — PerformanceObserver, Long Tasks, INP, CLS

### PerformanceObserver Architecture

**MDN:** `developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver`  
**Status:** Widely available

`PerformanceObserver` is the correct mechanism for measuring real-user performance in production. It subscribes to performance timeline entries as they are generated, eliminating the need to poll `performance.getEntries()`. Entries are delivered in batches to the callback to reduce overhead.

#### Entry Types and Their Significance

**`largest-contentful-paint` (LCP)**  
The render time of the largest image or text block visible in the viewport. The primary user-facing loading performance metric. Target: under 2.5 seconds. Observed via `PerformanceObserver` with `{ type: 'largest-contentful-paint', buffered: true }`. The `buffered: true` flag includes entries that occurred before the observer was registered — essential because LCP may fire early in page load before the application's observer code runs.

**`layout-shift` (CLS)**  
Cumulative Layout Shift. Reports unexpected DOM movement (elements that visually shift without user input). Each entry includes `hadRecentInput` (true if user interaction preceded the shift within 500ms) — shifts following user input are excluded from the CLS score. Summing `entry.value` for entries where `!entry.hadRecentInput` gives the cumulative CLS score.

**`event` (INP — Interaction to Next Paint)**  
Interaction to Next Paint replaced FID as a Core Web Vital in 2024. It measures the latency from the moment a user interacts (click, keydown, tap) to the next paint that reflects the interaction. `processingStart - startTime` is the input delay; `processingEnd - processingStart` is the processing time; `startTime + duration - processingEnd` is the presentation delay. The 75th percentile of all interaction durations is the INP score. Target: under 200ms.

**`longtask`**  
Any main-thread task exceeding 50ms. The attribution data (`longtask.attribution[0].name`) identifies which script or event handler caused the long task. This is the primary diagnostic entry type for identifying main-thread bottlenecks.

**`navigation`**  
Full navigation timing including DNS lookup, TCP handshake, server response time, and DOM content loaded. Used for measuring initial page load performance.

**`resource`**  
Per-resource timing for every network request. Includes cache hit detection (`transferSize === 0` for cached resources), blocking time, and connection timing. Used for identifying slow resources in the loading waterfall.

**`paint`**  
`first-paint` and `first-contentful-paint`. Baseline rendering metrics, now largely superseded by LCP for user-facing measurement.

#### Telemetry Architecture

Performance data is collected in a `Dedicated Worker` to prevent measurement overhead from affecting the main thread. The worker batches entries and sends them to the telemetry endpoint using the `Beacon API` (`navigator.sendBeacon()`) — which sends the payload asynchronously and guarantees delivery even when the page is unloading, unlike a `fetch()` call in `beforeunload`.

#### `performance.measureUserAgentSpecificMemory()`

Available in cross-origin isolated contexts (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`). Returns a snapshot of JavaScript memory usage broken down by browsing context. Used to verify that navigation between routes does not leak memory in development tooling.

---

---

# 10. css-rendering-engine.md

## CSS Engine Primitives — Containment, Content Visibility, will-change, CSS Typed OM

### CSS Containment

**Spec:** W3C CSS Containment Module Level 2  
**MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/contain`  
**Status:** Widely available

`contain` tells the browser that a subtree is independent of the rest of the document for layout, style, paint, or size purposes. This allows the browser to skip recalculation steps for the rest of the document when only the contained subtree changes.

Values and their effects:

- `layout` — The element's children do not affect the layout of elements outside it. Float elements and absolutely positioned children are contained within.
- `style` — Counter increments and quotes are scoped to the element.
- `paint` — The element's children do not render outside its border box. The element creates a stacking context. Renders the element as an independent paint layer.
- `size` — The element's size is not determined by its contents. Used with `contain-intrinsic-size` to provide a declarative size hint.
- `strict` — Equivalent to `layout style paint size` — maximum isolation.
- `content` — Equivalent to `layout style paint` — size-preserving isolation.

### `content-visibility: auto`

**Spec:** W3C CSS Containment Module Level 2  
**Status:** Widely available (Chrome 85+, Firefox 125+, Safari 18+)

`content-visibility: auto` instructs the browser to skip rendering (layout, paint, compositing) for elements not in the viewport, while preserving their layout footprint via `contain-intrinsic-size`. This is native virtualisation at the CSS engine level — requiring zero JavaScript.

For long-form content pages, document editors, feed-style UIs, and any page with large off-screen content areas, adding `content-visibility: auto; contain-intrinsic-size: auto 300px` to major sections can reduce initial render time by 50–70% by deferring off-screen rendering.

The `auto` value also creates a containment context, qualifying elements for container queries. Combined with `@layer`, `@scope`, and Shadow DOM, `content-visibility` completes the native CSS rendering optimisation toolkit.

### `will-change`

`will-change: transform` (or `opacity`) promotes an element to a compositor layer, enabling GPU-accelerated animations for that property without triggering layout or paint. Apply it immediately before an animation begins and remove it immediately after to avoid holding unnecessary compositor layers in memory.

### CSS Logical Properties

`margin-inline-start`, `padding-block-end`, `border-inline`, `inline-size`, `block-size` — the logical property equivalents of physical properties use start/end/inline/block axes, making styles automatically correct for both LTR and RTL text directions. All new layout code should use logical properties exclusively. Physical properties (`margin-left`, `width`) should only appear where the physical direction is intentional regardless of writing mode.

---

---

# 11. push-and-notifications.md

## Push API, Notification API, and VAPID

### Push API Architecture

**Spec:** W3C Push API  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Push_API`  
**Status:** Widely available (Chrome, Firefox, Edge, Safari 16+)

The Push API enables server-to-client notifications delivered even when the web application is not open. The full stack:

1. **Client subscribes**: The Service Worker's `PushManager.subscribe()` generates a `PushSubscription` containing an endpoint URL, p256dh public key, and auth secret. This subscription is sent to the application server.
2. **Server sends**: The server sends a POST request to the endpoint URL with the notification payload, encrypted using the p256dh key and auth secret (Web Push Protocol, RFC 8030). VAPID (Voluntary Application Server Identification) headers authenticate the server to the push service.
3. **Push service delivers**: The browser's push service (FCM for Chrome, Mozilla Push Service for Firefox, Apple Push Notification Service for Safari) delivers the notification to the browser.
4. **Service Worker wakes**: The `push` event fires in the Service Worker, even if no tabs are open. The SW decrypts the payload and calls `registration.showNotification()`.

#### iOS/Safari Push Notes

Safari on iOS requires the site to be installed as a Home Screen PWA and uses Apple Push Notification Service. The subscription endpoint is an Apple domain. VAPID is required. The same API surface works across all platforms, but the underlying push infrastructure differs. Test across all three major push services.

---

### Notification API

`registration.showNotification(title, options)` creates a native OS notification from the Service Worker context. Options include `body`, `icon`, `badge`, `image`, `tag` (for replacing/updating a notification), `renotify`, `requireInteraction`, `actions` (interactive buttons), `data` (arbitrary payload for `notificationclick` handling), and `vibrate`.

The `notificationclick` event fires in the Service Worker when the user clicks the notification or one of its actions. The SW can open a URL via `clients.openWindow()` or focus an existing tab via `clients.matchAll()`.

Notification permission must be requested via `Notification.requestPermission()` from a user gesture context. Requesting permission without a clear trigger (not in response to a user action that implies notification intent) results in low grant rates and browser-level demotion. Request permission contextually, only at the moment the user indicates they want notifications.

---

---

# 12. platform-integration.md

## Payment Request, Web Share, Badging, Protocol Handlers, and Contact Picker

### Payment Request API

**Spec:** W3C Payment Request  
**Status:** Widely available (Chrome, Edge, Safari, Firefox partial)

`PaymentRequest` provides a standardised browser UI for collecting payment information. The browser retrieves saved cards and digital wallets (Apple Pay, Google Pay) and presents them in a native sheet. The application receives a `PaymentResponse` containing the payment token; no raw card numbers are handled by the application.

Payment Request reduces checkout friction — studies consistently show that fewer form fields and native payment UIs increase conversion rates. The API supports multiple payment methods, shipping address collection, and line item display. Integration requires a server-side payment processor to tokenise and charge the payment method.

### Web Share API

**Status:** Widely available on mobile (Chrome Android, Safari iOS/macOS 12.1+). Limited on desktop.

`navigator.share({ title, text, url, files })` opens the OS-native share sheet with the specified content. This enables "Share" functionality that integrates with the user's installed apps (messaging, email, social) without implementing any custom share UI. On desktop Chrome, it opens a sharing dialog. On Safari, it opens the native macOS share sheet.

`navigator.canShare({ files })` checks whether the specific share payload (including files) is supported before calling `share()`.

### App Badging API

**Status:** Widely available for installed PWAs

`navigator.setAppBadge(count)` sets a numeric badge on the app icon in the OS taskbar/dock (for installed PWAs). `navigator.clearAppBadge()` removes it. Used for unread message counts, pending action counts. No notification permission required — the badge is tied to the PWA installation.

### Protocol Handler Registration

`navigator.registerProtocolHandler(scheme, url)` registers the web application to handle custom URL schemes (e.g., `web+myapp://`) or standard email/calendar schemes (`mailto:`, `webcal:`). Clicking a `mailto:` link in the browser can open the web-based email client if it has registered the handler.

---

---

# 13. module-system.md

## Import Maps, Module Workers, CSS Modules, and JSON Modules Deep-Dive

### Import Maps

**Spec:** WHATWG HTML Living Standard — Import Maps  
**Status:** Widely available (Chrome 89+, Firefox 108+, Safari 16.4+)

Import Maps resolve bare module specifiers in the browser without a bundler:

```html
<script type="importmap">
{
  "imports": {
    "lodash": "https://cdn.skypack.dev/lodash-es@4.17.21",
    "@app/core": "/src/core/index.js",
    "@app/ui/": "/src/ui/"
  },
  "scopes": {
    "/legacy/": {
      "lodash": "https://cdn.skypack.dev/lodash@3.10.1"
    }
  }
}
</script>
```

**`imports`** — Global specifier mappings. A trailing `/` in both key and value maps a path prefix, resolving all `@app/ui/button` imports to `/src/ui/button`.

**`scopes`** — Specifier mappings scoped to a URL prefix. Modules under `/legacy/` resolve `lodash` to a different version than the global mapping. This enables co-existing versions of a dependency for gradual migration.

#### Multiple Import Maps

Chrome 136+ supports multiple `<script type="importmap">` elements in a document. They are merged. Previously, only one was allowed. This is significant for micro-frontend architectures where each component team may need to contribute import map entries.

#### Import Maps in Workers

Import maps are inherited by `Worker` and `SharedWorker` contexts created from a page that has an import map. Service Workers do not inherit the page's import map — they use their own registration scope. An explicit import map for the SW context is a current specification gap; the SW must use fully-qualified URLs or a module bundler.

#### Production Strategy

For development: serve the source Import Map directly. For production: generate a precomputed Import Map from the same dependency graph, mapping specifiers to content-hash-versioned URLs. The Import Map is the versioning mechanism; no bundler is required for cache busting.

### Module Workers

`new Worker('./worker.js', { type: 'module' })` creates a Worker that uses the ES Module system, with `import` / `export` syntax, Import Map inheritance, and dynamic `import()` support. This is now the recommended approach for all new Workers; classic Workers with `importScripts()` are legacy.

### CSS Modules (Import Attributes)

**Status:** Chrome 123+, behind `with { type: 'css' }`. Not yet in Firefox or Safari for `<link>` + import.

```js
import sheet from './component.css' with { type: 'css' };
document.adoptedStyleSheets.push(sheet);
```

CSS Modules import a stylesheet as a `CSSStyleSheet` object that can be applied to a document or Shadow Root via `adoptedStyleSheets`. Combined with Shadow DOM's `adoptedStyleSheets`, this is the module-system-native approach to per-component CSS without `<style>` tags or string injection.

### JSON Modules

```js
import data from './config.json' with { type: 'json' };
```

Available in Chrome 123+. Imports a JSON file as a parsed JavaScript object. Type-safe, cached by the module system.

---

---

# 14. advanced-networking.md

## Fetch Priority, Resource Hints, Navigation Preload, and Beacon API

### Fetch Priority API

**Spec:** WICG Priority Hints  
**Status:** Chrome 101+, Firefox 132+, Safari 17.2+. Approaching Baseline.

The `fetchpriority` attribute on `<img>`, `<link>`, and `<script>` elements, and the `priority` option in the `RequestInit` dictionary for `fetch()`, allows declaring the relative priority of a resource request:

- `fetchpriority="high"` — Fetch this resource before others at the same priority level. Use for LCP images.
- `fetchpriority="low"` — Defer this resource behind default-priority resources. Use for below-the-fold images, non-critical scripts.
- `fetchpriority="auto"` — Default browser heuristic.

This is distinct from `loading="lazy"` (which defers fetching until near the viewport) — `fetchpriority` affects the order of resources that are all already queued for fetch. Correctly prioritising the LCP image via `fetchpriority="high"` is one of the most impactful single-attribute LCP improvements.

### Resource Hints

**`<link rel="preload">`** — Fetch a resource at high priority before it is discovered in the normal parsing flow. Use for fonts, critical images, and late-discovered JS/CSS. Specify `as` attribute for correct cache key and priority.

**`<link rel="modulepreload">`** — Fetch an ES Module and its transitive imports before they are needed. The browser evaluates the module graph and preloads all dependencies. Critical for SPA route prefetching during idle time.

**`<link rel="prefetch">`** — Fetch a resource at idle priority for a future navigation. Browser uses its bandwidth for this — safe to use liberally.

**`<link rel="preconnect">`** — Establish TCP/TLS connection to a third-party origin early. Use for critical API endpoints and CDNs.

**`<link rel="dns-prefetch">`** — Resolve DNS for an origin early, without establishing the connection. Cheaper than `preconnect`; fallback for origins the app may connect to but not certainly will.

### Navigation Preload

Navigation Preload allows Service Worker fetch interception to run in parallel with the navigation request, rather than waiting for the SW to activate before the request starts. `event.preloadResponse` in the `fetch` event handler returns the preloaded response.

For SSR pages where the SW cannot serve from cache, enabling Navigation Preload eliminates the SW startup latency from the navigation critical path — a latency of 10–100ms that was otherwise unavoidable.

```js
// In service worker install:
self.addEventListener('activate', e => {
  e.waitUntil(self.registration.navigationPreload.enable());
});

// In fetch handler:
self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      return e.preloadResponse ?? fetch(e.request);
    })());
  }
});
```

### Beacon API

`navigator.sendBeacon(url, data)` sends a small asynchronous POST request that the browser guarantees to complete even if the page is being unloaded. Unlike `fetch()` in a `beforeunload` handler (which is often cancelled), `sendBeacon` is queued at the OS level. Use for telemetry, analytics, and performance data sent when the user is leaving the page.

---

---

# 15. design-tokens-system.md

## Complete Native Design Token Architecture

### The Token Hierarchy

Design tokens — the named, semantically meaningful values (colors, spacing, typography, motion) that constitute a design system's vocabulary — are implemented natively in CSS using custom properties and `@property`. No build step, no token file preprocessor, no runtime library.

The token architecture has three tiers:

**Tier 1: Primitive Tokens**  
Raw values. Named by their value, not their usage. These rarely appear directly in component styles.

```css
@layer tokens {
  :root {
    /* Color palette */
    --color-blue-50:  hsl(214 100% 97%);
    --color-blue-500: hsl(214 100% 50%);
    --color-blue-900: hsl(214 80% 15%);
    
    /* Spacing scale */
    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-4: 1rem;
    --space-8: 2rem;
    
    /* Type scale */
    --text-sm: 0.875rem;
    --text-base: 1rem;
    --text-xl: 1.25rem;
    --text-3xl: 1.875rem;
    
    /* Radius scale */
    --radius-sm: 0.25rem;
    --radius-md: 0.5rem;
    --radius-full: 9999px;
  }
}
```

**Tier 2: Semantic Tokens**  
Reference primitive tokens by usage context. These are what component styles consume. Semantic tokens enable theming because only this tier changes between themes — component styles remain the same.

```css
@layer tokens {
  :root {
    /* Surfaces */
    --surface-default:  var(--color-white);
    --surface-raised:   var(--color-grey-50);
    --surface-overlay:  var(--color-grey-100);
    
    /* Content */
    --content-primary:   var(--color-grey-900);
    --content-secondary: var(--color-grey-600);
    --content-disabled:  var(--color-grey-400);
    
    /* Interactive */
    --interactive-primary:         var(--color-blue-500);
    --interactive-primary-hover:   var(--color-blue-600);
    --interactive-primary-active:  var(--color-blue-700);
    
    /* Feedback */
    --feedback-error:   var(--color-red-600);
    --feedback-success: var(--color-green-600);
    --feedback-warning: var(--color-amber-500);
    
    /* Motion */
    --duration-fast:    150ms;
    --duration-normal:  250ms;
    --duration-slow:    400ms;
    --easing-standard:  cubic-bezier(0.4, 0, 0.2, 1);
    --easing-enter:     cubic-bezier(0, 0, 0.2, 1);
    --easing-exit:      cubic-bezier(0.4, 0, 1, 1);
  }
}
```

**Tier 3: Component Tokens**  
Per-component custom properties declared on the `:host` of each Web Component. Consumers customise a component exclusively through its declared component tokens. Component tokens reference semantic tokens as defaults, but can be overridden directly.

```css
/* Inside the button component's shadow root */
:host {
  --button-bg:            var(--interactive-primary);
  --button-color:         var(--on-interactive-primary, white);
  --button-radius:        var(--radius-md);
  --button-padding-y:     var(--space-2);
  --button-padding-x:     var(--space-4);
  --button-transition:    background-color var(--duration-fast) var(--easing-standard);
}
```

### Dark Mode Architecture

Dark mode is implemented by re-declaring semantic tokens inside a `[data-theme="dark"]` attribute scope or a `@media (prefers-color-scheme: dark)` block. Component styles are unchanged. Only the semantic token values change:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --surface-default:  var(--color-grey-900);
    --content-primary:  var(--color-grey-50);
    --interactive-primary: var(--color-blue-400);
  }
}
```

User-overridable themes apply the same token re-declarations to a `[data-theme]` attribute on `<html>`. JavaScript toggles the attribute; CSS handles everything else.

### Registered Properties for Animated Tokens

Color and numeric tokens used in transitions are registered via `@property` to enable smooth interpolation:

```css
@property --brand-hue {
  syntax: '<angle>';
  inherits: true;
  initial-value: 214deg;
}

:root {
  transition: --brand-hue var(--duration-slow) var(--easing-standard);
}
```

Changing `--brand-hue` on `:root` now animates, and all components that derive their colours from `hsl(var(--brand-hue) ...)` animate with it. This enables animated theme transitions at zero JavaScript cost.

---

---

# 16. accessibility-platform.md

## Accessibility — ARIA, ElementInternals, AOM, and Shadow DOM

### ElementInternals and FormAssociated Custom Elements

Custom elements that participate in forms must use `attachInternals()` to receive an `ElementInternals` object. Through this object, the element:

- Sets its form value (`internals.setFormValue(value)`)
- Sets validity state and custom validity messages (`internals.setValidity(flags, message, anchor)`)
- Gets form context (`internals.form`, `internals.labels`)
- Sets default ARIA role and attributes (`internals.role`, `internals.ariaLabel`, etc.)

The last point is important: `ElementInternals` exposes an `ARIAMixin` that sets ARIA attributes as reflecting IDL attributes rather than content attributes. This allows the element to have a default ARIA role that component consumers can override via the content attribute on the host element.

### Accessible Name Computation in Shadow DOM

The Accessible Name Computation algorithm (AccName) follows the flat tree — it traverses composed shadow trees. This means:

- A `<label>` in the light DOM can reference an input inside a shadow DOM by `id` if the shadow root is `open` (this is an active area of specification work; current browser support varies)
- `aria-labelledby` references must be to elements in the same tree scope (same document or same shadow root) — cross-shadow references are not yet reliable
- `aria-describedby` has the same constraint
- ARIA roles defined on the shadow host via `role` attribute are reflected into the accessibility tree at the host element position

For form labels inside Shadow DOM, the current reliable pattern is to use `internals.ariaLabel` or `internals.setValidity()` for error messages, rather than attempting cross-shadow `aria-*` relationships.

### Accessibility Object Model (AOM)

The AOM is a developing specification that provides JavaScript access to the accessibility tree, enabling:

- Setting ARIA properties as JS properties rather than HTML attributes (`el.ariaLabel = 'Close'`)
- Associating accessible relationships (label, described-by) between elements in different shadow roots programmatically
- Querying the computed accessible role and name of any element

As of mid-2026, the IDL ARIA attribute reflecting properties (e.g., `element.ariaLabel`, `element.ariaChecked`) are widely available. The cross-root ARIA association API (`ARIAMixin.ariaLabelledByElements`) is experimental and Chromium-only.

---

---

# 17. testing-architecture.md

## Testing Native Web Components — Architecture and Tooling

### The Core Challenge

Web Components require a real browser DOM environment for testing — `jsdom` (used by Jest) does not fully implement Shadow DOM, Custom Elements lifecycle callbacks, or CSS custom properties. Tests that run in jsdom for framework-based components need to be replaced with tests running in a real browser environment.

### web-test-runner

`@web/test-runner` runs tests in Chromium (via Playwright or Puppeteer) or all browsers simultaneously. It supports ES Modules, Import Maps, Shadow DOM, and all browser APIs natively. Tests are written with any assertion library (Chai, native `assert`) and describe/it syntax.

Critically, it understands the module graph: it imports the component module, the browser registers the Custom Element, and the test manipulates real DOM nodes with real Shadow DOM. This is the only category of test that validates Web Component behaviour correctly.

### @open-wc/testing

The `@open-wc/testing` package provides Chai-based assertion helpers specific to Web Components: `fixture()` (renders a component in an isolated container and waits for its first update), `elementUpdated()` (waits for the component to complete asynchronous rendering), and DOM-aware assertions (`expect(el).to.have.attribute(...)`, `expect(el).shadowDom.to.equal(...)`).

### Component Testing Strategy

- **Unit tests**: Test pure state logic (store mutators, router matching logic, utility functions) in Node.js without a browser
- **Component tests**: Test each Custom Element in a real browser via web-test-runner, covering: attribute reflection, event emission, slot content projection, Shadow DOM structure, ARIA state
- **Integration tests**: Test route-level compositions via Playwright end-to-end, exercising the full stack including Service Worker, IndexedDB, and network
- **Visual regression**: Screenshot comparison via Playwright for design system components — the CSS isolation of Shadow DOM makes visual regression tests stable since external CSS cannot interfere with component rendering

---

---

# 18. project-structure.md

## Project Structure, Module Conventions, and Toolchain Philosophy

### Directory Layout

```
project-root/
├── index.html              # Application shell — Import Map, SW registration
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # Service Worker entry point
│
├── core/                   # Internal platform API layer
│   ├── api/                # Networking — fetch, streams, retries, interceptors
│   ├── animations/         # WAAPI utilities, View Transition helpers
│   ├── events/             # Event bus, delegation utilities
│   ├── offline/            # SW messaging, sync queue management
│   ├── platform/           # Feature detection, polyfill guards
│   ├── router/             # Navigation API, URLPattern route matching
│   ├── security/           # SubtleCrypto, Permissions, Sanitizer wrappers
│   ├── state/              # Reactive store — Proxy, EventTarget
│   ├── storage/            # Unified IndexedDB, Cache API, OPFS façade
│   ├── ui/                 # Component base classes, scheduling, observers
│   └── workers/            # Worker lifecycle, BroadcastChannel, SharedWorker
│
├── components/             # Reusable UI components
│   ├── base/               # Base HTMLElement extension with lifecycle helpers
│   ├── forms/              # Form-associated custom elements
│   ├── navigation/         # Router-outlet, nav-link, breadcrumb
│   └── [component-name]/   # Each component in its own directory
│       ├── index.js        # Custom Element class + registration
│       ├── template.html   # Declarative Shadow DOM template (if SSR)
│       └── styles.css      # Component styles (imported via CSS Modules)
│
├── routes/                 # Route modules — lazy-loaded
│   └── [route-name]/
│       ├── index.js        # Route handler + top-level component
│       └── [sub-route]/    # Nested routes
│
├── stores/                 # Application state stores
│   └── [domain].store.js   # One store per domain
│
├── tokens/                 # Design tokens
│   ├── primitive.css       # Tier 1 tokens
│   ├── semantic.css        # Tier 2 tokens
│   └── motion.css          # Animation timing tokens
│
└── workers/                # Dedicated and Shared Worker scripts
    ├── sync.worker.js      # Background sync queue processor
    ├── telemetry.worker.js # Performance data collection
    └── codec.worker.js     # WebCodecs media processing
```

### Module Conventions

- All modules are ES Modules (`type="module"`)
- No default exports — named exports only, for consistent import syntax and better tree-shaking
- No circular imports — enforced by ESLint `import/no-cycle`
- Cross-layer imports directed downward only — `routes` may import `components` and `core`, but `core` never imports from `routes`
- Side effects in module scope are prohibited — modules must be safe to import without observable effects
- All event subscriptions accept an `AbortSignal` parameter

### Toolchain Philosophy

This architecture is designed to be usable without a build step for development. The toolchain, where used, is a thin layer:

**Development**: Vite (ES Module passthrough dev server, HMR). No transpilation, no bundling. The browser runs the source files directly. Import Maps are served as-is.

**Production**: Rollup or Vite build produces: a content-hash-versioned module graph, a generated Import Map pointing to the versioned modules, and a prebuilt Service Worker with the asset manifest. No framework-specific compilation steps, no JSX, no TypeScript compilation in the app layer (TypeScript is used for type-checking only, with `isolatedModules: true` and source-file-level type declarations for Custom Elements).

**Testing**: `@web/test-runner` with Playwright. No Jest, no jsdom, no JSDOM hacks.

---

---

# 19. interoperability.md

## Embedding, Progressive Enhancement, and Integration Patterns

### Embedding Web Components in Existing Applications

Web Components are framework-agnostic by design. A Custom Element registered in the browser can be used in:

- **React** — with `ref` for programmatic access, standard event props for native event listeners (noting that React 19 restored native event support in custom elements)
- **Vue** — natively; Vue's template compiler treats unknown elements as custom elements and passes props/events correctly
- **Angular** — with `CUSTOM_ELEMENTS_SCHEMA` or automatically via standalone components
- **Server-rendered HTML** — with Declarative Shadow DOM for SSR without JavaScript hydration

The public API of each component (observed attributes, properties, events, slots) is the integration contract. Framework-specific integration wrappers should be thin and auto-generated where possible.

### Incremental Adoption Strategy

For existing applications adopting this architecture progressively:

1. **Phase 1**: Introduce `core/api/*` for new network calls. No component changes.
2. **Phase 2**: Replace new UI features with Custom Elements. Existing framework components remain.
3. **Phase 3**: Introduce `core/router/*` for new route additions. Coexist with the existing router via URL namespace partitioning.
4. **Phase 4**: Introduce Service Worker. Cache new routes only. Expand cache scope progressively.
5. **Phase 5**: Replace legacy framework components as they are next scheduled for rework.

---

---

# 20. future-roadmap.md

## In-Flight Proposals and Emerging Platform Capabilities

### TC39 — JavaScript Language Pipeline

**Signals (Stage 2)** — Standardised reactive primitives. `Signal.State`, `Signal.Computed`. Anticipated to reach Stage 3 in 2026–2027. Will provide a common interface for reactivity that framework libraries and this architecture's state layer can converge on.

**Import Defer** — `import defer * as ns from './module.js'` — defers evaluation of a module until first property access. Reduces startup cost for rarely-used modules that must be in the import graph. `es-module-shims` already polyfills this via syntax stripping.

**Import Attributes (now ES2025)** — `import data from './config.json' with { type: 'json' }`. Standardised; shipping in Chrome 123+, Firefox 133+.

**Decorators (Stage 3+)** — Class decorators enabling custom element attribute observation declarations without boilerplate. Framework authors (Lit) use a custom compiler step; native decorators would eliminate this.

### WICG / W3C Incubations

**Shared Element Transitions (View Transitions Level 2 for SPAs)** — Cross-component shared element animations where the same `view-transition-name` exists on both the outgoing and incoming element. Enables fluid "hero" element animations (an item card morphing into a detail view header) entirely in CSS.

**CSS `if()` function** — Inline conditional values in CSS without @media or custom property tricks. `color: if(style(--theme) = dark : white; else : black)`. In active development, not yet Baseline.

**Invokers / Command API** — A generalisation of `popovertarget` that extends the declarative action system to arbitrary behaviours: `commandfor="dialog-id" command="showModal"`. Eliminates JavaScript for common interactive patterns.

**`interest-target` attribute** — Declarative hover-intent prefetching and popover showing. An anchor or button with `interesttarget="popover-id"` shows the popover on hover with platform-managed debounce. No JavaScript, no IntersectionObserver hacks for hover cards.

**Document Picture-in-Picture** — `documentPictureInPicture.requestWindow()` opens a floating window containing arbitrary web content (not just video). Enables persistent floating panels, video call UI, and dashboards that remain visible while the user works in other tabs.

**Local AI APIs** — `window.ai.languageModel()`, `window.ai.summarizer()`, `window.ai.translator()` — browser-native access to on-device language models without network requests. Available in Chrome 127+ via Origin Trial. The architecture's `core.ai` namespace (future module) will expose these with fallback to server-side AI when unavailable.

**CSS `@when` / `@else`** — Conditional at-rule grouping, extending `@media`, `@supports`, and `@container` with boolean logic. Simplifies complex responsive/feature-conditional stylesheets.

**Scroll Snap Events** — `scrollsnapchanging` and `scrollsnapchange` events fire as the user snaps between snap positions, enabling JavaScript reactions to native scroll snap without polling.

---

### Cross-Platform Gap Closure — Interop 2026 Focus Areas

The Interop project (joint annual commitment by Apple, Google, Mozilla, Microsoft to interoperability) has historically been the most reliable predictor of which features will achieve Baseline. Areas on the 2025–2026 interop roadmap that directly affect this architecture:

- **CSS Anchor Positioning** — Achieved Baseline 2026
- **Scroll-Driven Animations** — Firefox implementation in progress; Baseline expected 2026
- **View Transitions Level 2 (cross-document)** — Firefox and Safari implementations in progress
- **WebTransport** — Achieved Baseline March 2026
- **Customisable Select** — Cross-browser implementation underway
- **Navigation API** — Achieved Baseline January 2026
- **Popover API** — Achieved Baseline January 2025

The trajectory is clear: the native web platform is converging toward feature completeness for production application development. The case for framework overhead weakens with each Interop cycle.

---

*End of Native-First Web Platform Architecture — Volume 2*

---

**Extended References:**

- W3C CSS View Transitions Module Level 2: `drafts.csswg.org/css-view-transitions-2/`
- W3C CSS Scroll-Driven Animations Level 1: `drafts.csswg.org/scroll-animations-1/`
- W3C CSS Anchor Positioning Level 1: `drafts.csswg.org/css-anchor-position-1/`
- W3C CSS Cascade Level 5 (@layer): `drafts.csswg.org/css-cascade-5/`
- W3C CSS Containment Level 2: `drafts.csswg.org/css-contain-2/`
- W3C WebCodecs: `w3.org/TR/webcodecs/`
- W3C WebTransport: `w3c.github.io/webtransport/`
- W3C Web Authentication Level 3: `w3c.github.io/webauthn/`
- W3C Payment Request: `w3.org/TR/payment-request/`
- W3C Push API: `w3.org/TR/push-api/`
- W3C Screen Wake Lock: `w3c.github.io/screen-wake-lock/`
- W3C Web Cryptography API Level 2: `w3c.github.io/webcrypto/`
- WHATWG File System Living Standard: `fs.spec.whatwg.org/`
- MDN — CSS Houdini APIs: `developer.mozilla.org/en-US/docs/Web/API/Houdini_APIs`
- MDN — CSS Scroll-Driven Animations: `developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations`
- MDN — CSS Anchor Positioning: `developer.mozilla.org/en-US/docs/Web/CSS/Guides/Anchor_positioning/Using`
- MDN — Popover API: `developer.mozilla.org/en-US/docs/Web/API/Popover_API`
- MDN — WebCodecs: `developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API`
- MDN — WebTransport: `developer.mozilla.org/en-US/docs/Web/API/WebTransport_API`
- MDN — IdleDetector: `developer.mozilla.org/en-US/docs/Web/API/IdleDetector`
- MDN — Screen Wake Lock: `developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API`
- MDN — FileSystemObserver: `developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver`
- MDN — ScrollTimeline: `developer.mozilla.org/en-US/docs/Web/API/ScrollTimeline`
- MDN — ViewTimeline: `developer.mozilla.org/en-US/docs/Web/API/ViewTimeline`
- MDN — Web Animations API Concepts: `developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Web_Animations_API_Concepts`
- MDN — PerformanceObserver: `developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver`
- TC39 Signals Proposal: `github.com/tc39/proposal-signals`
- TC39 Import Defer Proposal: `github.com/tc39/proposal-defer-import-eval`
- WICG Invokers: `github.com/WICG/invokers`
- WICG Interest Invokers: `github.com/WICG/interest-invokers`
- Interop 2025 Dashboard: `wpt.fyi/interop-2025`
- InfoQ — Navigation API Baseline 2026: `infoq.com/news/2026/05/navigation-api-browser`
- CSS Anchor Positioning Baseline 2026: `pockit.tools/blog/css-anchor-positioning-api-complete-guide`
- web.dev — Popover and Dialog: `web.dev/learn/css/popover-and-dialog`
- RxDB — OPFS Storage: `rxdb.info/rx-storage-opfs.html`
- Shopify Speculation Rules: `performance.shopify.com/blogs/blog/speculation-rules-at-shopify`