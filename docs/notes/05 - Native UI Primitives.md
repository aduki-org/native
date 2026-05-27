## Popover API, CSS Anchor Positioning, Dialog, and Customisable Select

**Version:** 1.0  
**Status:** Architecture Specification  
**Date:** May 2026  
**Specification Authority:** WHATWG HTML Living Standard, W3C CSS Anchor Positioning Module Level 1, Open UI Community Group  
**Primary Research Sources:** MDN Web Docs, Chrome for Developers, web.dev, WHATWG/HTML spec, CSS-Tricks, Smashing Magazine

---

## Preface: The UI Primitives Problem

For the better part of a decade, the most common reason a web project reached for a JavaScript dependency was not complexity of behaviour — it was the inability of the browser's native elements to be composed into the overlay patterns that modern interfaces require. Dropdowns, tooltips, modals, confirmation dialogs, comboboxes, and custom selects each required bespoke libraries not because their logic was hard, but because the platform offered no coherent, z-index-safe, accessibility-aware, viewport-respecting foundation to build them on.

The result was a generation of implementations that were inconsistently accessible, fragile under z-index stacking contexts, brittle against viewport edges, and impossible to animate into and out of existence cleanly. The libraries that solved these problems — Floating UI, Tippy.js, Headless UI, Radix UI, Reach UI, and dozens of others — solved real, chronic, platform-level gaps.

In 2025 and 2026, the browser platform retroactively addressed virtually all of these gaps with a coordinated set of new primitives: the **Popover API**, **CSS Anchor Positioning**, the enhanced **`<dialog>` element**, and **customisable `<select>`**. Each arrived through distinct specification bodies but they are designed to compose — they share the concept of the **top layer**, the **implicit anchor reference**, and the **invoker command model** as their unifying architecture.

This document provides a thorough architectural analysis of each primitive: what problem it solves, how the browser runtime model underlies it, where it composes with the others, what its accessibility contract is, what its limitations are, and where it still requires developer responsibility.

---

## Table of Contents

