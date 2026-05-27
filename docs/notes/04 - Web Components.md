## Web Component Lifecycle

**Spec Authority:** WHATWG HTML Living Standard — Custom Elements (last updated May 2026)  
**MDN Reference:** `developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements`  
**Baseline Status:** Custom Elements v1 — Widely Available (all major engines since 2019)  
**Related Documents:** architecture.md, rendering-system.md, reactivity.md, memory-management.md

---

## Overview

A Custom Element's lifecycle is not a framework convention. It is a set of synchronous callbacks defined in the WHATWG HTML Living Standard and invoked directly by the browser's element upgrade and DOM mutation machinery. Understanding this lifecycle precisely — including its ordering guarantees, its failure modes, and its interaction with Shadow DOM, forms, and the scheduler — is prerequisite to building components that are both correct and memory-safe.

This document covers the complete lifecycle: from element construction and upgrade, through connection and disconnection, to attribute observation, form association, and the recently added state-preserving move mechanism. It also covers the cleanup architecture that must accompany every lifecycle implementation, and the rendering discipline that separates well-behaved components from those that cause forced synchronous layout.

---

## The Element State Machine

Before examining individual callbacks, it helps to understand the state a custom element instance is in at each point in its existence. The HTML Living Standard defines a formal custom element state for every element:

**`undefined`** — The element tag name has been parsed or created, but `customElements.define()` has not yet been called for that name. The element exists in the DOM as an `HTMLElement` with no custom behaviour.

**`failed`** — The element's constructor threw an exception during upgrade, or the constructor violated the constructor constraints (for example, manipulating children). The element is permanently in a degraded state and will not receive further lifecycle callbacks.

**`uncustomized`** — The element name matches no registered definition. Not the same as `undefined`; an element can be `uncustomized` if it was created with a valid name that was never registered.

**`precustomized`** — An internal transient state during the upgrade process, before the constructor has completed.

**`custom`** — The element has been successfully upgraded and is fully operational. All lifecycle callbacks are active.

This state is accessible as `element.constructor` identity checks and via `customElements.get(name)`, and is reflected in the CSS `:defined` pseudo-class, which applies only to elements in the `custom` state.

---

## Upgrade Semantics

Upgrade is the process by which the browser associates a parsed or created element with its registered class and invokes the constructor. Its timing is non-obvious and has practical consequences.

When the HTML parser encounters `<my-component>` before `customElements.define('my-component', ...)` has been called, it creates a plain `HTMLElement` with the tag name preserved. When the definition is later registered — whether synchronously in a module or asynchronously after a dynamic `import()` — the browser performs an upgrade pass across all existing instances in the document.

During upgrade, the HTML Living Standard specifies that:

1. All existing observed attributes on the element are replayed as `attributeChangedCallback` calls, with `null` as the `oldValue` and the current attribute value as `newValue`.
2. If the element is already connected to a document at the time of upgrade, `connectedCallback` is enqueued immediately after the constructor completes.

This means `connectedCallback` may fire at two distinct moments: once at upgrade (if the element was already in the DOM), and again whenever the element is subsequently moved to a new parent. Code that guards first-time initialisation must use an explicit flag, not assume `connectedCallback` will only run once.

The `customElements.whenDefined(name)` method returns a Promise that resolves when the given element name is registered. This is the correct tool for code that depends on a component being ready before interacting with it — for example, calling a method on a custom element instance obtained via `querySelector`.

---

## Lifecycle Callbacks

All lifecycle callbacks are synchronous. They are invoked by the browser's element reaction queue, which processes microtask checkpoints during and after DOM mutations. Throwing an exception from a lifecycle callback is handled by the browser's error reporting mechanism and does not prevent the DOM mutation from completing, but it will leave the element in the `failed` state if it occurs during the constructor.

### `constructor()`

The constructor is invoked when the element is created via `document.createElement()` or during the upgrade of an existing element. It is also invoked when the HTML parser creates the element synchronously — though at that point in parsing, the element's children and attributes are not yet available.

The HTML Living Standard imposes strict constraints on what may occur in a constructor:

