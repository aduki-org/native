# Advanced Container-Driven Routing Architecture (v2)

This document defines the next-generation routing topology for `@aduki/native`. It replaces the monolithic single-outlet model with a **multi-container, concurrent-transition architecture** that mirrors a real desktop OS: multiple named regions of the UI mount and animate independently, and navigation only activates when its required container is verifiably alive in the DOM at the moment of resolution.

---

## 1. The Container Model

### What Is a Container?

A container is any DOM node (a standard element such as `#main-content`, or a custom element such as `<app-sidebar>`) that acts as a **first-class mounting slot** for routed views. Containers are not passive wrappers. They are active participants in the navigation lifecycle. They own their own animation, their own DOM swap strategy, and their own transition scope.

The `container` field in a `ui.element` spec accepts either form:

```javascript
container: '#main-content'   // standard element resolved via CSS selector
container: 'app-sidebar'     // custom element resolved via the container registry
```

Both forms resolve through the same internal registry. Selectors go through `document.querySelector` as a fallback only if no explicit registration is found.

### The Singleton Constraint

**Two containers with the same name cannot coexist in the DOM at the same time.**

If a second instance of `<app-sidebar>` attempts to connect while one is already registered, the router throws immediately:

```
ContainerError: Singleton violation — 'app-sidebar' is already mounted.
                A second instance cannot register while the first is active.
```

This is enforced in `connectedCallback` before any registration is accepted.

---

## 2. The Live Container Node Map

### Data Structure

The router maintains a `Map<string, WeakRef<HTMLElement>>` — a **named, weakly-held reference map** of every currently active container node. The string key is the container name or selector. The value is a `WeakRef` wrapping the live DOM element.

`WeakRef` is chosen deliberately over a strong `Map<string, HTMLElement>`:

- The router does **not** prevent containers from being garbage-collected if the rest of the app removes them from the DOM.
- If a `WeakRef` dereferences to `undefined` (the node was GC'd before `disconnectedCallback` fired — an edge case, but real), the router treats the container as absent and yields a `RouteError`.
- A `FinalizationRegistry` runs in the background as a passive safety net to prune stale map entries after GC, without blocking or polling.

```javascript
// Inside the router's container module
const containerNodeMap = new Map();           // string → WeakRef<HTMLElement>
const cleanupRegistry = new FinalizationRegistry((name) => {
  // Stale entry pruned after GC — non-blocking, non-deterministic
  if (containerNodeMap.get(name)?.deref() === undefined) {
    containerNodeMap.delete(name);
  }
});
```

### Background Updates: Non-Blocking, Lifecycle-Driven

The node map is **never polled**. It updates itself reactively through two mechanisms:

**Primary — Custom Element Lifecycle Hooks**

Every container (custom element or framework-wrapped standard element) calls into the router at the two critical lifecycle moments:

```javascript
connectedCallback() {
  router.registerContainer('app-sidebar', this);   // adds WeakRef to map
}

disconnectedCallback() {
  router.unregisterContainer('app-sidebar', this); // removes from map
}
```

These hooks fire synchronously when the browser connects or disconnects the node. The map is therefore always current with zero polling overhead.

**Secondary — MutationObserver Fallback (Standard Elements Only)**

For plain `#main-content` divs that cannot self-register, a single lightweight `MutationObserver` watches `document.body` for `childList` and `subtree` changes. When a tracked selector appears or disappears, the map is updated. This runs at idle priority using `requestIdleCallback` and never touches the main thread during active navigation.

---

## 3. Route Resolution Guard

When any navigation event fires, the router resolves the target container **before** any DOM mutation occurs:

1. Matched route declares `container: 'app-sidebar'`.
2. Router calls `containerNodeMap.get('app-sidebar')?.deref()`.
3. **If the node is live** → proceed to mount.
4. **If the node is absent or GC'd** → throw immediately:

```
RouteError: Required layout container 'app-sidebar' is not active in the DOM.
            Navigation to '/settings/profile' was aborted.
```

This makes "blind mounts" structurally impossible. On a mobile layout where the sidebar container is not rendered, navigating to a sidebar route fails cleanly rather than silently mounting into nothing.

---

## 4. The Container Interface

Any element acting as a router container must expose a `swapView` method. The router **never touches the DOM directly** — it hands off the new element and options to the container's `swapView`. The container owns all animation, DOM replacement, and cleanup.

```typescript
interface RouterContainer extends HTMLElement {
  swapView(newElement: HTMLElement, options?: SwapOptions): Promise<void>;
}

interface SwapOptions {
  transitionName?: string;   // view-transition-name hint for shared-element morphing
  params?: Record<string, string>;
  direction?: 'push' | 'replace' | 'back' | 'forward';
}
```

The router invokes this after guard resolution and container live-check:

```javascript
const containerEl = containerNodeMap.get(containerName)?.deref();
if (!containerEl) throw new RouteError(...);

// Instantiate new view element and hydrate params
const newEl = document.createElement(tag);
for (const [k, v] of Object.entries(params)) newEl[k] = v;

// Delegate all DOM manipulation and animation to the container
await containerEl.swapView(newEl, { params, direction: event.navigationType });
```

---

## 5. Element-Scoped View Transitions (Concurrent Transitions)

This is the architectural breakthrough that makes the multi-container model possible without visual conflicts.

### Background

As of Chrome 147 (March 2026), `element.startViewTransition()` is stable. It scopes a view transition to a DOM subtree rather than the entire document. This means:

- **Multiple containers can animate simultaneously** — a sidebar swap and a main panel swap run as independent, concurrent transitions.
- Only the container's subtree rendering pauses during its transition, not the entire document.
- Pointer events are blocked only within the transitioning subtree.
- Elements outside the transition root (e.g., a fixed header) remain interactive and paint normally on top.

For the container to use element-scoped transitions it must have `contain: layout` applied (required by the spec). The `<route-container>` base class applies this automatically.

### `document.startViewTransition` vs `element.startViewTransition`

| Dimension | `document.startViewTransition` | `element.startViewTransition` |
|---|---|---|
| Scope | Entire document | Container's subtree only |
| Concurrent transitions | No — one at a time | Yes — each container is independent |
| Pointer events blocked | Whole page | Transitioning subtree only |
| Browser support | Baseline Oct 2025 | Chrome 147+ (March 2026); progressive enhancement |

The container implementation must try `element.startViewTransition` first, then fall back to `document.startViewTransition`, then fall back to a direct synchronous swap.

---

## 6. The `cloneNode` Swap Strategy

Containers must **never use `innerHTML`** to mount views. `innerHTML` destroys all existing element identity, flushes Shadow DOM state, and forces a complete re-parse of the subtree. `cloneNode(true)` or direct `document.createElement` + `replaceChildren` is the correct path.

The preferred swap pattern inside `swapView`:

```javascript
async swapView(newElement, options = {}) {
  // The new element is already instantiated and param-hydrated by the router.
  // We only need to animate and replace.

  const doSwap = () => {
    this.replaceChildren(newElement);
    // replaceChildren is atomic — detaches old children and appends new in one step.
    // No intermediate empty state is painted.
  };

  // Try element-scoped transition first (Chrome 147+, concurrent-safe)
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

  // Final synchronous fallback
  doSwap();
}
```

`replaceChildren` with a pre-built element node is faster than any `innerHTML` path because:
- No HTML parser overhead.
- No destruction and recreation of custom element registrations.
- The new element arrives fully initialized with its props already set.

---

## 7. Sample Container Implementation: `<route-container>`

This is the base class every routed container should either extend or replicate. It is placed under `src/elements/route-container.js`.

```javascript
import { router } from '../core/router/index.js';

/**
 * <route-container name="app-sidebar">
 *
 * Base custom element that integrates with the router's container registry.
 * Any element extending this class becomes a valid mounting slot for routed views.
 *
 * Usage:
 *   <route-container name="app-sidebar"></route-container>
 *   or extend: class AppSidebar extends RouteContainer { ... }
 */
export class RouteContainer extends HTMLElement {
  // The container enforces contain: layout for element-scoped view transitions.
  // This is applied in connectedCallback to avoid FOUC.

  get containerName() {
    return this.getAttribute('name') || this.tagName.toLowerCase();
  }

  connectedCallback() {
    // Singleton guard: reject duplicate registration
    const existing = router.getContainer(this.containerName);
    if (existing && existing !== this) {
      throw new Error(
        `ContainerError: Singleton violation — '${this.containerName}' is already mounted.`
      );
    }

    // Require contain: layout for element-scoped view transitions
    this.style.contain = 'layout';

    router.registerContainer(this.containerName, this);
  }

  disconnectedCallback() {
    router.unregisterContainer(this.containerName, this);
  }

  /**
   * Called by the router to mount a new routed view into this container.
   * The element is already instantiated and param-hydrated.
   *
   * @param {HTMLElement} newElement - The new page/view element to mount.
   * @param {object} options - Routing metadata (direction, params, transitionName).
   */
  async swapView(newElement, options = {}) {
    const { direction = 'push', transitionName = 'route-swap' } = options;

    // Apply directional transition hint via CSS custom property
    this.dataset.transitionDirection = direction;

    const doSwap = () => {
      this.replaceChildren(newElement);
      delete this.dataset.transitionDirection;
    };

    // Strategy 1: Element-scoped transition (Chrome 147+, concurrent-safe)
    if (typeof this.startViewTransition === 'function') {
      try {
        const vt = this.startViewTransition({ callback: doSwap });
        await vt.finished;
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn('[RouteContainer] Scoped VT aborted:', err);
      }
      return;
    }

    // Strategy 2: Document-scoped transition (Baseline Oct 2025)
    if (typeof document.startViewTransition === 'function') {
      try {
        const vt = document.startViewTransition(doSwap);
        await vt.finished;
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn('[RouteContainer] Document VT aborted:', err);
      }
      return;
    }

    // Strategy 3: Synchronous direct swap
    doSwap();
  }
}

customElements.define('route-container', RouteContainer);
```

### Extending for Custom Animations

A specific container (e.g., `<app-sidebar>`) can extend `RouteContainer` and override `swapView` to inject its own animation choreography before calling `replaceChildren`:

```javascript
import { RouteContainer } from '../elements/route-container.js';

export class AppSidebar extends RouteContainer {
  async swapView(newElement, options = {}) {
    // Custom slide-in animation before swap
    this.style.transform = 'translateX(100%)';
    await this.animate(
      [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
      { duration: 240, easing: 'ease-out', fill: 'forwards' }
    ).finished;
    this.style.transform = '';

    // Delegate the actual DOM swap + transition to the base class
    await super.swapView(newElement, options);
  }
}

customElements.define('app-sidebar', AppSidebar);
```

---

## 8. Route Registration with Container Metadata

When `ui.element` is called with a `container` field, the framework registers the route with the container name embedded in `meta`. The router uses this at resolution time:

```javascript
// Internally invoked by ui.element(tag, spec, base)
router.register('/settings/:tab', 'settings-sidebar-view', {
  container: 'app-sidebar',    // Must be live in containerNodeMap at nav time
  singleton: true              // Prevent duplicate route pattern registration
});
```

Duplicate route pattern registration is rejected at `register()` time:

```
RouterError: Route pattern '/settings/:tab' is already registered 
             for element <settings-sidebar-view>. 
             Duplicate patterns are not permitted.
```

---

## 9. Declarative Usage (End-to-End)

```javascript
import { ui } from '@adukiorg/native/ui';

ui.element('settings-sidebar-view', {
  url: '/settings/:tab',
  container: 'app-sidebar',   // Must be a live singleton in the container registry
  props: {
    tab: { type: String, reflect: true }
  },
  mount({ el }) {
    console.log('Settings tab:', el.tab);
  }
}, import.meta.url);
```

At runtime, on navigation to `/settings/profile`:

1. Router matches the route → `tag: 'settings-sidebar-view'`, `params: { tab: 'profile' }`.
2. Router reads `meta.container: 'app-sidebar'`.
3. Router dereferences `containerNodeMap.get('app-sidebar')`.
4. If absent → throws `RouteError`. Navigation aborted cleanly.
5. If live → calls `containerEl.swapView(newEl, { params, direction })`.
6. `<app-sidebar>` runs its element-scoped view transition independently of any other container that may be animating simultaneously.

---

## 10. Architectural Summary

| Concern | Mechanism |
|---|---|
| Container liveness tracking | `Map<string, WeakRef<HTMLElement>>` updated via `connectedCallback` / `disconnectedCallback` |
| GC safety net | `FinalizationRegistry` prunes stale map entries passively |
| Singleton enforcement | `connectedCallback` checks registry before accepting registration |
| Standard element fallback | Single background `MutationObserver` on `document.body` at idle priority |
| Navigation guard | `containerNodeMap.get(name)?.deref()` check before any DOM mutation |
| DOM swap | `replaceChildren(newElement)` — no innerHTML, no parser overhead |
| Transition scope | `element.startViewTransition()` (Chrome 147+) → `document.startViewTransition()` → synchronous fallback |
| Concurrent animations | Each container's element-scoped transition is fully independent |
| Duplicate route prevention | `register()` rejects identical pattern strings at registration time |
| Custom animation | Containers override `swapView` and call `super.swapView()` for the actual replacement |