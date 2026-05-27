# Client-Side Routing Architecture Plan

This document outlines the detailed design, implementation, and optimization specifications for the high-performance client-side routing engine under `core.router` in the `@aduki/native` library.

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
└── plan.md           # This comprehensive planning document
```

---

## 3. Detailed Component & Integration Designs

### 3.1. Matcher & Table Registry (`match.js`)
* **Lazy Pattern Compilations:** Maintain routes in an ordered array. Compile raw pattern strings into active `URLPattern` instances dynamically on the first match pass to keep startup time negligible.
* **Match Resolution:** Match against full URLs by extracting pathname groups safely. If no route matches, fallback immediately to the configured `notFound` handler.
```javascript
export async function match(url) {
  const Pattern = await getURLPattern();
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

### 3.2. Lifecycle Guards & Safari Mitigation (`intercept.js`)
* **Precommit Interception:** For modern engines, execute registered guard hooks inside `precommitHandler`. Atomic redirections happen via `controller.redirect(url)` before the URL updates, preventing visual leaks of protected paths.
* **Post-Commit Safari Fallback:** Since Safari currently ignores `precommitHandler`, re-execute guard checks at the start of the `handler()` callback. If a violation is caught post-commit, perform a silent `navigation.navigate(url, { history: 'replace' })` to correct the address bar.
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
* **Shared Element Morphing:** Assign unique `view-transition-name` strings programmatically to interactive elements before the transition, and reset them immediately on transition completion to achieve fluid list-to-detail transformations.

### 3.8. The `<nav-link>` Primitive Element
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

## 4. Polyfill & Browser Gap Strategy

| API / Feature | Gap / Constraint | Native Support | Polyfill / Fallback Strategy |
|---|---|---|---|
| **Navigation API** | Missing in older engines | Baseline Jan 2026 | **History API Fallback:** Custom `pushState` / `popstate` overrides and link click event delegation. |
| **precommitHandler** | Safari missing | Chrome / Firefox only | **Double-Execution Guards:** Run guards in both pre-commit and post-commit handlers, using URL replacement fallbacks. |
| **URLPattern** | Missing in pre-2025 engines | Baseline Sep 2025 | **Path-to-Regexp Fallback:** Thin, compiled regular expression matcher that exposes identical match APIs. |
| **View Transitions** | Safari < 18, Firefox < 133 | Baseline Oct 2025 | **Direct DOM Fallback:** Execute the update callback synchronously without transition animations. |

---

## 5. Verification & Testing Plan

### 5.1. Automated Unit Tests (`tests/core/router/`)
To guarantee rock-solid correctness, the router module will be verified across the following scopes:
1. **`match.test.js`**: Verify lazy compiles, segment parameters extraction (`/users/:id`), modifier matches (`?`, `*`, `+`), and catch-all fallbacks.
2. **`history.test.js`**: Verify programmatic operations (`navigate`, `replace`, `back`, `forward`), and validation flags (`canBack`, `canForward`).
3. **`intercept.test.js`**:
   - Verify guard triggers under modern pre-commit pipelines.
   - Verify post-commit guard mitigations (Safari fallbacks) and URL replacement corrections.
   - Verify form submissions interception and `event.formData` delivery.
4. **`outlet.test.js`**: Verify `<route-outlet>` dynamic rendering, class autodefining, properties hydration, and nested layout preservation.
5. **`transitions.test.js`**: Assert transitions execute correctly when supported and fallback instantly without throw on non-supporting engines.

### 5.2. Test Runner Execution
Execute all tests using the project's zero-build browser runner:
```bash
npm test
```