- `super()` must be the first statement, with no arguments. This is not a style rule; it is a specification requirement enforced by the browser.
- `attachShadow()` is permitted and is the correct location for shadow root creation.
- Default property values and private field initialisation are permitted.
- DOM manipulation of the element's children is prohibited. The specification states this may result in a `NotSupportedError`.
- Reading or writing attributes is prohibited for the same reason.
- `attachInternals()` is permitted and must be called here if the element is form-associated.

The practical consequence is that the constructor should be narrow: attach the shadow root, initialise private fields, obtain the `ElementInternals` object if needed, and defer everything else to `connectedCallback`.

One consequence of the upgrade path described above is that a constructor invoked during upgrade receives an existing element — one that already has attributes and child nodes — via the `super()` return value. The constructor cannot distinguish this case from a fresh construction. This is why the spec fires `attributeChangedCallback` and `connectedCallback` after the constructor, rather than during it: those callbacks provide the correct hook for reacting to pre-existing state.

### `connectedCallback()`

`connectedCallback` is invoked each time the element is inserted into a connected document. A document is connected if it is attached to a browsing context; elements inserted into a detached fragment or a `document.createDocumentFragment()` do not trigger this callback until the fragment itself is inserted.

This callback is the correct location for all work that depends on the element being in the live DOM:

- Subscribing to state, creating observers, and registering event listeners
- Initiating network requests or scheduler tasks
- Rendering into the Shadow DOM for the first time
- Starting animations or intersection observation

Because `connectedCallback` may fire multiple times — on first connection, on reconnection after removal, and on upgrade if the element was already in the DOM — all subscription and initialisation logic must either be idempotent or guarded by an explicit state flag. The specification deliberately provides no built-in "first connection only" callback. That is a design decision, not an omission: one-time initialisation belongs either in the constructor (if it does not require DOM access) or behind an `if (!this.#initialised)` guard in `connectedCallback`.

A second important constraint: `connectedCallback` is called during the microtask checkpoint that follows DOM insertion. When the HTML parser creates nested custom elements, the outer element's `connectedCallback` may fire before the inner element's children have been parsed. Code that reads child elements inside `connectedCallback` must account for this and should use a `MutationObserver` or `slotchange` event rather than assuming children are present.

### `disconnectedCallback()`

`disconnectedCallback` is invoked each time the element is removed from a connected document. It is the mirror image of `connectedCallback` and must undo every subscription, observer, and pending operation established there.

The memory safety of the entire application depends on this callback being implemented correctly. In a long-lived single-page application where components are created and destroyed repeatedly as routes change, any subscription that outlives its component is a leak that accumulates over the session lifetime.

The complete list of what must be cleaned up in `disconnectedCallback`:

- All `AbortController` instances created in `connectedCallback`, by calling `.abort()`
- Any `ResizeObserver`, `IntersectionObserver`, `MutationObserver`, or `PerformanceObserver` instances, by calling `.disconnect()`
- Any `EventTarget` subscriptions not managed by an `AbortSignal`
- Any pending animation timelines created with the Web Animations API, by calling `.cancel()` or `.finish()`
- Any `setInterval` handles, by calling `clearInterval()`
- Any `BroadcastChannel` instances specific to this element's lifetime, by calling `.close()`

The AbortController pattern described in the cleanup section below is the most robust approach because a single `controller.abort()` call terminates all resources registered with that signal simultaneously, with no possibility of forgetting one.

### `attributeChangedCallback(name, oldValue, newValue)`

`attributeChangedCallback` is invoked when an attribute listed in the static `observedAttributes` getter is added, changed, or removed. Attributes not listed in `observedAttributes` produce no notifications, regardless of how they are set.

The callback receives three arguments: the attribute name, the previous value (or `null` if the attribute was just added), and the new value (or `null` if the attribute was removed). This three-argument signature is the correct way to implement attribute-driven reactivity without a separate comparison step.

Key behaviours to understand:

