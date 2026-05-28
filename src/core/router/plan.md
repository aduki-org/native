# Client-Side Routing Architecture Plan

This document outlines the consolidated, high-performance client-side routing engine architecture under `core.router` in the `@adukiorg/native` library. It covers URL-to-view matching, dynamic component rendering, guards evaluation, the multi-container WeakRef registry topology, concurrent element-scoped transitions, and validation plans.

---

## 1. Architectural Strategy & Core Requirements

The client-side router acts as the application's authoritative first-class navigation coordinator. It completely owns URL-to-view matching, dynamic component rendering, guards evaluation, history traversal checks, and visual transition orchestration.

### Key Pillars

1. **Unified Interception (Navigation API):** Register exactly one event listener on the native `window.navigation` event. Any link click, form submission, history traversal, or programmatic `navigation.navigate()` is intercepted at a single junction.
2. **Path Matching (URLPattern):** Utilize the compiled `URLPattern` matching engine to execute fast path parsing, parameterized path capture (`:id`), and modifier evaluations (`?`, `*`, `+`).
3. **Layout-Preserving Nested Routing:** Diff route segments to identify changes. Render nested elements into custom `<route-outlet>` Shadow DOM frames, ensuring that unchanged parent layouts are preserved and not unnecessarily unmounted.
4. **Transition Integration:** Seamlessly wrap DOM layout updates inside `document.startViewTransition()` to achieve GPU-accelerated same-document transitions, falling back to standard synchronous rendering when unsupported.
5. **Robust Safari Fallbacks:** Address Safari's lack of `precommitHandler` by running guard logic in both pre-commit and post-commit phases, applying immediate URL replacements to preserve authorization boundaries.

---

## 2. Component Blueprint & Files Layout

The router architecture strictly aligns with the lowercase, single-word naming structure:

```
src/core/router/
├── index.js          # Public facade and programmatic router API
├── history.js        # Wrapper for Navigation API push/replace/traversals
├── intercept.js      # Global navigation listener and lifecycle guards evaluator
├── match.js          # Route table registry and lazy URLPattern compiler
├── outlet.js         # <route-outlet> Custom Element and layout renderer
├── transitions.js    # Safe, fault-tolerant View Transitions orchestrator
└── plan.md           # This comprehensive, consolidated planning document
```

---

## 3. Detailed Component & Integration Designs

### 3.1. Matcher & Table Registry (`match.js`)
* **Pre-Resolved Native URLPattern:** Compiles raw pattern strings into active `URLPattern` instances natively on module load, avoiding dynamic async microtask checks.
* **Deterministic Route Specificity Sorting:** During `router.register()`, routes are automatically sorted by specificity: static paths first, parameterized paths next, and wildcards/catch-alls last. Paths within each category are sorted by length (longest pathname first) to guarantee deterministic matching.
* **Match Resolution:** Match against full URLs by extracting pathname groups safely. If no route matches, fallback immediately to the configured `notFound` handler.

```javascript
export async function match(url) {
  const Pattern = getURLPattern(); // Pre-resolved native or polyfilled URLPattern class
  const targetUrl = new URL(url, globalThis.location?.href || 'http://localhost');

  for (const route of routes) {
    if (!route.pattern) {
      route.pattern = route.patternStr.startsWith('http') 
        ? new Pattern(route.patternStr) 
        : new Pattern({ pathname: route.patternStr });
    }

    const result = route.pattern.exec(targetUrl.href);
    if (result) {
      return {
        route,
        params: result.pathname.groups || {},
        result
      };
    }
  }
  return null;
}
```

### 3.2. Lifecycle Guards, Hydration Gate & Safari Mitigation (`intercept.js`)
* **Precommit Interception:** For modern engines, execute registered guard hooks inside `precommitHandler`. Atomic redirections happen via `controller.redirect(url)` before the URL updates, preventing visual leaks of protected paths.
* **Post-Commit Safari Fallback:** Since Safari currently ignores `precommitHandler`, re-execute guard checks at the start of the `handler()` callback. If a violation is caught post-commit, perform a silent `navigation.navigate(url, { history: 'replace' })` to correct the address bar without adding broken history entries.
* **Async Custom Element Hydration Gate:** When a route is matched, the global orchestrator checks if the matched tag is a custom element (contains a hyphen `-`) and awaits its registration before committing the DOM mount:
```javascript
if (typeof customElements !== 'undefined' && tag.includes('-') && !customElements.get(tag)) {
  await customElements.whenDefined(tag);
}
```
This protects standard HTML elements and ensures components are hydrated before rendering.
* **TransitionController URL Comparison:** Handles absolute and relative URLs transparently using pathname matching with `new URL(u, window.location.href).pathname` to prevent callback execution timeouts.
* **Loading & Error Transitions:** CENTRALIZED error boundary. Handle `navigateerror` globally to catch script load failures or guard rejections. Silence `AbortError` which occurs when a navigation is superseded by a newer one.

