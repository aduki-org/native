## Rendering Architecture

**Version:** 1.0  
**Status:** Working Specification  
**Date:** May 2026  
**Authority:** MDN Web Docs, WHATWG Living Standard, W3C CSS View Transitions Module Level 1 and Level 2, W3C CSS Containment Module

---

## Table of Contents

1. [Conceptual Foundation](#1-conceptual-foundation)
2. [Shadow DOM as the Rendering Boundary](#2-shadow-dom-as-the-rendering-boundary)
3. [CSS Custom Properties as the Theming Primitive](#3-css-custom-properties-as-the-theming-primitive)
4. [HTML Templates and Cloning](#4-html-templates-and-cloning)
5. [The Rendering Pipeline](#5-the-rendering-pipeline)
6. [Rendering Scheduling](#6-rendering-scheduling)
7. [Forced Layout and the Read-Write Discipline](#7-forced-layout-and-the-read-write-discipline)
8. [Composited Layers and will-change](#8-composited-layers-and-will-change)
9. [View Transitions API](#9-view-transitions-api)
10. [Incremental and Partial Rendering](#10-incremental-and-partial-rendering)
11. [Slot Composition and the Flat Tree](#11-slot-composition-and-the-flat-tree)
12. [Declarative Shadow DOM and Server-Side Rendering](#12-declarative-shadow-dom-and-server-side-rendering)
13. [Direct DOM Mutation vs Virtual DOM](#13-direct-dom-mutation-vs-virtual-dom)
14. [Web Animations API](#14-web-animations-api)
15. [Rendering and Memory: The Lifecycle Contract](#15-rendering-and-memory-the-lifecycle-contract)
16. [core.ui — Rendering Utilities](#16-coreui--rendering-utilities)
17. [Rendering Decision Reference](#17-rendering-decision-reference)

---

## 1. Conceptual Foundation

The browser's rendering engine is not a canvas or a passive display layer. It is a fully specified, hardware-accelerated, accessibility-aware layout and compositing system that has been optimised by browser vendors over decades. The central principle of this architecture's rendering model is that every rendering task should be delegated to the platform wherever the platform is capable of performing it — and the platform's capabilities are substantially larger than most application-level code assumes.

This means the following posture governs every rendering decision:

The browser's layout engine, compositor, and style recalculation pipeline run on highly optimised C++ paths. Any JavaScript-driven equivalent — a virtual DOM differ, a manual layout computation, a JavaScript-driven animation loop — incurs overhead that the platform path does not. The burden of justification falls on the JavaScript path, not the platform path.

This document describes the rendering architecture of this system: how components are structured, how styles are scoped, how DOM mutations are timed, how transitions are animated, and how large lists are handled — all without delegating any of these concerns to a third-party rendering library.

---

## 2. Shadow DOM as the Rendering Boundary

**Spec:** WHATWG HTML Living Standard — Shadow DOM  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM`  
**Status:** Baseline — Widely Available

Each Custom Element owns a Shadow DOM: an encapsulated DOM subtree attached to the element's shadow root via `attachShadow({ mode: 'open' })`. The shadow root is the architectural rendering unit of this system. Everything that component renders lives inside it.

Shadow DOM enforces three isolation properties that are fundamental to a scalable component architecture:

**Style encapsulation.** CSS defined inside a shadow root applies only to nodes within that shadow root. External stylesheets have no effect on shadow-root-internal nodes except through the mechanisms specifically designed to cross shadow boundaries (CSS custom properties and `::part()`). This eliminates all specificity conflicts between components and removes the need for any CSS naming convention, CSS Modules, or CSS-in-JS solution to achieve style isolation. The platform provides this for free.

**DOM encapsulation.** `document.querySelector()` does not pierce shadow roots. External JavaScript cannot inadvertently select or manipulate a component's internal nodes. This ensures that component internals are truly private and that a component's rendered state cannot be corrupted by external code outside of the component's own lifecycle methods.

**Rendering independence.** The browser's style recalculation algorithm treats shadow roots as isolated subtrees for style resolution. A style change inside one shadow root does not trigger style invalidation across unrelated components. At scale, this is a meaningful rendering performance property.

The mode is `open` throughout this architecture. A closed shadow root (`mode: 'closed'`) prevents even the component's own external code from accessing `element.shadowRoot`, which creates debugging friction and integration problems without a meaningful security benefit in a same-origin application. Closed mode is not used.

---

## 3. CSS Custom Properties as the Theming Primitive

**Spec:** W3C CSS Custom Properties for Cascading Variables Module Level 1  
**MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties`  
**Status:** Baseline — Widely Available

CSS custom properties are the only CSS values that inherit through shadow boundaries. A custom property defined on a parent element in the light DOM is readable inside any descendant's shadow root via the standard cascade. This makes custom properties the correct and only necessary mechanism for design tokens, theming, and visual API contracts.

Every component in this system exposes its visual API as a set of documented CSS custom properties. The component's shadow root stylesheet reads these properties using `var()` with fallback defaults:

```css
:host {
  display: block;
  background-color: var(--surface-color, #ffffff);
  color: var(--on-surface-color, #1a1a1a);
  border-radius: var(--radius-md, 4px);
  padding: var(--spacing-md, 12px);
  font-family: var(--font-body, system-ui, sans-serif);
}
```

A component's internal implementation is entirely private. Its external visual contract is entirely described by its documented custom properties. No consumer of a component needs to know or care how its shadow DOM is structured.

At the application level, a theme is a flat set of custom property declarations on `:root`. Switching themes is a single DOM operation — replacing or toggling a class on the document root that activates a different set of custom property values. There is no JavaScript runtime cost and no re-render required; the cascade propagates the new values to all shadow roots automatically at the CSS engine level.

This approach is the web platform's native equivalent of a design token system. No library is required to implement it.

**Custom properties and `@property`**

The `@property` at-rule (part of the CSS Properties and Values API) allows custom properties to be registered with a syntax, initial value, and inheritance flag. A registered property participates in CSS transitions and animations, which unregistered properties do not. For any custom property that will be animated (colour themes, spacing transitions), registration via `@property` is required.

---

## 4. HTML Templates and Cloning

**Spec:** WHATWG HTML Living Standard — The `template` element  
**MDN:** `developer.mozilla.org/en-US/docs/Web/HTML/Element/template`  
**Status:** Baseline — Widely Available

The `<template>` element holds an inert DOM fragment. Content inside a `<template>` is parsed once by the browser during initial document parsing but is not rendered, does not fire subresource requests, and is not processed by the style engine until explicitly cloned and inserted into a live document.

This parsing behaviour is the source of the performance advantage. When a component is instantiated, it clones the pre-parsed template rather than re-parsing HTML from a string or constructing a tree via sequential `createElement()` calls. The cloning operation is a structured data copy of an already-parsed node tree — it is significantly faster than either alternative, and the cost advantage compounds for components instantiated many times.

The canonical instantiation pattern is:

```js
const template = document.getElementById('my-component-template');
const fragment = template.content.cloneNode(true);
this.shadowRoot.appendChild(fragment);
```

`cloneNode(true)` produces a deep clone including all descendant nodes. The resulting `DocumentFragment` is appended to the shadow root in a single operation, which triggers a single style recalculation rather than one per node.

**Template placement**

Templates used by a component are defined in the component's HTML file, adjacent to its module script, or in the application shell HTML. They are never dynamically constructed from string templates in JavaScript. Dynamic content is applied after cloning by selecting specific elements within the clone and setting their `textContent`, `dataset`, or attributes via the DOM API — never via `innerHTML`.

This discipline is not only a performance consideration. It is also the primary mechanism by which the system avoids innerHTML-based XSS vulnerabilities. All dynamic values enter the rendered tree through typed DOM API setters, which do not evaluate HTML.

---

## 5. The Rendering Pipeline

Understanding the browser's rendering pipeline is a prerequisite for every scheduling and mutation decision in this architecture. The pipeline executes in the following order within each rendering frame:

**1. JavaScript execution.** Event handlers, scheduled callbacks, and microtasks run here. DOM mutations made during this phase are batched by the browser and do not immediately trigger layout or paint.

**2. Style recalculation.** The browser resolves which CSS rules apply to each element. Style recalculation is invalidated by DOM mutations, attribute changes, class list changes, and dynamic insertion or removal of stylesheet rules.

**3. Layout.** The browser computes element dimensions and positions. Layout is invalidated by style recalculation and by reading certain layout-dependent properties during the JavaScript phase (see forced layout, section 7).

**4. Paint.** The browser records drawing instructions for each layer. Paint is invalidated by layout changes and by changes to visual properties (`background-color`, `border`, `box-shadow`, etc.) that do not affect geometry.

**5. Compositing.** The browser sends the recorded paint instructions to the GPU compositor, which assembles layers and renders the final frame. Composited animations (`transform`, `opacity`) bypass steps 3 and 4 entirely and run on the compositor thread, making them the cheapest possible animation path.

Every rendering decision in this architecture is made with reference to which stage of the pipeline it affects and whether it can be deferred to avoid triggering expensive earlier stages.

---

## 6. Rendering Scheduling

**Spec:** WICG Prioritized Task Scheduling  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Scheduler`  
**Status:** Baseline — Widely Available

DOM mutations must never be applied synchronously in response to state changes that originate outside the rendering pipeline. Synchronous mutation causes style recalculation and layout to run immediately within the current task, blocking all subsequent work until the pipeline completes. For applications with many components, this produces cascading forced layouts and perceptible jank.

The correct pattern separates the state notification from the DOM mutation:

1. A state change occurs (user event, network response, BroadcastChannel message, worker postMessage).
2. The subscribing component is notified via its subscription mechanism.
3. The component marks itself as dirty and schedules a render via `scheduler.postTask()` at `user-visible` priority, or via `requestAnimationFrame()` for mutations that must be synchronised with the next paint.
4. The DOM mutation executes in the scheduled callback, inside the browser's rendering pipeline, not outside it.

This batching approach has two effects. First, multiple state changes that arrive within the same task coalesce into a single scheduled render rather than triggering multiple successive layouts. Second, the mutation occurs at a point where the browser is already preparing a frame, rather than interrupting an arbitrary execution context.

**`requestAnimationFrame` vs `scheduler.postTask`**

`requestAnimationFrame` should be used only when the mutation must be synchronised with the very next paint — for example, a measurement that depends on the element's current rendered dimensions, or an animation that must begin on the next frame without visible delay. Its callback fires immediately before the browser composes the next frame, with no priority semantics and no cancellation support.

`scheduler.postTask()` with `user-visible` priority should be used for all other rendering work. It is cancellable via `AbortSignal`, priority-aware relative to other scheduled work, and composable with `scheduler.yield()` for long rendering tasks that span many nodes.

`scheduler.yield()` is used inside a `postTask` callback when rendering a large set of nodes: the work is broken into chunks, with a yield between each chunk. The browser can process input events and perform intermediate paints between chunks, keeping the application responsive during a large render operation.

**Coalescing with a dirty flag**

Because components receive state change notifications and schedule renders independently, it is possible for a component to schedule multiple renders before any of them executes. A simple dirty flag — a boolean set to `true` when a render is scheduled and to `false` when the render executes — ensures that at most one render is queued at any time. The second notification finds the flag already set and skips the schedule call.

---

## 7. Forced Layout and the Read-Write Discipline

**Reference:** Google Web Fundamentals — Rendering Performance  
**Also known as:** Layout thrashing

Reading a layout-dependent property from the DOM after a write in the same execution context causes the browser to flush its pending style and layout calculations synchronously before returning the value. This is called a forced synchronous layout. It is among the most expensive single operations in web rendering, and it is caused entirely by the order of API calls in application code, not by the browser.

Layout-triggering read properties include: `offsetWidth`, `offsetHeight`, `offsetTop`, `offsetLeft`, `offsetParent`, `clientWidth`, `clientHeight`, `scrollWidth`, `scrollHeight`, `scrollTop`, `getBoundingClientRect()`, `getComputedStyle()`, and `getClientRects()`.

The correct discipline is the read-then-write pattern: all layout reads in a given execution context occur before any DOM writes. If a write must precede a read — for example, when an element must be inserted before its dimensions can be measured — the read is deferred to a `requestAnimationFrame` callback, where the browser has already completed layout and the read is cheap.

In components that implement resize or position-aware behaviour, all dimension reads use `ResizeObserver` or `IntersectionObserver` rather than synchronous property access. Both observers deliver measurements to their callbacks at a safe point in the rendering pipeline, after layout, and their callbacks never trigger forced layout.

---

## 8. Composited Layers and will-change

**Spec:** W3C CSS Will Change Module Level 1  
**MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/will-change`  
**Status:** Baseline — Widely Available

The browser's compositor assembles the final frame from multiple independent layers. Certain properties — `transform`, `opacity`, and `filter` — can be animated entirely on the compositor thread, bypassing the main thread's style recalculation and layout stages. This is the cheapest possible animation path: no JavaScript, no layout, no paint for the animating elements.

`will-change: transform` and `will-change: opacity` instruct the browser to promote an element to its own composited layer before animation begins, allowing the compositor to prepare the layer in advance. This is used for elements that are about to animate, declared in the CSS or applied programmatically immediately before the animation starts.

Two constraints govern `will-change` usage in this architecture:

First, `will-change` must not be applied permanently to large numbers of elements. Each promoted layer consumes GPU memory. Applying `will-change` to every element in a list or to the root container is a common mistake that increases GPU memory pressure without proportionate benefit.

Second, `will-change` must be removed after the animation completes. A dynamic element that is animated on user interaction should have `will-change` added before the animation and removed in the `animationend` or `transitionend` event handler. CSS-based animations that use `will-change` in a `:hover` or `:active` rule are automatically scoped and need no manual removal.

The `transform` and `opacity` constraint holds for all animations in this system. Any animation that animates `width`, `height`, `top`, `left`, `margin`, `padding`, or any other geometry-affecting property is a layout animation and triggers the full pipeline on every frame. Such animations are avoided except where no alternative exists.

---

## 9. View Transitions API

**Spec:** W3C CSS View Transitions Module Level 1 (same-document) and Level 2 (cross-document)  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/View_Transition_API`  
**Status:** Baseline Newly Available as of October 2025. Chrome 111+, Edge 111+, Firefox 133+, Safari 18+.

The View Transitions API provides a mechanism for animating between two visual states of a document with minimal JavaScript and zero dependency on any animation library. It is the authoritative mechanism for all navigation transitions in this architecture.

### How it works

`document.startViewTransition(callback)` takes a DOM mutation as its argument. The browser performs the following sequence:

1. Captures a screenshot of the current visual state of the page (or of named elements — see below).
2. Executes the callback, which performs the DOM mutation (route change, list update, element swap).
3. Captures a screenshot of the new visual state.
4. Animates between the two states using CSS, by default a cross-fade.

The entire animation runs on the compositor. The captured screenshots are rendered as pseudo-elements (`::view-transition-old` and `::view-transition-new`) and are animated using standard CSS animations, making them fully customisable via stylesheet rules.

### Named transition groups

The `view-transition-name` CSS property assigns an element to a named transition group. When both the old state and the new state contain an element with the same `view-transition-name`, the browser animates that element's position and dimensions independently from the rest of the page — producing a shared-element transition without any JavaScript coordinate calculation.

For list-to-detail navigation — a pattern where a list item expands to fill the new page — `view-transition-name` is assigned to the relevant element programmatically before calling `startViewTransition()`, using a unique identifier derived from the item's data. This produces the effect of the item morphing into the page header with no animation library and no manual position tracking.

### Router integration

The router layer wraps every navigation's DOM mutation inside `startViewTransition()`. The transition is a progressive enhancement: if the browser does not support the View Transitions API, the same DOM mutation executes without the transition animation, and the application functions identically. Feature detection is `'startViewTransition' in document`.

### Level 2 — Cross-document transitions

View Transitions Level 2 extends the API to MPA (multi-page application) navigations. The `@view-transition` CSS at-rule declares that a document participates in cross-document view transitions. When the browser navigates from one such document to another, the transition fires without any JavaScript. Named transition groups work identically across documents. This capability is used for MPA-mode deployments of the application, where pages are separate documents rather than client-side rendered routes.

### Custom animations

The default cross-fade animation is overridden via CSS targeting the generated pseudo-elements. Custom animations are standard `@keyframes` animations applied to `::view-transition-old(root)` and `::view-transition-new(root)`, or to specific named groups. The `prefer-reduced-motion` media query is respected: when the user has expressed a preference for reduced motion, transition animations are suppressed or replaced with an instant cut by scoping a `@media (prefers-reduced-motion: reduce)` rule that sets the animation duration to zero.

---

## 10. Incremental and Partial Rendering

Large collections — lists of hundreds or thousands of items — cannot be fully rendered into the DOM without cost. Full materialisation of a large list produces a long initial layout calculation, increases memory pressure (each DOM node is a live JavaScript object with associated style and layout data), and degrades scroll performance. Three platform mechanisms address this.

### IntersectionObserver-driven virtualisation

**Spec:** W3C Intersection Observer  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API`  
**Status:** Baseline — Widely Available

`IntersectionObserver` fires a callback when an observed element enters or exits a defined intersection root (by default the viewport). Its callbacks execute off the main thread and are delivered at a safe point in the rendering pipeline, making observation of large numbers of elements essentially free compared to scroll event listeners.

For virtualised lists, sentinel elements at the top and bottom of the rendered portion are observed. When the bottom sentinel intersects the viewport, the next batch of items is rendered; when items scroll far enough above the viewport, they are removed from the DOM or their content is replaced with an empty placeholder of the same height to preserve scroll position.

This approach does not require a virtualisation library. It is implemented directly using the `IntersectionObserver` API on sentinels.

### `content-visibility: auto`

**Spec:** W3C CSS Containment Module Level 2  
**MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/content-visibility`  
**Status:** Baseline — Newly Available

`content-visibility: auto` instructs the browser's layout engine to skip rendering work (paint and layout) for elements that are off-screen, while preserving the element's contribution to document layout. Combined with `contain-intrinsic-size`, which provides a hint for the element's size during the skipped layout, this produces a native virtualisation effect at the CSS engine level with a single property declaration and no JavaScript.

The performance impact is comparable to a JavaScript virtualisation library for rendering cost, without any of the complexity: no sentinel management, no scroll position tracking, no item height measurement. For static or fixed-height lists, `content-visibility: auto` with a declared `contain-intrinsic-size` is the preferred solution and requires zero JavaScript.

Its limitation is that content inside a `content-visibility: auto` element is not searchable by the browser's in-page find function until the element is scrolled into view and rendered. For content that must be searchable, this tradeoff must be evaluated per use case.

### Chunked rendering with `scheduler.yield()`

When inserting a large number of nodes in a single operation — populating a list on initial load from a local cache, for example — the full insertion must not happen synchronously in a single task. A single long task blocking the main thread produces jank and delays input response.

The correct pattern is to batch the node insertions into chunks (typically 50–100 items per chunk, adjusted based on profiling), insert one chunk per task, and call `scheduler.yield()` between chunks. The browser can process queued input events and perform an intermediate paint between each chunk, keeping the application responsive throughout the operation.

---

## 11. Slot Composition and the Flat Tree

**Spec:** WHATWG HTML Living Standard — Slots  
**MDN:** `developer.mozilla.org/en-US/docs/Web/HTML/Element/slot`  
**Status:** Baseline — Widely Available

The `<slot>` element inside a shadow root creates a rendering projection: light DOM children of the host element are rendered at the slot's position inside the shadow root without being moved in the DOM. Slotted nodes remain in the light DOM; only their rendered position changes.

This distinction has two concrete implications for rendering.

**Style application.** Slotted elements are styled by their light DOM context, not by the shadow root's stylesheets. The shadow root cannot directly style slotted content. The `::slotted()` pseudo-element provides limited targeting of the outermost slotted nodes (not their descendants) from within the shadow root. Deeper control over slotted content's appearance requires CSS custom properties on the slotted element.

**The flat tree and accessibility.** The browser composes the rendered tree — called the flat tree — by merging the shadow tree and the slotted light DOM content at their respective slot positions. The flat tree is what the browser's layout engine processes, what assistive technologies traverse, and what `getComputedStyle()` reflects. ARIA roles, landmark regions, and focus order all apply to flat tree order. When building components that project slotted content, the flat tree traversal must be considered when assigning ARIA attributes: a landmark declared on the host element must wrap the slotted content as it appears in the flat tree, not as it appears in the shadow tree alone.

The `slotchange` event fires on a `<slot>` element when its assigned nodes change. `slot.assignedNodes()` and `slot.assignedElements()` provide access to the currently distributed nodes. These are used when a component's rendering behaviour depends on the number or type of its slotted children — for example, a tab container that renders navigation tabs based on the number of slotted tab panels.

---

## 12. Declarative Shadow DOM and Server-Side Rendering

**Spec:** HTML Living Standard — Declarative Shadow DOM  
**MDN:** `developer.mozilla.org/en-US/docs/Web/HTML/Element/template#shadowrootmode`  
**Status:** Baseline Newly Available as of August 5, 2024. Chrome 90+, Edge 90+, Firefox 123+, Safari 16.4+.

Declarative Shadow DOM allows a shadow root to be defined in server-rendered HTML using a `<template shadowrootmode="open">` element nested inside the custom element. The browser attaches the shadow root during HTML parsing, before any JavaScript executes:

```html
<my-card>
  <template shadowrootmode="open">
    <style>:host { display: block; }</style>
    <slot></slot>
  </template>
  <p>Slotted content from server</p>
</my-card>
```

This eliminates the Flash of Unstyled Content (FOUC) that previously affected JavaScript-driven Shadow DOM attachment. In a JavaScript-driven shadow root, the component appears unstyled between the browser's initial paint and the point at which the component's JavaScript runs and calls `attachShadow()`. Declarative Shadow DOM resolves this entirely.

For server-side rendering pipelines, declarative Shadow DOM makes Web Components first-class server-rendered elements. A server can emit the full shadow tree as static HTML, the browser paints it styled on the first paint, and JavaScript hydration attaches event listeners and reactive state to the already-rendered structure without touching the visual state.

**Specification attribute history.** The `shadowrootmode` attribute was introduced in 2023. Earlier Chromium implementations (before Chrome 124) used the deprecated `shadowroot` attribute. Any server-rendering infrastructure that targets older Chromium versions requires awareness of this distinction.

**Streaming compatibility.** Declarative Shadow DOM is compatible with HTTP streaming. The shadow root is attached as soon as the closing `</template>` tag is parsed, regardless of whether the document has finished loading. This makes it composable with `ReadableStream`-based server responses and progressive HTML delivery.

---

## 13. Direct DOM Mutation vs Virtual DOM

This architecture does not use a virtual DOM. The decision is architectural and is documented here to prevent the question from being relitigated.

A virtual DOM system maintains an in-memory representation of the desired DOM state, diffs it against the previous representation on each state change, and applies a minimal set of mutations to the real DOM. The diffing step has a CPU cost proportional to the size of the component tree being diffed. In most applications, this cost is negligible. In applications with large, frequently updating trees, it is a bottleneck.

This architecture avoids the diffing step entirely. Components subscribe to specific state keys and know which DOM nodes correspond to which state values. When a subscribed value changes, the component mutates exactly the nodes that correspond to that value — not the entire component tree. There is no reconciliation pass because there is no out-of-sync representation to reconcile.

The model is closer to SolidJS's fine-grained reactivity than to React's component model. When a state value changes, the DOM update is a direct property or attribute setter call on a known element reference. No intermediate representation is created or diffed.

This approach requires that components maintain references to the DOM nodes they intend to update. Those references are established during the template clone step in `connectedCallback()`, stored on the component instance, and released in `disconnectedCallback()` alongside all other cleanup. The references are local to the component, so they do not prevent GC of the component or its shadow tree after disconnection.

The TC39 Signals proposal (Stage 2 as of mid-2026) formalises the computational model this architecture already implements: a state value is a `Signal.State`, a derived value is a `Signal.Computed`, and a DOM update triggered by a state change is an effect. When native signals ship, the subscription layer in this architecture is a straightforward migration target, since both models express reactivity as computed values that re-execute when their declared state dependencies change.

---

## 14. Web Animations API

**Spec:** W3C Web Animations  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API`  
**Status:** Baseline — Widely Available

The Web Animations API provides programmatic control over CSS animations from JavaScript. It is the correct API for animations that must be driven by dynamic values, sequenced imperatively, or controlled (paused, reversed, cancelled) based on application logic.

`element.animate(keyframes, options)` returns an `Animation` object. The animation runs on the compositor for `transform` and `opacity` properties. The returned `Animation` exposes `play()`, `pause()`, `cancel()`, `reverse()`, and a `finished` promise that resolves when the animation completes.

`element.getAnimations()` returns all animations currently running on an element, including those triggered by CSS. This enables coordination between CSS-triggered and JavaScript-triggered animations on the same element — inspecting and pausing CSS transitions before overriding them with programmatic animations, for example.

The Web Animations API is preferred over CSS transitions for application-driven animations (those triggered by state changes) because:

- The animation is fully defined in JavaScript, adjacent to the logic that triggers it, rather than split across a CSS file
- It is cancellable and inspectable via the `Animation` object
- Its `finished` promise allows sequencing without manual `transitionend` listeners
- It degrades gracefully: if the API is not available, the component still mutates the DOM; only the animation is missing

CSS transitions and animations are preferred for purely presentational state (`hover`, `focus`, `active`, loading skeleton pulses) that does not need to be controlled from JavaScript.

---

## 15. Rendering and Memory: The Lifecycle Contract

Rendering work creates memory obligations. Every DOM reference stored on a component, every observer registered for rendering feedback, and every animation timeline started by a component must be released when the component is removed from the document.

The component lifecycle contract for rendering resources is:

**In `connectedCallback()`:**
- Clone the template and store references to the dynamic nodes within the clone
- Register `ResizeObserver` and `IntersectionObserver` callbacks for any rendering-dependent measurement
- Pass the component's `AbortController.signal` to `core.ui.observe.*` calls for automatic cleanup

**In `disconnectedCallback()`:**
- Call `controller.abort()` — this terminates all observer registrations made with the signal, cancels all scheduled render tasks that accepted the signal, and releases any in-flight animation control
- Set stored node references to `null` (not strictly required in modern engines, but explicit for clarity)
- Cancel any running animations via `element.getAnimations().forEach(a => a.cancel())`

A component that neglects this contract will prevent its shadow DOM subtree from being garbage collected as long as any observer, scheduler task, or animation timeline holds a reference to any node within it. In a long-lived SPA, every navigation that creates and forgets such a component accumulates unreachable memory. This is the canonical form of the web application memory leak and it is prevented entirely by disciplined lifecycle adherence.

---

## 16. core.ui — Rendering Utilities

The `core.ui` module exposes rendering utilities as thin platform wrappers. Application code and component code use these rather than calling the underlying browser APIs directly, ensuring consistent scheduling, observer management, and transition integration across the codebase.

```
core.ui.define(tag, Class)
```
Registers a Custom Element. Internally calls `customElements.define()` with a guard that prevents double-registration during hot module replacement in development.

```
core.ui.template(id)
```
Returns a cloned `DocumentFragment` from a `<template>` element by id. Caches the template element reference after first lookup.

```
core.ui.transition(callback)
```
Wraps a DOM mutation in `document.startViewTransition()` with a feature-detection guard. Returns the `ViewTransition` object if supported, or executes the callback directly if not. Always returns a Promise that resolves after the mutation (and transition, if active) completes.

```
core.ui.schedule(callback, priority?)
```
Schedules a callback via `scheduler.postTask()` at the specified priority (default `user-visible`). Returns a Promise that resolves when the callback has executed. Accepts an `AbortSignal` via the options object.

```
core.ui.observe.resize(element, callback, signal?)
```
Attaches a `ResizeObserver` to the element, calling the callback on every size change. If a signal is provided, the observer is disconnected automatically when the signal aborts.

```
core.ui.observe.intersection(element, callback, options?, signal?)
```
Attaches an `IntersectionObserver` to the element with the given options. Disconnects automatically on signal abort.

```
core.ui.observe.mutation(element, callback, options?, signal?)
```
Attaches a `MutationObserver` to the element. Disconnects automatically on signal abort.

---

## 17. Rendering Decision Reference

The following table maps rendering scenarios to the correct platform mechanism.

| Scenario | Mechanism |
|---|---|
| Component visual isolation | Shadow DOM (`attachShadow`) |
| Theme / design tokens | CSS custom properties on `:root`, read via `var()` in shadow root |
| Animated CSS custom properties | `@property` registration with `<syntax>` |
| Initial component render | `<template>` clone + shadow root append |
| State-driven DOM update | `scheduler.postTask()` (user-visible) or `requestAnimationFrame` |
| Animation of transform / opacity | CSS animation or Web Animations API; compositor-thread |
| Animation of geometry properties | Avoid; use transform equivalent instead |
| Pre-animation layer promotion | `will-change: transform` or `will-change: opacity`, removed after animation |
| Navigation transition | `document.startViewTransition(callback)` |
| Shared-element transition | `view-transition-name` on matched elements before transition |
| Cross-document transition | `@view-transition` at-rule (Level 2) |
| Large list rendering | `content-visibility: auto` + `contain-intrinsic-size` |
| Scroll-triggered load / unload | `IntersectionObserver` on sentinel elements |
| Large batch DOM insertion | Chunked with `scheduler.yield()` between chunks |
| Layout measurement | `ResizeObserver` or `IntersectionObserver`; never synchronous read-after-write |
| Server-side rendered components | Declarative Shadow DOM (`shadowrootmode="open"`) |
| Accessible flat tree composition | `<slot>` + ARIA applied to host and shadow root for correct flat tree traversal |
| Rendering observer cleanup | `AbortController` signal passed to `core.ui.observe.*` |

---

## Standards and References

- WHATWG HTML Living Standard — Shadow DOM: `html.spec.whatwg.org/#shadow-trees`
- WHATWG HTML Living Standard — Custom Elements: `html.spec.whatwg.org/#custom-elements`
- WHATWG HTML Living Standard — The template element: `html.spec.whatwg.org/#the-template-element`
- W3C CSS View Transitions Module Level 1: `w3.org/TR/css-view-transitions-1`
- W3C CSS View Transitions Module Level 2: `w3.org/TR/css-view-transitions-2`
- W3C CSS Containment Module Level 2 (`content-visibility`): `w3.org/TR/css-contain-2`
- W3C CSS Custom Properties Level 1: `w3.org/TR/css-variables-1`
- W3C CSS Properties and Values API Level 1 (`@property`): `w3.org/TR/css-properties-values-api-1`
- W3C Web Animations: `w3.org/TR/web-animations-1`
- W3C Intersection Observer: `w3.org/TR/intersection-observer`
- W3C CSS Will Change Module Level 1: `w3.org/TR/css-will-change-1`
- WICG Prioritized Task Scheduling: `wicg.github.io/scheduling-apis`
- MDN — Shadow DOM: `developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM`
- MDN — View Transitions API: `developer.mozilla.org/en-US/docs/Web/API/View_Transition_API`
- MDN — content-visibility: `developer.mozilla.org/en-US/docs/Web/CSS/content-visibility`
- MDN — Web Animations API: `developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API`
- MDN — IntersectionObserver: `developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API`
- web.dev — Declarative Shadow DOM: `web.dev/articles/declarative-shadow-dom`
- TC39 Signals Proposal (Stage 2): `github.com/tc39/proposal-signals`