- `attributeChangedCallback` fires before `connectedCallback` during upgrade, for all pre-existing observed attributes on the element. The `oldValue` will be `null` in these cases, because the attribute had no prior value within the component's observation scope.
- It fires for attribute mutations both before and after the element is connected. An element that is not yet in the DOM can still have its attributes set and will receive change notifications.
- It is the correct entry point for attribute-driven re-renders, not `connectedCallback`. An attribute change that occurs after connection should drive a re-render; `connectedCallback` should not be called again for that purpose.

### `adoptedCallback()`

`adoptedCallback` is invoked when the element is moved to a different `Document` via `document.adoptNode()`. This applies in multi-document scenarios: applications that use `<iframe>` elements and move components between the main frame and embedded frames, or applications that use `document.implementation.createHTMLDocument()` for off-screen document creation.

In most applications, `adoptedCallback` is never invoked. It exists to handle cases where the element's document context has semantic meaning — for example, a component that reads document-level metadata, registers with a document-scoped service, or holds references to document-specific resources.

If an element's behaviour is entirely self-contained within its own shadow tree, `adoptedCallback` typically requires no implementation.

### `connectedMoveCallback()` — State-Preserving Moves

**API:** `Element.moveBefore()`  
**Spec:** WHATWG DOM Living Standard  
**Browser support:** Chrome 133+. Firefox and Safari have expressed support; as of mid-2026, this is not yet cross-browser.

This is the most recently added lifecycle callback and it addresses a long-standing problem: moving an element in the DOM via `insertBefore()` or `appendChild()` triggers `disconnectedCallback` followed by `connectedCallback`, which destroys the element's runtime state. For components with active video or audio playback, open WebSocket connections, running CSS animations, or accumulated internal state, this is destructive.

`Element.moveBefore(node, referenceNode)` is a new DOM method that moves a node atomically within a connected DOM tree without invoking the remove and insert primitives. It preserves the element's state entirely. Its signature mirrors `insertBefore()` but its internal behaviour bypasses the normal removal steps.

When a custom element is moved via `moveBefore()`:

- If the element defines `connectedMoveCallback()`, that method is called instead of `disconnectedCallback()` and `connectedCallback()`. This signals to the element that it has been repositioned, not removed and re-added, and allows it to skip any teardown and re-setup that would be inappropriate for a move.
- If the element does not define `connectedMoveCallback()`, the regular `disconnectedCallback()` and `connectedCallback()` fire, for backwards compatibility. At this point, `this.isConnected` will be `true` during the `disconnectedCallback()`, which can serve as a signal that the call is happening due to a move rather than a genuine removal — though this distinction is fragile and `connectedMoveCallback` is the correct solution.

`MutationObserver` instances watching the moved element's parent will receive two mutation records — one for removal, one for insertion — even when `moveBefore()` is used. This is intentional for compatibility.

`moveBefore()` can only move nodes within a connected subtree. Attempting to use it to move a node into a detached fragment throws a `HierarchyRequestError`. Feature detection is required: `'moveBefore' in Element.prototype`.

The practical pattern for components that manage state across potential moves:

```js
connectedMoveCallback() {
  // The element has been repositioned. Update any position-dependent
  // state (e.g. sticky scroll references, bounding rect caches) without
  // tearing down subscriptions or re-initialising.
  this.#updatePositionDependentState();
}
```

---

## Component Cleanup Architecture

The single most important structural decision in a component's lifecycle implementation is how it manages cleanup. This architecture mandates one pattern: a single `AbortController` per connected lifetime.

In `connectedCallback()`, create an `AbortController` and store it on a private field. Pass its `signal` to every operation that accepts one:

- `addEventListener()` — the `{ signal }` option has been supported since 2021 and removes the listener automatically when the signal aborts
- `fetch()` — accepts `signal` in its options object; aborts the in-flight request on abort
- `scheduler.postTask()` — accepts `signal`; cancels the queued task on abort
- `ResizeObserver`, `IntersectionObserver`, `MutationObserver` — do not accept signals natively; their `.disconnect()` calls must be registered explicitly on the signal's `abort` event
- State subscriptions in the reactive layer — must also register cleanup via the signal

