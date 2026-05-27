## Reactivity Architecture

**Version:** 1.0  
**Status:** Working Specification  
**Date:** May 2026  
**Authority:** MDN Web Docs, WHATWG HTML Living Standard, TC39 Proposal Registry, WICG Observable Specification

---

## Table of Contents

1. [Conceptual Foundation](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#1-conceptual-foundation)
2. [The Push-Pull Model and Glitch-Freedom](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#2-the-push-pull-model-and-glitch-freedom)
3. [The Browser's Native Reactive Primitives](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#3-the-browsers-native-reactive-primitives)
4. [Proxy-Based Reactive State](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#4-proxy-based-reactive-state)
5. [Explicit Subscription vs Auto-Tracking](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#5-explicit-subscription-vs-auto-tracking)
6. [EventTarget as the Pub/Sub Primitive](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#6-eventtarget-as-the-pubsub-primitive)
7. [Computed Values and Memoisation](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#7-computed-values-and-memoisation)
8. [Deep Reactivity and Nested State](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#8-deep-reactivity-and-nested-state)
9. [Cross-Context Reactivity via BroadcastChannel](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#9-cross-context-reactivity-via-broadcastchannel)
10. [TC39 Signals Proposal](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#10-tc39-signals-proposal)
11. [WICG Observable Proposal](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#11-wicg-observable-proposal)
12. [The Reactivity Lifecycle Contract](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#12-the-reactivity-lifecycle-contract)
13. [core.state — Reactive State API](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#13-corestate--reactive-state-api)
14. [Reactivity Decision Reference](https://claude.ai/chat/e6967609-e960-446d-8e04-2e0e3ea07de6#14-reactivity-decision-reference)

---

## 1. Conceptual Foundation

Reactivity is the property of a system where a change to one value automatically propagates to all values that depend on it, and ultimately to any outputs — such as DOM mutations — that are derived from those values. It is a data flow discipline, not a framework feature.

The problem it solves is coupling. Without reactivity, code that changes state must also enumerate and update every consumer of that state. As a codebase grows, maintaining this enumeration correctly is where much of the maintenance burden accumulates. Reactivity inverts the dependency: consumers declare what they depend on, and the system propagates changes to them.

The web platform has never lacked the primitives to build this. `Proxy` intercepts reads and writes on any object. `EventTarget` provides a native publish/subscribe interface. The Observer APIs (`MutationObserver`, `ResizeObserver`, `IntersectionObserver`) react to specific environmental changes. What the platform has lacked — and what the TC39 Signals proposal attempts to provide — is a standardised high-level model built on top of these primitives.

This architecture does not wait for that standard. The Proxy and EventTarget primitives are sufficient to build a complete, production-grade reactive system today. The design is explicitly aligned with the Signals proposal's computational model so that migration, when the standard ships and stabilises, requires minimal structural change.

---

## 2. The Push-Pull Model and Glitch-Freedom

Reactive systems are typically described along two axes: whether change propagation is push-based or pull-based, and whether computed values can be observed in an inconsistent intermediate state.

**Push-based propagation** means that when a source state value changes, the system immediately notifies all registered dependents. This is eager: computation happens at write time rather than at read time. The advantage is that consumers always have current values. The disadvantage is that if multiple source values change in the same transaction, consumers may fire multiple times with partially updated state — once per source value — before the full update is complete.

**Pull-based propagation** means that computed values are lazily evaluated only when read. The system marks dependents as stale on a write but defers computation until the consumer reads the value. The advantage is that computation happens only once per read, regardless of how many source updates preceded it. The disadvantage is that the consumer must explicitly request the value.

**Push-then-pull** (also called the push-pull model) is the approach used by most modern fine-grained reactive systems — SolidJS, Angular signals, Preact signals, and the TC39 proposal itself. When a source value changes, dependents are marked as stale (push). Recomputation happens lazily only when a consumer reads the derived value (pull). This eliminates redundant computation while ensuring consumers never read stale data.

**Glitch-freedom** is the property that a consumer can never observe an intermediate state where some — but not all — of its dependencies have updated. In a graph where state A influences both B and C, and effect D reads both B and C, a glitchy system might fire D once with the new B and the old C before firing again with both new. A glitch-free system ensures D fires only once, after both B and C have settled. The push-then-pull model achieves glitch-freedom by deferring computation to the pull step: by the time any consumer reads its derived values, all upstream state has already propagated.

This architecture's explicit subscription model (section 5) sidesteps the glitch problem by a different route: components subscribe to specific state keys and schedule their DOM updates through the rendering pipeline, which naturally batches multiple state changes arriving within the same task into a single render pass. This is a coarser form of glitch-freedom, appropriate for this architecture's rendering model.

---

## 3. The Browser's Native Reactive Primitives

The following platform primitives compose into a complete reactive system without any library dependency.

**`Proxy`**  
**MDN:** `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy`  
**Status:** Baseline — Widely Available

`Proxy` wraps any object and intercepts its fundamental operations through a handler. The `get` trap fires on any property read; the `set` trap fires on any property write; the `deleteProperty` trap fires on property deletion. These interception points are the foundation of dependency tracking (reading establishes a dependency) and change notification (writing notifies subscribers). `Reflect` provides the default behaviour for each trap, making it straightforward to intercept selectively without replacing unrelated operations.

**`EventTarget`**  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/EventTarget`  
**Status:** Baseline — Widely Available

`EventTarget` is the browser's native publish/subscribe interface. Any class can extend it. Any module can instantiate it and export the instance as a named event bus. Consumers register with `addEventListener()`, which accepts an `{ signal }` option for automatic cleanup when the signal aborts. The dispatch infrastructure runs at the engine level and is considerably more efficient than any userland event emitter.

**`CustomEvent`**  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/CustomEvent`  
**Status:** Baseline — Widely Available

`CustomEvent` carries arbitrary payload in its `detail` property through the standard event dispatch system. It is the mechanism by which state changes travel through an `EventTarget`-based pub/sub system. The payload is structured-cloned internally during dispatch, which means it arrives at listeners as a safe copy rather than a mutable reference to the originating object.

**`MutationObserver`**  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/MutationObserver`  
**Status:** Baseline — Widely Available

Observes changes to the DOM tree: child node insertions and removals, attribute mutations, and character data changes. Callbacks deliver a batch of `MutationRecord` entries after all mutations in a microtask have settled, making the callback inherently glitch-free with respect to DOM state. Used in this architecture for components that must react to structural DOM changes outside their own shadow root.

**`ResizeObserver`**  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/ResizeObserver`  
**Status:** Baseline — Widely Available

Fires when an element's content box, border box, or device-pixel content box dimensions change. Callbacks are delivered after layout but before paint, so layout information is always current and no forced layout is triggered by reading dimensions inside the callback. Used for components with dimension-dependent rendering — charts, custom scroll containers, responsive components.

**`IntersectionObserver`**  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API`  
**Status:** Baseline — Widely Available

Fires when an observed element's intersection with a root (the viewport by default) crosses a configured threshold. Observations are batched and delivered asynchronously, entirely off the main thread. Used for visibility-driven reactivity: lazy rendering, scroll-triggered animations, virtualised lists, analytics.

**`PerformanceObserver`**  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver`  
**Status:** Baseline — Widely Available

Fires when new entries are added to the browser's performance timeline. Entry types relevant to this architecture include `longtask` (main thread tasks exceeding 50ms), `measure` (application-defined timing marks), `largest-contentful-paint`, `layout-shift`, and `first-input`. Used by the monitoring layer to detect rendering regressions, not by application-level reactive code.

---

## 4. Proxy-Based Reactive State

A reactive store is a `Proxy` wrapping a plain object. The `set` trap intercepts every property write, applies the change to the underlying object, and notifies all registered subscribers for that key. The `get` trap passes through to the underlying object by default, with the option to record which properties are accessed during a computation.

The subscriber registry is a `Map` from property keys to sets of callback functions. When the `set` trap fires, it reads the subscriber set for the changed key and calls each subscriber with the new and previous values. Subscribers that are no longer needed are removed by returning their disposer function, or automatically via `AbortSignal`.

```js
// Conceptual structure — not the full implementation
function createStore(initial) {
  const subscribers = new Map();

  const proxy = new Proxy({ ...initial }, {
    set(target, key, value) {
      const previous = target[key];
      if (Object.is(previous, value)) return true; // no-op for unchanged values
      target[key] = value;
      subscribers.get(key)?.forEach(fn => fn(value, previous));
      return true;
    }
  });

  return {
    store: proxy,
    subscribe(key, callback, signal) {
      if (!subscribers.has(key)) subscribers.set(key, new Set());
      subscribers.get(key).add(callback);
      signal?.addEventListener('abort', () =>
        subscribers.get(key)?.delete(callback)
      );
    }
  };
}
```

The `Object.is()` equality check before notifying is critical. Without it, setting a property to its current value triggers a spurious notification, causing components to schedule unnecessary re-renders. `Object.is()` handles the edge cases (`NaN !== NaN` in standard equality; `Object.is(NaN, NaN)` is true) correctly.

This is the same model used internally by Vue 3's `reactive()`, MobX observables, and SolidJS stores. The `Proxy` primitive is already in the platform; these frameworks implement it themselves. This architecture uses the primitive directly.

---

## 5. Explicit Subscription vs Auto-Tracking

Most signal and reactive library implementations use **auto-tracking**: during the execution of a computed function or an effect, all `get` accesses on reactive state are recorded as dependencies. When any of those dependencies changes, the computation re-runs automatically. The developer does not need to declare dependencies.

This architecture uses **explicit subscription** instead. Components subscribe to specific state keys by name:

```js
core.state.subscribe('user.profile', (newValue) => {
  this.renderProfile(newValue);
}, this.abortController.signal);
```

This is a deliberate constraint, not a limitation. The reasons are:

**Predictability.** Auto-tracking depends on a global mutable context — a thread-local stack tracking "which computation is currently executing." Reading a reactive property outside a tracking context (in an event handler, in a setTimeout, in a worker message handler) silently fails to register the dependency. Debugging why a component does not update often traces back to this silent failure. Explicit subscription has no hidden context. The subscription is either registered or it is not.

**Clarity of coupling.** Explicit subscriptions are a declaration of intent that is readable in the component's source code without executing the component to observe which properties it reads. This is a significant debugging and code review advantage in large codebases.

**No stale closure bugs.** Auto-tracking combined with closures produces a well-known class of bugs where a computation captures a stale reference to a reactive value because the closure was formed before the reactive context was established. Explicit subscriptions bind a callback to a key by name; there is no closure over reactive state.

**Alignment with the rendering model.** Components subscribe to state keys and schedule render updates. The rendering layer (section 6 of the rendering document) handles batching. The reactivity layer's only responsibility is to notify. This separation of concerns is cleaner than a reactive system that also manages rendering scheduling.

The tradeoff is verbosity. Explicit subscriptions require the developer to enumerate dependencies. For components that depend on many state keys, this is more code than auto-tracking would require. The architecture accepts this cost in exchange for the predictability and debuggability advantages.

---

## 6. EventTarget as the Pub/Sub Primitive

For communication that is not tied to shared mutable state — notifications of events, one-way signals from one module to another, lifecycle announcements — `EventTarget` provides a native publish/subscribe interface that requires no additional library.

The pattern is simple: a module creates an `EventTarget` instance, exports it as a named event bus, and dispatches `CustomEvent` instances on it. Consumers register listeners with `addEventListener()`.

The `{ signal }` option on `addEventListener()` is the key feature that makes this pattern safe in a long-lived application. Passing a component's `AbortController.signal` to every `addEventListener()` call means that all subscriptions are automatically removed when the component's controller aborts in `disconnectedCallback()`. No manual `removeEventListener()` calls are required, and no subscription can outlive the component.

For events that should propagate up the component tree, standard DOM events dispatched from within a shadow root must be composed to cross the shadow boundary. A `CustomEvent` with `{ bubbles: true, composed: true }` crosses shadow boundaries and can be received by ancestors in the light DOM. Events without `composed: true` are contained within the shadow root's event scope.

The `EventTarget` approach is used at two distinct levels:

**Module-level event buses** are singleton `EventTarget` instances exported from a module and used for application-level events (authentication state changes, global notifications, route change announcements). They are long-lived and shared.

**Component-level events** are dispatched from Custom Elements via `this.dispatchEvent()` for the standard web component communication pattern where a child signals to a parent. This is the correct mechanism for custom interactive elements reporting user actions upward.

---

## 7. Computed Values and Memoisation

A computed value is a function of one or more state values whose result should be cached and only recomputed when its dependencies change. Without memoisation, reading a derived value recalculates it on every access regardless of whether its inputs have changed — correct, but inefficient for expensive derivations.

In the absence of native signals with built-in lazy evaluation, computed values in this architecture are implemented as follows:

A computed value has an explicit dependency list — the state keys it reads. It maintains a cache: the last computed result and the last-seen version of each dependency. When a dependency changes, the computed value is marked invalid. On the next read, it recomputes and updates both the cache and the dependency versions.

`WeakMap` is used to associate computed caches with their source state objects rather than with string keys. This ensures that a computed value's cache is eligible for garbage collection when the state object it depends on becomes unreachable, without requiring explicit disposal. This is a meaningful memory safety property for computed values that are created locally within a component and should not outlive it.

**Version numbers vs equality checks**

The simplest invalidation strategy is to mark a computed value invalid whenever any of its dependencies fires a change notification, then recompute lazily on next read. A more precise strategy is to recompute only when the new dependency value is not `Object.is()`-equal to the previous one, eliminating redundant recomputation for writes that produce the same value (a common case for boolean or enum state).

This architecture uses the latter. A state write that does not change the value (caught in the `Proxy` `set` trap as described in section 4) does not invalidate downstream computed values. This is equivalent to the `equals` option in signal implementations.

**Synchronous vs asynchronous derivations**

Computed values are synchronous: they are pure functions of their inputs with no side effects. Asynchronous derivations — a derived value that depends on a network request or a worker computation — are not modelled as computed values. They are modelled as separate state keys that are updated when the asynchronous operation completes, and they follow the same subscription pattern as any other state change.

---

## 8. Deep Reactivity and Nested State

A `Proxy` wrapping a flat object intercepts changes to its direct properties. It does not intercept changes to nested objects: `store.user = newUser` fires the `set` trap, but `store.user.name = 'new name'` mutates the nested object in place without going through the proxy's trap.

There are two approaches to this problem.

**Shallow stores with structured keys.** The store's values are always primitive or immutable. Nested objects are replaced entirely rather than mutated in place: `store.user = { ...store.user, name: 'new name' }`. This is the simpler approach and produces cleaner change semantics — every state change is a property assignment that fires exactly one notification. It is the default approach in this architecture for most state.

**Recursive proxying.** When the `get` trap is accessed on a property whose value is a plain object, a new `Proxy` is returned for that nested object, with the same handler. This is how Vue 3's `reactive()` implements deep reactivity. It means `store.user.name = 'new name'` fires a `set` trap at the `user.name` level and can notify subscribers to the `user.name` key.

Recursive proxying is more ergonomic but has costs: a new `Proxy` wrapper is created on every property access of a nested object; the subscriber key space becomes a hierarchical path rather than a flat key; and the interaction with the equality check becomes more complex. It is appropriate for deep, complex state objects where replacing the whole parent object would be semantically incorrect or prohibitively expensive.

This architecture defaults to shallow stores. Recursive proxying is used only for explicitly declared complex state objects where the ergonomic benefit justifies the additional complexity.

---

## 9. Cross-Context Reactivity via BroadcastChannel

**Spec:** WHATWG HTML Living Standard — BroadcastChannel  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API`  
**Status:** Baseline — Widely Available

Reactive state within a single browsing context (tab) is managed by the Proxy-based store. When the same application is open in multiple tabs, each tab maintains its own store instance. State changes in one tab do not automatically propagate to others.

`BroadcastChannel` bridges this gap. It is a named, origin-scoped message bus: any context (tab, Worker, iframe) can join a named channel and receive all messages sent to it. When the store commits a write, it can optionally broadcast the change to all other same-origin contexts via a `BroadcastChannel` named after the store.

The receiving context's `message` event handler applies the incoming update to its own store instance using the same mutation path as a local write. The result is that all open tabs maintain consistent state without any server round-trip.

Two constraints govern this pattern:

**Broadcast is opt-in per state key.** Not all state is appropriate to synchronise across tabs. Ephemeral UI state (which modal is open, which accordion is expanded) should not be broadcast. Durable application state (user profile, authentication status, shared data) should be. The store's `subscribe` API accepts a `{ broadcast: true }` option to opt a key into cross-context synchronisation.

**Incoming broadcasts must not re-broadcast.** A write triggered by an incoming `BroadcastChannel` message must not itself be broadcast, or it will loop. The store sets an internal flag during the application of an incoming broadcast update; the `set` trap checks this flag before dispatching to the broadcast channel.

---

## 10. TC39 Signals Proposal

**Spec:** `github.com/tc39/proposal-signals`  
**Status:** Stage 1 as of mid-2026. Not yet shipped in any browser.  
**Polyfill:** `github.com/proposal-signals/signal-polyfill`

The TC39 Signals proposal aims to standardise fine-grained reactivity primitives as native JavaScript types. The proposal was presented at the April 2024 TC39 meeting and accepted at Stage 1. As of mid-2026 it remains at Stage 1, still in the early prototyping phase the champions specified as a prerequisite for Stage 2 advancement. The proposal's README explicitly states that significant framework integration prototyping must precede any further stage advancement.

The source material for this architecture document originally described the proposal as Stage 2 — this is incorrect. Stage 1 means the committee has agreed the problem space is worth exploring; it does not mean the API is stable or that browser implementation is imminent. The proposal's own FAQ notes that native availability across browsers without polyfills should be expected to take "at least 2–3 years at an absolute minimum" from the point the proposal reaches a stable stage.

### The proposed API surface

`Signal.State(initialValue)` — a writable signal. Reading via `.get()` and writing via `.set(value)` are the two operations. Multiple `State` signals can be the source nodes of a reactive graph.

`Signal.Computed(computeFn)` — a lazily evaluated derived value. The computation function is re-executed only when a dependency has changed and the computed value is read. The signal automatically tracks which other signals are read during the computation function's execution (auto-tracking). Computed signals cache their last result and do not recompute unnecessarily.

`Signal.subtle.Watcher(notifyFn)` — a low-level observer used by framework authors to build effects. A `Watcher` is notified synchronously when any of its watched signals changes, but it does not re-read or recompute anything — it only flags that something has changed. The actual re-computation happens when the framework schedules an effect to pull the new value. This separation between notification and computation is the mechanism that achieves glitch-freedom: the `Watcher` can be notified multiple times within a single synchronous update, but the effect runs only once, after all updates have settled.

`Signal.subtle.*` contains the remaining framework integration APIs: `watch()`, `unwatch()`, `getPending()`, and `hasSubs()`. These are explicitly not intended for application-level use.

### Why the proposal does not include effects

The proposal intentionally omits a built-in effect API (a function that automatically re-runs when its dependencies change and can perform side effects like DOM mutation). Effects are left to framework authors because the correct timing and scheduling of effects is deeply tied to each framework's rendering pipeline. A native effect primitive would need to express where in the browser's rendering pipeline it should execute — a concern that belongs to the platform's rendering scheduler, not to the language itself. The `Signal.subtle.Watcher` provides the notification hook; frameworks use it to integrate with `requestAnimationFrame`, `scheduler.postTask()`, or their own rendering queue.

### Migration alignment

This architecture's Proxy-based reactive layer is positioned for straightforward migration to native signals when they stabilise. The mental model is aligned: a `Signal.State` is a state store property; a `Signal.Computed` is a computed value with memoisation; a framework-built effect driven by `Signal.subtle.Watcher` corresponds to a component's subscriber callback that schedules a DOM update. The explicit subscription model used today is a step more manual than auto-tracking signals, but the structural shape is the same. Migration would reduce the subscription boilerplate without requiring changes to the rendering or lifecycle architecture.

---

## 11. WICG Observable Proposal

**Spec:** `wicg.github.io/observable`  
**Status:** Draft Community Group Report (November 2025). Not yet in Baseline. Not shipped broadly in any engine as of mid-2026.

The WICG Observable proposal provides a composable abstraction for handling streams of asynchronous events. An `Observable` represents a source of values over time, with operators (`map`, `filter`, `takeUntil`, `flatMap`) that compose event streams declaratively. It is intended to sit between `EventTarget` (synchronous, imperative) and `Promise` (asynchronous, single-value) in the platform's reactive primitive hierarchy.

The proposal originated in TC39 in 2015, moved to WHATWG in 2017, and has evolved slowly since. It has attracted sustained developer demand and no strong opposition, but has repeatedly stalled due to lack of implementer prioritisation. The community group draft of November 2025 reflects renewed activity, but it has not cleared the implementer commitment threshold required for Baseline status.

### Relationship to this architecture

The Observable proposal is relevant to event-driven reactivity, not state-driven reactivity. It addresses the problem of composing streams of user events and async notifications — "the user typed in this field, but only update the search after they stop typing, and cancel any in-flight search if they type again." This is the problem that RxJS was built to solve.

This architecture's `EventTarget` pub/sub pattern handles the simpler cases. For complex event stream composition — debouncing, throttling, takeUntil-style cancellation — the current approach either uses imperative AbortController-based cancellation or includes a minimal operator set in the events module. The Observable proposal would provide a standardised declarative alternative.

This architecture does not depend on the proposal and does not polyfill it. The event composition patterns in `core/events/` are implemented without it. If the Observable API ships and achieves Baseline status, the event composition layer is a candidate for migration, since the operator semantics would be standard and the implementation maintenance burden would move to the platform.

---

## 12. The Reactivity Lifecycle Contract

Every subscription created by a component must be released when the component is removed from the document. Subscriptions hold a reference to their callback, which typically holds a reference to the component instance, which holds a reference to its shadow DOM subtree. A subscription that outlives its component prevents the entire component tree from being garbage collected.

The lifecycle contract for reactivity resources is:

**In `connectedCallback()`:**  
Create a single `AbortController`. Pass its `signal` to every `subscribe()` call, every `addEventListener()` call, and every `core.ui.observe.*` call. The signal propagates through every subscription channel and is the single point of cleanup for all of them.

**In `disconnectedCallback()`:**  
Call `this.abortController.abort()`. This single call terminates all subscriptions registered with the signal — reactive store subscriptions, DOM event listeners, BroadcastChannel listeners, observer callbacks, and scheduled tasks that accepted the signal. No individual cleanup of each subscription is required.

**On reconnection:**  
`connectedCallback()` may fire more than once if the element is moved within the document. Each call to `connectedCallback()` must create a fresh `AbortController` and register subscriptions anew. The previous controller was aborted in the preceding `disconnectedCallback()`.

**Subscription idempotency:**  
Because `connectedCallback()` can fire multiple times, the subscription setup must be idempotent. Using a new `AbortController` per `connectedCallback()` call — rather than a single controller for the element's lifetime — guarantees this: each call creates a fresh subscription set associated with the new controller, and the previous set has already been cleaned up.

---

## 13. core.state — Reactive State API

The `core.state` module exposes the reactive store as an ergonomic interface. Application code interacts with `core.state` rather than calling `Proxy` directly.

```
core.state.create(initialState)      → ReactiveStore
```

Creates a new reactive store from a plain object. The returned store is the single source of truth for a domain of application state.

```
store.get(key)                       → value
```

Reads a value by key. Does not establish a subscription.

```
store.set(key, value)                → void
```

Writes a value. Fires notifications for all subscribers of the key if the value has changed (using `Object.is()` equality).

```
store.subscribe(key, callback, signal?)  → Disposer
```

Registers a callback for changes to the given key. If a signal is provided, the subscription is removed when the signal aborts. Returns a disposer function for manual removal when a signal is not available.

```
store.derived(keys[], computeFn)     → ComputedValue
```

Creates a memoised derived value. The `computeFn` is called with the current values of the listed keys and its result is cached. The cache is invalidated when any of the listed keys changes.

```
store.snapshot()                     → PlainObject
```

Returns a plain, non-reactive copy of the store's current state. Used for serialisation, debugging, and server-side rendering hydration payloads.

```
store.hydrate(snapshot)              → void
```

Applies a snapshot to the store, setting all keys to the snapshot's values without dispatching individual change notifications. Used during application startup to restore persisted state in a single operation.

```
store.broadcast(channelName)         → void
```

Opts the store into cross-context synchronisation via a `BroadcastChannel` with the given name. Subsequently, all writes to the store are broadcast to other same-origin contexts subscribing to that channel.

---

## 14. Reactivity Decision Reference

The following maps scenarios to the correct reactivity mechanism.

|Scenario|Mechanism|
|---|---|
|State shared across multiple components|`core.state` Proxy-based reactive store|
|Component reacts to a single state key|`store.subscribe(key, fn, signal)`|
|Derived value from multiple state keys|`store.derived(keys, fn)` with memoisation|
|Cross-component notification without shared state|`EventTarget` event bus + `CustomEvent`|
|Component reports user action to parent|`this.dispatchEvent(new CustomEvent(..., { bubbles: true, composed: true }))`|
|State synchronised across multiple tabs|`store.broadcast(channelName)` via `BroadcastChannel`|
|Reacting to DOM tree mutations|`MutationObserver` via `core.ui.observe.mutation()`|
|Reacting to element dimension changes|`ResizeObserver` via `core.ui.observe.resize()`|
|Reacting to element visibility changes|`IntersectionObserver` via `core.ui.observe.intersection()`|
|Event stream composition (debounce, takeUntil)|Imperative `AbortController` cancellation in `core/events/`; Observable API pending|
|All subscription cleanup on component removal|Single `AbortController.abort()` in `disconnectedCallback()`|
|Using TC39 Signals today|Not available natively; use Proxy-based store; `signal-polyfill` for evaluation only|

---

## Standards and References

- TC39 Signals Proposal (Stage 1): `github.com/tc39/proposal-signals`
- TC39 Signals Polyfill: `github.com/proposal-signals/signal-polyfill`
- WICG Observable Draft (November 2025): `wicg.github.io/observable`
- MDN — Proxy: `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy`
- MDN — Reflect: `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect`
- MDN — EventTarget: `developer.mozilla.org/en-US/docs/Web/API/EventTarget`
- MDN — CustomEvent: `developer.mozilla.org/en-US/docs/Web/API/CustomEvent`
- MDN — MutationObserver: `developer.mozilla.org/en-US/docs/Web/API/MutationObserver`
- MDN — ResizeObserver: `developer.mozilla.org/en-US/docs/Web/API/ResizeObserver`
- MDN — IntersectionObserver: `developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API`
- MDN — BroadcastChannel: `developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API`
- WHATWG HTML Living Standard: `html.spec.whatwg.org`
- Jonathan Frere — Pushing and Pulling: Three Reactivity Algorithms: `jonathan-frere.com/posts/reactivity-algorithms`