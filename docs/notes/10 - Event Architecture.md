## Event Architecture

**Spec authority:** WHATWG DOM Living Standard, WHATWG HTML Living Standard **MDN:** `developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener` **Status:** All APIs described in this document are Baseline Widely Available unless otherwise noted. `AbortSignal.any()` and `AbortSignal.timeout()` are Baseline Newly Available as of March–April 2024.

---

## Table of Contents

1. [Philosophy and Scope](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#1-philosophy-and-scope)
2. [The addEventListener Options Object](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#2-the-addeventlistener-options-object)
3. [Memory-Safe Subscription with AbortSignal](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#3-memory-safe-subscription-with-abortsignal)
4. [AbortSignal Composition](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#4-abortsignal-composition)
5. [Event Propagation Model](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#5-event-propagation-model)
6. [Event Delegation](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#6-event-delegation)
7. [Shadow DOM Event Mechanics](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#7-shadow-dom-event-mechanics)
8. [Custom Events and Component Communication](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#8-custom-events-and-component-communication)
9. [The Global Event Bus](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#9-the-global-event-bus)
10. [Cross-Cutting System Events](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#10-cross-cutting-system-events)
11. [Event Naming Conventions](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#11-event-naming-conventions)
12. [Memory Safety and the GC Boundary](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#12-memory-safety-and-the-gc-boundary)
13. [Performance Constraints](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#13-performance-constraints)
14. [What the Event Architecture Does Not Own](https://claude.ai/chat/567d370a-36e2-4898-9b9c-a05f2183f1b9#14-what-the-event-architecture-does-not-own)

---

## 1. Philosophy and Scope

The browser's event system is a mature, engine-optimised publish-subscribe infrastructure. It is not a primitive to be reimplemented; it is an infrastructure to be composed. Every reactive pattern in this architecture — component communication, system-level notifications, state change propagation, user interaction handling — is expressed through the browser's native `EventTarget`, `Event`, and `CustomEvent` interfaces.

This document defines the complete set of patterns, constraints, and conventions governing event usage across the system. Three properties are non-negotiable: every event listener must have a deterministic cleanup path; no listener may block the main thread; and event-driven communication must flow in the correct direction for the component topology it operates within.

The `core/events/` module provides no reimplementation of event dispatch. It provides three things: the shared `AbortController` lifecycle pattern used uniformly across all component types, the application-level event bus singleton, and a small set of typed wrapper utilities for dispatching well-formed `CustomEvent` objects. Nothing in this module replaces the browser's event APIs. Everything in this module uses them.

---

## 2. The addEventListener Options Object

**Spec:** WHATWG DOM Living Standard — `EventTarget.addEventListener(type, listener, options)` **MDN:** `developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener` **Status:** Options object form — Baseline Widely Available. All individual options described below are Baseline Widely Available.

The third argument to `addEventListener` accepts a plain object with four independent boolean and object properties. Understanding each is prerequisite to correct listener registration.

### capture

`capture: true` registers the listener in the capture phase — it fires as the event travels downward from the document root toward the target element, before the event reaches the target. `capture: false` (the default) registers in the bubble phase — the listener fires as the event travels back upward after reaching the target.

Capture-phase listeners are rarely needed but indispensable when they are. The two primary use cases are: intercepting events before child elements can stop their propagation with `stopPropagation()`, and listening for events that do not bubble (focus, blur, scroll) at a container level without attaching individual listeners to every child.

The capture flag affects listener identity: a listener registered with `capture: true` and the same listener registered with `capture: false` are treated as two distinct registrations. Both the registration call and the cleanup call must specify the same `capture` value to correctly match.

### once

`once: true` causes the listener to be automatically removed after its first invocation. The listener fires once and is gone. This eliminates the pattern of calling `removeEventListener` manually inside a handler that should only fire once. The browser handles deregistration internally.

`once: true` and a `signal` option can be combined. If the signal aborts before the listener fires, the listener is removed without having fired. If the listener fires before the signal aborts, it is removed as a result of `once`, and the signal's subsequent abort has no listener to remove — which is not an error.

### passive

`passive: true` declares to the browser that this listener will never call `event.preventDefault()`. This declaration allows the browser to start processing the event's default action (most notably, scrolling) without waiting for the JavaScript handler to complete. The performance benefit is significant for scroll-blocking events: `touchstart`, `touchmove`, `wheel`, and `mousewheel`.

Without `passive: true` on these event types, the browser must hold the scroll pipeline until every registered handler finishes, because any one of them might call `preventDefault()` to block the scroll. This produces visible scroll jank, particularly on mobile. With `passive: true`, the browser starts scrolling immediately in a separate thread and the handler runs concurrently.

In Chrome, Edge, and Firefox, `touchstart`, `touchmove`, `wheel`, and `mousewheel` listeners attached to the `window`, `document`, or `document.body` are passive by default. Explicitly setting `passive: false` opts back out of this default to allow `preventDefault()`. Code that must call `preventDefault()` on these events — for example, a custom drag interaction that must suppress the default scroll — must explicitly opt out and accept the scrolling latency.

Calling `preventDefault()` inside a listener declared as `passive: true` is silently ignored by the browser and produces a console warning. It does not throw. Code that is relied upon to prevent default scroll behaviour must not be marked passive.

### signal

`signal` accepts an `AbortSignal`. The listener is automatically removed when the associated `AbortController` is aborted. This is the primary cleanup mechanism for all event listeners in this architecture. Its behaviour and implications are described fully in Section 3.

---

## 3. Memory-Safe Subscription with AbortSignal

**Spec:** WHATWG DOM Living Standard — AbortController, AbortSignal **MDN:** `developer.mozilla.org/en-US/docs/Web/API/AbortController` **Status:** Baseline Widely Available.

### The Problem

Event listeners registered without a cleanup path are the most common source of memory leaks in browser applications. A listener holds a reference to the object that registered it. If that object is a component that has been removed from the DOM, the listener keeps it alive in memory indefinitely, preventing garbage collection. In a long-lived SPA with frequent component mounting and unmounting, unbounded listener accumulation is a reliable path to progressive memory exhaustion.

A 2026 study of 500 open-source repositories found that 86% contained at least one missing cleanup pattern, and missing event listener removal accounted for 19% of all leak patterns across the sample. This is not a niche problem.

### The Pattern

This architecture enforces a single, non-negotiable pattern for every event subscription: all listeners in a component share one `AbortController`, created at connection time. The controller's signal is passed to every `addEventListener` call. Cleanup is a single `controller.abort()` call in `disconnectedCallback`. There are no exceptions.

```js
connectedCallback() {
  this.#controller = new AbortController();
  const { signal } = this.#controller;

  this.addEventListener('click', this.#handleClick, { signal });
  window.addEventListener('resize', this.#handleResize, { signal });
  document.addEventListener('visibilitychange', this.#handleVisibility, { signal });
  // All three are removed by the single call below
}

disconnectedCallback() {
  this.#controller.abort();
}
```

When `controller.abort()` is called, every listener registered with that signal is synchronously removed. This is equivalent to calling `removeEventListener` individually for each listener, without the bookkeeping. There is no array of cleanup functions to maintain, no risk of forgetting a specific listener, and no need to retain references to the original handler function objects.

This pattern replaces the older approach of maintaining an array of `{element, type, handler}` tuples and iterating it in `disconnectedCallback`. The `signal` option is more reliable, more readable, and less error-prone than any manual bookkeeping scheme.

### Signal Scope

Each component owns exactly one `AbortController` per connected lifecycle. If a component is disconnected and reconnected (moved in the DOM), `connectedCallback` fires again. A new controller must be created at the top of `connectedCallback`. The previous controller's signal is already aborted; attempting to reuse it will result in the listener being removed immediately upon registration (since an already-aborted signal causes instant cleanup). The component must not hold a stale reference to the previous controller.

The signal should never be stored on `this` as a public property. It is an implementation detail of the component's subscription lifecycle, not part of its public API.

### signal.aborted and Deferred Operations

An `AbortSignal` exposes a boolean `signal.aborted` property. Async operations that check whether they should continue can poll this property at yield points. When a navigation or other signal-issuing system aborts a signal, any async code that checks `signal.aborted` between await points will detect the abort and can exit early, preventing stale state updates.

The `signal.reason` property returns the value passed as the optional argument to `controller.abort(reason)`. For standard lifecycle aborts, no reason is set and `reason` is `undefined`. For explicit cancellations that need to be distinguished from lifecycle cleanup (e.g., user-initiated cancellation vs. component destruction), a typed reason object can be passed and inspected at the point of detection.

`signal.throwIfAborted()` is a convenience method that throws `signal.reason` if the signal is aborted and does nothing otherwise. This can replace a manual `if (signal.aborted) throw signal.reason` check at yield points in async operations.

---

## 4. AbortSignal Composition

**Status:** `AbortSignal.timeout()` — Baseline Newly Available, April 2024. `AbortSignal.any()` — Baseline Newly Available, March 2024. Both available in Web Workers.

### AbortSignal.timeout()

`AbortSignal.timeout(milliseconds)` returns a pre-configured signal that automatically aborts after the specified duration. It does not require an `AbortController`. The signal aborts with a `TimeoutError` `DOMException` (distinguishable by `error.name === 'TimeoutError'`), which is separate from the `AbortError` produced by a manual `controller.abort()` call. This distinction allows calling code to differentiate between a user-cancelled operation and one that timed out.

The timeout is based on active elapsed time, not wall-clock time. It is paused while the document is in a back-forward cache or a Worker is suspended. This is correct behaviour for network requests that should not race a user's connection type — the timeout reflects actual active waiting time, not calendar time.

```js
// A fetch that times out after 8 seconds, distinct from user-cancelled aborts
const response = await fetch('/api/data', { signal: AbortSignal.timeout(8000) });
```

### AbortSignal.any()

`AbortSignal.any(iterable)` takes an array of `AbortSignal` objects and returns a composite signal that aborts when any one of the input signals aborts. The returned signal's `reason` is set to the reason of whichever input signal fired first. If any input signal is already aborted at the time of the call, the returned signal is immediately aborted.

The primary use case is combining a component's lifecycle signal with an operation-specific timeout or a user-cancellation signal:

```js
connectedCallback() {
  this.#controller = new AbortController();
  const { signal: lifecycleSignal } = this.#controller;
  // ...
}

async fetchData(endpoint) {
  const { signal: lifecycleSignal } = this.#controller;
  const timeoutSignal = AbortSignal.timeout(10_000);
  // Abort on component unmount OR timeout, whichever comes first
  const signal = AbortSignal.any([lifecycleSignal, timeoutSignal]);
  const response = await fetch(endpoint, { signal });
  return response.json();
}
```

This pattern eliminates the need for try-catch blocks that attempt to distinguish abort reasons at call sites that cannot know all the reasons — the `signal.reason` on the composed signal carries the correct original reason.

### AbortSignal.abort()

`AbortSignal.abort(reason)` returns a signal that is already in the aborted state. It is used when an API accepts a signal and the caller wants to pass a pre-cancelled signal — for example, when a conditional path determines the operation should not run at all, but the API always requires a signal argument.

---

## 5. Event Propagation Model

**Spec:** WHATWG DOM Living Standard — Event dispatch

Every DOM event dispatched on an element travels through three phases, in sequence: the capture phase, the target phase, and the bubble phase.

### Capture Phase

The event begins at the document root and travels downward through the DOM tree toward the event target, passing through each ancestor in turn. Listeners registered with `capture: true` fire during this phase. The event reaches these listeners before it reaches the target element's own listeners.

The capture phase is used in two situations: when a container must intercept an event before any child can stop its propagation; and when listening for non-bubbling events (focus, blur, scroll, load, error) at a container level.

### Target Phase

The event arrives at the element on which it was dispatched — `event.target`. Both capture-phase and bubble-phase listeners registered directly on the target element fire at this phase, in registration order.

### Bubble Phase

The event travels back upward from the target through its ancestors to the document root. Listeners registered with `capture: false` (the default) fire during this phase. This is the phase used by event delegation.

### stopPropagation and stopImmediatePropagation

`event.stopPropagation()` prevents the event from traveling further up or down the tree after the current listener completes. Other listeners on the same element at the same phase still fire.

`event.stopImmediatePropagation()` stops propagation and also prevents any further listeners on the current element from firing, regardless of registration order.

Both methods should be used sparingly. Stopping propagation creates invisible coupling between components: a component that stops propagation on a common event type may silently break parent components that depend on receiving that event. If a component needs to handle an event privately without announcing it to parents, the correct pattern is to not call `stopPropagation` — instead, the component should only dispatch its own `CustomEvent` with domain-specific semantics upward, rather than relying on the raw browser event propagating further.

### preventDefault

`event.preventDefault()` cancels the browser's default action for an event — for example, preventing a link from navigating, a form from submitting, or a drag from triggering text selection. It does not stop propagation.

`event.cancelable` must be checked before calling `preventDefault()`. Not all events are cancelable; calling `preventDefault()` on a non-cancelable event has no effect. Calling it inside a listener declared `passive: true` is silently ignored.

---

## 6. Event Delegation

Event delegation is the pattern of registering a single listener on a container element that handles events from all descendant elements, using `event.target` inspection to identify the originating element. It is the correct pattern for lists, grids, menus, and any interactive collection of repeated items.

### Why Delegation

Attaching individual listeners to each item in a dynamic list requires adding listeners as items are added, removing them as items are removed, and maintaining the bookkeeping for all of them. Delegation eliminates all of that: one listener on the container handles all items, present and future, without any per-item registration or cleanup.

For a list with 500 items, 500 individual click listeners consume measurable memory and slow mutation operations. One delegated listener on the container costs a fixed, minimal amount regardless of list length.

### Identifying the Target

Inside a delegated listener, `event.target` is the element that actually received the interaction — potentially a deeply nested descendant of the item element. The correct way to find the relevant item is `event.target.closest(selector)`. `closest()` traverses upward through the DOM tree from the event target, returning the first ancestor (or the element itself) that matches the selector, or `null` if none matches.

```js
container.addEventListener('click', (event) => {
  const item = event.target.closest('[data-item-id]');
  if (!item || !container.contains(item)) return;
  handleItemClick(item.dataset.itemId);
}, { signal });
```

The `container.contains(item)` check is important: `closest()` traverses upward without stopping at the container, so it could return an ancestor of the container that also happens to match the selector. The contains check ensures the matched element is actually inside the delegated container.

### Delegation Across Shadow Boundaries

`event.target` inside a delegated listener registered in the light DOM will be retargeted by the browser when the originating event crosses a shadow boundary. The browser replaces `event.target` with the shadow host element — the Custom Element that contains the shadow root — rather than exposing the internal shadow DOM node. This is event retargeting: an intentional encapsulation mechanism.

To obtain the full internal path of an event that crossed a shadow boundary, `event.composedPath()` returns the complete array of nodes the event traversed, including those inside shadow trees. `composedPath()[0]` is the original, un-retargeted target. This is available only within the listener's execution context; after the event finishes dispatching, `composedPath()` returns an empty array.

The practical implication: delegated listeners in the light DOM cannot reliably target specific elements inside a child component's shadow root using `closest()`, because `event.target` will be retargeted to the host element. Delegation across shadow boundaries should be limited to host-level handling, not internal shadow tree navigation.

---

## 7. Shadow DOM Event Mechanics

**Spec:** WHATWG DOM Living Standard — Shadow trees and event dispatch

### The bubbles and composed Flags

Two boolean flags on a dispatched event determine its propagation behaviour in a Shadow DOM context: `bubbles` and `composed`. These are independent. Their interaction produces four distinct propagation modes.

`bubbles: false, composed: false` — the event fires only on the dispatching element and does not propagate anywhere. Used for internal notifications within a component where no parent should observe the event.

`bubbles: true, composed: false` — the event bubbles upward within its shadow tree but stops at the shadow boundary. Parent elements in the light DOM do not receive it. Used for events that are internal to a component's shadow DOM — visible within the shadow tree but not exposed externally.

`bubbles: false, composed: true` — the event crosses shadow boundaries at each host element level but does not bubble through intermediary nodes. It propagates from host to host. This is rarely used in practice.

`bubbles: true, composed: true` — the event bubbles upward through the full composed tree, crossing all shadow boundaries. This is the correct configuration for Custom Events that must be observable by parent elements in the light DOM — the equivalent of a "callback prop" in framework parlance. All UA-dispatched UI events (`click`, `keydown`, `touchstart`, `mouseover`, `copy`, `paste`, and others) are configured as `composed: true` by the browser.

### Event Retargeting

When an event crosses a shadow boundary during bubbling, the browser adjusts `event.target` at each boundary crossing so that listeners outside a shadow tree always see the host element as the target, never an internal shadow node. This is event retargeting. It is not a bug; it is the enforcement of the component's encapsulation contract. External code cannot — and should not — inspect the internal structure of a component's shadow DOM through events.

The internal shadow tree target is still accessible via `event.composedPath()[0]` inside any listener that fires before dispatch completes.

### Non-Composed Native Events

Several native browser events are `composed: false` by default. Notable examples include `focus`, `blur`, `focusin`, `focusout`, `scroll`, and `load`. This means:

A `focus` event on an element inside a shadow root does not bubble out of that shadow root. A parent component listening for `focus` on its container will not receive focus events from inputs inside a child component's shadow DOM.

The correct handling for cases where focus within a shadow tree needs to be communicated outward is for the shadow root's component to listen internally for focus and dispatch a composed custom event. The `focusin` event is `composed: true` and does cross shadow boundaries; this is often the correct native event to use at container level when detection of any descendant focus is needed.

### Slotted Content and Events

Content assigned to a shadow root's slot via the light DOM retains its light DOM membership for event propagation purposes. An event dispatched on slotted content (light DOM nodes rendered inside a slot) propagates through the flat tree — the rendered tree that accounts for slot assignments. The propagation path includes the shadow tree elements (the slot element itself) as the event passes through them.

Practically: a click on a slotted `<button>` inside a `<my-dialog>` will bubble through the slot, through the shadow root's internal structure, out through the `<my-dialog>` host, and continue upward through the light DOM tree. If the click event is composed (it is — all clicks are), and the shadow root has listeners, they will fire. This is expected and correct.

---

## 8. Custom Events and Component Communication

**Spec:** WHATWG DOM Living Standard — CustomEvent

### The Communication Direction Contract

Component communication in this architecture has a strict direction contract derived from the DOM's own event model:

Upward communication — from a child component to its parent — uses `CustomEvent` dispatched on the component element itself with `{ bubbles: true, composed: true }`. The event bubbles through the DOM tree; parent elements observe it by registering listeners at any ancestor, including the document. This is the pattern for all "something happened inside me" notifications.

Downward communication — from a parent to a child — uses direct property assignment or method calls on the child element's reference. It does not use attributes for non-primitive data (attributes are strings; objects lose their type and require serialisation). It does not use events dispatched on the child.

Sibling communication — between two components with a shared parent — is never done by dispatching upward and listening at the sibling level. It is done either by letting the shared parent mediate (listening to the upward event and updating the sibling via a property), or by using the reactive state layer (both siblings subscribe to the same state key and react independently).

This contract enforces unidirectional data flow. It eliminates the ambiguity of event dispatch patterns where it is unclear who is the authoritative owner of state.

### CustomEvent Construction

`CustomEvent` is constructed with a type string and an options object. The `detail` property of the options object carries the event's payload. `detail` is passed through the event as `event.detail` in listeners.

The type string should follow the naming convention defined in Section 11. The `detail` object should carry only the minimum information a consumer needs to respond to the event — not the entire internal state of the dispatching component.

`detail` is not cloned during dispatch within the same document. Listeners receive a reference to the same object. Mutating `event.detail` inside a listener affects what subsequent listeners receive. If immutability of the payload is required, the dispatching component should pass a frozen or shallow-cloned object.

```js
// Dispatching from inside a component
this.dispatchEvent(new CustomEvent('item-selected', {
  bubbles: true,
  composed: true,
  detail: { id: this.#selectedId, label: this.#selectedLabel }
}));
```

### Listening at the Parent Level

A parent component subscribes to a child's custom event in its `connectedCallback`, using the component's lifecycle `AbortController` signal for cleanup:

```js
connectedCallback() {
  this.#controller = new AbortController();
  const { signal } = this.#controller;

  // Listen for events that bubble up from any descendant
  this.addEventListener('item-selected', this.#handleItemSelected, { signal });
}
```

Because the event bubbles and is composed, this listener will receive the event from any descendant — including components inside shadow roots — without needing to know the component tree structure.

### Properties and Method Calls for Downward Communication

A parent passes data to a child by setting properties directly on the child element:

```js
const child = this.shadowRoot.querySelector('my-list');
child.items = this.#data;
child.selectedId = this.#selectedId;
```

Property setters on the child component receive the value and trigger whatever internal update logic the component defines. The parent does not need to know the internal implementation; it only needs to know the component's documented property API.

Method calls are appropriate for imperative actions: `child.reset()`, `child.focus()`, `child.scrollToItem(id)`. These represent commands rather than data, and the method boundary is the correct abstraction.

---

## 9. The Global Event Bus

**Spec:** WHATWG DOM Living Standard — EventTarget as a standalone constructible interface **Status:** Constructible `EventTarget` (i.e., `new EventTarget()`) — Baseline Widely Available.

### Architecture

A single `EventTarget` instance is instantiated once and exported as the default export from `core/events/bus.js`. It is a singleton by virtue of ES Module caching semantics: the module is evaluated once per browsing context, and subsequent imports receive the cached export.

```js
// core/events/bus.js
export const bus = new EventTarget();
```

Because `EventTarget` is now constructible (it was not always so — older patterns used `document.createElement('div')` as a workaround), the bus is a plain `EventTarget` with no DOM attachment, no implicit global state, and no lifecycle tied to any document element. It is a pure pub/sub mechanism.

Consumers dispatch to the bus and subscribe from it using the identical `dispatchEvent` and `addEventListener` / `removeEventListener` API they use for DOM events. There is no separate pub/sub interface to learn.

### Scope and Usage

The application-level bus is used exclusively for system-level events: conditions that are genuinely cross-cutting and have no natural DOM parent through which an event could propagate.

Appropriate uses include authentication state changes (signed in, signed out, session expired), application-wide connectivity status transitions (online, offline), user preference changes that affect the entire application (locale, theme, reduced-motion), and service worker lifecycle events forwarded to the main thread.

Inappropriate uses include anything that could instead travel through the DOM tree as a bubbling `CustomEvent`. If two components have a common ancestor in the DOM, the correct communication channel is a bubbling event up to that ancestor, not a bus message. The bus is a last resort for genuinely decoupled producers and consumers, not a convenience shortcut around the DOM tree.

### Subscription and Cleanup

Subscribers use `addEventListener` with a `signal` option on the bus, using the component's lifecycle `AbortController`:

```js
connectedCallback() {
  this.#controller = new AbortController();
  bus.addEventListener('auth:signedout', this.#handleSignOut, {
    signal: this.#controller.signal
  });
}

disconnectedCallback() {
  this.#controller.abort();
}
```

The bus itself holds no references to listeners once they are aborted. Because `EventTarget`'s listener management is reference-based, a component that aborts its controller and is subsequently garbage-collected will have its listener cleaned up. The bus does not need to be explicitly notified; listener removal is implicit in the abort.

### Dispatching to the Bus

Any module may dispatch to the bus by importing it and calling `bus.dispatchEvent()`:

```js
import { bus } from 'core/events/bus.js';

bus.dispatchEvent(new CustomEvent('auth:signedout', {
  detail: { reason: 'session-expired' }
}));
```

The `bubbles` and `composed` options have no effect on events dispatched to a standalone `EventTarget` — they only affect DOM tree propagation, and the bus has no DOM tree. The flags may be omitted or set to `false`; their presence does not cause errors, but they are meaningless in this context.

---

## 10. Cross-Cutting System Events

The following system events are dispatched on the application bus. This is the authoritative list. Adding a new system event requires updating this document, the bus module's JSDoc types, and any consuming modules.

### Authentication Events

`auth:signedin` — dispatched when a user successfully authenticates. `detail` carries the minimal user identity object (id, display name, role set). No credential material is ever carried in a `CustomEvent`.

`auth:signedout` — dispatched when a session ends, either by explicit sign-out or session expiry. `detail` carries `{ reason: 'explicit' | 'expired' | 'revoked' }`.

`auth:refreshed` — dispatched when an access token is silently refreshed. Consumers that cache auth-gated resources should invalidate their caches on this event.

### Connectivity Events

`connectivity:online` — dispatched when `navigator.onLine` transitions to true and the network is verified reachable. Not equivalent to the native `window` `online` event, which fires on any interface change regardless of actual connectivity. The system verifies reachability before dispatching.

`connectivity:offline` — dispatched when connectivity is lost. Consumers should activate offline UI states and queue any pending writes to the offline sync queue.

### Preference Events

`preference:changed` — dispatched when a user preference changes (locale, theme, font size, reduced-motion preference). `detail` carries `{ key, value }`. Consumers are responsible for re-rendering or updating their state in response.

### Service Worker Events

`sw:updated` — dispatched by the Service Worker communication bridge when a new Service Worker has been installed and is waiting. The UI should prompt the user to reload to apply the update.

`sw:message` — a pass-through for arbitrary messages forwarded from Service Worker scope to the main thread. The receiving component is responsible for interpreting `detail.payload` according to the message type.

---

## 11. Event Naming Conventions

### Custom Event Names

Custom event type strings follow a `domain:action` naming scheme using lowercase and hyphens within each segment. The domain segment identifies the component or subsystem responsible for the event. The action segment is a past-tense verb or noun describing what happened.

Examples: `item-selected`, `form-submitted`, `auth:signedin`, `route:changed`, `list:reordered`.

The colon separator distinguishes system bus events (which use a colon) from component-level custom events (which use a hyphen-only name). Component events never use a colon; bus events always do. This convention makes the event's scope immediately legible from its type string.

### Avoiding Native Event Name Conflicts

Custom event type strings must never shadow native browser event types. Do not use `click`, `change`, `input`, `submit`, `load`, `error`, `focus`, `blur`, `keydown`, `keyup`, or any other name that the browser uses for built-in events. Using these names for custom events will cause listeners to receive both custom dispatches and native browser dispatches for the same type, with no way to distinguish them.

### Namespacing in Third-Party Contexts

In contexts where this system's events might coexist with events from other libraries or integrations, the type string may be extended with a reverse-DNS-style namespace prefix: `app:item-selected`, `app:auth:signedin`. The additional prefix should be used consistently across all events in that context, not selectively.

---

## 12. Memory Safety and the GC Boundary

### Primary Mechanism: AbortSignal

The correct and primary mechanism for preventing event listener memory leaks is the `AbortController`/`AbortSignal` pattern described in Section 3. This pattern is explicit, deterministic, and synchronous. When `controller.abort()` is called in `disconnectedCallback`, all listeners are removed before the component's garbage collection eligibility is assessed.

This is not an optimisation; it is a correctness requirement. A component that does not clean up its listeners cannot be garbage-collected as long as any listener holds a reference to it — which is always the case for `this.#handleX` style handlers that close over the component instance.

### WeakRef and FinalizationRegistry

`WeakRef` and `FinalizationRegistry` are available in all modern browsers (ES2021). They are relevant to the event architecture in one narrow scenario: when a listener must be registered on an external long-lived object (a global singleton, the `window`, or the application bus), but the component that owns the listener may be collected before it has an opportunity to call `disconnectedCallback` — which can happen in unusual teardown sequences.

In this scenario, the listener can be wrapped in a function that holds only a `WeakRef` to the component:

```js
const ref = new WeakRef(this);
const handler = (event) => {
  const component = ref.deref();
  if (!component) return; // already collected
  component.#handleEvent(event);
};
```

A `FinalizationRegistry` can then be used to remove the wrapper from the external object when the component is garbage-collected:

```js
registry.register(this, { target: externalObject, type: 'event-type', handler });
// In the registry callback:
({ target, type, handler }) => target.removeEventListener(type, handler);
```

This pattern is complex and should be treated as a fallback for exceptional circumstances. `FinalizationRegistry` callbacks are not guaranteed to run at a specific time; they may run much later than collection, or not at all if the environment is discarded first. They must not be relied upon for correctness — only for eventual resource recovery. The primary contract is still explicit cleanup via `AbortController`.

### WeakMap for Auxiliary State

When a module needs to associate data with component instances without preventing their collection, `WeakMap` is the correct data structure. A `WeakMap` keyed by the component instance does not prevent the instance from being garbage-collected. When the instance is collected, its entry in the `WeakMap` is eligible for removal.

```js
// Associating computed state with a component without holding a strong reference
const computedCache = new WeakMap();

function getComputedValue(component) {
  if (computedCache.has(component)) return computedCache.get(component);
  const value = compute(component);
  computedCache.set(component, value);
  return value;
}
```

`WeakMap` is appropriate when the lifetime of the associated data should exactly match the lifetime of the component. It is not appropriate when the data must outlive the component.

---

## 13. Performance Constraints

### Never Block the Main Thread in Handlers

Event handlers run synchronously on the main thread. Any handler that blocks the main thread for more than approximately 50ms will produce a perceivable delay in user interaction (this is the threshold for Interaction to Next Paint). Long-running computations triggered by events must be offloaded to Workers or broken into scheduler-yielded microbatches using `scheduler.postTask()`.

A handler's job is: read the event, do a minimal synchronous operation, and either schedule further work or dispatch the result. It is not the place for sorting, filtering large datasets, or making synchronous network requests.

### Passive Listeners for Scroll and Touch

Every `touchstart`, `touchmove`, `wheel`, and `mousewheel` listener that does not call `preventDefault()` must be registered with `{ passive: true }`. This is a correctness requirement for scroll performance, not merely an optimisation. Failure to mark these listeners passive will generate console warnings and, more importantly, will produce scroll jank on mobile devices.

### Avoiding Handler Recreation

Handlers should be defined as class methods (or stable function references stored as private fields) rather than being created as new arrow functions on every `addEventListener` call. Creating a new function object on each `connectedCallback` is not incorrect when the `signal` pattern is used — the old function is removed with the listener — but it is unnecessary allocation. Arrow functions assigned to private fields at construction time are preferred.

### Event Listener Count Discipline

The total number of event listeners active at any time should be proportional to the number of mounted components, not the number of DOM nodes in any list or grid. Delegation (Section 6) is the mechanism that maintains this proportionality. A component that renders 500 list items must not register 500 item-level click listeners.

---

## 14. What the Event Architecture Does Not Own

The event architecture defines how listeners are registered, cleaned up, and structured. It does not own:

**Reactive state propagation** — when state changes should trigger re-renders or computed derivations, that is the reactivity layer's concern. The event system is the transport for notifications; the state layer is the source of truth.

**Network request lifecycle** — `AbortController` is shared between the event pattern and network cancellation, but the event module does not manage fetch requests. The network module owns that lifecycle.

**Router navigation events** — the `navigate` event and its interception are owned by the router module. The event architecture provides the `AbortController` pattern that the router uses internally, but it does not dispatch or handle navigation events.

**Worker message passing** — `postMessage` and `MessageChannel` are the transport for Worker communication. These produce `message` events but the Worker architecture module owns the lifecycle contracts for them. The event module provides the `AbortController` pattern for the main-thread listeners on those messages.

**Scheduler and timing** — `setTimeout`, `requestAnimationFrame`, `scheduler.postTask()`, and `requestIdleCallback` are timing primitives that may be triggered by events but are owned by the runtime and rendering architecture, not the event module.

---

**References:**

- WHATWG DOM Living Standard — EventTarget: `dom.spec.whatwg.org/#interface-eventtarget`
- WHATWG DOM Living Standard — AbortController: `dom.spec.whatwg.org/#interface-abortcontroller`
- WHATWG DOM Living Standard — AbortSignal: `dom.spec.whatwg.org/#interface-AbortSignal`
- WHATWG DOM Living Standard — CustomEvent: `dom.spec.whatwg.org/#interface-customevent`
- WHATWG DOM Living Standard — Shadow tree event dispatch: `dom.spec.whatwg.org/#shadow-tree`
- MDN — EventTarget.addEventListener(): `developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener`
- MDN — AbortController: `developer.mozilla.org/en-US/docs/Web/API/AbortController`
- MDN — AbortSignal: `developer.mozilla.org/en-US/docs/Web/API/AbortSignal`
- MDN — AbortSignal.any(): `developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static`
- MDN — AbortSignal.timeout(): `developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static`
- MDN — Event.composed: `developer.mozilla.org/en-US/docs/Web/API/Event/composed`
- MDN — Event.composedPath(): `developer.mozilla.org/en-US/docs/Web/API/Event/composedPath`
- MDN — CustomEvent: `developer.mozilla.org/en-US/docs/Web/API/CustomEvent`
- V8 — WeakRef and FinalizationRegistry: `v8.dev/features/weak-references`
- Chrome for Developers — Passive event listeners: `developer.chrome.com/docs/lighthouse/best-practices/uses-passive-event-listeners`
- pmdartus — Complete guide to Shadow DOM event propagation: `pm.dartus.fr/posts/2021/shadow-dom-and-event-propagation/`