In `disconnectedCallback()`, call `controller.abort()`. This single line terminates every resource that was registered with the signal. No additional cleanup tracking is required.

The reason this pattern is non-optional: in a component that is connected and disconnected hundreds of times during a user session — as a virtualised list renders and removes items, for example — a single missed cleanup in `disconnectedCallback()` that holds a closure over component state prevents the garbage collector from reclaiming that component's memory. Accumulated across hundreds of instances, this becomes a measurable memory leak within minutes.

The `AbortSignal.any([...signals])` static method (available in all engines since 2024) enables composing multiple abort conditions. A component that should cancel its work if either it is disconnected or an external cancellation condition fires can pass `AbortSignal.any([this.#controller.signal, externalSignal])` to operations that need both cancellation paths.

---

## Declarative Shadow DOM and Server-Side Rendering

**Status:** Baseline Newly Available as of August 5, 2024  
**Attribute name:** `shadowrootmode` (note: older implementations used `shadowroot`; this was renamed in 2023 and implementations before Chrome 124 use the older name)

Prior to Declarative Shadow DOM, shadow roots could only be attached via JavaScript — meaning components rendered by a server had no shadow tree until the JavaScript bundle loaded and executed. This caused a Flash of Unstyled Content because the component's internal styles lived in the shadow root, which did not exist until JavaScript ran.

Declarative Shadow DOM resolves this by allowing the shadow root to be expressed directly in HTML:

```html
<my-component>
  <template shadowrootmode="open">
    <style>/* component styles */</style>
    <slot></slot>
  </template>
  <!-- slotted light DOM content here -->
</my-component>
```

The browser parses and attaches this shadow root during HTML parsing, before any JavaScript executes. The component's styles are applied immediately. When JavaScript later upgrades the element, the shadow root is already present and `attachShadow()` must not be called again — calling it on an element that already has a declarative shadow root will throw. The correct pattern is to check `this.shadowRoot` in the constructor and only call `attachShadow()` if the shadow root does not exist.

The lifecycle interaction: when an element with a declarative shadow root is upgraded, `connectedCallback` fires as usual. The shadow root's content is already rendered. The component's `connectedCallback` should treat this correctly — it may need to hydrate event listeners onto already-rendered DOM nodes rather than stamping a template clone for the first time.

---

## Form-Associated Custom Elements

