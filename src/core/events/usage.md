# Core Event System — Comprehensive Usage Guide

The `@adukiorg/native` event system is a zero-dependency, ultra-performance event bus, delegation mechanism, and memory-safe listener registry built directly on the browser's native event loops.

This guide demonstrates how to utilize all system primitives to write performant, leak-free, and accessible application event flows.

---

## Table of Contents

1. [Importing the System](#1-importing-the-system)
2. [Global Event Bus (`bus`)](#2-global-event-bus-bus)
3. [Memory-Safe Active Listening (`listen`)](#3-memory-safe-active-listening-listen)
4. [High-Performance Event Delegation (`delegate`)](#4-high-performance-event-delegation-delegate)
5. [Single Event Promises (`once`)](#5-single-event-promises-once)
6. [Standardized Telemetry Namespaces (`names`)](#6-standardized-telemetry-namespaces-names)
7. [Web Component Lifecycle Integration](#7-web-component-lifecycle-integration)
8. [Memory Safety & Leak-Free Dual-Cleanup](#8-memory-safety--leak-free-dual-cleanup)

---

## 1. Importing the System

Exported via the centralized standard `@adukiorg/native/events` entry path:

```javascript
import { events, bus, listen, delegate, once, names } from '@adukiorg/native/events';
```

* `events` is the primary namespace aggregator.
* Individually destructured named exports are fully supported for clean bundler treeshaking.

---

## 2. Global Event Bus (`bus`)

The global Event Bus singleton is ideal for out-of-band communication between distant components or system-wide telemetry triggers (e.g., auth state changes, connectivity updates).

### Dispatching Events (`emit`)

Pass a string type and an optional data payload. The payload is automatically packaged inside a native `CustomEvent`'s `detail` field:

```javascript
events.emit('user:purchased', { itemId: 42, price: 9.99 });
```

### Listening to Events (`on`)

Subscribe to an event. If an `AbortSignal` is provided as the third parameter, the listener is automatically cleaned up when the signal aborts.

```javascript
const controller = new AbortController();

// Subscribed with automated signal-gated cleanup
events.on('user:purchased', (event) => {
  const { itemId, price } = event.detail;
  console.log(`User purchased item #${itemId} for $${price}`);
}, controller.signal);

// Aborting the controller cleans up all bound listeners automatically
controller.abort();
```

### Manual Disposer Callbacks

If you prefer not to use `AbortController` signals, the subscription method returns an explicit `dispose` callback to invoke manually:

```javascript
const dispose = events.on('user:purchased', (event) => {
  console.log('Purchased!', event.detail);
});

// Unsubscribe manually when done
dispose();
```

---

## 3. Memory-Safe Active Listening (`listen`)

`listen` is a comprehensive wrapper for registering events on arbitrary targets (`window`, `document`, DOM elements, or EventTargets). It prevents memory leaks and defends interaction performance metrics out of the box.

```javascript
import { listen } from '@adukiorg/native/events';
```

### A. Automatic Passive Optimizations (Protecting INP)

The browser's layout engine can jank or stutter during scroll interactions if touch/wheel listeners are evaluated synchronously.

`listen` automatically identifies these events and registers them as `{ passive: true }` by default:

```javascript
// Automatically registered as passive: true under the hood
const dispose = listen(window, 'wheel', (e) => {
  console.log('User scrolled:', window.scrollY);
});
```

* **Default-Passive Event Types:** `touchstart`, `touchmove`, `wheel`, `mousewheel`.
* **Explicit Override:** If you genuinely need to prevent the default behavior (e.g., within a custom modal overlay zoom), explicitly supply `passive: false`:

  ```javascript
  listen(element, 'touchmove', handleZoom, { passive: false });
  ```

### B. Signal Teardowns & Disposers

Like the Event Bus, `listen` returns a direct disposer callback and integrates perfectly with `AbortSignal` options:

```javascript
const signal = myComponentController.signal;

listen(document, 'keydown', (event) => {
  if (event.key === 'Escape') closeModal();
}, { signal });
```

---

## 4. High-Performance Event Delegation (`delegate`)

Instead of registering hundreds of identical click handlers to individual elements in a scrolling feed (which spikes browser memory consumption), register a single delegate listener on a common ancestor root.

```javascript
import { delegate } from '@adukiorg/native/events';
```

```javascript
const list = document.querySelector('.user-list');

const dispose = delegate(list, '.delete-btn', 'click', function(event, matchedElement) {
  // `this` and `matchedElement` are bound to the exact matched descendant (.delete-btn)
  const userId = matchedElement.dataset.id;
  deleteUser(userId);
});
```

### Features & Optimizations

1. **Shadow DOM Boundary Crossing:** Unlike simple light-DOM delegation matching that breaks on Shadow DOM encapsulation due to retargeting, `delegate` safely inspects `event.composedPath()` to identify nested target matches.
2. **Fast-Path Selector Matching Cache:** Dynamic evaluations of `.matches(selector)` are cached in a dual-layered, file-scoped `WeakMap`. This completely eliminates redundant matcher execution cycles on consecutive bubbled actions, yielding near-instant execution.
3. **Memory Safety:** Since cached targets are held in a `WeakMap`, elements are garbage collected cleanly the moment they are removed from the DOM.

---

## 5. Single Event Promises (`once`)

`once` is a standard helper that wraps a listener hook inside a Promise, resolving when the event fires exactly once. It is perfect for linear sequences, such as waiting for transition ends or network status changes.

```javascript
import { once } from '@adukiorg/native/events';
```

### Linear Workflows

```javascript
async function uploadAndConfirm() {
  showUploadSpinner();

  // Wait for the native transition to finish rendering
  await once(spinnerElement, 'transitionend');

  // Perform upload...
  await api.upload('/files', data);
}
```

### Gated Lifetime Waiting (Abortable)

Avoid hanging unresolved Promises. Always pass an abort signal when waiting in workflows that might cancel prematurely:

```javascript
const abortCtrl = new AbortController();

try {
  // Wait up to 5 seconds or reject early on signal abort
  const event = await once(window, 'message', { signal: abortCtrl.signal });
  console.log('Received payload:', event.data);
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Gated await timed out or cancelled.');
  }
}
```

---

## 6. Standardized Telemetry Namespaces (`names`)

To prevent typos in string keys across large codebases, use standard namespace constants matching central system categories:

```javascript
import { names, events } from '@adukiorg/native/events';
```

| Domain | Constant Path | Event Key | Purpose |
|---|---|---|---|
| **Authentication** | `names.auth.signedin` | `'auth:signedin'` | User logged in successfully |
| | `names.auth.signedout` | `'auth:signedout'` | User logged out |
| | `names.auth.refreshed` | `'auth:refreshed'` | Token refreshed |
| **Connectivity** | `names.connectivity.online` | `'connectivity:online'` | Device regained network access |
| | `names.connectivity.offline` | `'connectivity:offline'` | Device went offline |
| **User Preferences** | `names.preference.changed` | `'preference:changed'` | Theme/locale selection modified |
| **Service Worker** | `names.sw.updated` | `'sw:updated'` | A new app build was downloaded |
| | `names.sw.message` | `'sw:message'` | Broadcast payload from background |

### Usage Example

```javascript
events.on(names.connectivity.offline, () => {
  showOfflineBanner('Connection lost. Working offline.');
});
```

---

## 7. Web Component Lifecycle Integration

The `@adukiorg/native` library integrates the UI rendering engine with the Event system natively. Any Custom Element inheriting from `BaseElement` or created declaratively via `ui.element` automatically manages a unified `AbortController` (`this.ctrl` or `ctrl`) across its mount lifecycles.

This ensures zero boilerplate for registering and cleaning up event listeners.

### A. Class-Based Elements (extending `BaseElement`)

`BaseElement` automatically bootstraps `this.ctrl` during `connectedCallback` and aborts it in `disconnectedCallback`. Simply utilize the reactive signal `this.ctrl.signal`:

```javascript
import { BaseElement } from '@adukiorg/native/ui';
import { listen, events, names } from '@adukiorg/native/events';

export class AppShell extends BaseElement {
  // Mount lifecycle hook (called automatically by BaseElement on DOM connect)
  mount() {
    const { signal } = this.ctrl;

    // 1. Bind memory-safe window events (Automatically passive)
    listen(window, 'wheel', this.#handleZoom.bind(this), { signal });

    // 2. Bind global telemetry events using registry constants
    events.on(names.auth.signedout, () => {
      this.#redirectToLogin();
    }, signal);

    // 3. Bind local shadow component delegations
    events.delegate(this.shadowRoot, '.action-card', 'click', this.#onCardClick, { signal });
  }

  #handleZoom(event) {
    // Handled safely with automated disconnect cleanup
  }

  #onCardClick(event) {
    console.log('Card tapped:', this);
  }

  #redirectToLogin() {
    window.location.hash = '/login';
  }
}

customElements.define('app-shell', AppShell);
```

### B. Declarative Elements (`ui.element`)

When registering elements declaratively, the standard `mount` callback is passed the unified controller context `{ el, ctrl, internals }`. Simply pass `ctrl.signal` to bind your events:

```javascript
import { ui } from '@adukiorg/native/ui';
import { listen, events, names } from '@adukiorg/native/events';

ui.element('user-profile', {
  template: './profile.html',
  style: './profile.css',
  
  mount({ el, ctrl }) {
    const { signal } = ctrl;

    // Listen to global connectivity telemetry
    events.on(names.connectivity.offline, () => {
      el.shadowRoot.querySelector('.status').textContent = 'Offline';
    }, signal);

    // Delegation inside shadow DOM
    events.delegate(el.shadowRoot, '.edit-btn', 'click', (e) => {
    }, { signal });
  }
});
```

---

## 8. Memory Safety & Leak-Free Dual-Cleanup

When combining `AbortSignal` listeners and manual `dispose()` callbacks, a standard implementation often introduces a subtle memory leak: if you manually dispose of a listener *before* the signal is aborted, the signal's `'abort'` event listener is still held in memory by the browser, keeping the disposer function closure and target elements alive.

To prevent this, the `@adukiorg/native` event system enforces a bulletproof **dual-cleanup** process on all methods (`bus.js`, `listen.js`, `delegate.js`, `once.js`):

1. **Automatic Removal via `{ once: true }`**:
   The `'abort'` event listener registered on the `AbortSignal` is configured with `{ once: true }`. This guarantees that if the signal aborts, the browser's engine automatically detaches the listener.
2. **Explicit Manual Unbind**:
   If you call the returned `dispose()` function manually, the internal cleanup immediately calls `signal.removeEventListener('abort', dispose)`. This breaks the closure references, ensuring immediate and complete garbage collection of the handler and elements.

```javascript
const controller = new AbortController();

// 1. Register listener with BOTH an AbortSignal and a disposer hook
const dispose = events.listen(window, 'wheel', handleScroll, {
  signal: controller.signal
});

// 2. Unsubscribe manually before the signal aborts
dispose(); // Immediately removes BOTH the wheel listener AND the abort listener, preventing leaks!
```
