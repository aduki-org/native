## Limitations, Browser Gaps, and Polyfill Strategy

**Version:** 1.0  
**Status:** Working Specification  
**Date:** May 2026  
**Authority:** MDN Web Docs, CanIUse, web.dev Baseline, Chrome Platform Status, Mozilla Platform Status

---

## Table of Contents

1. [Governing Principles for Gap Management](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#1-governing-principles-for-gap-management)
2. [Gap Classification Model](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#2-gap-classification-model)
3. [Routing Layer — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#3-routing-layer--gaps-and-fallbacks)
4. [Component Model — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#4-component-model--gaps-and-fallbacks)
5. [Animation Layer — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#5-animation-layer--gaps-and-fallbacks)
6. [Scheduling Layer — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#6-scheduling-layer--gaps-and-fallbacks)
7. [Storage Layer — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#7-storage-layer--gaps-and-fallbacks)
8. [Networking Layer — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#8-networking-layer--gaps-and-fallbacks)
9. [Offline and Background Layer — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#9-offline-and-background-layer--gaps-and-fallbacks)
10. [Security Layer — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#10-security-layer--gaps-and-fallbacks)
11. [Performance Layer — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#11-performance-layer--gaps-and-fallbacks)
12. [UI Primitives — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#12-ui-primitives--gaps-and-fallbacks)
13. [CSS Platform — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#13-css-platform--gaps-and-fallbacks)
14. [Module System — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#14-module-system--gaps-and-fallbacks)
15. [Reactivity — Gaps and Fallbacks](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#15-reactivity--gaps-and-fallbacks)
16. [Polyfill Inventory and Weight Budget](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#16-polyfill-inventory-and-weight-budget)
17. [Progressive Enhancement Implementation Patterns](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#17-progressive-enhancement-implementation-patterns)
18. [Framework Comparison: Where Native Wins and Where It Struggles](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#18-framework-comparison-where-native-wins-and-where-it-struggles)
19. [Long-Term Maintainability Assessment](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#19-long-term-maintainability-assessment)
20. [Gap Resolution Roadmap](https://claude.ai/chat/97735d72-7e14-4446-b776-7b3c815a218f#20-gap-resolution-roadmap)

---

## 1. Governing Principles for Gap Management

### The Nature of Platform Gaps

Not all browser API gaps are equal. This architecture's decision-making framework for any given gap depends on its category:

**Chromium-only features** — APIs that exist only in Chrome and Edge. These are often WICG proposals that have not yet gained cross-browser consensus. The architecture uses them behind feature detection as _progressive enhancements_ — users on non-Chromium browsers receive a functionally complete but less optimised experience.

**Newly Available features** — APIs in Baseline Newly Available status (all four major engines, but within the past 30 months). These require feature detection but no alternative code path for users with up-to-date browsers. The fallback handles only users on browser versions older than the Baseline date.

**Specification gaps** — Areas where no browser has shipped a complete solution, requiring userland implementations. These are fundamentally different from cross-browser gaps; they are gaps in the platform itself that the architecture must fill with production-quality code.

**Safari-specific gaps** — Apple's browser historically lags behind Chrome on certain PWA and background capabilities. These are treated as explicit first-class concerns, not afterthoughts, because Safari's market share — particularly on iOS, where it is the only rendering engine — is substantial.

### Honest Assessment Policy

This document does not minimise gaps. Each gap is described with its actual user impact, the reliability of the fallback, and explicit acknowledgement of where the native platform cannot yet match the capability of mature libraries or native apps. Architectural integrity requires honesty about current limitations.

---

## 2. Gap Classification Model

Every API gap in this architecture is assigned to one of four severity tiers:

**Tier 1 — Critical:** The gap affects core application functionality. The fallback must provide equivalent functionality, not a degraded experience. A Tier 1 gap without an equivalent fallback is a blocker for shipping.

**Tier 2 — Significant:** The gap affects a meaningful user segment or a performance-sensitive code path. The fallback provides functional equivalence but may have observable performance or reliability differences. These gaps are documented prominently in operational runbooks.

**Tier 3 — Enhancement:** The gap affects only optimisation or polish. The fallback is the "no enhancement" path — the feature is simply absent for affected users, but core functionality is unaffected.

**Tier 4 — Monitoring:** The gap is in an emerging API that is not yet relied upon in this architecture, but is tracked for future adoption. No fallback required today.

---

## 3. Routing Layer — Gaps and Fallbacks

### Navigation API

**Gap severity:** Tier 2  
**Affected users:** Browsers released before January 2026 (pre-Firefox 147, pre-Safari 26.2). Roughly 10–20% of users depending on update velocity in the target audience.  
**Feature detection:** `'navigation' in window`

**Fallback strategy:** The History API fallback in `core/router` provides SPA routing with these limitations:

`popstate` is not dispatched for programmatic navigation. The fallback manually dispatches `popstate` after every `history.pushState()` and `history.replaceState()` call.

Link-click navigation requires document-level event delegation. A `click` listener on `document` uses `event.target.closest('a[href]')` to intercept same-origin same-document link navigations. Non-`<a>` navigation triggers (form submissions, programmatic `window.location` assignments) cannot be intercepted by the History API fallback.

Full history stack is not accessible. The fallback maintains its own shadow history array, which may diverge from the browser's actual history if the user uses the browser's back/forward navigation to reach sessions or pages outside the SPA's managed history.

**Impact assessment:** The History API fallback is a fully functional SPA routing solution for the core navigation use case. Applications that depend on `navigation.entries()` for breadcrumb generation or exit-confirmation modals will have degraded functionality for ~15% of users until the Navigation API's Baseline reaches the "Widely Available" threshold.

---

### URLPattern API

**Gap severity:** Tier 2  
**Affected users:** Browsers released before September 2025. Rapidly shrinking segment as of mid-2026.  
**Feature detection:** `'URLPattern' in globalThis`

**Fallback strategy:** The `path-to-regexp` library (~1.5 KB compressed) provides equivalent pattern matching capability. The `core/router` module wraps pattern matching behind a `matchRoute(pattern, url)` function that dispatches to `URLPattern.exec()` natively or `pathToRegexp.match()` as fallback.

`path-to-regexp` is the engine underlying Express.js, React Router v5/6, and most other major routing libraries. It has extensive production hardening and handles edge cases that naive regex implementations miss.

**Worker context gap:** The `path-to-regexp` fallback cannot be easily shared with the Service Worker without bundling. For Service Worker URL routing on pre-URLPattern browsers, a simplified regex-based matching approach is used as the SW fallback, with URLPattern taking over for supported browsers.

---

## 4. Component Model — Gaps and Fallbacks

### Customised Built-In Elements

**Gap severity:** Tier 2  
**Affected users:** Safari does not implement customised built-in elements (the `is` attribute mechanism). This is a fundamental Safari objection to the design, not a lag in implementation.  
**Feature detection:** `customElements.define('my-btn', MyButton, { extends: 'button' })` should be tested in a try/catch or checked against `HTMLButtonElement.prototype.constructor`.

**Fallback strategy:** This architecture does **not** use customised built-in elements as primary components. All primary components are autonomous Custom Elements (`class MyComponent extends HTMLElement`), which have no Safari gap. The `builtin-element-polyfill` (2KB compressed) is available as an optional dependency for specific cases where built-in extension is necessary for accessibility reasons (e.g., extending `<button>` to inherit its native keyboard focus and activation behaviour).

**Design principle enforcement:** `core/ui.define()` only registers autonomous Custom Elements. Any proposal to use customised built-in elements for a core UI component must be reviewed against this constraint and accompanied by Safari polyfill justification.

---

### Declarative Shadow DOM

**Gap severity:** Tier 3  
**Affected users:** Browsers released before August 2024. Small and shrinking user segment.  
**Feature detection:** `HTMLTemplateElement.prototype.hasOwnProperty('shadowRootMode')`

**Spec note:** The attribute name changed from `shadowroot` to `shadowrootmode` in the 2023 specification revision. Chrome 124+ uses the new name; Chrome 90–123 used the old name. Safari and Firefox use the new name from their initial implementations.

**Fallback strategy:** A small (< 1 KB) polyfill replaces `<template shadowrootmode>` elements with JavaScript `attachShadow()` calls on their parent elements during HTML parsing completion. The polyfill has no visible user impact — it runs before first paint on browsers that need it.

**SSR impact:** Without Declarative Shadow DOM, server-rendered Web Components cannot have their shadow DOM present in the initial HTML. The JavaScript upgrade step must perform the shadow DOM construction. This means SSR Web Components on pre-August-2024 browsers behave as if they were entirely JavaScript-rendered — the shadow DOM is constructed after JavaScript loads and executes, not at parse time.

---

### Custom State Pseudo-Class

**Gap severity:** Tier 3  
**Affected users:** Browsers released before mid-2024 where `ElementInternals.states` was not yet available  
**Feature detection:** `'states' in ElementInternals.prototype`

**Fallback strategy:** For browsers without Custom State support, the component adds a reflected attribute (e.g., `data-state-loading="true"`) to the host element and targets it with `[data-state-loading]` CSS selectors as an alternative to `:state(loading)`. The `core/ui` base class provides a `setState(name, value)` method that uses `ElementInternals.states` when available and reflects to data attributes when not.

---

## 5. Animation Layer — Gaps and Fallbacks

### View Transitions API — Same-Document

**Gap severity:** Tier 3  
**Affected users:** Browsers released before October 2025 (pre-Firefox 133, pre-Safari 18)  
**Feature detection:** `'startViewTransition' in document`

**Fallback strategy:** When `startViewTransition` is not available, the `core.ui.transition()` method executes the DOM update callback directly without any animation. The transition is instant and correct; it is simply unanimated. This is the definition of progressive enhancement: the feature enhances but does not gate the experience.

No animation library is loaded as a fallback. The position of this architecture is that unanimated state changes are preferable to a small animation library dependency that complicates the CSS model and may not animate the same elements the View Transitions API would.

---

### View Transitions API — Cross-Document (MPA)

**Gap severity:** Tier 3  
**Affected users:** Firefox (no support as of mid-2026); Safari requires `@view-transition` CSS at-rule  
**Feature detection:** `@supports (view-transition-name: none)` for same-document; `@view-transition` at-rule parsing detection for cross-document

**Fallback strategy:** Cross-document view transitions are a pure CSS progressive enhancement. The `@view-transition { navigation: auto }` at-rule in both the outgoing and incoming page stylesheets is silently ignored by browsers that do not support it. Non-Chromium-non-Safari users receive instant (normal browser) navigation. No code paths are affected; no fallback logic is required.

---

### Web Animations API — GroupEffect / SequenceEffect

**Gap severity:** Tier 3  
**Affected users:** All browsers except Chrome for `GroupEffect`/`SequenceEffect`  
**Feature detection:** `'GroupEffect' in window`

**Fallback strategy:** Sequential animation orchestration is implemented via Promise chaining on `Animation.finished`. A helper function `core.animations.sequence([effects])` abstracts this, using native `SequenceEffect` when available and Promise-chained animations when not. Parallel animations use `Promise.all([...animations.map(a => a.finished)])` as the fallback for `GroupEffect`.

---

## 6. Scheduling Layer — Gaps and Fallbacks

### Scheduler API

**Gap severity:** Tier 1 (for `postTask`); Tier 2 (for `yield`)  
**Affected users:** Browsers released before approximately late 2022 (Scheduler API is Widely Available but was added in Chrome 94 / Firefox 101 / Safari 16.4)  
**Feature detection:** `'scheduler' in globalThis && 'postTask' in scheduler`

**Fallback strategy:**

For `scheduler.postTask()`: A minimal userland implementation dispatches tasks as Promise microtasks (for `user-blocking`), `requestAnimationFrame` callbacks (for `user-visible`), and `MessageChannel` message events (for `background`) — a well-known performance technique that approximates `scheduler.postTask()`'s priority semantics with existing platform primitives.

For `scheduler.yield()`: The fallback is `new Promise(resolve => setTimeout(resolve, 0))` — yielding to the event loop via a setTimeout macrotask. This has lower precision than native `yield()` (which can yield at a precise priority level) but provides the essential "don't starve the event loop" behaviour.

The `core/platform/scheduler.js` module exports `postTask()` and `yield()` that transparently delegate to native implementations when available.

---

## 7. Storage Layer — Gaps and Fallbacks

### File System Access API — User-Facing Pickers

**Gap severity:** Tier 2 (for features that require file picker access)  
**Affected users:** Firefox (no `showOpenFilePicker()`/`showSaveFilePicker()`); Safari (no user-facing pickers, though Safari supports OPFS)  
**Feature detection:** `'showOpenFilePicker' in window`

**Fallback strategy:** `<input type="file">` for opening files; anchor download (`<a href="blob:...">`) for saving files. These provide equivalent functionality but with a different UX — the browser's native file picker (same visual) but without the ability to persist file handles for re-opening the same file in a future session.

For applications that need to reopen previously-accessed files (document editors, data import tools), the OPFS provides a reasonable alternative: files can be read from the user via `<input type="file">` and then stored in OPFS for subsequent sessions.

**Architectural constraint:** Any feature in the application that uses the File System Access API must declare a fallback implementation using `<input type="file">`. There is no acceptable "Chromium-only" state for file access features; they must work cross-browser with degraded but functional UX.

---

### StorageManager Persistence

**Gap severity:** Tier 3  
**Affected users:** Some older browsers and specific browser configurations where `navigator.storage.persist()` is not supported or is automatically denied

**Fallback strategy:** Applications that cannot obtain persistent storage must gracefully handle the possibility of browser-initiated data eviction. The `core/storage` layer tracks whether persistence has been granted and, if not, periodically warns users with significant offline data that their data may be lost under storage pressure. The application's local data model is designed to be resynchronisable from the server, so data loss from eviction is recoverable (not catastrophic).

---

### IndexedDB Schema Migrations

**Gap severity:** Tier 1 (schema correctness is non-negotiable)

**This is not a browser gap** but an architectural risk. IndexedDB schema migration via `onupgradeneeded` is the platform's mechanism, and it works correctly across all browsers. The risk is in application code that performs migrations incorrectly.

**Required discipline:**

- Every schema change increments the version integer
- Migrations are applied sequentially and idempotently (migration N must succeed whether the user is upgrading from version N-1 or from version N-5)
- Object store creation and deletion only happen inside `onupgradeneeded`
- Data migrations (transforming existing records) must handle the case where the record count is zero (fresh install)
- Failed migrations must not leave the database in a partially-migrated state — the `versionchange` transaction rolls back if an error is thrown

---

## 8. Networking Layer — Gaps and Fallbacks

### `fetch()` — Request Cloning Limitations

**Gap severity:** Tier 3  
**Note:** This is a `Request` body streaming limitation in the Fetch specification, not a browser gap.

A `Request` body can be consumed only once. If the interceptor pipeline in `core/api` needs to both log the request body and send it to the network, the `Request` must be cloned before the first consumption: `request.clone()` produces an independent `Request` with the same body stream. This is a design constraint documented for `core/api` interceptor authors.

---

### Server-Sent Events in Workers

**Gap severity:** Tier 3  
**Note:** `EventSource` is not available in Web Workers in Firefox as of mid-2026; it is available in Chrome Workers.  
**Feature detection:** `'EventSource' in globalThis`

**Fallback strategy:** For Worker-based SSE consumption, the main thread maintains the `EventSource` connection and relays events to the Worker via `postMessage()`. This adds one message-passing hop but provides cross-browser compatibility. An alternative is to use a `fetch()` stream from within the Worker as a manual SSE implementation — `ReadableStream` is available everywhere in Workers.

---

## 9. Offline and Background Layer — Gaps and Fallbacks

### Background Sync API

**Gap severity:** Tier 2  
**Affected users:** All Firefox users; all Safari users (not implemented in either browser as of mid-2026)  
**Feature detection:** `'sync' in ServiceWorkerRegistration.prototype` or `'BackgroundSyncManager' in window`

**Fallback strategy — Manual Online Retry:**

The fallback must be a first-class implementation path, not an afterthought. For Firefox and Safari users, offline-queued mutations are replayed using the following sequence:

1. The `online` event fires on `window` when connectivity is restored.
2. The application reads pending operations from IndexedDB.
3. The operations are replayed in chronological order via `core.api`.
4. Successfully replayed operations are removed from the pending queue.
5. Failed operations (server returned an error, as opposed to network failure) are handled by the conflict resolution strategy and removed from the queue.

**Reliability difference:** The critical reliability gap is that the `online` event fires only when the tab is open. If a user performs an offline operation, closes the app, and later regains connectivity without re-opening the app, the Background Sync API would replay the operation in the background (Chromium only). On Firefox and Safari, the operation remains in the queue until the user reopens the app.

**Implication for UX:** Applications must not present the "sync successful" confirmation until the operation is actually confirmed by the server. Optimistic UI is acceptable (showing the mutation as applied in the local UI), but the server confirmation should be tracked and the user notified if the operation remains unconfirmed after a reasonable time.

**Implication for data model:** Pending operations must be designed to be safe to replay multiple times (idempotent by design) or protected against duplicate replay by the server (operation IDs with server-side deduplication).

---

### Periodic Background Sync

**Gap severity:** Tier 2 for installed PWA features  
**Affected users:** All desktop browsers; all iOS browsers; Firefox; Safari on macOS  
**Browser support:** Android Chrome with installed PWA only

**Fallback strategy:** Content freshness for all non-Android-PWA contexts is achieved through:

`stale-while-revalidate` Service Worker caching strategy — content is served from cache instantly while a network update runs in the background. This provides freshness without background sync.

On-tab-open freshness check — when the application becomes visible (via the Page Visibility API, `document.visibilitychange` event), a background refresh of stale content is initiated.

Push notifications — for applications that need to notify users of new content, the Push API is the cross-browser alternative. It requires a server to initiate pushes, whereas Periodic Background Sync runs on a browser-controlled schedule.

**Design principle:** No feature in this architecture should depend on Periodic Background Sync as its only freshness mechanism. Every feature using it must have a complete, tested fallback that operates for the majority of users who do not qualify for the API.

---

### Push Notifications on iOS

**Gap severity:** Tier 2  
**Affected users:** All iOS users who have not installed the application as a PWA from the App Store  
**Note:** Push notifications on iOS Safari require the application to be installed as a PWA (added to home screen) from iOS 16.4+.

**Fallback strategy:** Applications targeting iOS users for push notifications must implement an installation prompt flow that encourages iOS users to add the app to their home screen. Users who have not installed the PWA do not receive push notifications on iOS; this is a platform constraint with no viable workaround.

---

## 10. Security Layer — Gaps and Fallbacks

### Sanitizer API

**Gap severity:** Tier 2  
**Affected users:** Firefox and Safari users (native Sanitizer API not available in mid-2026)  
**Feature detection:** `'Sanitizer' in window`

**Fallback strategy:** DOMPurify (~14 KB compressed) is used for all browsers lacking native Sanitizer API support. The `core.security.sanitize(html, config)` function dispatches:

- Native path: `element.setHTML(html, { sanitizer: new Sanitizer(config) })`
- Fallback path: `DOMPurify.sanitize(html, equivalentConfig)`

DOMPurify translates configuration from the Sanitizer API's format to DOMPurify's format. Mozilla maintains a `sanitizer-polyfill` library that performs this translation, which is the reference implementation for the fallback.

**Security note (May 2026):** CVE-2026-7939 was a UXSS vulnerability in Chrome's Sanitizer API implementation, patched in Chrome 148.0.7778.96. This demonstrates that native browser security APIs are not infallible. Defense-in-depth requires server-side HTML sanitisation as a second layer, regardless of client-side sanitisation mechanism.

**Operational requirement:** All user-generated HTML must pass through `core.security.sanitize()` before being inserted into the DOM. Direct `innerHTML` assignment with unvalidated user content is prohibited by code review and should be enforced by linting rules (`no-inner-html` custom lint rule targeting `.innerHTML =` assignments outside the sanitize function).

---

### Trusted Types

**Gap severity:** Tier 3 for current deployment; Tier 1 if required by CSP  
**Affected users:** Firefox and Safari do not support Trusted Types enforcement as of mid-2026  
**Feature detection:** `'trustedTypes' in window`

**Fallback strategy:** Trusted Types is designed as a CSP enforcement mechanism. If the CSP header `require-trusted-types-for 'script'` is not set, Trusted Types has no enforcement effect in any browser. The architecture designs for Trusted Types compatibility (using `setHTML()` through the sanitise abstraction, avoiding bare `innerHTML` assignments) without requiring the enforcement header in production until cross-browser support reaches parity.

When Trusted Types reaches Baseline, the CSP header can be enabled globally as an additional defence-in-depth layer.

---

## 11. Performance Layer — Gaps and Fallbacks

### Speculation Rules API

**Gap severity:** Tier 3  
**Affected users:** Firefox (no support); Safari 26.2 (disabled by default); older browsers  
**Feature detection:** `HTMLScriptElement.supports && HTMLScriptElement.supports('speculationrules')`

**Fallback strategy:** `<link rel="prefetch">` for document prefetching on non-Chromium browsers. Prefetch `<link>` elements are inserted dynamically on `mouseenter` of qualifying navigation links:

When the Speculation Rules API is available, the full prerender/prefetch ruleset with eagerness controls is used.

When only `<link rel="prefetch">` is available, simple document prefetching is performed on link hover. This provides partial benefit (the HTML is fetched before navigation) but without the prerender execution and without the browser's resource-governor that prevents speculation from degrading device performance.

When neither is available, no prefetching is performed.

**Impact:** For Chromium users (~65% of the market), Speculation Rules provides up to instant navigation via prerender. For non-Chromium users, navigation latency is reduced by the prefetch time savings (typically 200–500ms for the HTML document itself). The experience difference is real but not a blocker.

---

### `content-visibility: auto` Layout Shift

**Gap severity:** Tier 3  
**Affected users:** Browsers released before September 2024  
**Feature detection:** CSS `@supports (content-visibility: auto)` or JavaScript `CSS.supports('content-visibility', 'auto')`

**Fallback strategy:** `content-visibility: auto` degrades gracefully — browsers that do not support it simply render all content regardless of viewport position. The page works correctly; it is simply slower on initial load for long pages. No JavaScript fallback is necessary; the rendering bottleneck simply reverts to the baseline.

**CLS risk:** When `content-visibility: auto` is combined with `contain-intrinsic-size` estimates, incorrect size estimates can cause layout shift as elements load their actual dimensions. The `contentvisibilityautostatechange` event should be used to correct estimates based on actual rendered sizes on first render.

---

## 12. UI Primitives — Gaps and Fallbacks

### Popover API

**Gap severity:** Tier 2  
**Affected users:** Browsers released before January 2025. ~5% of users depending on update adoption rates.  
**Feature detection:** `'popover' in HTMLElement.prototype`

**Fallback strategy:** The `core/ui` popover utility provides a JavaScript fallback for browsers without native Popover API support:

- Top-layer simulation: the fallback appends the popover element to `document.body` with `position: fixed; z-index: 2147483647` (maximum z-index) to approximate top-layer placement
- Light dismiss: a transparent overlay element behind the popover intercepts clicks to close it, simulating `popover="auto"` light-dismiss behaviour
- The `popovertarget` declarative attribute is supplemented with JavaScript attribute observation to connect triggers to their targets

**Known fallback limitations:** Fixed positioning in transformed ancestors does not behave like true top-layer placement. The fallback does not implement the full top-layer stack semantics (dismissal order for nested auto popovers). These are acceptable limitations for the estimated ~5% user population.

---

### Dialog Element

**Gap severity:** Tier 1  
**Browser support:** Widely Available — no meaningful gap exists for modern browser targets. `<dialog>` has been in all major engines since 2022.

---

### CSS Anchor Positioning

**Gap severity:** Tier 2  
**Affected users:** Browsers released before January 2026  
**Feature detection:** `CSS.supports('anchor-name', '--anchor')` or `@supports (anchor-name: --anchor)` in CSS

**Fallback strategy:** Floating UI (~3.5 KB compressed, modular, tree-shakeable) is used as the positioning fallback for browsers without anchor positioning support.

Floating UI provides:

- Programmatic positioning relative to a reference element
- Automatic viewport-edge detection and flipping
- Middleware model for offset, flip, shift, and size adjustments
- Arrow element positioning

The `core/ui/position.js` utility wraps both approaches: CSS anchor positioning is declared via CSS for supported browsers; Floating UI JavaScript positioning is activated via feature detection for unsupported browsers. The Floating UI fallback is only loaded when the feature detection fails, preventing unnecessary download for supported browsers.

**Design constraint:** Components that use floating positioning must declare both a CSS anchor positioning approach (for supported browsers) and register with the Floating UI fallback system (for unsupported browsers). This is enforced by a component audit checklist.

---

## 13. CSS Platform — Gaps and Fallbacks

### CSS Mixins (`@mixin` / `@apply`)

**Gap severity:** Tier 4 (not yet relied upon — tracking only)  
**Status:** Chrome 146 (expected 2026); not cross-browser

**Strategy:** This architecture does not use CSS mixins. CSS custom properties achieve most theming use cases. Until CSS mixins reach Baseline, reusable declaration patterns are handled through CSS custom properties, `@layer` cascade layers, and — where necessary — a minimal use of Sass at build time for shared utilities.

---

### `interpolate-size: allow-keywords`

**Gap severity:** Tier 3 (enhancement gap)  
**Status:** Not Baseline as of mid-2026

**Fallback strategy:** Animations to `height: auto` use the WAAPI with JavaScript-measured heights:

1. Measure the element's natural height by temporarily rendering it without the `height` constraint (via `visibility: hidden` or a cloned measurement element)
2. Animate from `height: 0` to the measured pixel height using `element.animate()`
3. On animation completion, set `height: auto` to allow future natural layout

This is the established pattern for accordion animations. It requires JavaScript involvement but provides cross-browser consistent behaviour. When `interpolate-size` reaches Baseline, the JavaScript measurement step can be removed.

---

### CSS Container Queries — Older Browsers

**Gap severity:** Tier 3 (size queries); Tier 4 (style queries — not yet relied upon)  
**Affected users:** Browsers released before February 2023 for size queries  
**Feature detection:** `@supports (container-type: inline-size)` in CSS

**Fallback strategy:** Size queries degrade gracefully — browsers that do not support them apply no rules from within `@container` blocks and render the component's default layout. The component's default layout must be a valid, usable layout (not a broken intermediate state) that works without the responsive adjustments container queries provide.

`ResizeObserver` provides an equivalent JavaScript mechanism for the minority of users on pre-container-query browsers: observe the component's size, add a class when the container is narrow, write CSS against that class. This JavaScript path is heavier but functionally equivalent.

---

## 14. Module System — Gaps and Fallbacks

### Import Maps

**Gap severity:** Tier 2  
**Affected users:** ~4% of users on browsers without native Import Map support (per `es-module-shims` benchmark data)  
**Feature detection:** `HTMLScriptElement.supports && HTMLScriptElement.supports('importmap')`

**Fallback strategy:** `es-module-shims` (~13 KB compressed) provides a complete Import Map polyfill.

**Performance characteristics of `es-module-shims`:**

- 94% of users pass through with zero overhead (native Import Map passthrough)
- For the ~4% who trigger the polyfill: 1.4–1.5x native module loading speed on average; up to 1.8x on slow networks
- The polyfill adds ~5ms startup overhead for native-supported users (detection only; no polyfilling)
- Large import maps (hundreds of entries) cost only a few extra milliseconds for the additional parsing

**Deployment pattern:** Include `es-module-shims` as a `nomodule` script (only loaded by older browsers) or as a shim script that self-inactivates when native support is detected. The `shamefully-hoist`-free polyfill mode ensures the polyfill does not activate for users who already have native support.

**Operational note:** The import map specifier resolution must be deterministic across both native and polyfilled modes. Any specifier that resolves differently in the two modes is a bug.

---

### Dynamic `import()` in Service Workers

**Gap severity:** Tier 1 (was a gap; now resolved)  
**Note:** Dynamic `import()` is now available in Service Workers across all major engines as part of the January 2026 Baseline for Service Worker module support.

The historical constraint — that Service Workers could not use `import()` — required all Service Worker code to be pre-bundled or use `importScripts()`. This constraint is resolved. Service Workers registered with `{ type: 'module' }` support both static and dynamic `import`.

---

## 15. Reactivity — Gaps and Fallbacks

### TC39 Signals

**Gap severity:** Tier 4 (not yet relied upon — tracking only)  
**Status:** Stage 1 as of mid-2026; no browser shipping

This is not a browser gap in the traditional sense — no browser is "behind" on signals because none have shipped them yet. The gap is that the platform does not yet provide native reactive primitives.

**Current state:** This architecture implements reactive primitives in `core/state` using `Proxy` and `EventTarget`. The implementation provides:

- Mutable state via `Proxy` traps that intercept property assignments
- Computed values that re-run when their dependencies change (tracked via the Proxy get trap's dependency collection)
- Subscriptions via `EventTarget` listeners with `AbortSignal` lifecycle integration

**Migration path to TC39 Signals:** The `core/state` API surface (`get`, `set`, `subscribe`, `derived`) is designed to be implementable on top of either `Proxy`/`EventTarget` or native TC39 Signals. When native Signals ship and reach Baseline (estimated 2028+ based on Stage 1 progression timeline), `core/state`'s internals can be re-implemented without changing the API surface exposed to components.

**Important distinction:** The TC39 Signals proposal deliberately omits effects (DOM-linked reactions). Even when native Signals ship, a scheduling layer analogous to `core/state`'s subscription model will still be required to connect signal changes to DOM updates. The platform's contribution is the signal graph semantics; the application framework's contribution is the rendering schedule.

---

## 16. Polyfill Inventory and Weight Budget

The complete polyfill set this architecture may load, with sizes and activation conditions:

|Polyfill|Compressed Size|Activation Condition|Affected User % (est.)|
|---|---|---|---|
|`es-module-shims`|~13 KB|No native Import Map support|~4% polyfill activation; 96% passthrough|
|`path-to-regexp` (URLPattern fallback)|~1.5 KB|No `URLPattern` in `globalThis`|~10% (pre-Sep 2025 browsers)|
|DOMPurify (Sanitizer fallback)|~14 KB|No native `Sanitizer` API|~60%+ (Firefox, Safari, pre-Baseline)|
|`builtin-element-polyfill`|~2 KB|Safari + using `is` attribute|Safari users only; conditional load|
|Floating UI (anchor positioning fallback)|~3.5 KB|No CSS anchor positioning|~20% (pre-Jan 2026 browsers)|
|Declarative Shadow DOM polyfill|< 1 KB|No `HTMLTemplateElement.shadowRootMode`|~5% (pre-Aug 2024 browsers)|
|History API router fallback|~2 KB|No Navigation API|~15% (pre-Jan 2026 browsers)|

**Total maximum polyfill weight (worst case, all polyfills active):** ~35 KB compressed. This is the theoretical maximum for a user on a browser from 2022 accessing this application. In practice, the actual load is a subset of these, and the threshold for "worst case" will decrease as browser update adoption increases.

**Polyfill loading strategy:** All polyfills are loaded conditionally — only when feature detection confirms the absence of the native API. They are not included in the main application bundle. They are loaded as separate modules, allowing the browser to cache them independently from application code that changes more frequently.

---

## 17. Progressive Enhancement Implementation Patterns

### Feature Detection Architecture

Feature detection is centralised in `core/platform/`. Components and modules import detection utilities rather than performing inline feature detection. Centralising detection ensures:

1. Detection is performed once and cached, not re-detected on every usage
2. Detection logic is testable in isolation
3. False detection results (browser quirks that appear to support a feature but implement it incorrectly) can be patched in one location

**Detection utility pattern:**

```
// core/platform/supports.js — conceptual, not for implementation
supports.navigationAPI           → boolean
supports.urlPattern              → boolean
supports.viewTransitions         → boolean
supports.popoverAPI              → boolean
supports.schedulerPostTask       → boolean
supports.schedulerYield          → boolean
supports.anchorPositioning       → boolean
supports.sanitizerAPI            → boolean
supports.fileSystemAccessPickers → boolean
supports.backgroundSync          → boolean
supports.speculationRules        → boolean
supports.contentVisibility       → boolean
supports.customStatePseudoClass  → boolean
supports.declarativeShadowDOM    → boolean
supports.importMaps              → boolean
```

Each property is computed once (lazy, on first access) and cached. The detection tests are conservative — they check not just for API presence but for correct behaviour where known browser bugs exist.

### Progressive Enhancement vs Polyfill Decision

For each gap, the decision between a progressive enhancement (the feature is simply absent for affected users) and a polyfill (the feature is emulated for affected users) is made on the basis of user impact:

**Progressive enhancement (no polyfill):** The feature is an optimisation or visual enhancement. Its absence does not affect core task completion. Examples: View Transitions (navigation is still functional), Speculation Rules (page loads are functional), `content-visibility` (page is correct but potentially slower).

**Polyfill required:** The feature provides functionality that users expect to be available regardless of browser. Its absence would break a user's ability to complete core tasks or represent a security regression. Examples: Import Maps (module loading would fail without polyfill), DOMPurify for Sanitizer API (HTML sanitisation cannot be absent), History API router fallback (navigation must work).

---

## 18. Framework Comparison: Where Native Wins and Where It Struggles

### Where Native Wins Decisively

**Routing:** The Navigation API + URLPattern combination is strictly more capable at the platform level than History API-based framework routers. The Navigation API intercepts navigation types that are structurally uninterceptable by History API-based routers (back/forward traversal). This is not a matter of feature parity; it is a fundamental capability gap in the older API that no framework router can close.

**Style encapsulation:** Shadow DOM encapsulation is deterministic — it is enforced by the browser, not by build-time tooling. CSS modules and CSS-in-JS achieve similar developer experience goals but through mechanisms that can be bypassed, require build tooling, and add JavaScript overhead. Shadow DOM's encapsulation cannot be accidentally violated.

**Animation:** The View Transitions API provides a native, zero-JavaScript navigation animation model that previously required significant FLIP calculation code or large libraries (Framer Motion). For navigation transitions specifically, the native model is superior.

**Offline capability:** Service Workers + IndexedDB + Cache API is the actual infrastructure that all major framework-based PWA solutions use. There is no abstraction benefit; frameworks add conventions (Workbox strategies, etc.) but do not provide additional offline capability beyond what the platform already exposes.

**Component longevity:** An autonomous Custom Element built to the Custom Elements v1 specification will work in any standards-compliant browser indefinitely. There is no deprecation risk equivalent to React breaking changes (React 16 → 18 migration, legacy context API deprecation, etc.). This is a factual statement about how browser standards work: they extend but do not break.

### Where Native Requires More Discipline

**Reactivity without signals:** Without native reactive primitives, the application must manage dependency tracking, subscription cleanup, and computed value invalidation explicitly. Frameworks abstract this with hooks (React), composables (Vue), or signals (Solid, Angular 17+). The `core/state` layer provides these primitives, but every component author must understand the subscription model and ensure `disconnectedCallback` cleanup — whereas a framework's useEffect equivalent handles this automatically.

**Server-side rendering:** Declarative Shadow DOM enables SSR of Web Components, but the tooling ecosystem is thin. There is no equivalent of Next.js's integrated SSR with Web Components. Building SSR infrastructure for a Web Components-based application requires custom server-side template rendering to produce the Declarative Shadow DOM markup. This is not technically difficult, but there are no production-hardened libraries that handle it end-to-end.

**TypeScript component types:** Custom Elements do not have TypeScript-inferred types for their properties, methods, and events in the same way that React component props or Vue component options are typed by their respective type packages. TypeScript requires manual type declarations for Custom Elements, either written by hand or generated by a tool like `custom-elements-manifest`. This is a DX gap, not a runtime gap, but it has a real impact on team productivity in TypeScript-heavy organisations.

**Large-team conventions:** Framework conventions are enforced by the framework — a React component has a specific shape, a Vue component has a specific options structure. These conventions reduce the surface area for architectural divergence in large codebases. A Web Components-based architecture enforces its conventions through code review, linting rules, and documentation. The enforcement is less automatic and more dependent on team discipline.

**Ecosystem tooling:** The npm ecosystem of utilities designed for React (react-query, react-hook-form, react-table, etc.) does not have Web Components equivalents of similar quality. Applications that need advanced data grid, form management, or data-fetching capabilities must either build their own or accept that the available Web Components ecosystem libraries are less mature.

---

## 19. Long-Term Maintainability Assessment

### The Standards Stability Argument

Browser standards do not introduce breaking changes. The WHATWG and W3C living standard model adds capabilities and may deprecate APIs over very long periods, but does not invalidate existing code. A Custom Element written against the Custom Elements v1 specification in 2019 is valid and functional in every major browser in 2026 without any modification.

Contrast this with framework-based applications: React applications written against the React 16 class component API require migration to function equivalents + hooks in React 18; legacy context consumers require refactoring; act() changes affect testing; the Strict Mode double-invocation model surfaced latent bugs requiring fixes. These are not hypothetical disruptions — they are documented migration guides that teams must dedicate engineering time to executing.

**The maintenance cost model for this architecture:**

- Browser standards change: free (no engineering work)
- Framework major version changes: engineering time required proportional to the breaking changes

**The maintenance risk model for this architecture:**

- New browser standards are additive — they do not break existing code
- Discipline enforcement depends on humans, not the framework

### The Primary Maintenance Risk

This architecture's primary long-term maintenance challenge is discipline without enforcement. The constraints documented in this specification — module boundary rules, `disconnectedCallback` cleanup obligations, the prohibition on `innerHTML` without sanitisation, the requirement for `AbortSignal` integration in all subscriptions — are enforced only by code review and linting rules.

A React codebase enforces its own component lifecycle by the framework's runtime. A web component codebase relies on developers following documented conventions. As the team grows and documentation becomes less prominently read, convention drift is the primary failure mode.

**Mitigation strategies (referenced, not implemented here):**

- Automated linting rules enforcing module boundary constraints
- Lifecycle audit tooling that detects `connectedCallback` subscriptions without matching `disconnectedCallback` cleanup
- Bundle analysis that flags imports crossing module layer boundaries in the wrong direction
- Component authoring checklist embedded in PR templates

### Framework Adoption as a Later Option

This architecture is not a permanent anti-framework commitment. The architectural contracts defined here — the `core.*` API surface, the module topology, the event model — are designed to be compatible with a future decision to adopt a framework for specific application layers (route-level rendering, complex form management, data grids) while retaining the native platform primitives as the foundation.

The correct mental model: this architecture provides a stable platform layer that a framework can build on, rather than a framework that replaces the platform. If a future business requirement demands a React or Vue component library integration, that integration is achievable by wrapping Custom Elements as React/Vue-compatible wrappers or by using framework components inside Custom Element shadow DOMs.

---

## 20. Gap Resolution Roadmap

The following is a forward-looking assessment of when current gaps are expected to close based on standardisation trajectory and browser shipping patterns.

|Gap|Current Status|Expected Resolution|
|---|---|---|
|Navigation API (fallback needed)|Newly Available Jan 2026|Widely Available ~2028|
|URLPattern (fallback needed)|Newly Available Sep 2025|Widely Available ~2027|
|View Transitions same-doc (fallback needed)|Newly Available Oct 2025|Widely Available ~2027|
|View Transitions cross-doc (Chromium + Safari)|Not cross-browser|Firefox shipping: unclear|
|CSS Anchor Positioning (fallback needed)|Newly Available Jan 2026|Widely Available ~2028|
|Popover API (fallback needed)|Newly Available Jan 2025|Widely Available ~2027|
|Content-visibility (fallback: none needed, graceful degradation)|Newly Available ~2024|Widely Available now|
|Sanitizer API (DOMPurify fallback)|Not Baseline|Cross-browser: unclear timeline|
|Background Sync (manual fallback)|Chromium only|Firefox/Safari: unclear|
|Speculation Rules (link prefetch fallback)|Chromium dominant|Firefox: unclear; Safari: disabled default|
|TC39 Signals (Proxy fallback)|Stage 1|Browser shipping: estimated 2028+|
|CSS Mixins (preprocessor fallback)|Chrome 146 only|Cross-browser: 2027+|
|interpolate-size (WAAPI fallback)|Emerging|Cross-browser: 2026–2027|
|File System Access pickers (file input fallback)|Chromium only|Firefox/Safari: unclear|
|Periodic Background Sync (on-open fallback)|Chromium PWA only|Not on standards track for others|

**Reading this table:** "Widely Available ~2027" means the API is expected to transition from "Newly Available" to "Widely Available" Baseline status as the 30-month clock from its initial multi-browser availability expires. This does not mean all users will have it by that date — it means the architectural rationale for maintaining a fallback becomes less important as the user population on older browsers shrinks.

---

_This document is part of the Native-First Web Platform Architecture Specification._  
_Cross-references: `18. native-platform-capabilities.md`, `19. browser-api-research.md`, `2. architecture.md`_

---

**References and Standards:**

- WHATWG HTML Living Standard: `html.spec.whatwg.org`
- W3C CSS View Transitions Module Level 1: `w3.org/TR/css-view-transitions-1`
- W3C Web Cryptography API Level 2: `w3c.github.io/webcrypto`
- W3C Intersection Observer: `w3c.github.io/IntersectionObserver`
- W3C Resize Observer: `w3c.github.io/csswg-drafts/resize-observer`
- WICG Navigation API: `github.com/WICG/navigation-api`
- WICG URLPattern: `github.com/WICG/urlpattern`
- WICG Prioritized Task Scheduling: `wicg.github.io/scheduling-apis`
- WICG Sanitizer API: `wicg.github.io/sanitizer-api`
- WICG Speculation Rules: `github.com/WICG/nav-speculation`
- TC39 Signals: `github.com/tc39/proposal-signals`
- web.dev Baseline: `web.dev/baseline`
- MDN Browser Compatibility Data: `github.com/mdn/browser-compat-data`
- CanIUse: `caniuse.com`
- es-module-shims: `github.com/guybedford/es-module-shims`
- DOMPurify: `github.com/cure53/DOMPurify`
- Floating UI: `floating-ui.com`
- InfoQ — Navigation API Baseline January 2026: `infoq.com/news/2026/05/navigation-api-browser`
- Chrome for Developers — Speculation Rules: `developer.chrome.com/docs/web-platform/implementing-speculation-rules`
- web.dev — URLPattern Baseline: `web.dev/blog/baseline-urlpattern`
- web.dev — Baseline Digest January 2026: `web.dev/blog/baseline-digest-jan-2026`