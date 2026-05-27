## Client-Side Routing Architecture

**Spec authority:** WHATWG HTML Living Standard, WICG Navigation API, WICG URL Pattern API, W3C CSS View Transitions Module Level 1 and 2 **Status:** Navigation API — Baseline Newly Available January 2026. URLPattern — Baseline Newly Available September 2025. Same-document View Transitions — Baseline Newly Available October 2025.

---

## Table of Contents

1. [Philosophy and Scope](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#1-philosophy-and-scope)
2. [Navigation API](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#2-navigation-api)
3. [URLPattern API](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#3-urlpattern-api)
4. [Route Table and Matching](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#4-route-table-and-matching)
5. [Route Lifecycle](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#5-route-lifecycle)
6. [Nested Routing and Outlets](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#6-nested-routing-and-outlets)
7. [Lazy Route Loading and Prefetching](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#7-lazy-route-loading-and-prefetching)
8. [View Transitions Integration](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#8-view-transitions-integration)
9. [Route Guards](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#9-route-guards)
10. [Navigation State](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#10-navigation-state)
11. [Form Navigations](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#11-form-navigations)
12. [URL State Ownership](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#12-url-state-ownership)
13. [Error Handling](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#13-error-handling)
14. [Focus Management and Scroll Restoration](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#14-focus-management-and-scroll-restoration)
15. [Service Worker Coordination](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#15-service-worker-coordination)
16. [Browser Compatibility and Feature Detection](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#16-browser-compatibility-and-feature-detection)

---

## 1. Philosophy and Scope

The router is the application's first-class navigation layer. It owns everything that concerns URL-to-view mapping: matching, handler dispatch, transition orchestration, history management, and guard evaluation. No other module manipulates the URL or the history stack directly.

This architecture's router is built exclusively on two platform APIs — the Navigation API and the URLPattern API — both now at Baseline Newly Available status in all major engines. No third-party routing library is used, and none is needed. The platform primitives are complete.

The fundamental design principle is that every navigation, regardless of its origin, passes through a single interception point: the `navigate` event on `window.navigation`. A user clicking an anchor tag, submitting a form, pressing the browser back button, calling `navigation.navigate()` programmatically, or traversing history via `navigation.traverseTo()` all produce the same event on the same interface. This unification is the central architectural advantage over the History API, which could not intercept link-click navigations and produced a `popstate` event that did not fire for programmatic `pushState()` calls.

The router module lives at `core/router/`. It exports a single initialisation function and a programmatic navigation utility. It does not export global state; components that need to know the current route read from the URL directly or subscribe to `currententrychange` events through a documented internal channel.

---

## 2. Navigation API

**Spec:** WHATWG HTML Living Standard — Navigation API **MDN:** `developer.mozilla.org/en-US/docs/Web/API/Navigation_API` **Status:** Baseline Newly Available — January 2026. Chrome, Edge, Firefox 147, Safari 26.2.

### The window.navigation Interface

The entry point is `window.navigation`, a `Navigation` object available in every browsing context. It is the only interface this router interacts with for all navigation operations. The `window.history` API is not used; the two APIs maintain separate state and must not be mixed.

Key properties and methods on `window.navigation`:

`navigation.currentEntry` returns a `NavigationHistoryEntry` representing the current page. This entry has a stable `key` (a UUID-like string assigned at creation, persists across reloads) and an `id` (a UUID-like string that changes on each navigation to this URL, including reloads). The `key` is the correct identifier for `traverseTo()`; the `id` is useful for identifying a specific load.

`navigation.entries()` returns an array of all `NavigationHistoryEntry` objects for the current browsing context, limited to same-origin entries. This is a complete, readable history stack — a fundamental capability missing from the History API, which provided no programmatic access to the stack.

`navigation.navigate(url, options)` initiates a programmatic push navigation. The returned object has two promises: `committed` (resolves when the URL changes) and `finished` (resolves when the handler completes). The `options` object accepts `state` (arbitrary structured-cloneable data to attach to the entry) and `info` (arbitrary transient data passed to the resulting `navigate` event as `event.info`, not persisted in history).

`navigation.traverseTo(key, options)` navigates to a specific history entry by its `key`. Returns the same `{committed, finished}` promise pair.

`navigation.updateCurrentEntry({state})` updates the state of the current entry without triggering a navigation. Does not fire a `navigate` event; fires `currententrychange` instead.

`navigation.back()`, `navigation.forward()`, and `navigation.reload()` mirror their History API equivalents but return the same `{committed, finished}` promise pair, making them awaitable.

### The navigate Event

The `navigate` event is the central interception point. It is dispatched on `window.navigation` before any navigation commits. The router registers exactly one listener:

```js
window.navigation.addEventListener('navigate', handleNavigate);
```

Properties available on the `NavigateEvent` object:

`event.destination` — a `NavigationDestination` object. `event.destination.url` is the full destination URL string. `event.destination.getState()` returns the state attached to the destination entry (for traversals to existing history entries that had state set).

`event.navigationType` — one of `"push"`, `"replace"`, `"reload"`, or `"traverse"`. This is used to distinguish between forward navigations, in-place replacements, reloads, and back/forward traversals, which may require different handler logic (a traversal may restore previously rendered content from a component cache rather than re-fetching).

`event.canIntercept` — a boolean indicating whether this navigation can be intercepted. Cross-origin navigations cannot be intercepted. Fragment navigations can technically be intercepted but generally should not be. Download navigations cannot be intercepted. The router must check this before calling `intercept()`.

`event.hashChange` — true when the navigation is a same-document fragment navigation. The router should generally not intercept these; the browser handles them correctly by default.

`event.downloadRequest` — non-null when the navigation is a download. The router must not intercept downloads.

`event.userInitiated` — true when the navigation was triggered by a user action (link click, form submit, back/forward button). False for programmatic navigations. Useful for analytics and guard logic.

`event.sourceElement` — the element that initiated the navigation (e.g., the anchor element clicked), when applicable.

`event.signal` — an `AbortSignal` that becomes aborted if the navigation is superseded by a new navigation or cancelled. Every `fetch()` call made during the handler must receive this signal so that in-flight requests are cancelled automatically if the user navigates away before the handler completes.

`event.info` — the transient data passed via the `navigate()` call's `info` option. Not stored in history. Useful for passing one-time context to the handler (e.g., an optimistic UI update hint or an animation direction).

`event.formData` — a `FormData` object when the navigation was initiated by a form submission. Non-null only for form-driven navigations.

### event.intercept()

Calling `event.intercept()` on a `NavigateEvent` converts the navigation from a full document load into a same-document navigation. The browser immediately commits the URL change (updating `location.href` and `navigation.currentEntry`) and then calls the provided handler. If the handler returns a promise (it will be async in all practical cases), the browser waits for the promise to settle before firing `navigatesuccess` or `navigateerror`.

`intercept()` accepts an options object with three optional properties: `handler`, `precommitHandler`, `focusReset`, and `scroll`.

`handler` is an async function that performs the actual DOM update. It runs after the URL has been committed. This is the correct location for rendering the new route's component into the appropriate outlet element.

`precommitHandler` is an async function that runs after the `navigate` event fires but before the URL is committed. It receives a `NavigationPrecommitController` as its argument. Returning a rejected promise from `precommitHandler` aborts the navigation entirely, with no URL change. This is the correct mechanism for authentication guards and redirect logic (see Section 9). The `NavigationPrecommitController` exposes a `redirect(url, options)` method that changes the navigation's eventual destination before commit, and an `addHandler(fn)` method for conditionally registering post-commit handlers.

`focusReset` controls post-navigation focus behaviour. The default value `"after-transition"` resets focus to the first `autofocus` element in the document, or to `<body>` if none exists. Setting this to `"manual"` suppresses automatic focus management, requiring the router or route component to place focus explicitly. Manual control is required for any application that needs to place focus on a specific landmark or heading after navigation, which is important for screen reader users.

`scroll` controls scroll restoration. The default `"after-transition"` restores scroll position for traversal navigations and scrolls to the top for push/replace navigations. Setting this to `"manual"` suppresses automatic scroll management.

Multiple `intercept()` calls on the same `NavigateEvent` are permitted (if multiple listeners intercept). All `precommitHandler` callbacks are resolved before the navigation commits. All `handler` callbacks run after commit. If any handler rejects, `navigateerror` fires.

### Navigation Events

`navigatesuccess` fires on `window.navigation` when all handler promises have fulfilled. The router uses this event to hide loading indicators and fire post-navigation analytics.

`navigateerror` fires on `window.navigation` when any handler promise rejects. The event is an `ErrorEvent`; `event.message`, `event.filename`, and `event.error` are available. The router uses this as a centralised error boundary.

`currententrychange` fires on `window.navigation` when `navigation.currentEntry` changes, including for traversals, replace navigations, and `updateCurrentEntry()` calls. The event object is a `NavigationCurrentEntryChangeEvent` with `navigationType` and `from` (the previous entry) properties. Route-level components that need to react to navigation changes without triggering a full re-render subscribe to this event.

---

## 3. URLPattern API

**Spec:** WICG URL Pattern API (urlpattern.spec.whatwg.org) **MDN:** `developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API` **Status:** Baseline Newly Available — September 2025. Chrome, Edge, Firefox, Safari. Also available in Web Workers and Service Workers.

### Constructor

`URLPattern` accepts either a single pattern string, or an object with properties corresponding to URL components: `protocol`, `username`, `password`, `hostname`, `port`, `pathname`, `search`, `hash`. Each property can be independently specified; unspecified properties default to a wildcard that matches anything.

```js
// Match any URL with this pathname, regardless of origin
new URLPattern({ pathname: '/users/:id' })

// Match a full URL with a specific origin
new URLPattern('https://example.com/articles/:slug')

// Match any subdomain with an API path
new URLPattern({ hostname: '*.example.com', pathname: '/api/:version/*' })
```

The pattern syntax is based on path-to-regexp, which is the same syntax used by Express.js route patterns and popularised across the ecosystem. It supports named capture groups (`:paramName`), wildcards (`*`), non-capturing groups, optional segments, and embedded regular expression groups. The syntax is a superset of path-to-regexp, extended to support origin-level matching.

### test() and exec()

`pattern.test(url)` returns a boolean: does the URL match the pattern? Used during route table iteration for fast matching.

`pattern.exec(url)` returns a `URLPatternResult` object on match, or `null` on no match. The result has properties for each URL component (`pathname`, `hostname`, `search`, `hash`, etc.), each of which is an object with `input` (the matched substring) and `groups` (a plain object of named capture group values). This is the correct method to use when route parameters need to be extracted and passed to the handler.

```js
const pattern = new URLPattern({ pathname: '/articles/:year/:slug' });
const result = pattern.exec('https://example.com/articles/2026/intro-to-routing');
// result.pathname.groups.year === '2026'
// result.pathname.groups.slug === 'intro-to-routing'
```

Named groups become typed object properties rather than positional array indices. This eliminates the index-based fragility of regex groups.

### hasRegExpGroups

`pattern.hasRegExpGroups` is a read-only boolean indicating whether the pattern contains embedded regular expression capturing groups. Certain platform APIs (including the Service Worker static routes API's `urlPattern` condition) prohibit regexp groups. Routes intended for Service Worker static routing must use only named groups and wildcards, not embedded regexps, and this property can be checked to validate conformance.

### Availability in Workers

`URLPattern` is available in both Web Workers and Service Workers. The router's pattern definitions — the same `URLPattern` instances registered in the main-thread route table — can be imported and used in the Service Worker for request-level routing without duplicating pattern logic. This shared availability is an architectural advantage over library-based routing, which typically cannot be imported cleanly into a Service Worker context.

---

## 4. Route Table and Matching

### Route Table Structure

The router maintains a route table as an ordered array of route definition objects. Each route definition has the following shape:

```
{
  pattern: URLPattern,
  load: () => Promise<RouteModule>,
  meta: { title: String, auth: Boolean, ... }
}
```

`pattern` is a compiled `URLPattern` instance. `load` is a zero-argument function that returns a dynamic `import()` of the route's module. `meta` is an optional plain object of route-level metadata consumed by guards and the document title manager.

Route definitions are declared in a single source file imported by the router module. They are not scattered across the application. This centralisation is a deliberate constraint: the full route table must be inspectable at once to reason about application structure.

### Matching Algorithm

On each `navigate` event, after passing the interceptability guards (`event.canIntercept`, `event.hashChange`, `event.downloadRequest`), the router constructs a `URL` object from `event.destination.url` and iterates the route table in declaration order. Each pattern is tested with `pattern.exec(destinationUrl)`. The first match wins; iteration stops.

First-match semantics mean that more specific routes must be declared before more general ones. A wildcard or catch-all route must be last in the table. This ordering contract is enforced by convention and can be validated by a lint rule.

If no route matches, the router calls a registered `notFound` handler, which renders a 404 component into the root outlet. The `notFound` handler is always registered as the last implicit entry in the route table using a catch-all pattern.

---

## 5. Route Lifecycle

A complete navigation from URL change to completed render follows this sequence:

**Step 1 — navigate fires.** `window.navigation` dispatches the `NavigateEvent`. The router's listener fires synchronously.

**Step 2 — Interceptability check.** The router checks `event.canIntercept`, `event.hashChange`, and `event.downloadRequest`. If any condition requires passing the navigation to the browser, the router returns early without calling `intercept()`.

**Step 3 — Route matching.** The router calls `pattern.exec()` against each route table entry. The first match extracts route parameters and identifies the route module loader.

**Step 4 — event.intercept() call.** The router calls `event.intercept({ precommitHandler, handler })`. At this point, control transfers into the intercept lifecycle.

**Step 5 — precommitHandler executes.** If the matched route has guards (authentication, authorisation, or deactivation checks), they are evaluated here, before the URL changes. A failed guard calls `controller.redirect()` to redirect, or rejects the promise to cancel. See Section 9.

**Step 6 — Navigation commits.** The URL updates in `location.href` and `navigation.currentEntry`. Loading UI may be activated here.

**Step 7 — handler executes.** The route module is lazily imported if not cached. `document.startViewTransition()` wraps the DOM update. The route's component is instantiated or retrieved from a component cache and rendered into the matched outlet. The handler's async function returns; the promise settles.

**Step 8 — navigatesuccess fires.** Loading UI is hidden. Post-navigation hooks (analytics, document title update) execute.

If the handler's promise rejects at any point, `navigateerror` fires instead of `navigatesuccess`, and the router's error boundary takes over.

---

## 6. Nested Routing and Outlets

### Outlet Custom Element

Nested route rendering is managed through `<route-outlet>` elements, which are Custom Elements registered by the router module. A `<route-outlet>` element renders the currently active child route's component into its shadow root. When the active child route changes, the outlet replaces its rendered content.

Each outlet has a `name` attribute that identifies which route segment it renders. The root-level outlet (unnamed, or `name="root"`) renders top-level routes. Layout components for nested route groups render named child outlets within their shadow DOM.

### Route Chain Resolution

The router resolves a full URL not to a single route but to a chain of matched route segments. For a URL like `/dashboard/settings/notifications`, the route chain might be `[root, dashboard, settings, notifications]`. Each segment corresponds to an outlet in the component tree.

On each navigation, the router diffs the new route chain against the current route chain. Only outlets whose matched segment has changed receive a new component; outlets whose segment is unchanged are not re-rendered. This is the critical performance characteristic of nested routing: navigating between sibling routes within a layout re-renders only the innermost outlet, not the entire page.

### Route Groups and Layouts

Routes are organised into groups that share a common layout. A group is defined by a parent route entry that renders a layout component. The layout component includes one or more `<route-outlet name="...">` elements where child routes render. The parent route's pattern uses a wildcard suffix to match all child URLs: `{ pathname: '/dashboard/*' }`. Child routes define their relative segment: `{ pathname: '/dashboard/settings' }`.

---

## 7. Lazy Route Loading and Prefetching

### Dynamic Import

Every route module is a dynamic `import()`. The module is not fetched until the route is first activated. The route table's `load` function is a wrapper around the import:

```js
load: () => import('/routes/settings.js')
```

On first navigation to a route, `load()` is called. The returned promise is awaited in the route handler. On subsequent navigations to the same route, the browser's module cache serves the module synchronously at negligible cost. The router does not maintain its own module cache; it relies entirely on the browser's module registry semantics.

Route modules export a single default — the Custom Element class for the route's component — and optionally a named `guard` export for route-level guard logic and a named `meta` export for route metadata.

### Prefetching with modulepreload

During idle time, the router inserts `<link rel="modulepreload">` elements for routes likely to be visited next. The heuristic for "likely next" is IntersectionObserver-driven: any visible anchor element whose `href` matches a registered route triggers a `modulepreload` hint during the next idle callback.

```js
// Pseudocode — triggered in scheduler.postTask('background')
observer = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const href = entry.target.getAttribute('href');
    const route = matchRoute(href);
    if (route && !preloaded.has(route)) {
      insertModulePreloadHint(route.moduleUrl);
      preloaded.add(route);
    }
  }
});
// Observe all anchor elements in the current route component
```

`modulepreload` triggers both the fetch and parsing of the module graph. When the user then navigates to the route, the import resolves immediately from the cache.

### Speculation Rules API

For multi-page application scenarios where full-document navigations occur, the Speculation Rules API (`<script type="speculationrules">`) extends prefetching to full document prerendering with configurable eagerness levels — `"immediate"`, `"moderate"`, and `"conservative"`. This API is Chromium-only as of mid-2026; Safari and Firefox are not yet supported.

For this architecture's single-page application routing, `modulepreload` is the correct and broadly supported prefetch mechanism. Speculation Rules may be used as a progressive enhancement for Chromium browsers in scenarios involving full-page navigations (e.g., cross-origin links in a multi-app context), detected via `HTMLScriptElement.supports('speculationrules')`.

---

## 8. View Transitions Integration

**Spec:** W3C CSS View Transitions Module Level 1 (same-document) and Level 2 (cross-document) **Status — same-document:** Baseline Newly Available October 2025. Chrome 111+, Edge 111+, Firefox 133+, Safari 18+. **Status — cross-document:** Chrome 126+, Edge 126+, Safari 18.2+. Firefox does not support cross-document transitions as of mid-2026.

### Integration Point

`document.startViewTransition(callback)` wraps the DOM update inside the route handler. The browser captures a screenshot of the current visual state before the callback executes, runs the callback to update the DOM, captures the new state, and composites an animated transition between them — a cross-fade by default, GPU-accelerated, off the main thread.

The router wraps every handler's DOM update in a View Transition. The integration is conditional: if the browser does not support `document.startViewTransition`, the DOM update runs directly without animation. No animation library is required for any navigation transition in this system.

```js
async handler() {
  const component = await loadRouteComponent(route);
  if (document.startViewTransition) {
    await document.startViewTransition(() => outlet.render(component)).finished;
  } else {
    outlet.render(component);
  }
}
```

The `ViewTransition` object returned by `startViewTransition()` exposes a `finished` promise that resolves when the transition animation completes. For navigations where the router needs to await transition completion before executing post-navigation hooks, `await transition.finished` is used.

### Named Transitions with view-transition-name

The `view-transition-name` CSS property assigns individual elements to named transition groups. When a named element exists in both the pre-transition and post-transition state, the browser animates it as a shared element — morphing its position, size, and appearance from the old state to the new, rather than cross-fading at the page level.

For a list-to-detail navigation pattern, the correct approach is to assign a unique `view-transition-name` to the element representing the selected item before the navigation, and assign the same name to the corresponding element in the detail view. This is set programmatically in the navigate event's handler, immediately before the `startViewTransition()` call.

```js
// Before transition: assign name to the source element
sourceElement.style.viewTransitionName = 'selected-item';

await document.startViewTransition(() => {
  // Render the detail view, which also has view-transition-name: selected-item
  outlet.render(detailComponent);
}).finished;

// Clean up after transition
sourceElement.style.viewTransitionName = '';
```

Named transition groups are CSS-controllable via `::view-transition-group(name)`, `::view-transition-old(name)`, and `::view-transition-new(name)` pseudo-elements.

### Cross-Document Transitions

For multi-page navigations, same-origin cross-document View Transitions are enabled through the `@view-transition` CSS at-rule in both the outgoing and incoming documents. The `pageswap` and `pagereveal` events on the `window` object provide hooks for customising transition behaviour. This requires no JavaScript in the navigation path and is the correct approach for MPA-style architectures.

Firefox's lack of cross-document View Transitions support as of mid-2026 means MPA-style animated transitions are a progressive enhancement. The `@supports (view-transition-name: none)` check can scope the at-rule to supporting browsers without disrupting the layout in non-supporting ones.

### Performance Considerations

View transitions that occupy the main thread for more than a short interval will negatively affect Interaction to Next Paint (INP). The `startViewTransition()` callback must complete quickly. Long-running work (data fetching, complex component initialisation) must be completed before the callback, or broken into microtasks that yield via `scheduler.yield()`. The browser composites the animation on the GPU; only the JavaScript inside the callback runs on the main thread.

---

## 9. Route Guards

Route guards control whether a navigation is permitted to proceed. This architecture implements guards in two categories: activation guards (evaluated before a route is entered) and deactivation guards (evaluated before leaving a route). Both categories integrate with the Navigation API's `precommitHandler` and `event.signal` mechanisms.

### Activation Guards via precommitHandler

The `precommitHandler` option in `event.intercept()` is the correct mechanism for activation guards. It runs after the `navigate` event fires but before the URL commits, making it the only correct place to redirect unauthenticated users without exposing an intermediate URL state.

A `precommitHandler` receives a `NavigationPrecommitController`. Calling `controller.redirect(url, options)` changes the navigation destination before commit. Only one navigation event fires, and only one URL ever appears in the address bar. The user is never momentarily shown a protected URL before being redirected.

Guard logic is defined at the route level as an exported `guard` function in the route module, or at the table level as a property of the route definition. The router composes them:

```js
event.intercept({
  async precommitHandler(controller) {
    // Table-level guard
    if (route.meta.auth && !await isAuthenticated()) {
      controller.redirect('/login', { state: { returnTo: event.destination.url } });
      return;
    }
    // Route-level guard (from route module)
    if (routeModule.guard) {
      await routeModule.guard(event.destination, controller);
    }
  },
  async handler() {
    // DOM update — only runs if precommitHandler did not redirect or reject
  }
});
```

If the `precommitHandler` promise rejects, the navigation is cancelled entirely with no URL change and no DOM update. `navigateerror` fires with the rejection reason. This is the correct path for guard failures that should be treated as errors rather than redirects.

The `event.signal` is available inside the `precommitHandler` and should be passed to any async operations (token validation, permission API queries) so they are cancelled if the navigation is superseded.

### Safari precommitHandler Gap

As of mid-2026, Safari's Navigation API implementation is missing support for the `precommitHandler` option. The feature is marked as blocked by Safari in the web platform features explorer. This is a live browser gap that requires a fallback strategy.

The fallback is to perform guard logic synchronously or at the start of the `handler` function. If a guard fails inside `handler`, the navigation has already committed (URL has changed). The router must call `navigation.navigate(fallbackUrl, { history: 'replace' })` to correct the URL. This creates a brief period where the address bar shows the protected URL. For applications that cannot expose protected URL patterns even transiently, a server-side guard (via Service Worker fetch interception or server-rendered redirect) is required as a belt-and-suspenders measure.

The recommended approach is to implement the guard in both `precommitHandler` (for Chrome and Firefox) and as the first operation in `handler` (for Safari), using the same guard function in both positions. A feature detect on `NavigationPrecommitController` is not reliable; instead, structure the code so the handler guard is always present but the precommit guard provides an improved user experience where available.

### Deactivation Guards

A deactivation guard prevents navigation away from the current route when the user has unsaved changes. The Navigation API does not provide a direct equivalent to the `beforeunload` event for same-document navigations. Deactivation guards are implemented by:

1. The current route component subscribes to `navigate` events on `window.navigation` during its connected lifecycle, with an `AbortController` signal for cleanup.
2. When a navigation is initiated and the component has unsaved state, the handler calls `event.preventDefault()` (which cancels the navigation if the event is cancelable) and displays a confirmation dialog.
3. If the user confirms, the component sets a flag that instructs the guard to pass on the next navigation, then re-initiates the navigation.

`event.preventDefault()` cancels the navigation for cancelable events. Not all navigation events are cancelable; `event.cancelable` must be checked before calling it. Traversal navigations (back/forward) are not cancelable.

---

## 10. Navigation State

Navigation state in this architecture is partitioned into two distinct concepts that must not be confused: history entry state and navigation info.

### History Entry State

State attached to a history entry is set via the `state` option in `navigation.navigate()`, `navigation.reload()`, or `navigation.updateCurrentEntry()`. It is stored by the browser, persists across reloads (for the session), and is retrievable from any `NavigationHistoryEntry` object via `entry.getState()`.

State is deep-cloned on storage and retrieval. The browser uses the structured clone algorithm. Functions, DOM nodes, and non-cloneable objects cannot be stored. Only serialisable data is valid: plain objects, arrays, strings, numbers, booleans, `Map`, `Set`, `ArrayBuffer`, and similar.

State is retrieved in the navigate event handler via `event.destination.getState()`. This returns the state that was attached when the destination entry was created or last updated. For traversal navigations (back/forward), this is how the router restores scroll position, component instance state, or form field values.

State set via the Navigation API is completely separate from state set via `window.history.pushState()`. Calling `getState()` only returns Navigation API state; `history.state` only returns History API state. Applications using the Navigation API must not mix `history.pushState()` calls with Navigation API navigations.

### Navigation Info

The `info` option in `navigation.navigate()` passes transient data to the resulting `navigate` event as `event.info`. This data is not stored in history and does not survive a reload or traversal. It is used for one-shot contextual hints to the handler — for example, an indication of which animation direction to use, or an optimistic render payload that avoids a network round-trip.

### updateCurrentEntry

`navigation.updateCurrentEntry({ state })` updates the state of the current entry without navigating. This is the correct mechanism for persisting UI state (scroll position, open accordion panels, form draft) as the user interacts with a page, so that the state is restored when the user presses back. It fires `currententrychange` but not `navigate`.

### Entry Lifecycle Events

Each `NavigationHistoryEntry` dispatches `navigateto` when it becomes the current entry and `navigatefrom` when the user navigates away from it. It also dispatches `dispose` when the entry is permanently evicted from history — for example, when a push navigation truncates the forward history stack. The `dispose` event is the correct location for route-level cleanup of resources associated with a specific history entry.

---

## 11. Form Navigations

The Navigation API intercepts form submissions as navigations. When a form is submitted, the `navigate` event fires with `event.formData` containing a `FormData` object representing the submitted form fields. `event.navigationType` will be `"push"` or `"replace"` depending on the form's `method` and the page's navigation history.

The router handles form navigations through the same route table as link-click navigations. The matched handler receives `event.formData` and can process it directly — submitting to an API, validating client-side, and rendering the result — without a full page reload.

```js
async handler() {
  if (event.formData) {
    const result = await submitForm(event.formData, { signal: event.signal });
    outlet.render(resultComponent(result));
  } else {
    // Standard navigation
    outlet.render(await loadRouteComponent(route));
  }
}
```

This makes the router the single interception point for both link-driven and form-driven navigations. There is no need for `fetch()`-on-submit workarounds or separate form submission event listeners at the component level.

---

## 12. URL State Ownership

The router owns the URL. This is an absolute constraint: no other module reads or writes `location.href`, `location.pathname`, `location.search`, or `location.hash` directly. All URL reads go through `window.navigation.currentEntry.url` (a full URL string) or through the `URL` constructor applied to it. All URL changes go through `navigation.navigate()`, `navigation.reload()`, or `navigation.traverseTo()`.

### Search Parameter State

URL search parameters are the canonical location for state that must survive a reload, be sharable as a bookmark, and be representable as a URL. The router extracts search parameters from the destination URL via the standard `URL` and `URLSearchParams` interfaces.

Components that need to read URL-persisted state do not read from `location.search`; they receive their data from the route handler, which passes the extracted parameters as part of the rendered component's initialisation. Components that need to update URL-persisted state call a router-provided utility function that calls `navigation.navigate()` with the updated URL, rather than manipulating the URL string directly.

### Hash Navigations

Fragment navigations — changes to the URL hash with no change to the pathname or search — are not intercepted by the router. The browser's default behaviour (scrolling to the matching element) is preserved. If an application needs custom hash behaviour, it should use the `hashchange` event, not the Navigation API's `navigate` event, to avoid interfering with the router's interception logic.

---

## 13. Error Handling

Navigation errors are centralised through the `navigateerror` event on `window.navigation`. The router registers a single error handler:

```js
window.navigation.addEventListener('navigateerror', event => {
  hideLoadingIndicator();
  if (event.error?.name === 'AbortError') {
    // Superseded by another navigation — not a user-visible error
    return;
  }
  renderErrorBoundary(event.error, outlet);
  logNavigationError(event);
});
```

`AbortError` — thrown when a navigation's `AbortSignal` fires because a newer navigation superseded it — must be silently handled. It is not a real error; it is an expected condition during rapid navigation (e.g., a user who clicks multiple links quickly). All route handlers that await fetch operations will receive `AbortError` rejections when superseded, and all such operations pass `event.signal` to their `fetch()` calls precisely so this abort chain works automatically.

All other error types are genuine failures: module load failures (network errors during `import()`), handler exceptions, guard rejections. These are presented to the user through an in-page error component and reported to the application's error tracking system.

The `navigateerror` handler's guarantee is that if a route handler throws or rejects for any reason, the application's error boundary runs. Route handlers do not need try-catch blocks for the purpose of rendering errors; only for internal error recovery logic that should not propagate to the boundary.

---

## 14. Focus Management and Scroll Restoration

### Focus

After a navigation that replaces substantial content, WCAG guidelines require focus to be moved to a meaningful location so keyboard and screen reader users are aware of the change. The Navigation API's default behaviour — resetting focus to the `autofocus` element or `<body>` — is a reasonable baseline but insufficient for most applications.

The recommended pattern is to set `focusReset: 'manual'` in `event.intercept()` and explicitly place focus on the primary content region of the newly rendered route. The route component's Custom Element can expose a `focus()` method that the router calls after the transition completes. Alternatively, the first heading element in the route component can receive a `tabindex="-1"` and be focused programmatically.

For routes where the user is returning to previously visited content (traversal navigations), focus should generally not be forced to a heading — the user has already seen this content. The `event.navigationType === 'traverse'` check allows the router to skip focus management for traversals and rely on the browser's natural focus restoration.

### Scroll Restoration

The Navigation API provides built-in scroll restoration for traversal navigations when `scroll` is not set to `"manual"`. Scroll position is stored per history entry by the browser and restored automatically on traversal.

For push navigations (new page loads), the default behaviour scrolls to the top. For navigations to a URL with a hash fragment, the browser scrolls to the matching element if `event.hashChange` is false and the hash target exists in the new document. The router passes all hash navigations to the browser unchanged, allowing this behaviour to function.

When `scroll: 'manual'` is required — for example, when a route renders incrementally and scroll restoration must wait for content to be ready — the router calls `event.scroll()` explicitly at the point in the handler when content is available.

---

## 15. Service Worker Coordination

The `URLPattern` API's availability in Service Workers enables consistent route-aware request handling at the fetch interception layer, using the same pattern syntax as the main-thread router.

The Service Worker imports the route pattern definitions (the URL patterns only, not the handler logic) and uses them to make routing decisions on fetch events: whether to serve from cache, to forward to the network, or to serve an offline fallback page. This avoids duplicating route structure between the main thread and the Service Worker.

Route-level caching strategies are a natural extension: API requests for a given route can be identified by matching the fetch URL against route-associated API path patterns and applying the appropriate strategy (cache-first for static assets, network-first for user data, stale-while-revalidate for content feeds).

The Service Worker and the main-thread router do not share live state. Communication between them uses `BroadcastChannel` (for multi-tab coordination) or the `MessageChannel` API for direct SW-to-client messaging, as described in the worker architecture document.

The Service Worker also handles the SPA shell routing requirement: every same-origin navigation that does not match a static asset pattern is served the application shell HTML, allowing the client-side router to take over. This is the standard offline-capable SPA pattern, and it requires the Service Worker to use `URLPattern` matching to distinguish static asset requests from application navigation requests.

---

## 16. Browser Compatibility and Feature Detection

### Baseline Status Summary

|API|Baseline Status|Since|
|---|---|---|
|Navigation API (core)|Newly Available|January 2026|
|Navigation API — precommitHandler|Limited (Safari missing)|Chrome/Firefox only|
|URLPattern|Newly Available|September 2025|
|View Transitions — same-document|Newly Available|October 2025|
|View Transitions — cross-document|Limited (Firefox missing)|Chrome, Edge, Safari 18.2+|
|Speculation Rules API|Limited (Chromium only)|Chrome, Edge only|

### Feature Detection

The router module's initialisation function performs feature detection before registering any listeners:

```js
const hasNavigationAPI = 'navigation' in window;
const hasURLPattern = 'URLPattern' in window;
const hasViewTransitions = 'startViewTransition' in document;
const hasPrecommitHandler = (() => {
  try {
    // precommitHandler is detectable via the spec; Safari throws on use, not on existence check
    return 'NavigationPrecommitController' in window;
  } catch { return false; }
})();
```

If `hasNavigationAPI` is false, the router falls back to a History API implementation. As of January 2026, this fallback applies only to browsers predating the Baseline window — a small and shrinking population. The fallback History API router does not support `precommitHandler` guards or form navigation interception.

If `hasURLPattern` is false (browsers before September 2025), the router falls back to a minimal path-matching utility using `URL` and manual string comparison. Named capture groups are emulated through a thin wrapper. This fallback is temporary; URLPattern is Baseline Newly Available and no longer requires a polyfill for production use in 2026.

If `hasViewTransitions` is false, DOM updates run without animation. The application functions identically; transitions are a progressive enhancement.

### Cross-Origin Constraints

The Navigation API cannot intercept cross-origin navigations. `event.canIntercept` will be false, and `event.intercept()` will throw a `SecurityError` if called. The router's early-exit check on `event.canIntercept` is therefore not optional; it is a correctness requirement.

Same-origin constraint: the router can only intercept navigations where the origin does not change. Applications that span multiple origins (e.g., a marketing site on `example.com` and an application on `app.example.com`) require either different router instances per origin or cross-origin communication strategies that are outside the router's scope.

### Migration from History API

Applications migrating from a History API-based router should follow the WICG Navigation API migration guide. The key contract differences are: `pushState()`/`replaceState()` calls must be replaced with `navigation.navigate()`/`navigation.reload()` calls; `popstate` event listeners must be replaced with `navigate` event listeners; and `history.state` access must be replaced with `navigation.currentEntry.getState()`. The two APIs maintain separate state stores; mixing them produces inconsistent results.

---

## Summary: What the Router Does Not Own

The router owns URL-to-view mapping, history management, navigation lifecycle, and transition orchestration. It does not own:

- **Component rendering internals** — the router tells an outlet which component to render; the component manages its own shadow DOM.
- **Data fetching** — route handlers may initiate a fetch to determine what to render, but data loading logic belongs in the network layer. The router passes the fetch's `AbortSignal` down and does not manage caching.
- **Authentication state** — guards read authentication state from the state layer; they do not own it.
- **Scroll position of inner components** — the router manages the top-level document scroll; component-internal scroll is the component's responsibility.
- **URL search parameter encoding semantics** — the router reads and writes search parameters but delegates their structure to the domain they belong to.

---

**References:**

- WHATWG HTML Living Standard — Navigation API: `html.spec.whatwg.org/dev/nav-history-apis.html`
- WICG Navigation API explainer: `github.com/WICG/navigation-api`
- MDN — Navigation API: `developer.mozilla.org/en-US/docs/Web/API/Navigation_API`
- MDN — NavigateEvent: `developer.mozilla.org/en-US/docs/Web/API/NavigateEvent`
- MDN — NavigateEvent.intercept(): `developer.mozilla.org/en-US/docs/Web/API/NavigateEvent/intercept`
- MDN — NavigationPrecommitController: `developer.mozilla.org/en-US/docs/Web/API/NavigationPrecommitController`
- MDN — URLPattern: `developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API`
- web.dev — URLPattern Baseline: `web.dev/blog/baseline-urlpattern`
- MDN — View Transition API: `developer.mozilla.org/en-US/docs/Web/API/View_Transition_API`
- W3C — CSS View Transitions Module Level 1: `w3.org/TR/css-view-transitions-1`
- InfoQ — Navigation API Baseline January 2026: `infoq.com/news/2026/05/navigation-api-browser`
- web.dev — Navigation API Baseline: `web.dev/blog/baseline-navigation-api`
- Chrome for Developers — Modern client-side routing with Navigation API: `developer.chrome.com/docs/web-platform/navigation-api`
- Web Platform DX — Limited Availability (precommitHandler): `web-platform-dx.github.io/web-features-explorer/limited-availability`