### 3.3. Reactivity & State Management Integration
* **URL State Ownership:** The router owns all URL-related reads and writes. Components read from URL search parameters via standard `URLSearchParams` inside route handlers.
* **Reactivity Hookups:** Components read route state from the Proxy-based Session Store. They subscribe to changes and schedule DOM updates via rendering pipelines to avoid UI glitches.
* **Hydration State Modeling:** Manage three-phase loading transitions for remote data:
  * `loading`: Set when a route is matched but in-flight fetches are pending.
  * `hydrated`: Set when local state (IndexedDB/Session) is populated with complete payload.
  * `error`: Triggered if network or decoding fails, prompting an in-page recovery view.

### 3.4. Form Navigation Interception
* **Interception:** `window.navigation` naturally intercepts form submissions (both `GET` and `POST` methods). The `navigate` event delivers a valid `event.formData` instance containing input values.
* **Processing Pipeline:** The router passes `event.formData` directly to matched handlers, bypassing traditional page-reloading standard action submissions.

```javascript
async handler() {
  if (event.formData) {
    // Process form payload asynchronously and render results
    const result = await processFormSubmit(event.formData, { signal: event.signal });
    outlet.render(resultView(result));
  } else {
    // Standard navigation render
    outlet.render(await loadRouteView(route));
  }
}
```

### 3.5. Nested Routing & Shadow DOM Outlets (`outlet.js`)
* **Nested Route Resolution:** Diff the resolved route segment chains on each navigation pass. Only update `<route-outlet>` elements whose active segment has changed, avoiding re-rendering of outer layout components.
* **Custom `<route-outlet>` Element:** Opens a shadow root to isolate styles. Autodefines unregistered Custom Element ES classes on-the-fly using their class name:

```javascript
async render(elementOrClass, props = {}) {
  this.#shadow.innerHTML = '';
  if (typeof elementOrClass === 'function') {
    let tagName = elementOrClass.name.toLowerCase();
    if (!tagName.includes('-')) {
      tagName = `route-${tagName}`;
    }
    if (!customElements.get(tagName)) {
      customElements.define(tagName, elementOrClass);
    }
    const el = document.createElement(tagName);
    Object.assign(el, props);
    this.#shadow.appendChild(el);
    return el;
  }
  // Handles string element tags & HTMLElement instances...
}
```

### 3.6. View Transitions Integration (`transitions.js`)
* **Fault-Tolerant Transitions:** Wrap DOM mutations in `document.startViewTransition()`. Add a try-catch guard to silence aborted view transition errors (common during rapid clicking) to ensure application stability.
* **Unblocking Transition Engine:** Resolves transition execution instantly using `vt.ready` instead of `vt.finished`, preventing route management pipelines from being blocked by long-running paint frames.
* **Synchronous Updates Bypass:** If no asynchronous promise is returned by the update callback, updates are run synchronously to avoid unneeded microtask scheduler ticks.
* **Shared Element Morphing:** Assign unique `view-transition-name` strings programmatically to interactive elements before the transition, and reset them immediately on transition completion to achieve fluid list-to-detail transformations.

### 3.7. The `<nav-link>` Primitive Element
* **Tag Naming & Registration:** The primitive router-aware anchor tag is explicitly named and registered as `nav-link` (not `ui-link`).
* **Active State Auto-Synchronization:** The element listens to standard browser `navigate` events. When matched, it sets the `aria-current="page"` attribute automatically, enabling CSS pseudo-selector styles like `::slotted(nav-link[aria-current="page"])` to highlight active tabs.
* **Cancelable External Click Events:** Clicking an external target triggers a custom `external` event:

