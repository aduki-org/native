# Programmatic Client-Side Routing: Complete Developer Guide

The `@adukiorg/native` client-side router is a **pure JavaScript logic interface** for modern browser navigation. It offers two beautiful paradigms: **Declarative Route-Coupling** (zero boilerplate auto-mounting) and a **Fluent Transition Controller** (fine-grained programmatic chains).

---

## 1. High-Level Declarative Route-Coupling (Premium Paradigm)

Instead of building complex layout shell managers that listen to routers, **components declare where they belong in the URL space**. The platform automatically handles pattern matching, target container mounting, reactive property diffing, and parameter injection:

```javascript
import { ui } from '@adukiorg/native/ui';

ui.element('user-profile-page', {
  url: '/users/:id',          // Automatically registered in the route engine
  container: '#main-content',  // Automatically mounted here on successful match
  props: {
    id: { type: String, reflect: true }
  },
  mount({ el, ctrl }) {
    // Automatically mounted inside '#main-content' with dynamic 'id' prop set from URL!
    console.log(`Mounted profile for User #${el.id}`);
  }
}, import.meta.url);
```

### How it works under the Hood:
- **Automatic Registration**: Defining `url` in the spec registers it with the route matching engine instantly.
- **Zero-Boilerplate Auto-Mounting**: When the URL matches, the engine finds the target container in the DOM, instantiates the custom element, maps URL params directly to properties, and injects the view.
- **Preservation Diffing**: If the element is already active, the engine keeps the instance mounted and reactively syncs updated parameter values, triggering component-level update lifecycles.

---

## 2. Programmatic Navigation & Fluent Transition Controller (`nav`)

To afford developers absolute control over individual traversals, the router exposes a fluent navigation manager `nav` offering chainable transition handlers:

```javascript
import { nav } from '@adukiorg/native/router';

// Initiate navigation with chainable callbacks
nav.to('/users/42')
  .on('found', ({ tag, params }) => {
    console.log(`Successfully navigated and resolved element <${tag}> with parameters:`, params);
  })
  .on('notfound', ({ url }) => {
    console.error(`Destination path not registered: ${url}`);
  })
  .on('error', (err) => {
    console.error('Transition failed or guard rejected:', err);
  });
```

---

## 3. Unified Programmatic API Facade

The router encapsulates all URL traversals. Never manipulate `window.location` directly.

| Function / Property | Signature | Description |
|---|---|---|
| `router.register` | `register(path, handler, meta)` | Manually registers a route with a tag name or factory function. |
| `router.on` | `on(type, callback, signal)` | Registers an event listener on the router (`'found'`, `'notfound'`, `'error'`). |
| `router.navigate` | `navigate(url, options)` | Initiates a standard programmatic push traversal. |
| `router.replace` | `replace(url, options)` | Replaces the current history entry in the stack. |
| `router.back` | `back()` | Navigates backward one entry in the history stack. |
| `router.forward` | `forward()` | Navigates forward one entry in the history stack. |
| `router.go` | `go(index)` | Navigates to a specific relative entry index. |
| `router.current` | `current()` | Returns the active history entry details. |
| `router.entries` | `entries()` | Returns the entire same-origin history stack. |

---

## 4. Route Guards & Security Checks

Guards act as firewall checkpoints before route commits. Register them dynamically:

```javascript
// Register a global route guard
router.guard((destination) => {
  // If navigating to admin and not authorized, redirect to login
  if (destination.url.includes('/admin') && !isAuthenticated()) {
    return '/login';
  }
  return null; // Return null to proceed
});
```

> [!NOTE]
> **Safari Guard Fallback**: Because Apple Safari lacks native Navigation API `precommitHandler` hooks, the guard runs atomically inside a post-commit transition loop. If a guard fails under Safari, the router uses an in-place location replacement (`replace`) to seamlessly restore the address bar without creating broken back-button history entries.

---

## 5. Background Network Synchronization

The router exposes advanced synchronization pipelines that execute off-thread to coordinate cross-tab sync and background multiplexed transport connection pools:

### Cross-Tab Synchronization
Cross-tab sync is **fully automatic** once initialized. When a same-origin tab navigates to a new route, the router broadcasts a sync signal via `BroadcastChannel('native-router-sync')`. Duplicate tabs automatically capture the event and update their active URL silently to maintain perfect session parity across screens.

### Coordinated Connection Pools
Optimize WebSocket or WebTransport resources by coordination pools. Register channels that map directly to pathname `URLPattern` requirements:

```javascript
import { router } from '@adukiorg/native/router';

// Register background streams linked to paths
router.registerConnection('/rooms/:roomId', async (url) => {
  const roomId = new URL(url).pathname.split('/').pop();
  const socket = new WebSocket(`wss://api.example.com/rooms/${roomId}`);
  
  socket.onmessage = (e) => console.log('Socket message:', e.data);
  
  return {
    close() {
      socket.close();
      console.log(`Coordinated WebSocket closed for Room ${roomId}`);
    }
  };
});
```

When a user navigates from `/rooms/42` to `/settings`, the router automatically invokes `close()` on the active coordinated connection pool and cleans up all unneeded network sockets.

---

## 6. Performance, Correctness & Architectural Optimizations

The routing engine has been heavily optimized for maximum execution efficiency, low latency, and deterministic behavior:

### 6.1. Deterministic Route Specificity Sorting
When routes are registered via `router.register()`, they are automatically sorted based on structural specificity:
1. **Static Paths**: Absolute exact matches (e.g., `/settings/profile`) are evaluated first.
2. **Parameterized Paths**: Dynamic paths with parameters (e.g., `/users/:id`) are evaluated second.
3. **Wildcards / Catch-Alls**: Paths with wildcards (e.g., `*` or `/(.*)`) are evaluated last.
Within each category, paths are additionally sorted by **length (longest pathname first)** to ensure nested paths match before parent paths, making route matching completely deterministic.

### 6.2. Synchronous URLPattern Match Path
The router pre-resolves the native `URLPattern` class on module load, avoiding dynamic async microtask polyfill checks during routing. Route matching is synchronously executed on the hot path for modern browsers to eliminate frame latency.

### 6.3. Async Custom Element Hydration Gate
During declarative route resolution, the global router orchestrator implements an async custom element hydration gate. Before mounting, it checks if the tag is a custom element (by verifying the presence of a hyphen `-`) and awaits its definition:
```javascript
if (typeof customElements !== 'undefined' && tag.includes('-') && !customElements.get(tag)) {
  await customElements.whenDefined(tag);
}
```
This protects standard HTML nodes from throwing errors and prevents instantiation of un-hydrated `HTMLUnknownElement` elements.

### 6.4. Absolute & Relative Pathname Normalization
The `TransitionController` handles absolute and relative URLs transparently. It maps URL strings to their resolved pathnames internally using the `window.location.origin` fallback to prevent comparison mismatches:
```javascript
const getPath = (u) => {
  try { return new URL(u, window.location.href).pathname; } catch (_) { return u; }
};
```
This prevents programmatic `nav.to()` callbacks from timing out due to absolute/relative string mismatches.

### 6.5. Circular Dependency & Dynamic Import Prevention
`nav.to` registers its execution callbacks via a static, module-level registration mechanism. This avoids runtime circular dependencies and eliminates dynamic dynamic `import()` overhead during programmatic transitions.

### 6.6. Infinite Cross-Tab Sync Loop Guard
To prevent dynamic routing sync loops, tab synchronization utilizes a lightweight `sent` cycle-check guard, discarding duplicate sync events when a same-url navigation has already been processed.