**Interface:** `ElementInternals`  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/ElementInternals`  
**Baseline Status:** Widely Available (all engines since March 2023)

Custom elements that need to participate in native HTML form submission and validation do so via the `ElementInternals` API. The mechanism has two parts: the static declaration and the internals object.

Declaring `static formAssociated = true` on the element class opts the element into form association. This must be a static class field, not an instance property. When this declaration is present, the element gains four additional lifecycle callbacks:

**`formAssociatedCallback(form)`** — Called when the element is associated with or disassociated from a `<form>` element. The `form` parameter is the associated `HTMLFormElement`, or `null` on disassociation.

**`formDisabledCallback(disabled)`** — Called when the element's disabled state changes, either because a `disabled` attribute was set on the element itself or because a `<fieldset>` ancestor became disabled. The `disabled` parameter is a boolean.

**`formResetCallback()`** — Called when the associated form is reset. The element should reset its displayed value and its internal form value to the default state.

**`formStateRestoreCallback(state, mode)`** — Called when the browser restores form state, either after a navigation (`mode === 'restore'`) or as part of autocomplete (`mode === 'autocomplete'`). This allows the element to reconstruct its state from previously saved form data.

`attachInternals()` must be called in the constructor and its return value stored on a private field. The `ElementInternals` object provides:

- `internals.setFormValue(value, state)` — sets the value that will be submitted with the form
- `internals.setValidity(flags, message, anchor)` — controls the element's validation state and message
- `internals.checkValidity()` and `internals.reportValidity()` — invoke constraint validation
- ARIA properties (`internals.role`, `internals.ariaLabel`, `internals.ariaChecked`, etc.) — set default accessibility semantics without requiring explicit `aria-*` attributes on the host element

The ARIA properties on `ElementInternals` are significant: they express the element's semantics as defaults that can be overridden by the page author but will remain present if the author omits them. This is how native elements work — a `<button>` has `role="button"` as a default even if no `role` attribute is present — and `ElementInternals` enables the same pattern for custom elements.

---

## Slot Composition and the Flat Tree

The `<slot>` element distributes light DOM content into a shadow tree without moving or copying nodes. Slotted content remains in the light DOM; only its rendering position changes. This distinction has several lifecycle and accessibility consequences.

**Slot assignment events:** The `slotchange` event fires on a `<slot>` element when its assigned nodes change — that is, when light DOM children are added, removed, or reordered in a way that affects which nodes are slotted. This is the correct mechanism for a component to react to changes in its projected content. Watching children via a `MutationObserver` on the shadow root will not detect slotted content changes, because the slotted nodes are not in the shadow tree.

**Querying assigned nodes:** `slotElement.assignedNodes()` returns the flat list of nodes assigned to a slot, including text nodes. `slotElement.assignedElements()` returns only element nodes. Both methods accept a `{ flatten: true }` option that traverses nested slot elements in composed trees.

**Accessibility and the flat tree:** The accessibility tree is built from the flat tree — the composed rendering tree that combines the shadow tree and slotted light DOM content in their rendered positions. Screen readers traverse this flat tree, not the shadow tree or light DOM in isolation. Consequently:

- ARIA landmark roles placed on shadow DOM elements are exposed to assistive technologies in their rendered position within the flat tree.
- Slotted content's ARIA attributes are read as they appear in the light DOM; they are not duplicated or overridden by shadow DOM.
- The `role` and ARIA attributes of the shadow host element are in scope for its shadow tree's content. A shadow host with `role="dialog"` creates a dialog landmark that encompasses its shadow children and slotted content.
- The `:host` pseudo-class in shadow CSS does not affect accessibility semantics; use `internals.role` or a `role` attribute on the host for semantic assignment.

**Named slots:** The `slot` attribute on a light DOM element assigns that element to the named slot inside the shadow tree. A single light DOM element can only be assigned to one slot. Unassigned light DOM children are distributed to the unnamed default slot, if one exists.

---

## The `customElements` Registry API

The registry provides the coordination surface between element definitions and the rest of the application.

**`customElements.define(name, constructor, options)`** — Registers an element class against a name. The name must contain a hyphen and begin with a letter. The optional `options` object accepts `{ extends: 'builtin-name' }` for customised built-in elements, though this feature has incomplete cross-browser support and should not be relied upon in this architecture.

**`customElements.get(name)`** — Returns the constructor class registered for a name, or `undefined` if no registration exists. Useful for checking whether a component has been defined before attempting to upgrade elements programmatically.

**`customElements.whenDefined(name)`** — Returns a Promise that resolves with the class constructor once the element is defined. This is the correct way to await component readiness before calling methods on instances. It is preferable to polling or using mutation observers.

**`customElements.upgrade(root)`** — Synchronously upgrades all unupgraded custom elements within the given root. Useful when custom elements are inserted into a detached fragment and then attached — the browser will upgrade them on insertion, but calling `upgrade()` on the fragment beforehand allows interaction with the upgraded instances before insertion.

---

## Rendering Discipline within Lifecycle Callbacks

Lifecycle callbacks must not perform synchronous DOM mutations that trigger layout recalculation in response to external state changes. The correct rendering discipline is:

1. A state change arrives (user event, network response, worker message, state subscription notification).
2. The component marks itself as needing a render — setting a boolean flag or enqueueing a task.
3. The actual DOM mutation occurs inside a `scheduler.postTask()` callback with `user-visible` priority, or inside `requestAnimationFrame()` for work that must be frame-synchronised.
4. The rendered output is applied to the shadow DOM in a single batched mutation.

Applying DOM mutations synchronously inside `connectedCallback` is acceptable for initial render, because no layout recalculation has yet been performed for this element. Applying mutations synchronously inside `attributeChangedCallback` in response to a rapid sequence of attribute changes will cause repeated forced layout — each mutation invalidates the computed style, and any subsequent layout read before the next frame forces an immediate recalculation. Batching into a single scheduled callback avoids this.

For components that display many attributes and may receive rapid changes, a debounced or batched render schedule is essential. The pattern is to set a dirty flag and enqueue a render if one is not already pending:

```js
#dirty = false;