```javascript
const event = new CustomEvent('external', {
  detail: { href, target },
  bubbles: true,
  cancelable: true,
  composed: true
});
this.dispatchEvent(event);
if (event.defaultPrevented) {
  e.preventDefault(); // HALT browser default anchor navigation
}
```
This enables parent applications to show alert boxes, warnings, or styled modal gates before allowing external page redirects.

---

## 4. Advanced Container-Driven Routing Architecture

This architecture outlines a next-generation routing topology for `@adukiorg/native`. It replaces the monolithic single-outlet model with a **multi-container, concurrent-transition architecture** that mirrors a real desktop OS: multiple named regions of the UI mount and animate independently, and navigation only activates when its required container is verifiably alive in the DOM at the moment of resolution.

### 4.1. The Container Model

#### What Is a Container?
A container is any DOM node (a standard element such as `#main-content`, or a custom element such as `<app-sidebar>`) that acts as a **first-class mounting slot** for routed views. Containers own their own animation, their own DOM swap strategy, and their own transition scope.

The `container` field in a `ui.element` spec accepts either form:
```javascript
container: '#main-content'   // standard element resolved via CSS selector
container: 'app-sidebar'     // custom element resolved via the container registry
```

Both forms resolve through the same internal registry. Selectors go through `document.querySelector` as a fallback only if no explicit registration is found.

#### The Singleton Constraint
**Two containers with the same name cannot coexist in the DOM at the same time.**
If a second instance of `<app-sidebar>` attempts to connect while one is already registered, the router throws immediately:
```
ContainerError: Singleton violation — 'app-sidebar' is already mounted.
                A second instance cannot register while the first is active.
```
This is enforced in `connectedCallback` before any registration is accepted.

### 4.2. The Live Container Node Map

#### Data Structure
The router maintains a `Map<string, WeakRef<HTMLElement>>` — a **named, weakly-held reference map** of every currently active container node.

