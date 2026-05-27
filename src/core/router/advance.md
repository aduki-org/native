# Advanced Container-Driven Routing Architecture

This architecture outlines a next-generation routing paradigm. It transitions away from a monolithic top-down router replacing children in a single main DOM node, towards a hierarchical, container-aware navigation topology.

In modern desktop-like web applications, multiple layout contexts (e.g., `<split-view>`, `<side-panel>`, `<modal-overlay>`) exist simultaneously. Navigation should resolve within specific active contexts rather than replacing the entire application state.

---

## 1. Strict Container Topology & Singletons

A container is any DOM element (a standard element like `#main-content` or a custom element like `<app-sidebar>`) designated as a mounting slot for routed views.

### The Singleton Container Rule

- **Uniqueness Constraint**: "Two identical containers cannot exist at the same time."
- If an element targets `container: 'app-sidebar'`, there must be exactly one active `<app-sidebar>` node in the DOM.
- This enforces a predictable structural hierarchy. The router never has to guess *which* sidebar to mount into.

---

## 2. Dynamic Container Registry (The WeakMap Router)

The router no longer blindly executes `document.querySelector` on every navigation. Instead, it maintains a real-time, non-blocking registry of active container nodes.

### Implementation Concept

- The Router uses a combination of a `WeakMap` and an internal `Set` to track currently mounted containers.
- **Auto-Registration**: When a layout element (like `<side-panel>`) is attached to the DOM, it registers itself with the router: `router.registerContainer('side-panel', this)`. When unmounted, it removes itself.
- **MutationObserver Fallback**: The router can also utilise a lightweight background `MutationObserver` to track the lifecycle of standard elements (e.g., `#main`) without blocking the main thread.

### The Strict Layout Activation Contract

When a navigation event triggers (e.g., `nav.to('/profile/settings')`):

1. The router resolves the matched element (e.g., `<settings-page>`).
2. It looks up the element's required `container` (e.g., `container: 'side-panel'`).
3. It checks the active **Container Registry**.
4. **Resolution Guard**: If the `side-panel` container is **not** currently active in the DOM, the navigation yields an Error: `RouteError: Required layout container 'side-panel' is not active.`
5. This guarantees that deep-links only activate when their required parent hierarchy has been established.

---

## 3. Delegated View Transitions & UI Swaps

The router **does not** touch the DOM directly (no `replaceChildren` or `innerHTML`). DOM manipulation is delegated entirely to the Container.

### The Container Interface

Any registered container must expose a method (e.g., `async swapView(newNode, meta)`). The router calls this method, passing the instantiated, parameter-hydrated page element.

```javascript
// Inside a Custom Container Element (e.g., <side-panel>)
async swapView(newElement, options) {
  // Leverage Native UI Primitives (View Transitions API)
  if (document.startViewTransition) {
    document.startViewTransition(() => {
      // High-performance DOM swapping
      // cloneNode() strategies can be used here to prepare the new view off-DOM
      this.replaceChildren(newElement);
    });
  } else {
    this.replaceChildren(newElement);
  }
}
```

### Why Delegation?

- Containers own their animation lifecycles. A modal container might slide the new view in from the bottom. A main view might cross-fade.
- `innerHTML` is inherently slow and destroys element identity. By delegating the swap, containers can use `cloneNode()` for massive performance gains, or orchestrate complex entry/exit animations before detaching the old node.

---

## 4. Element Definition Integration

Declarative components link into this system securely. They declare their URLs and targeted singleton container directly in the `ui.element` spec.

```javascript
import { ui } from '@adukiorg/native/ui';

ui.element('settings-sidebar-view', {
  url: '/settings/:tab',
  container: 'app-sidebar', // The target singleton container
  props: {
    tab: { type: String, reflect: true }
  },
  mount({ el, ctrl }) {
    // Component lifecycle bound seamlessly to the sidebar container
  }
});
```

### Prevention of Duplicate Registration

When `ui.element` boots up, it parses the `url`. It registers the URL with the router, ensuring the pattern maps perfectly to `settings-sidebar-view`. The router uses a centralized path map, strictly preventing identical routes from overwriting each other or resolving to multiple containers simultaneously.

---

## 5. Architectural Benefits Summary

1. **Safety**: "Blind mounts" are impossible. If a user triggers a route for the right-hand split-view, but the app is in single-column mobile layout, the router cleanly aborts or cascades rather than breaking the DOM.
2. **Performance**: Container-delegated swaps (using View Transitions and `cloneNode`) bypass the expensive reflows of generic router diffing.
3. **State Management Sync**: The element's `props` are hydrated by the router natively, meaning `core/state` stores only receive clean, committed data when the new view initializes.