#scheduleRender() {
  if (this.#dirty) return;
  this.#dirty = true;
  scheduler.postTask(() => {
    this.#render();
    this.#dirty = false;
  }, { priority: 'user-visible', signal: this.#controller.signal });
}
```

The `signal` on `postTask` ensures that if the component is disconnected before the scheduled render fires, the task is cancelled automatically — no render work is performed for a removed component.

---

## Lifecycle Callback Ordering Guarantees

The HTML Living Standard defines the callback reaction queue and its ordering precisely. In practice, the guarantees that matter for application code:

- Within a single microtask checkpoint, reactions for a given element are processed in the order they were enqueued. This means that if both `attributeChangedCallback` and `connectedCallback` are enqueued for the same element during upgrade, `attributeChangedCallback` fires first.
- Reactions from different elements within the same checkpoint are processed in tree order: ancestors before descendants.
- Callbacks are microtasks, not tasks. They will complete before the browser performs its next rendering update, which means synchronous DOM mutations in a callback take effect immediately in the same frame.
- There is no guaranteed ordering between `connectedCallback` of one component and `connectedCallback` of a sibling component inserted in the same operation. If inter-component coordination at connection time is required, use `CustomEvent` dispatch or the reactive state layer rather than assuming a particular sibling ordering.

---

## The Absence of a `readyCallback`

A recurring question when implementing non-trivial components is how to perform work that must occur once, after the element is connected and its initial attributes are applied, but that should not repeat on reconnection.

The specification does not provide a `readyCallback` or equivalent. This is intentional — the upgrade and connection model is the platform's answer. The practical implementation is an explicit guard:

```js
#initialised = false;

connectedCallback() {
  this.#controller = new AbortController();

  if (!this.#initialised) {
    this.#initialised = true;
    this.#firstConnected();
  }

  this.#subscribe();
}

#firstConnected() {
  // One-time setup: render initial template, fetch initial data, etc.
}

#subscribe() {
  // Per-connection setup: register observers, subscriptions, etc.
}
```

This separation makes the distinction between one-time and per-connection behaviour explicit in the code, rather than relying on implicit lifecycle semantics that the platform does not provide.

---

## Summary: Callback Responsibility Matrix

|Callback|What belongs here|
|---|---|
|`constructor()`|`super()`, `attachShadow()`, `attachInternals()`, private field defaults|
|`connectedCallback()`|AbortController creation, subscriptions, observers, initial render, data fetch|
|`disconnectedCallback()`|`controller.abort()`, manual observer disconnects, explicit cleanup|
|`attributeChangedCallback()`|Attribute-driven state updates, scheduled re-renders|
|`adoptedCallback()`|Document-context re-registration, if applicable|
|`connectedMoveCallback()`|Position-dependent state updates, suppression of teardown on move|
|`formAssociatedCallback()`|Form-scoped state init, ARIA label synchronisation|
|`formDisabledCallback()`|Visual and functional disabled state|
|`formResetCallback()`|Value reset to default|
|`formStateRestoreCallback()`|State reconstruction from browser-saved data|

---

## Standards References

- WHATWG HTML Living Standard — Custom Elements: `html.spec.whatwg.org/multipage/custom-elements.html`
- WHATWG HTML Living Standard — ElementInternals: `html.spec.whatwg.org/multipage/custom-elements.html#the-elementinternals-interface`
- WHATWG DOM Living Standard — moveBefore(): `dom.spec.whatwg.org`
- MDN — Using custom elements: `developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements`
- MDN — ElementInternals: `developer.mozilla.org/en-US/docs/Web/API/ElementInternals`
- web.dev — Declarative Shadow DOM: `web.dev/articles/declarative-shadow-dom`
- WHATWG DOM PR #1307 — moveBefore() specification: `github.com/whatwg/dom/pull/1307`