1. [The Top Layer — The Foundational Model](#1-the-top-layer--the-foundational-model)
2. [Popover API — Architecture and Full Specification](#2-popover-api--architecture-and-full-specification)
3. [Invoker Commands — The Declarative Action System](#3-invoker-commands--the-declarative-action-system)
4. [Interest Invokers — Declarative Hover UI](#4-interest-invokers--declarative-hover-ui)
5. [CSS Anchor Positioning — Complete Architecture](#5-css-anchor-positioning--complete-architecture)
6. [The `<dialog>` Element — Full Platform Contract](#6-the-dialog-element--full-platform-contract)
7. [The Popover/Dialog Interaction Model — The Top Layer Stack](#7-the-popoverdialog-interaction-model--the-top-layer-stack)
8. [Customisable `<select>` — Architecture and Progressive Enhancement](#8-customisable-select--architecture-and-progressive-enhancement)
9. [Composing the Primitives — Canonical UI Pattern Map](#9-composing-the-primitives--canonical-ui-pattern-map)
10. [Accessibility Architecture — Cross-Primitive Analysis](#10-accessibility-architecture--cross-primitive-analysis)
11. [Animation and Transition Architecture](#11-animation-and-transition-architecture)
12. [Integration with Shadow DOM](#12-integration-with-shadow-dom)
13. [Tradeoff Analysis and Remaining Gaps](#13-tradeoff-analysis-and-remaining-gaps)
14. [Browser Compatibility Matrix](#14-browser-compatibility-matrix)
15. [Design Principles for Native-First UI Composition](#15-design-principles-for-native-first-ui-composition)

---

---

## 1. The Top Layer — The Foundational Model

### What the Top Layer Is

Every element that renders in the browser exists within a stacking context hierarchy. Stacking contexts are created by positioned elements with `z-index`, `opacity`, `transform`, `filter`, and related properties. The fundamental problem with this model for overlay UI is that any element inside a stacking context is bounded by that context's stack position, no matter how high its own `z-index` is. A tooltip inside a `transform: translateX(0)` parent will be clipped by its stacking context. A modal with `z-index: 9999` can still be occluded by a later-positioned element in the same context.

The **top layer** is a browser-managed rendering layer that exists entirely outside the normal document stacking context. Elements promoted to the top layer render above all content in the document, including all `z-index` stacks, regardless of where they sit in the DOM. This is not a CSS property available to arbitrary elements — it is a browser-controlled promotion mechanism, currently triggered only by specific APIs:

- `dialog.showModal()` — promotes the `<dialog>` to the top layer as a modal
- `popover` attribute (when visible) — promotes the popover element to the top layer
- Fullscreen API (`element.requestFullscreen()`) — promotes the element to the top layer

The significance of this to UI primitive design cannot be overstated. Every tooltip library, modal library, and dropdown library that manually manages `z-index` is approximating what the top layer provides natively. The top layer is not an approximation — it is the correct architectural primitive.

### Top Layer Ordering

Elements within the top layer are ordered by their insertion time into the top layer stack. The most recently promoted element is visually highest. Critically, **`z-index` has no effect on top-layer ordering**. The only thing that determines which top-layer element appears above another is the order in which they were added.

This has a significant architectural consequence for the popover/dialog interaction that is covered in section 7.

### `::backdrop`

Every element promoted to the top layer gets a `::backdrop` pseudo-element that sits between the top-layer element and the rest of the document. It fills the entire viewport. For `dialog.showModal()`, the backdrop is what makes the rest of the page appear dimmed. For popover elements, the backdrop is present but transparent by default. Both are fully styleable via CSS. The backdrop participates in the top layer stack between its associated element and the element below it.

---

## 2. Popover API — Architecture and Full Specification

### Specification and Status

**Spec:** WHATWG HTML Living Standard — Popover  
**MDN:** `developer.mozilla.org/en-US/docs/Web/API/Popover_API`  
**Baseline:** Newly Available as of January 2025 (Chrome, Edge, Firefox, Safari)  
**Open UI Source:** `open-ui.org/components/popover.research.explainer`

### The Core Design Principle

The Popover API solves the overlay presence problem — the set of concerns around making something appear above other content, respond to user intent, and disappear cleanly. It does not prescribe semantics. A popover element retains whatever semantic role it has from its HTML; the `popover` attribute adds only presentation behaviour. This separation of presentation from semantics is architecturally correct and distinguishes popovers from dialogs, which carry an implicit ARIA role.

### The Three Popover Types

**`popover="auto"`**

The default and most commonly appropriate type. Auto popovers participate in a mutually exclusive stack: showing a new auto popover closes the currently open auto popover (unless the new one is an ancestor of the current one in the DOM tree — nested auto popovers are supported). Auto popovers are light-dismissed: clicking outside closes them, pressing Escape closes them. They respond to close requests. This is the correct type for dropdown menus, non-modal overlay panels, disclosure content, and context menus.

The nesting model is deliberate. A user opening a submenu should not close the parent menu. The browser correctly identifies DOM-tree ancestry and preserves the parent popover's open state when a descendant opens.

**`popover="hint"`**

Introduced in Chrome 133, January 2025. Hint popovers occupy a separate stack from auto popovers. Opening a hint popover does not close an open auto popover — they coexist. Hint popovers are light-dismissed and respond to close requests. A hint popover will close other hint popovers.

This type is designed explicitly for tooltips and hover cards. The architectural problem it solves: if a user has a toolbar with buttons that open UI popovers via click (`auto` type), and also wants to show informational tooltips on hover (`hint` type), the two should not interfere. Hovering a button to see its tooltip should not close the open toolbar panel.

**`popover="manual"`**

Manual popovers are programmatic only. They do not light-dismiss, do not respond to Escape, and do not close other popovers. They must be explicitly shown and hidden by JavaScript. This type is appropriate for toast notifications, persistent overlays, and scenarios where the application controls the full dismissal lifecycle — for example, a loading indicator that must wait for an async operation to complete before closing.

### The Popover Lifecycle

The popover element is `display: none` when hidden, effectively removed from the rendering tree and accessibility tree. When shown, it becomes `display: block` (or the element's intrinsic display value) and is promoted to the top layer.

The transition between these states is observable via two events on the popover element:

- **`beforetoggle`** — fires before the popover's state changes. The event's `newState` (`"open"` or `"closed"`) and `oldState` properties describe the transition. This event is cancellable — calling `event.preventDefault()` on a `beforetoggle` event prevents the popover from opening or closing. This is the interception point for cases like "confirm before closing" or "validate before showing."
- **`toggle`** — fires after the state change has occurred. Not cancellable. The correct event for reacting to state changes (updating external UI, firing analytics events).

### Declarative Invocation — `popovertarget`

Setting `popovertarget="some-id"` on a `<button>` (or `<input type="button">`) connects that button to the element with the matching `id` as its invoker. The button's `popovertargetaction` attribute controls which action the button performs: `"toggle"` (default), `"show"`, or `"hide"`.

The browser, upon establishing this relationship, automatically:

- Sets the `aria-expanded` state on the button, reflecting whether the popover is open or closed, without any JavaScript
- Establishes an `aria-details` relationship between the invoker and the popover
- Places the popover in a logical position in keyboard focus navigation order when shown
- Creates an **implicit anchor reference** between the button and the popover (the button becomes the popover's default CSS anchor)

The implicit anchor reference is the integration point between the Popover API and CSS Anchor Positioning, covered in section 5.

### Programmatic Control

The popover element exposes three methods:

- `element.showPopover()` — shows the popover; throws if already open
- `element.hidePopover()` — hides the popover; throws if already hidden
- `element.togglePopover(force?)` — toggles the state; the optional boolean `force` argument locks the direction

`element.popover` (an IDL attribute reflecting the `popover` content attribute) provides the current state as a string (`"auto"`, `"hint"`, `"manual"`, or `null` if not a popover). This is usable for feature detection: `'popover' in HTMLElement.prototype` tests for Popover API support.

### The `popoverTargetElement` Property

The JavaScript equivalent of `popovertarget` is the `popoverTargetElement` property on `HTMLButtonElement`. Setting this property to an element reference creates the same invoker relationship as the HTML attribute — including the implicit ARIA and anchor relationships — without requiring that the popover element have an `id` attribute. This matters for programmatically constructed components where DOM identity management is complex.

---

## 3. Invoker Commands — The Declarative Action System

### Specification and Status

**Spec:** WHATWG HTML Living Standard — Invoker Commands (Invokers)  
**WICG Explainer:** `github.com/WICG/invokers`  
**Status:** Chrome 135+ (partial). Under active cross-browser standardisation.

### Architecture

The Invoker Commands API generalises `popovertarget` into a uniform declarative action system. Where `popovertarget` only works for popover elements, Invoker Commands allow any interactive element to declare a target and a command to invoke on it:

- `commandfor="target-id"` — references the target element by ID
- `command="verb"` — the action to invoke

Built-in command verbs include those for `<dialog>` (`"show-modal"`, `"close"`) and `<popover>` (`"toggle-popover"`, `"show-popover"`, `"hide-popover"`), with the specification designed to allow custom element types to register their own command verbs.

### Architectural Significance

Before Invoker Commands, button-triggered UI behaviour required JavaScript event listeners on every trigger. The Invoker model shifts trigger-behaviour wiring to HTML, making the relationship declarative, serialisable, and accessible by default. The browser creates the ARIA relationship (`aria-expanded`, `aria-controls`, `aria-haspopup`) automatically when a command relationship is established.

This is the web platform's answer to the pattern that React, Vue, and Angular implement with event binding and component props — but expressed at the HTML level, where it is available to the accessibility tree before any JavaScript evaluates.

---

## 4. Interest Invokers — Declarative Hover UI

### Specification and Status

**Spec:** WICG Interest Invokers  
**WICG Explainer:** `github.com/WICG/interest-invokers`  
**MDN reference:** Present on Popover API page as `interestfor` attribute  
**Status:** Experimental, Chrome 139+ (flag). Not yet Baseline.

### The Hover Problem

Building a hover-triggered tooltip correctly requires more than `mouseenter` and `mouseleave` listeners. A correct implementation handles:

- Hover intent (debouncing the show trigger so rapid mouse passes do not flicker)
- Keyboard focus as an equivalent to hover (critical for accessibility)
- Touch long-press as an equivalent to hover on touch devices
- Correctly hiding when the user moves from the trigger to inside the tooltip without closing it
- Not interfering with the popover stack when other overlays are open

None of these are easy to implement correctly. The history of tooltip libraries is largely a history of gradually discovering and fixing these edge cases.

### Interest Invoker Architecture

The `interestfor` attribute on a trigger element (`<a>`, `<button>`, `<area>`) designates the element that should be shown when the user "expresses interest" in the trigger. Interest is defined by the browser as: hover with a configurable delay (default 500ms), keyboard focus, and touch long-press on mobile.

The interest target is shown when interest is gained and hidden when interest is lost. The browser manages all the input event handling, debouncing, and the transition between input methods — including correctly handling the mouse moving from the trigger into the interest target (which should not close it).

Two CSS properties govern timing:

- `interest-show-delay` — time to wait before showing (default 0.5s). Can be reduced for quicker tooltips.
- `interest-hide-delay` — time to wait before hiding after interest is lost (default 0s)

`interestfor` works with `popover="hint"` — showing the hint popover on interest, while not closing other open auto popovers in the stack.

### Architectural Distinction from `popovertarget`

`popovertarget` triggers on explicit activation (click, Enter key). `interestfor` triggers on passive intent (hover, focus). They are complementary: a toolbar button might use both `popovertarget` to toggle its menu panel on click, and separately provide a `popover="hint"` tooltip via `interestfor` for users who hover to see what the button does before committing to clicking.

`interestfor` also differs from `popovertarget` in element scope: while `popovertarget` is currently limited to `<button>` and `<input type="button">`, `interestfor` works on `<a>` elements as well. This enables link previews (a hovering card showing context about where a link leads) without wrapping links in buttons.

---

## 5. CSS Anchor Positioning — Complete Architecture

### Specification and Status

**Spec:** W3C CSS Anchor Positioning Module Level 1  
**MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/Guides/Anchor_positioning`  
**Baseline:** Newly Available as of January 2026 (Chrome 125+, Edge 125+, Firefox 147+, Safari 26+)

### What It Replaces

The entire category of JavaScript libraries whose primary function is "position element B relative to element A, staying inside the viewport": Floating UI, Popper.js, Tippy.js (positioning logic), Bootstrap's Popper integration, jQuery UI position utility, and custom `getBoundingClientRect()` + `window.scrollY` calculations that litter virtually every codebase that predates 2026.

The collective download size of these libraries across the web is enormous. The performance cost — executing layout-querying JavaScript on every scroll, resize, and open — is measurable. CSS Anchor Positioning moves this computation into the CSS layout engine, which runs in the browser's layout thread and has access to layout geometry without triggering forced layout.

### The Conceptual Model

CSS Anchor Positioning creates a tethering relationship between two elements:

- The **anchor element** — declares itself as a named anchor. Any element can be an anchor.
- The **anchor-positioned element** — a positioned element (`position: absolute` or `position: fixed`) that declares which anchor it is bound to and specifies how it should be placed relative to that anchor.

The relationship is CSS-driven and lives in the cascade. It survives DOM mutations, scroll events, and viewport resizes without any JavaScript. The browser recalculates the positioned element's location as part of normal layout.

### The Four Positioning Mechanisms

These are not mutually exclusive — they can be combined. But each solves a different problem:

**1. `anchor-name` / `position-anchor`**  
The identity system. `anchor-name: --my-anchor` declares an element as a named anchor. `position-anchor: --my-anchor` binds the positioned element to that anchor. The value is a CSS custom identifier (starting with `--`), following the same convention as CSS custom properties. This scoping by name means multiple anchor pairs can coexist on a page without interfering.

An element can declare multiple anchor names (`anchor-name: --anchor-a, --anchor-b`), allowing it to serve as the anchor for multiple positioned elements with different positioning strategies.

**2. `position-area`**  
A 3×3 conceptual grid centred on the anchor element. The positioned element is placed in one of the grid's cells. Row positions: `top`, `center`, `bottom`. Column positions: `left`, `center`, `right`. In logical-property equivalents: `block-start`, `center`, `block-end`, `inline-start`, `inline-end`.

The `span-` prefix extends placement across multiple cells. `position-area: top span-all` places the element above the anchor, spanning the full width. `position-area: bottom span-inline-start` places below, spanning left. This shorthand covers 80% of real-world positioning needs — a tooltip above an element, a dropdown below a button, a context menu to the right — without any coordinate calculation.

**3. `anchor()` function**  
An explicit edge-to-edge positioning function used as a value for inset properties (`top`, `bottom`, `left`, `right`, `inset-block-start`, etc.). `bottom: anchor(top)` means "this element's bottom edge is positioned at the anchor's top edge" — placing the element directly above the anchor. The function accepts an anchor-side keyword: `top`, `bottom`, `left`, `right`, `start`, `end`, `self-start`, `self-end`, `center`.

An optional fallback length can be provided — `bottom: anchor(top, 0px)` — used if the anchor element does not exist or the anchor relationship is invalid.

The `anchor()` function gives precise edge-to-edge control, useful when `position-area` does not have the exact grammar for a specific layout relationship.

**4. `anchor-size()` function**  
Available as a value for sizing and margin properties. Returns the computed dimension of the anchor element. `width: anchor-size(width)` makes the positioned element the same width as its anchor — the most common application being a dropdown menu that should be exactly as wide as the button it drops from. `max-height: calc(anchor-size(height) * 3)` sets a max height relative to the anchor's height. Available since Baseline January 2026.

`anchor-center` is a special alignment value (`justify-self: anchor-center`, `align-self: anchor-center`) that centres the positioned element along the corresponding axis relative to its anchor, without manual margin arithmetic.

### Overflow Management — `@position-try` and `position-try-fallbacks`

The most architecturally significant feature. When the positioned element's default position would cause it to overflow the viewport or its containing block, the browser automatically tries alternative placements from a declared list.

**Built-in try tactics** are specified via keywords in `position-try-fallbacks`:

- `flip-block` — mirrors the position across the block axis. A tooltip above flips to below.
- `flip-inline` — mirrors across the inline axis. A menu on the left flips to the right.
- `flip-start` — swaps start properties with end properties diagonally.
- These tactics can be combined: `flip-block flip-inline` tries both flips.
- Named `position-area` values can also appear directly in the fallback list.

**Custom try options** via `@position-try`:  
For cases where the built-in tactics are not sufficient, custom `@position-try` rules define named alternative positions. Each `@position-try` block specifies a complete alternative set of positioning declarations to apply when the default overflows. Multiple custom options can be combined with built-in tactics in the fallback list.

**`position-try-order`**  
Controls whether the browser tries fallbacks based on overflow avoidance or on which option gives the most space to the positioned element. `most-block-size` and `most-inline-size` prefer the option that gives the most available space along that axis.

### `position-visibility`

Controls whether a positioned element remains visible when its anchor moves toward or off the viewport edge:

- `always` — the positioned element stays visible regardless of anchor position (current browser default, despite spec default being `anchors-visible`)
- `anchors-visible` — hides the positioned element when its anchor has completely overflowed or been covered
- `no-overflow` — hides the positioned element if it cannot be positioned without overflow, even after exhausting all fallback options

`position-visibility: no-overflow` is the clean solution to the "sticky tooltip that escapes into the viewport margin" problem that affected every manual calculation-based approach.

### Implicit Anchor References from Popover API

When a button uses `popovertarget` (or `commandfor`) to reference a popover element, the browser establishes an implicit anchor reference: the button is the popover's default anchor. The popover can then use `position-area` without declaring `anchor-name` or `position-anchor` — the implicit relationship is already established. Combined with `position-try-fallbacks`, this gives complete, viewport-safe positioning with minimal CSS and zero JavaScript.

### Position Anchoring Across the Top Layer

Anchor-positioned elements can sit in the top layer (via `popover` attribute) while their anchor sits in the normal document flow. The browser correctly resolves the positioning relationship across these different rendering contexts. This is what makes the Popover + Anchor combination work: the popover floats in the top layer, but its CSS anchor is a normal document element — a button, an icon, a table cell — and the browser continuously tethers the popover to that element regardless of scroll or layout changes.

### Multiple Anchors

A positioned element can reference different anchors for different properties by explicitly naming the anchor in each `anchor()` function call:

```
/* concept only — shows multi-anchor capability */
top: anchor(--anchor-a bottom);
left: anchor(--anchor-b right);
```

This enables advanced positioning relative to two independent reference points — relevant for complex UI patterns like popups that must stay within a specific region of the screen while also being visually connected to a specific trigger.

---

## 6. The `<dialog>` Element — Full Platform Contract

### Specification and Status

**Spec:** WHATWG HTML Living Standard — `<dialog>` element  
**MDN:** `developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog`  
**`showModal()` Baseline:** Widely Available since March 2022  
**`requestClose()` Baseline:** Newly Available since May 2025

### The Distinction from Popover

The `<dialog>` element and the Popover API solve adjacent but distinct problems. Their key differences define when each is appropriate:

| Dimension | `<dialog>` modal | `popover="auto"` |
|-----------|-----------------|------------------|
| Inertness | Makes entire page inert | Does not make page inert |
| Light dismiss | Only with `closedby="any"` | Automatic |
| Implicit ARIA role | `role="dialog"` | None (semantic neutral) |
| Stacking | Top layer | Top layer |
| Focus management | Browser-managed | Browser-managed |
| Backdrop | Yes, with `::backdrop` | Yes (transparent by default) |
| Use case | Blocking decision required | Non-blocking overlay content |

The decisive criterion: **does the rest of the application need to be blocked while this element is open?** If yes — confirmations, login forms, critical alerts, terms agreements — use `<dialog>` with `showModal()`. If no — menus, tooltips, side panels, information overlays — use the Popover API.

### `showModal()` — The Full Contract

`showModal()` promotes the dialog to the top layer as a modal. The critical platform behaviours triggered by this call:

**Inertness:** Every element in the same document that is not the `<dialog>` or a descendant of it becomes inert. The `inert` attribute is effectively applied by the browser to the rest of the document. Inert elements are not focusable, not clickable, and are removed from the accessibility tree. This is a hard accessibility requirement for true modal dialogs — without inertness, keyboard and screen reader users can tab outside the modal and interact with content that is visually obscured.

**Focus management:** The browser moves focus into the dialog when `showModal()` is called. It focuses the first focusable element unless an element inside the dialog has the `autofocus` attribute, in which case that element receives focus. The correct usage is to `autofocus` the element the user is expected to interact with first. A critical UX detail: without `autofocus`, focus goes to the first focusable element in DOM order. If that element is a close button at the top of the dialog, the user is placed on the close button immediately — potentially not what was intended for complex forms.

**`close()` returns focus:** When the dialog is closed via `close()`, the browser automatically returns focus to the element that opened the modal. This is specified behaviour. No JavaScript is needed to track or restore focus manually when using the native dialog with `showModal()`.

**Escape key:** The Escape key fires a `cancel` event on the dialog, which by default closes it (firing `close` after `cancel`). This behaviour is handled by the browser's Close Watcher mechanism.

### The Close Watcher and `requestClose()`

The **Close Watcher** is an internal browser mechanism that intercepts platform close gestures (Escape on desktop, back gesture on mobile). When a dialog is open, the Close Watcher intercepts these gestures and routes them to the `cancel` event on the dialog rather than allowing them to navigate away from the page.

`requestClose(returnValue?)` — Baseline Newly Available since May 2025 — exposes this mechanism to JavaScript. It behaves identically to what happens when the user presses Escape: fires `cancel`, and if not prevented, fires `close` and closes the dialog. This is the correct method for "close button" implementations because it honours the full event sequence, allowing interception of the close for confirmation dialogs ("Are you sure you want to discard changes?").

`close(returnValue?)` — the existing method — bypasses the `cancel` event and closes immediately. Use `close()` when confirmation of the close intention is not needed.

### `closedby` Attribute

Part of the dialog light-dismiss additions (WHATWG HTML pull request 10737). Controls whether the user can close the dialog by clicking outside it:

- `closedby="none"` — no user-triggered closing except explicit UI within the dialog
- `closedby="closerequest"` — Escape key only (default for modal dialogs)
- `closedby="any"` — light dismiss: click outside or Escape closes the dialog

`closedby="any"` makes modal dialogs behave like auto popovers from a dismissal standpoint, while retaining the inertness and ARIA semantics of a modal dialog. This is the pattern for "soft modals" — overlays that are technically modal (block underlying interaction) but feel lighter, like a bottom sheet.

### `returnValue` — Dialog as a Value-Producing Interface

The `returnValue` property on `HTMLDialogElement` carries the string passed to `close(returnValue)` or `requestClose(returnValue)`. Forms inside dialogs using `method="dialog"` set `returnValue` to the value of the submit button used — enabling a pattern where a dialog produces a structured decision ("confirm", "cancel", "later") that the opener reads from the `close` event:

```
dialog.addEventListener('close', () => {
  const decision = dialog.returnValue;
  // branch on 'confirm' / 'cancel' / etc.
});
```

This pattern replaces the common anti-pattern of resolving promises from within a dialog component's internal close handlers — the communication is one-directional (dialog tells caller its result) and the protocol is string-based (matching native `<form method="dialog">` behaviour).

### Non-Modal Dialog: `show()`

`dialog.show()` opens the dialog without the top layer promotion, without making the page inert, and without focus management. This is equivalent to setting `display: block` on a positioned element — it appears in normal document flow (typically as a `position: absolute` or `position: fixed` element given its default UA stylesheet). Non-modal dialogs are rare in production UI; the Popover API now covers most of the use cases that non-modal dialogs previously addressed.

---

## 7. The Popover/Dialog Interaction Model — The Top Layer Stack

### The Critical Architectural Problem

The top layer is a stack. Items added later appear above items added earlier. The `<dialog>` modal and popover elements both use the top layer. When a modal dialog is open and a popover is opened from outside the dialog, a conflict arises:

`showModal()` makes the page outside the dialog **inert**. A popover element that lives in the DOM outside the dialog is part of the inert page. When it is promoted to the top layer and visually appears above the dialog, it is still technically inert — it renders but cannot receive keyboard focus, mouse clicks, or be reached by screen reader virtual cursor navigation. The popover appears to work visually but is inaccessible.

This is documented in the WHATWG HTML issue tracker (issue #9936) and is a known architectural tension between the inertness model of modal dialogs and the top-layer promotion of popovers.

### The Design Rule: Popovers Spawned From Within a Modal Belong Inside the Modal

The resolution is architectural: any popover that needs to be interactable while a modal dialog is open must be a descendant of the `<dialog>` element in the DOM. When the browser applies inertness, it excludes the `<dialog>` and all its descendants. A popover inside the `<dialog>` is therefore not inert when opened.

The practical consequence for component design:

- Toast notifications and other globally-managed popovers that live at the top of the document tree cannot be meaningfully interacted with while a modal dialog is open.
- Context menus, tooltips, and submenus triggered by content inside a modal must be rendered inside the dialog's DOM subtree.

This constraint argues for architecturally co-locating overlay content with the component that triggers it, rather than teleporting overlays to a global portal at the document root — the opposite of the pattern that React portals popularised.

### Last-In-Wins and Animation Coordination

Because top-layer ordering is purely insertion-time based, coordinating multiple top-layer elements visually requires thoughtful architecture. A popover opened from inside a dialog will correctly appear above the dialog (it was added to the top layer after the dialog). But a popover opened from outside the dialog, while the dialog is open, will visually appear above the dialog backdrop even though it is inaccessible. This visual-over-functional mismatch is the root of the "toast on top of dialog" problem documented in HTMHell (December 2025 advent calendar, item 1).

The specification is actively being revised to address this. Until it is resolved, the architectural guidance is: globally managed notification overlays should not use the Popover API's top layer rendering when a modal dialog is active. They should either be inside the dialog's subtree or their rendering should be suppressed when a modal is open.

---

## 8. Customisable `<select>` — Architecture and Progressive Enhancement

### Specification and Status

**Spec:** WHATWG HTML Living Standard (in progress) and CSS Working Group  
**Open UI Proposal:** TAG review #1007 — WHATWG, CSSWG, Open UI CG  
**Chrome for Developers announcement:** March 24, 2025  
**Current support:** Chrome 135+, Edge 135+, Opera 120+, Samsung Internet 29+  
**Firefox:** Not yet implemented  
**Safari:** Not yet implemented  
**Global usage coverage:** ~70% as of January 2026  
**Baseline Status:** Not yet Baseline

### The Historical Problem

The `<select>` element's dropdown picker has been rendered by the operating system since the earliest days of HTML. This had a benefit — native OS rendering gives a familiar, accessible, and performant picker. But it had an overwhelming cost — developers could not restyle the open dropdown, could not embed non-text content (icons, badges, colour swatches) in options, could not control the picker's position, and could not apply the application's design system to the most common form control on the web.

The result was three decades of `<select>` replacements: custom dropdown components built with `<div>`, `<ul>`, and JavaScript, each requiring hand-implementation of keyboard navigation, screen reader announcements, focus management, form association, and mobile behaviour. Every one of these libraries is a maintenance liability — they are approximations of native select semantics that inevitably miss edge cases.

### The Architectural Solution

`appearance: base-select` on a `<select>` element opts it into a new rendering mode. In this mode:

- The browser renders the closed state (the "button" showing the selected value) using a `<button>` element placed as the first child of `<select>`. This button is fully styleable.
- The `<selectedoption>` element inside that button reflects the currently selected option's content, updating automatically when selection changes. It can contain arbitrary HTML including images.
- The open picker is a `::picker(select)` pseudo-element attached to the `<select>`. It renders in the top layer. It is fully styleable via `select::picker(select) { ... }`.
- Each `<option>` element can contain arbitrary HTML content — not just text strings.

The `::picker-icon(select)` pseudo-element allows styling the dropdown arrow independently.

The browser manages all the existing `<select>` semantics in this new mode: keyboard navigation (arrow keys, type-ahead), screen reader announcements, form association, value serialisation, required validation, and `change` events. The developer controls only the visual presentation.

### Progressive Enhancement Architecture

Because Firefox and Safari do not yet support `appearance: base-select`, the progressive enhancement model is essential:

A standard `<select>` element is the base. It is accessible, functional, and visually consistent everywhere. The `appearance: base-select` styling is layered on top within a `@supports (appearance: base-select)` block. Browsers that do not understand this CSS simply see the standard `<select>`. The HTML is identical — only the CSS differs between the basic and enhanced experiences.

This is the correct architecture for any unstable-Baseline feature. The application never depends on `appearance: base-select` for correctness; it only depends on it for visual enhancement.

### What This Displaces

Properly implemented, this eliminates the need for:

- React Select and derivatives
- Headless UI's `Combobox` when used purely for select-style UI
- Custom `<div>`-based dropdown components that replicate select semantics
- Any library whose primary purpose is "make `<select>` look like our design system"

It does not eliminate combobox components (which combine a text input with a filtered dropdown) — that pattern involves genuinely different interaction semantics that `<select>` does not model.

### Relationship to Popover API and Anchor Positioning

The picker rendered by `::picker(select)` in `appearance: base-select` mode uses the Popover API's top layer internally. The `<select>` button and its `::picker(select)` have an implicit anchor relationship — the picker is positioned relative to the select button using CSS Anchor Positioning by default, and this can be customised. This is the three-primitive integration point: customisable select is built on top of the top layer, the Popover API, and CSS Anchor Positioning — demonstrating that these primitives are not independent features but a coherent compositional system.

---

## 9. Composing the Primitives — Canonical UI Pattern Map

The following maps each common overlay UI pattern to the correct combination of native primitives:

### Tooltip (non-interactive, text-only)

**Primitives:** `popover="hint"` + `interestfor` (interest invoker) + CSS Anchor Positioning  
**Pattern:** The trigger element carries `interestfor="tooltip-id"`. The tooltip element has `popover="hint"` and is anchor-positioned relative to its implicit anchor (the trigger). No JavaScript required.  
**Notes:** Until `interestfor` achieves Baseline, a `title` attribute provides the fallback.

### Hovercard (hover-triggered, rich content, interactive)

**Primitives:** `popover="hint"` + `interestfor` + CSS Anchor Positioning + `interest-hide-delay` (to allow the pointer to travel into the card)  
**Pattern:** Same as tooltip but with richer DOM content. The `interest-hide-delay` prevents the card from closing as the user moves their cursor from the trigger into the card.

### Dropdown Menu

**Primitives:** `popover="auto"` + `popovertarget` (or `commandfor/command`) + CSS Anchor Positioning + `position-try-fallbacks`  
**ARIA requirements:** `role="menu"` on the popover, `role="menuitem"` on items, keyboard navigation (arrow keys, Home, End, type-ahead) via JavaScript. The Popover API provides the container lifecycle and top-layer rendering; ARIA roles and keyboard interaction are developer responsibility.

### Context Menu

**Primitives:** `popover="auto"` (opened programmatically on `contextmenu` event) + CSS Anchor Positioning relative to cursor position (via a zero-size anchor element positioned at the click coordinates)  
**Notes:** This is the most complex pattern — cursor-relative positioning requires placing a transient anchor element at the mouse position. This is the one pattern where JavaScript coordinate calculation cannot be fully eliminated yet.

### Non-blocking Side Panel / Drawer

**Primitives:** `popover="auto"` with custom CSS. `position-area` irrelevant — side panels are full-height, not anchor-positioned.

### Modal Dialog (blocking)

**Primitives:** `<dialog>` + `showModal()`. No Popover API.  
**Notes:** The defining characteristic is `inertness`. If the rest of the page must be blocked, it is always `<dialog>`.

### Confirmation Dialog

**Primitives:** `<dialog>` + `showModal()` + `requestClose()` + `cancel` event interception + `returnValue` protocol  
**Pattern:** The dialog contains a form with `method="dialog"` and buttons with `value` attributes for each decision. `returnValue` carries the decision to the `close` event handler.

### Alert / Notification Toast

**Primitives:** `popover="manual"` (application controls show/hide timing) + no anchor positioning (positioned fixed to viewport corner via standard CSS)  
**Notes:** Manual is correct here because the application — not user intent — controls when toasts close. See section 7 for the interaction conflict with open modal dialogs.

### Combobox (filterable input + dropdown list)

**Primitives:** `<input>` for the text entry + `popover="auto"` for the listbox + CSS Anchor Positioning relative to the input + `role="combobox"` on the input + `role="listbox"` and `role="option"` on the popover content  
**Notes:** The Popover API handles the top-layer rendering and light-dismiss. All ARIA attributes (combobox/listbox relationship, `aria-activedescendant`, `aria-expanded`) and keyboard navigation remain JavaScript responsibilities.

### Customisable Single-Select Dropdown

**Primitives:** `<select>` + `appearance: base-select` (progressive enhancement)  
**Notes:** The browser handles everything when `appearance: base-select` is supported.

---

## 10. Accessibility Architecture — Cross-Primitive Analysis

### What the Platform Provides Automatically

When these primitives are used correctly, the browser provides the following accessibility behaviours without any developer JavaScript:

- `aria-expanded` on the invoking button (Popover API + Invoker system)
- `aria-details` relationship between trigger and overlay (Popover API)
- Keyboard focus management when opening a modal (`<dialog>` + `showModal()`)
- Focus return on modal close (`<dialog>` + `close()`)
- Escape key handling for both popovers and dialogs (via Close Watcher)
- `role="dialog"` on `<dialog>` elements (implicit ARIA role)
- Inertness of background content when a modal is open (`<dialog>` + `showModal()`)

### What the Developer Retains Responsibility For

The Popover API is semantically neutral. A popover element retains its own HTML semantics. The browser does not guess what role a popover plays — that is always developer responsibility:

**Dropdown menus:** `role="menu"`, `role="menuitem"`, `role="menuitemcheckbox"` etc. must be declared. Arrow key navigation must be implemented. The `aria-expanded` on the trigger is automatic; the menu role is not.

**Dialogs:** `<dialog>` carries `role="dialog"` automatically. `aria-label` or `aria-labelledby` should be provided to give the dialog an accessible name (the first `<h*>` inside the dialog is the natural candidate via `aria-labelledby`).

**Focus inside popovers:** When a popover opens, focus does not automatically move into it — unlike `showModal()`. If the popover contains interactive content that the user needs to reach (a menu, a form), focus must be moved programmatically. The `toggle` event on the popover is the correct trigger. Non-interactive popovers (tooltips) should not move focus.

**Keyboard navigation within menus and listboxes:** Arrow keys, Home, End, and type-ahead character navigation must be implemented. The Popover API handles the container; the interaction within the container is developer territory.

### Shadow DOM Popover Accessibility Gap

As of the most recent Web Platform Test data (WPT results for Chrome 147, Edge 146, Firefox 149, Safari 26.4): Firefox and Safari both fail tests for focus behaviour inside shadow DOM popovers. Core popover functionality and shadow host focus delegation work correctly across all browsers, but fine-grained focus handling within a shadow root popover is still inconsistent. Applications using popovers within Web Components should test focus behaviour explicitly across Firefox and Safari until this gap is closed.

---

## 11. Animation and Transition Architecture

### The `display` Animation Problem

Popover elements use `display: none` when hidden and `display: block` (or their intrinsic display) when shown. CSS transitions cannot interpolate between `display: none` and another display value using the standard transition model — `display` is a discrete property with no interpolatable intermediate states.

The browser solves this with **discrete animation support for `display`**: supporting browsers animate `display` such that the animated content is shown for the entire animation duration. The value flips to `none` only at the very end of an exit animation (or the very beginning of an enter animation). This enables fade-in/fade-out, slide-in/slide-out, and scale animations using standard CSS transitions with one key addition: the `transition-behavior: allow-discrete` property (or `transition: ... allow-discrete` shorthand) must be declared to opt into this discrete animation handling.

### `@starting-style`

CSS `@starting-style` provides the initial state from which a popover or dialog entry animation begins. Without it, there is no "before" state to transition from when an element enters the document or becomes visible for the first time. `@starting-style` declares the property values the element should be considered to have at the moment before it becomes visible — the starting point of the enter animation.

This was historically impossible with pure CSS. It required JavaScript to add a class immediately after `showPopover()` to trigger the transition. `@starting-style` brings this into CSS, enabling fully declarative entry and exit animations for overlay elements with no JavaScript.

### View Transitions for Overlay Content

`document.startViewTransition()` can wrap the `showPopover()` / `hidePopover()` calls for richer animated transitions, including shared-element transitions between the trigger and the popover content. This is most relevant for overlays that represent a detail view of a triggering element — product cards expanding to detail panels, thumbnail images expanding to full previews.

### Reduced Motion Compliance

All animations on overlay elements must respect `prefers-reduced-motion: reduce`. The CSS-level approach:

```css
/* conceptual — omitting specifics */
@media (prefers-reduced-motion: reduce) {
  /* Remove duration and delay from all overlay animations */
  /* Use instant show/hide rather than animated transitions */
}
```

Dialogs and popovers are high-frequency interaction points. Users with vestibular disorders who have set `prefers-reduced-motion` will be most affected by overlay animations that violate this preference. Reduced motion handling is not optional.

---

## 12. Integration with Shadow DOM

### The Same-Context Constraint

The `popovertarget` attribute's `id` reference must resolve within the same DOM tree (document or shadow root). A button inside a shadow root cannot reference a popover in the light DOM via `id`, and vice versa. The implicit anchor relationship created by `popovertarget` follows the same constraint.

This is the most significant architectural limitation for Web Component-based design systems. A component that renders its trigger in shadow DOM and wants to open a global popover in the light DOM must use JavaScript (`popoverTargetElement` property on the button, which accepts a direct element reference across shadow boundaries) rather than the declarative HTML attribute.

**Workaround:** The `popoverTargetElement` property (JavaScript equivalent of `popovertarget`) accepts an element reference with no shadow-tree constraint. A component's `connectedCallback` can set `triggerButton.popoverTargetElement = globalPopoverElement` to establish the invoker relationship across shadow boundaries while still benefiting from the automatic ARIA and anchor relationships.

### Popover Inside Shadow DOM

A popover element inside a shadow root works correctly for show/hide, top-layer rendering, and light dismiss. The shadow root's `delegatesFocus` setting interacts with focus management — when a popover inside a shadow root with `delegatesFocus: true` is opened and focus is programmatically moved into it, focus delegation applies correctly in Chrome and Edge, but Firefox and Safari have known failures in specific edge cases (per WPT data as of mid-2026).

### CSS Anchor Positioning Across Shadow Boundaries

Anchor names are scoped to the same tree scope (document or shadow root) — with one exception. CSS custom properties that cross shadow boundaries (via inheritance) **cannot** carry anchor names. However, the CSS Anchor Positioning specification allows an element in the light DOM to serve as the anchor for a positioned element inside an open shadow root, because the flat tree (composed rendering tree) is what the anchor resolution algorithm operates on. In practice: an anchor-positioned element inside a shadow root can reference an anchor element in the light DOM, as long as the `anchor-name` and `position-anchor` values match and the light DOM anchor is a visible ancestor or sibling in the flat tree.

---

## 13. Tradeoff Analysis and Remaining Gaps

### What These Primitives Fully Replace (no library needed)

- Simple tooltips (with `popover="hint"` + `interestfor` once Baseline)
- Non-interactive overlay panels and drawers
- Dropdown menus (top-layer rendering and lifecycle — not keyboard interaction)
- Modal dialogs and confirmation dialogs
- Toast notifications
- Customisable select dropdowns (for Chromium users; progressive enhancement for others)
- All z-index management for overlay elements

### What These Primitives Enable (significantly simpler than before)

- Hover cards and rich tooltips
- Combobox dropdowns (Popover handles the container; ARIA/keyboard is developer work)
- Context menus (positioning relative to cursor coordinates remains a JavaScript concern)
- Nested menu systems (the Popover auto-stack manages open/close correctly)

### What Remains Outside Platform Scope

**Full keyboard interaction within menus:** Arrow key navigation, role management, type-ahead, and wrapping — these will always be JavaScript. The platform provides the container; interaction within is developer responsibility. This is the correct division: the platform cannot know the semantic model of a menu (single-select, multi-select, navigation) without a semantic declaration.

**Combobox (combined input + filtered list):** The `<select>` element's model does not include a text-filtering input. Combobox components remain a significant composition challenge even with these primitives.

**Cursor-relative context menus:** CSS Anchor Positioning requires a DOM anchor. A context menu that must appear at the cursor coordinates requires either a zero-size element teleported to the click position (adding DOM complexity) or JavaScript positioning. This is the one positioning pattern the CSS API does not yet cleanly express.

**`interestfor` Baseline gap:** Until Firefox and Safari implement `interestfor`, hover-triggered tooltips and hovercards still require JavaScript for those browsers. The fallback is `mouseenter`/`mouseleave` listeners, or the `title` attribute for simple text tooltips.

**Customisable select cross-browser:** 70% global coverage means a significant portion of users still see the OS-native select. The progressive enhancement architecture handles this correctly, but the full design system appearance cannot be assumed for all users yet.

**Toast notifications blocked by modal inertness:** The architectural mismatch between global toast rendering location and modal dialog inertness has no clean resolution with the current spec. A WHATWG issue is open. The practical workaround is to render toast notifications inside the topmost modal dialog when one is present.

---

## 14. Browser Compatibility Matrix

| Primitive | Chrome | Edge | Firefox | Safari | Baseline |
|-----------|--------|------|---------|--------|----------|
| Popover API (core) | 114+ | 114+ | 125+ | 17+ | Jan 2025 |
| `popover="hint"` | 133+ | 133+ | — | — | Not yet |
| `popovertarget` / invoker | 114+ | 114+ | 125+ | 17+ | Jan 2025 |
| Interest Invokers (`interestfor`) | 135+ (flag) | — | — | — | Experimental |
| CSS Anchor Positioning | 125+ | 125+ | 147+ | 26+ | Jan 2026 |
| `anchor-size()` | 125+ | 125+ | 147+ | 26+ | Jan 2026 |
| `@position-try` fallbacks | 125+ | 125+ | 147+ | 26+ | Jan 2026 |
| `<dialog>` + `showModal()` | Widely | Widely | Widely | Widely | Mar 2022 |
| `requestClose()` | 127+ | 127+ | 132+ | 18+ | May 2025 |
| `closedby` attribute | 133+ | 133+ | — | — | Not yet |
| Customisable `<select>` | 135+ | 135+ | — | — | Not Baseline |
| `@starting-style` | 117+ | 117+ | 129+ | 17.5+ | Widely Available |
| `transition-behavior: allow-discrete` | 117+ | 117+ | 129+ | 17.5+ | Widely Available |
| Popover + Shadow DOM (focus) | pass | pass | partial | partial | Progressing |

---

## 15. Design Principles for Native-First UI Composition

These principles, derived from the research above, govern how overlay UI should be designed and built in this architecture:

**1. Top Layer First**  
Any overlay element — tooltip, menu, modal, drawer — that must appear above all other content belongs in the top layer. The correct entry to the top layer is via `popover` attribute, `<dialog>.showModal()`, or the pending Fullscreen API integration. Under no circumstances should `z-index` management be used as a substitute for top-layer promotion.

**2. Semantics Precede Presentation**  
Choose the primitive by its semantic model, not by its visual appearance. A modal that blocks the page is `<dialog>`. A non-blocking overlay is `popover`. A hover-triggered informational panel is `popover="hint"`. The visual styling follows the semantic choice; the semantic choice determines the accessibility contract.

**3. Declare Positions, Do Not Calculate Them**  
CSS Anchor Positioning should be the first choice for any positioned UI element that must be tethered to another element. JavaScript coordinate calculation is the fallback when CSS anchor positioning cannot express the required geometry. Floating UI and similar libraries remain appropriate when `@position-try` fallback logic is insufficient for the application's needs — but that is now an edge case rather than the common case.

**4. Let the Platform Own Dismissal**  
`popover="auto"` and Escape-key handling via the Close Watcher are browser-native close behaviours. Code that manually manages dismiss on `document.click` or `window.keydown` for Escape is duplicating platform behaviour. Remove it.

**5. Accessibility Is a Contract, Not a Feature**  
The Popover API provides ARIA scaffolding. The `<dialog>` element provides inertness and focus management. These are the baseline — the developer contract begins where the platform leaves off: semantic roles for menu contents, keyboard navigation, `aria-label` on dialogs, and focus placement inside popovers. The platform reduces the cost of accessibility; it does not eliminate the developer's responsibility.

**6. Progressive Enhancement for Unstable-Baseline Features**  
`popover="hint"`, `interestfor`, `closedby`, and `appearance: base-select` are progressively enhanced. The base experience (without these features) must be fully functional. The enhanced experience uses `@supports` and feature detection. Baseline-available features (`popover="auto"`, CSS Anchor Positioning, `<dialog>`, `showModal()`, `requestClose()`) can be used as primary foundations without progressive enhancement guards.

**7. Co-locate Overlays with Their Semantic Owner**  
Because of the popover/dialog inertness interaction, overlays that need to be reachable while a modal is open must be descendants of that modal in the DOM. Architecturally, this means overlay content belongs with the component that spawns it — not in a global portal at the document root. The top layer handles rendering; DOM structure determines inertness boundaries.

**8. Animate with the Platform's Motion Vocabulary**  
Entry and exit animations for overlays use `@starting-style`, `transition-behavior: allow-discrete`, and `display` transition support. View Transitions handle shared-element transitions between trigger and overlay. There is no requirement for GSAP, Framer Motion, or any animation library for standard overlay motion.

---

*End of ui-primitives.md*

---

**Standards and Reference Sources:**

- WHATWG HTML Living Standard — Popover: `html.spec.whatwg.org/#the-popover-attribute`
- WHATWG HTML Living Standard — Dialog: `html.spec.whatwg.org/dev/interactive-elements.html`
- WHATWG HTML Living Standard — Invoker Commands: in progress
- W3C CSS Anchor Positioning Module Level 1: `drafts.csswg.org/css-anchor-position-1/`
- Open UI Popover Explainer: `open-ui.org/components/popover.research.explainer/`
- TAG Review #1007 — Customisable Select: `tag-github-bot.w3.org/review/1007`
- MDN — Popover API: `developer.mozilla.org/en-US/docs/Web/API/Popover_API`
- MDN — Using Popover API: `developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using`
- MDN — Using CSS Anchor Positioning: `developer.mozilla.org/en-US/docs/Web/CSS/Guides/Anchor_positioning/Using`
- MDN — Fallback Options and Conditional Hiding: `developer.mozilla.org/en-US/docs/Web/CSS/Guides/Anchor_positioning/Try_options_hiding`
- MDN — @position-try: `developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@position-try`
- MDN — anchor-size(): `developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/anchor-size`
- MDN — HTMLDialogElement: `developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement`
- MDN — requestClose(): `developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/requestClose`
- MDN — Customisable Select: `developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Customizable_select`
- web.dev — Dialog and Popover Baseline: `web.dev/articles/baseline-in-action-dialog-popover`
- web.dev — Anchor Positioning: `web.dev/learn/css/anchor-positioning`
- Chrome for Developers — Introducing Popover API: `developer.chrome.com/blog/introducing-popover-api`
- Chrome for Developers — Popover Hint: `developer.chrome.com/blog/popover-hint`
- Chrome for Developers — Anchor Positioning API: `developer.chrome.com/blog/anchor-positioning-api`
- Chrome for Developers — Customisable Select: `developer.chrome.com/blog/a-customizable-select`
- CSS-Tricks — CSS Anchor Positioning Guide: `css-tricks.com/css-anchor-positioning-guide/`
- HTMHell Advent 2025 — Top Layer Popover/Dialog Conflict: `htmhell.dev/adventcalendar/2025/1/`
- Smashing Magazine — Getting Started With Popover API: `smashingmagazine.com/2026/03/getting-started-popover-api`
- Adobe Shadow DOM CSS — Popover feature tracking: `shadow-dom-css.adobe.com/features/popover`
- WHATWG HTML issue #9936 — Popover on top of modal dialog: `github.com/whatwg/html/issues/9936`
- CSS-Tricks — No Need to Trap Focus on Dialog: `css-tricks.com/there-is-no-need-to-trap-focus-on-a-dialog-element`