`WeakRef` is chosen deliberately over a strong `Map`:
- The router does **not** prevent containers from being garbage-collected if the rest of the app removes them from the DOM.
- If a `WeakRef` dereferences to `undefined` (e.g. node GC'd before `disconnectedCallback` fires), the router treats the container as absent and yields a `RouteError`.
- A `FinalizationRegistry` runs in the background as a passive safety net to prune stale map entries after GC.

```javascript
const containerNodeMap = new Map();           // string → WeakRef<HTMLElement>
const cleanupRegistry = new FinalizationRegistry((name) => {
  if (containerNodeMap.get(name)?.deref() === undefined) {
    containerNodeMap.delete(name);
  }
});
```

#### Background Updates: Non-Blocking, Lifecycle-Driven
The node map is **never polled**. It updates reactively through two mechanisms:

1. **Custom Element Lifecycle Hooks**: Containers register themselves in `connectedCallback` and unregister in `disconnectedCallback`.
2. **MutationObserver Fallback (Standard Elements Only)**: For plain divs, a single `MutationObserver` watches `document.body` for child changes. Once all registered containers have been resolved, this observer is automatically disconnected to preserve thread resources.

### 4.3. Route Resolution Guard

When navigation triggers, the target container is resolved **before** any DOM mutation:
1. Matched route declares `container: 'app-sidebar'`.
2. Router calls `containerNodeMap.get('app-sidebar')?.deref()`.
3. **If the node is live** → proceed to mount.
4. **If the node is absent or GC'd** → throw immediately:
```
RouteError: Required layout container 'app-sidebar' is not active in the DOM.
            Navigation to '/settings/profile' was aborted.
```
This prevents blind mounts and ensures safety.

### 4.4. The Container Interface

Any element acting as a router container must expose a `swapView` method. The router **never touches the DOM directly** — it hands off the new element and options to the container's `swapView`.

```typescript
interface RouterContainer extends HTMLElement {
  swapView(newElement: HTMLElement, options?: SwapOptions): Promise<void>;
}

interface SwapOptions {
  transitionName?: string;
  params?: Record<string, string>;
  direction?: 'push' | 'replace' | 'back' | 'forward';
}
```

### 4.5. Element-Scoped View Transitions (Concurrent Transitions)

Scoped view transitions enable simultaneous animations across different parts of the UI without blocking pointer events outside their respective subtrees:
- Only the container's subtree rendering pauses during its transition.
- Scoped transitions require `contain: layout` applied to the container.
- The container tries element-scoped `startViewTransition` first, then falls back to `document.startViewTransition`, then to a synchronous swap.

### 4.6. The `cloneNode` / `replaceChildren` Swap Strategy

Containers must **never use `innerHTML`** to mount views. `innerHTML` destroys all existing element identity and flushes Shadow DOM state. Direct `replaceChildren(newElement)` is the correct atomic path.

```javascript
async swapView(newElement, options = {}) {
  const doSwap = () => {
    this.replaceChildren(newElement);
  };

  // Try element-scoped transition (Chrome 147+, concurrent-safe)
  if (typeof this.startViewTransition === 'function') {
    try {
      await this.startViewTransition({ callback: doSwap }).finished;
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('Scoped transition failed:', err);
    }
    return;
  }

  // Fall back to document-scoped transition (Baseline Oct 2025)
  if (typeof document.startViewTransition === 'function') {
    try {
      await document.startViewTransition(doSwap).finished;
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('Document transition failed:', err);
    }
    return;
  }

  doSwap();
}
```

---

## 5. Sample Container Implementation: `<route-container>`

```javascript
import { router } from '../core/router/index.js';

export class RouteContainer extends HTMLElement {
  get containerName() {
    return this.getAttribute('name') || this.tagName.toLowerCase();
  }

  connectedCallback() {
    const existing = router.getContainer(this.containerName);
    if (existing && existing !== this) {
      throw new Error(`ContainerError: Singleton violation — '${this.containerName}' already mounted.`);
    }
    this.style.contain = 'layout';
    router.registerContainer(this.containerName, this);
  }

  disconnectedCallback() {
    router.unregisterContainer(this.containerName, this);
  }

  async swapView(newElement, options = {}) {
    const { direction = 'push' } = options;
    this.dataset.transitionDirection = direction;

    const doSwap = () => {
      this.replaceChildren(newElement);
      delete this.dataset.transitionDirection;
    };

    if (typeof this.startViewTransition === 'function') {
      try {
        await this.startViewTransition({ callback: doSwap }).finished;
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn('[RouteContainer] Scoped VT aborted:', err);
      }
      return;
    }

    if (typeof document.startViewTransition === 'function') {
      try {
        await document.startViewTransition(doSwap).finished;
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn('[RouteContainer] Document VT aborted:', err);
      }
      return;
    }

    doSwap();
  }
}

customElements.define('route-container', RouteContainer);
```

---

## 6. Polyfill & Browser Gap Strategy

| API / Feature | Gap / Constraint | Native Support | Polyfill / Fallback Strategy |
|---|---|---|---|
| **Navigation API** | Missing in older engines | Baseline Jan 2026 | **History API Fallback:** Custom `pushState` / `popstate` overrides and link click event delegation. |
| **precommitHandler** | Safari missing | Chrome / Firefox only | **Double-Execution Guards:** Run guards in both pre-commit and post-commit handlers, using URL replacement fallbacks. |
| **URLPattern** | Missing in pre-2025 engines | Baseline Sep 2025 | **Path-to-Regexp Fallback:** Thin, compiled regular expression matcher that exposes identical match APIs. |
| **View Transitions** | Safari < 18, Firefox < 133 | Baseline Oct 2025 | **Direct DOM Fallback:** Execute the update callback synchronously without transition animations. |

---

## 7. Verification & Testing Plan

### 7.1. Automated Unit Tests (`tests/core/router/`)
The router module is verified across the following scopes:
1. **`match.test.js`**: Verify lazy compiles, segment parameters extraction (`/users/:id`), modifier matches (`?`, `*`, `+`), specificity route sorting, and catch-all fallbacks.
2. **`history.test.js`**: Verify programmatic operations (`navigate`, `replace`, `back`, `forward`), and validation flags (`canBack`, `canForward`).
3. **`intercept.test.js`**:
   - Verify guard triggers under modern pre-commit pipelines.
   - Verify post-commit guard mitigations (Safari fallbacks) and URL replacement corrections.
   - Verify TransitionController pathname comparison checks.
   - Verify form submissions interception and `event.formData` delivery.
4. **`outlet.test.js`**: Verify `<route-outlet>` dynamic rendering, class autodefining, properties hydration, and nested layout preservation.
5. **`transitions.test.js`**: Assert transitions execute correctly when supported and fallback instantly without throw on non-supporting engines.

### 7.2. Test Runner Execution
Execute all tests using the project's zero-build browser runner:
```bash
npm test
```
