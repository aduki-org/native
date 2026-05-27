## Native CSS Architecture — Cascade Layers, @scope, Custom Properties, and Houdini

**Spec authority:** W3C CSS Cascade 5, W3C CSS Cascading and Inheritance Level 6, W3C CSS Properties and Values API Level 1, W3C CSS Typed OM Level 1, W3C CSS Painting API Level 1 **MDN references:** `developer.mozilla.org/en-US/docs/Web/CSS/@layer`, `@scope`, `--*`, `@property`, `Houdini_APIs` **Date:** May 2026

---

### Overview

Modern CSS has crossed a threshold. The combination of Cascade Layers, `@scope`, registered Custom Properties, and the Houdini APIs now covers the architectural territory previously occupied by CSS Modules, BEM naming conventions, CSS-in-JS libraries, and Sass variable systems — without any build step, runtime overhead, or framework dependency. Each of these features targets a specific, historically painful class of problem in large-scale CSS: specificity management, style encapsulation, type-safe design tokens, and extensibility into the rendering pipeline itself.

This document specifies how each system works, how they compose with each other and with Shadow DOM, and where the browser gaps still require a progressive enhancement posture.

---

## 1. CSS Cascade Layers (`@layer`)

**Spec:** W3C CSS Cascade Level 5 **MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/@layer` **Status:** Widely Available — Chrome 99+, Firefox 97+, Safari 15.4+, Edge 99+ (early 2022). Global support exceeds 96% as of 2026.

### The Problem `@layer` Solves

Specificity conflicts are not merely an inconvenience; they are an architectural failure mode. In a large codebase without layers, the author's control over which styles win depends entirely on selector specificity and source order — both of which are fragile under team scale. A third-party stylesheet loaded via `@import` can introduce selectors specific enough to override application-level styles. Component styles can be overridden by utility classes, or vice versa, in ways that depend on the order of `<link>` tags in the HTML head. Every incident of `!important` is an indicator that the architecture has failed to manage the cascade deliberately.

`@layer` resolves this at the architectural level. A later-declared layer takes cascade precedence over an earlier one, entirely regardless of selector specificity. This means a `.button` selector in the `utilities` layer will always override `.card .button.primary.active` in the `components` layer, because the declaration order of layers — not the specificity of individual selectors — governs priority.

The critical corollary: styles written outside any `@layer` block sit above all named layers in the cascade and always win. This has an immediate practical use: third-party CSS that does not use layers can be demoted below all application styles at import time:

```css
@import 'third-party-library.css' layer(vendor);
```

This single line quarantines the entire third-party stylesheet below every layer your application defines. No selector wrapping, no specificity fights, no `!important` escalation.

### Layer Priority Model

Layer priority is determined by the order in which layers are first declared, not the order in which they are populated. The canonical pattern is to declare all layers in a single statement at the top of the root stylesheet, which makes the priority order explicit and auditable:

```css
@layer reset, tokens, base, components, layouts, utilities, themes, overrides;
```

With this declaration in place, the priority order is fixed. Layers can be populated across multiple files, in any import order, and the cascade priority will still match what is written in this declaration. This is what makes `@layer` robust at scale: the priority structure is decoupled from file load order.

### Recommended Layer Architecture for Large Applications

A production-scale layer ordering that mirrors the design system hierarchy:

```css
@layer
  reset,       /* Browser default removal and normalisation */
  tokens,      /* CSS custom property declarations, design token primitives */
  base,        /* Typographic defaults, element-level base styles */
  components,  /* Component library styles */
  layouts,     /* Page-level layout primitives */
  utilities,   /* Single-purpose atomic overrides */
  themes,      /* Dark mode, brand variants, high-contrast overrides */
  overrides;   /* Per-page or per-feature emergency overrides */
```

Each layer's role is intentional. `reset` has the lowest priority because it should lose to everything. `tokens` sits above reset but below base, because tokens are declarations that base styles consume. `utilities` sits above components because utility classes are, by definition, override-intent styles. `themes` sits above utilities because a dark mode override must be capable of overriding any earlier layer. `overrides` has the highest named-layer priority and should be used sparingly — its existence acknowledges that some production environments require per-page deviation that cannot be resolved through the normal layer stack.

### Nested Layers

Layers can be nested. This is the mechanism that allows a component library to expose its own internal layering as a customisation surface:

```css
/* Inside the component library */
@layer ui.base, ui.components, ui.hooks;

/* In the consuming application */
@layer reset, tokens, base, ui, utilities, themes;
```

The consuming application imports the library's output into the `ui` layer. The library's internal `ui.base`, `ui.components`, and `ui.hooks` sub-layers are now positioned within the application's layer stack, below `utilities` and `themes`. This gives the consuming application full control over the library's cascade precedence without any build-time configuration or selector wrapping.

### Integration with Shadow DOM

`@layer` inside a shadow root is scoped to that shadow root. Shadow root layer declarations do not interfere with the document's layer order, and document layers do not reach inside the shadow root's style context. This is correct behaviour: Shadow DOM's encapsulation model should contain its own cascade, and it does.

The design token bridge between the document layer stack and Shadow DOM components is CSS custom properties, which cross shadow boundaries by inheritance. The practical model is: design tokens are declared in the document's `tokens` layer, and components — whether light-DOM or shadow-DOM — consume them via `var()`. This is explored fully in the Custom Properties section below.

### `@supports at-rule(@layer)` — Feature Detection

`@layer` is widely available enough in 2026 that feature detection is only relevant for the residual 4% of users on older browsers. For those cases, the correct approach is not to duplicate styles but to provide a simplified fallback stylesheet and use the `@supports at-rule(@layer)` query to gate layer-dependent styles:

```css
@supports not at-rule(@layer) {
  /* Fallback: simpler stylesheet without layer architecture */
}
```

Browsers that do not understand `@layer` will ignore the at-rule wrapper and process the rules it contains normally, without any layering. In practice this means the styles still apply — they just lose the specificity management benefit. For applications that use layers primarily for architecture rather than for specificity overriding, this degradation is often acceptable.

---

## 2. CSS `@scope`

**Spec:** W3C CSS Cascading and Inheritance Level 6 **MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/@scope` **Status:** Baseline Newly Available — Firefox 146 (late 2025) added support, joining Chrome 118+ and Safari 17.4+. Cross-browser as of late 2025.

### The Problem `@scope` Solves

CSS is globally scoped by default. A `p` selector applies to every `<p>` element in the document. BEM naming, CSS Modules, and CSS-in-JS emerged to solve this: each provides a mechanism to limit a selector's applicability to a defined subtree without relying on increasingly complex selector chains. All three require either naming discipline or a build step. `@scope` provides the same capability as a native CSS feature.

### Scoping Root and Scoping Limit

`@scope` accepts two arguments: the scoping root (required) and an optional scoping limit (the stop point). Rules inside the `@scope` block apply only to elements that are:

- descendants of at least one element matching the scoping root, and
- not descendants of any element matching the scoping limit (if provided).

```css
@scope (.card) to (.card-footer) {
  p {
    font-size: 0.875rem;
    line-height: 1.5;
  }
  h3 {
    font-size: 1rem;
    font-weight: 600;
  }
}
```

This `p` rule applies only to paragraphs inside `.card` elements, but is excluded from paragraphs inside `.card-footer` elements nested within those cards. The stop condition is what enables component encapsulation without leaking into intentionally distinct sub-regions.

The `:scope` pseudo-class inside a `@scope` block refers to the scoping root element itself — the element matched by the opening selector. This is the mechanism for styling the component's host element from within its scoped context.

### Specificity Behaviour

Selectors inside `@scope` carry the specificity implied by the selector itself, with one important property: a scoped rule is considered to have lower specificity than an otherwise identical unscoped rule. This means scoped defaults lose to explicit overrides, which is the desired behaviour for component libraries. A library can establish scoped component defaults that application-level styles can override with normal (unscoped) selectors, without the library's specificity blocking customisation.

This is architecturally significant. It means `@scope` can express "component defaults" without the specificity debt that component-level selectors typically accrue.

### `@scope` and `@layer` Composition

`@scope` and `@layer` are orthogonal and compose cleanly. A `@scope` block can appear inside a `@layer` block, and the scoping restriction applies within the context of that layer's cascade priority. This is the complete native replacement for CSS Modules:

```css
@layer components {
  @scope (.button) {
    :scope {
      display: inline-flex;
      align-items: center;
      padding: var(--space-2) var(--space-4);
    }
    .icon {
      width: 1em;
      height: 1em;
    }
  }
}
```

This pattern gives a component its own scoped style context within a named cascade layer. No class name mangling, no build step, no runtime injection. The result is auditable in browser DevTools without transformation.

### `@scope` vs Shadow DOM

Shadow DOM provides stronger encapsulation: Shadow DOM isolates styles both inward (document styles cannot reach inside) and outward (shadow styles cannot bleed outside). `@scope` only provides outward isolation — document styles can still penetrate into scoped regions unless the scoping limit blocks them.

The practical division: use Shadow DOM when a component requires full isolation (JavaScript behaviour, form participation, custom element lifecycle). Use `@scope` when a component is purely presentational, does not require a shadow root, and needs only to prevent its styles from leaking to sibling or parent elements. `@scope` is the lighter-weight tool for the lighter-weight use case.

---

## 3. CSS Custom Properties and the Design Token System

**Spec:** CSS Custom Properties for Cascading Variables, CSS Properties and Values API Level 1 **MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/--*`, `developer.mozilla.org/en-US/docs/Web/CSS/@property` **Status:**

- Unregistered custom properties (`--name: value`): Widely Available (universal browser support since 2016)
- `@property` (registered custom properties): Widely Available — Chrome 85+, Firefox 128+ (July 2024), Safari 16.4+

### Unregistered Custom Properties

Custom properties declared with the `--` prefix are the native design token system. They are live values: unlike Sass variables, which are resolved at build time to their literal values, CSS custom properties are resolved at runtime and participate in the cascade. This distinction is the source of their power.

A custom property declared on `:root` is accessible to every element in the document tree via `var(--property-name)`. Because custom properties inherit down the DOM tree, declaring a property on any ancestor element overrides the `:root` value for all that element's descendants. This is the mechanism for component-level theming, dark mode, and layout variants: redefine a set of custom properties on a container element, and every component inside it automatically uses the new values — no class changes on individual components required.

A two-fallback pattern is the recommended defensive style for custom property consumption:

```css
color: var(--text-primary, var(--color-neutral-900, #1a1a1a));
```

The first fallback (`--color-neutral-900`) is a more primitive token that the component can fall back to if the semantic token is absent. The second fallback (`#1a1a1a`) is a literal value of last resort. This is correct three-tier token architecture expressed natively.

### Design Token Hierarchy

A production design token architecture has three tiers:

**Primitive tokens** are raw values with no semantic meaning attached. They define the full range of available values:

```css
:root {
  --color-blue-50: #eff6ff;
  --color-blue-500: #3b82f6;
  --color-blue-900: #1e3a5f;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
}
```

**Semantic tokens** map intent to primitives. They answer "what is this for" rather than "what is this value":

```css
:root {
  --color-interactive: var(--color-blue-500);
  --color-interactive-hover: var(--color-blue-600);
  --color-text-primary: var(--color-neutral-900);
  --space-component-padding: var(--space-4);
  --radius-component: var(--radius-md);
}
```

**Component tokens** are scoped to a specific component and reference semantic tokens:

```css
.button {
  --button-bg: var(--color-interactive);
  --button-radius: var(--radius-component);
  --button-padding-inline: var(--space-component-padding);
}
```

The indirection at each tier has a purpose: when the brand colour changes, updating `--color-blue-500` cascades the change through every semantic and component token that references it. When a specific component needs to diverge from the semantic value, it can override its own component token without affecting anything else. This is the architecture that makes large design system refactors manageable.

### Shadow DOM and Custom Property Inheritance

Custom properties cross shadow boundaries. This is the designed integration point between document-level design tokens and shadow-DOM component internals. A component with a shadow root can consume `:root`-declared custom properties via `var()` without any props system, context injection, or JavaScript data flow. The document's token layer is the ambient styling API for all components.

This pattern is explicitly enforced by declaring all design tokens in the `tokens` `@layer` on `:root`, ensuring they have the lowest cascade priority (overrideable by any layer above) while being available to every element in the tree including shadow roots.

### Theming and Dark Mode

The standard pattern for theming uses a `data-theme` attribute combined with `prefers-color-scheme`:

```css
/* Default (light) tokens */
:root {
  --color-surface: var(--color-neutral-50);
  --color-text-primary: var(--color-neutral-900);
}

/* System dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-surface: var(--color-neutral-950);
    --color-text-primary: var(--color-neutral-100);
  }
}

/* Manual override — higher specificity than @media */
[data-theme='dark'] {
  --color-surface: var(--color-neutral-950);
  --color-text-primary: var(--color-neutral-100);
}

[data-theme='light'] {
  --color-surface: var(--color-neutral-50);
  --color-text-primary: var(--color-neutral-900);
}
```

The `data-theme` attribute takes precedence over the `@media` block because an attribute selector has higher specificity than a `:root` rule inside a media query. This two-source architecture allows users to choose a theme preference that overrides their OS setting, which is expected product behaviour. The JavaScript required to implement user preference storage and `data-theme` toggling is minimal and has no CSS-side complexity.

---

## 4. Registered Custom Properties (`@property`)

**Spec:** W3C CSS Properties and Values API Level 1 (Houdini) **MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/@property` **Status:** Widely Available — Chrome 85+, Firefox 128+ (July 2024), Safari 16.4+

### What Registration Adds

An unregistered custom property is an opaque string to the browser's style engine. The browser does not know whether `--accent-hue: 220deg` is an angle, a number, a colour, or arbitrary text. This opacity has consequences:

First, animating an unregistered custom property produces a binary snap at the 50% point rather than smooth interpolation, because the engine cannot compute intermediate values for a value it does not know the type of. A `transition` or `@keyframes` animation on an unregistered property is effectively useless for producing smooth motion.

Second, if an invalid value is assigned to an unregistered property, the browser falls back to the property's inherited value or initial value with no type constraint to guide it. For complex token systems, invalid assignments can propagate silently through the cascade.

`@property` resolves both issues by registering a custom property with an explicit `syntax` (type), `inherits` flag, and `initial-value`:

```css
@property --accent-hue {
  syntax: '<angle>';
  inherits: true;
  initial-value: 220deg;
}

@property --surface-opacity {
  syntax: '<number>';
  inherits: false;
  initial-value: 1;
}

@property --brand-color {
  syntax: '<color>';
  inherits: true;
  initial-value: oklch(55% 0.18 220);
}
```

The `syntax` descriptor accepts CSS data type names: `<color>`, `<length>`, `<angle>`, `<number>`, `<percentage>`, `<integer>`, `<length-percentage>`, `<url>`, `<image>`, `<transform-list>`, custom idents, or `*` (universal — accepts any valid token stream, equivalent to unregistered behaviour but with `initial-value` and `inherits` control). The `inherits` and `syntax` descriptors are both required; an `@property` rule missing either is invalid and ignored entirely.

### Animated Custom Properties

With a registered `<color>` property, transitions and keyframe animations between two colour values produce correctly interpolated colour. The same applies to `<length>`, `<angle>`, and `<number>` properties. This enables a class of CSS animation that was previously impossible without JavaScript:

```css
@property --hue-rotate {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.element {
  transition: --hue-rotate 600ms ease;
  filter: hue-rotate(var(--hue-rotate));
}

.element:hover {
  --hue-rotate: 180deg;
}
```

Before `@property`, the `hue-rotate` transition would snap. With the property registered as `<angle>`, the browser interpolates through the angle values correctly. This is also the mechanism for animated dark mode transitions, animated gradient stops, and animated SVG colour fills driven by CSS.

### `initial-value` as a Safety Net

The `initial-value` guarantees that a registered property always resolves to a valid value of the declared type, even if no other declaration sets it and the property has `inherits: false`. This eliminates the class of bug where a component renders incorrectly because a design token it depends on was never assigned. The initial value acts as a type-safe default.

For tokens in the `tokens` `@layer`, registering critical semantic tokens with `@property` and providing `initial-value` defaults ensures that components render coherently even in partially-initialised states.

---

## 5. CSS Typed Object Model (Typed OM)

**Spec:** W3C CSS Typed OM Level 1 (Houdini) **MDN:** `developer.mozilla.org/en-US/docs/Web/API/CSS_Typed_OM_API` **Status:** Widely Available — Chrome 66+, Firefox 119+, Safari 16.4+

### Architecture

The traditional CSS Object Model represents every CSS value as a string. `element.style.opacity` returns `"0.5"`. Setting a value requires constructing a string. Performing arithmetic on a CSS value requires parsing the string, doing arithmetic in JavaScript, and reconstructing a string. This string round-trip has two costs: parsing overhead on every read/write, and correctness risk from string construction bugs.

Typed OM exposes CSS values as structured JavaScript objects. `element.attributeStyleMap.get('opacity')` returns a `CSSUnitValue` with a numeric `value` and a unit string. Setting a value uses typed constructors. Math uses `CSSMathValue` operations that the engine evaluates.

The architectural relevance of Typed OM in this system is narrow but important: it applies to animation-loop-critical code paths where the string-parsing overhead of the traditional CSSOM is measurable. For one-time property reads or writes, the performance difference is negligible. For tight animation loops that update CSS values on every frame, eliminating string parsing produces real gains.

For the purposes of this architecture, Typed OM is used in the rendering system's animation utilities and in any component that manipulates CSS custom property values programmatically at animation frequency. It is not a replacement for `element.style.setProperty()` in general-purpose code.

---

## 6. CSS Houdini — Paint API and Layout Worklet

**Spec:** W3C CSS Painting API Level 1, W3C CSS Layout API Level 1 **MDN:** `developer.mozilla.org/en-US/docs/Web/API/Houdini_APIs` **Status:**

- CSS Paint API: Chrome/Edge (Chromium 65+), partial Safari. Firefox: under consideration, not shipped.
- CSS Layout API: Chrome Canary only (behind flag). Not in Firefox or Safari. Not documented on MDN.
- CSS Animation Worklet: Chromium only. Not in stable Firefox or Safari.

### What Houdini Is

Houdini is the W3C umbrella for a collection of low-level APIs that expose stages of the browser's CSS rendering pipeline to JavaScript. Where `@property` and Typed OM are parts of Houdini that have reached wide availability, the worklet-based APIs — Paint, Layout, and Animation — remain Chromium-exclusive or experimental as of mid-2026.

A worklet is architecturally distinct from a Web Worker: worklets are not general-purpose JavaScript execution environments. They are extension points within the browser's rendering pipeline, executed on a thread appropriate to that pipeline stage (compositor for animation, raster for paint), with intentionally restricted access to the global scope. A `PaintWorklet` cannot access the DOM, `fetch`, or any main-thread APIs. It receives a 2D rendering context, the element's dimensions, and the computed values of any CSS custom properties it declared interest in. It returns a rendered image.

### CSS Paint API — Architecture and Use Cases

The Paint API allows defining custom `background-image`, `border-image`, or `mask` values implemented in JavaScript. The worklet registers a paint function under a name, which is then used in CSS as `paint(worklet-name, arg1, arg2)`.

The worklet receives:

- A `PaintRenderingContext2D` — a canvas-like 2D drawing API with no text rendering
- A `PaintSize` object with the element's `width` and `height` in device pixels
- A `StylePropertyMapReadOnly` containing the computed values of any custom properties listed in the worklet's `inputProperties` declaration

The architectural use case is programmable CSS images: gradient borders with corner radius, noise texture backgrounds, complex custom shape fills or masks that respond to CSS custom property values. Because the worklet can read custom properties, its visual output is fully controllable from CSS or JavaScript via `setProperty()`.

Practical applications where the Paint API provides genuine value over pure CSS: animated gradient borders that require per-frame custom geometry, procedurally-generated background textures driven by component state, custom progress indicator shapes that cannot be expressed in SVG without duplication.

### Browser Gap Strategy for the Paint API

The Paint API is Chromium-only and should be treated as a progressive enhancement only, with a complete CSS fallback that does not depend on the worklet. Given that the Paint API specifically targets visual enhancements (backgrounds, borders, masks), a CSS fallback is always available even if it is less visually rich. The correct feature detection guard is:

```js
if ('paintWorklet' in CSS) {
  CSS.paintWorklet.addModule('./paint-worklet.js');
}
```

A CSS feature query is available for use in stylesheets:

```css
@supports (background: paint(worklet-name)) {
  /* Paint API-dependent styles */
}
```

Do not use the Paint API for anything that affects usability, only for visual enhancement. Do not expect Firefox or Safari parity within the near term.

### CSS Layout API — Status

The Layout API would allow defining custom CSS layout algorithms (masonry, circular, custom grid variants) registered as worklets and invoked via `display: layout(worklet-name)`. As of mid-2026 it is available only in Chrome Canary behind a flag and is not documented on MDN. It is not ready for production use and is not part of this architecture's current specification. It is noted here for completeness and for the roadmap section.

---

## 7. Composition Model — How the Systems Interact

The four systems described in this document are not alternatives. They compose into a single CSS architecture:

`@layer` owns the cascade. It determines which styles win when rules from different sources or design system levels conflict. Every stylesheet is authored inside a named layer.

`@scope` owns encapsulation for light-DOM components. Within a named layer, scoped blocks prevent component styles from leaking outside their intended subtree. The combination of `@layer components { @scope (.component) { ... } }` provides full component-level encapsulation within the cascade hierarchy.

Custom properties are the data layer. Primitive tokens, semantic tokens, and component tokens form a three-tier hierarchy on `:root`, inherited by all elements including shadow roots. They are the integration interface between the document layer stack and shadow-DOM internals.

`@property` strengthens the data layer. Critical tokens — those that are animated, those with strong type contracts, those that must not degrade to empty strings — are registered with type and initial-value. This is not applied universally; registration is a deliberate decision for tokens where the additional guarantees matter.

Typed OM and the Paint API are narrow optimisation layers. Typed OM appears only in animation-critical code paths. The Paint API appears only as progressive enhancement for visual features with a complete CSS fallback.

---

## 8. Relationship to Shadow DOM

The architecture of a native-first component system distinguishes between:

- Document-level CSS (cascade layers, scoped styles, token declarations) — governs everything in the light DOM
- Component-level CSS (inside shadow roots) — governs the internals of Custom Elements

These two levels interact only through CSS custom properties. A component's shadow root cannot see document layers or scoped rules from outside. Document `@layer` and `@scope` declarations cannot reach inside the shadow root. This boundary is not a limitation; it is the correct encapsulation model.

The practical consequence for authoring: a component's shadow root stylesheet uses `@layer` for its own internal organisation if it has sufficient internal complexity. It consumes design tokens from the document via `var()`. It declares component tokens (e.g., `--button-bg`) with `@property` initial values so that the component renders correctly even when deployed in a context that has not provided the expected document tokens. The component's public styling API is its set of CSS custom property inputs — this is documented in the component's API specification just as JavaScript properties and events are.

---

## 9. Relationship to the `design-tokens-system.md` Module

The design token architecture described in this document — primitive tokens, semantic tokens, component tokens, `@property` registration, `data-theme` theming — is specified at implementation depth in `design-tokens-system.md` (Volume 2, chapter 15). The present document establishes the CSS mechanisms. The design tokens document specifies the full token taxonomy, naming conventions, generation toolchain, and integration with the build system.

---

## 10. Browser Support and Progressive Enhancement Summary

|Feature|Status|Notes|
|---|---|---|
|`@layer`|Widely Available|Chrome 99+, Firefox 97+, Safari 15.4+. 96%+ global support.|
|`@scope`|Baseline Newly Available|Firefox 146 (late 2025) completed cross-browser support.|
|CSS Custom Properties|Widely Available|Universal support since 2016.|
|`@property`|Widely Available|Chrome 85+, Firefox 128+, Safari 16.4+.|
|CSS Typed OM|Widely Available|Chrome 66+, Firefox 119+, Safari 16.4+.|
|CSS Paint API|Limited|Chromium only. Progressive enhancement only.|
|CSS Layout API|Experimental|Canary only. Not production-ready.|
|CSS Animation Worklet|Limited|Chromium only. Use WAAPI instead.|

`@scope`'s Baseline Newly Available status means it is safe for production use in new features with the understanding that users on browsers older than late 2025 will not receive the scoping benefit (styles will still apply, just globally). For an architecture where `@scope` is used for component-level encapsulation, the degradation is cosmetically invisible to users but may produce specificity collisions in older browsers. A `@supports at-rule(@scope)` guard can isolate the most specificity-sensitive scoped rules where this is a concern.

---

## 11. What This Replaces

The CSS architecture described in this document provides native equivalents for the following tools and abstractions:

**Sass/Less variables** — Replaced by CSS custom properties. Sass variables are resolved at build time and cannot be updated at runtime or by JavaScript. Custom properties are live, cascade-aware, and accessible to JavaScript. The remaining legitimate use of a CSS preprocessor in this architecture is for `@mixin` patterns that generate repetitive rule sets from parameters — a narrower use case than full Sass dependency.

**CSS Modules** — Replaced by `@scope` inside `@layer`. CSS Modules generate locally-scoped class names at build time via hash suffixing. `@scope` provides the same scoping without class name mangling, build steps, or JavaScript module imports for stylesheets.

**BEM naming** — Replaced by the combination of `@scope` and `@layer`. BEM encodes cascade management and component scope into class names, at the cost of verbose markup and rigid naming conventions. With `@scope` providing encapsulation and `@layer` managing cascade priority, BEM's architectural function is served natively.

**CSS-in-JS (styled-components, Emotion)** — Replaced by the full combination of `@layer`, `@scope`, custom properties, and `@property`. CSS-in-JS's primary value propositions are: co-location of styles with components (addressed by authoring `@scope` blocks alongside components), dynamic theming (addressed by custom properties), and specificity isolation (addressed by `@layer`). The runtime cost of CSS-in-JS — JavaScript bundle size, runtime style injection, hydration overhead — has no equivalent in native CSS.

**!important escalation** — Eliminated by `@layer`. With layers managing cascade priority, `!important` has one legitimate remaining use: within a layer, to express override intent to any styles in the same layer. `!important` applied to unlayered styles still defeats all layers. The architecture discourages unlayered styles for exactly this reason.

---

## References

- W3C CSS Cascade Level 5 — `drafts.csswg.org/css-cascade-5/`
- W3C CSS Cascading and Inheritance Level 6 (`@scope`) — `drafts.csswg.org/css-cascade-6/`
- W3C CSS Properties and Values API Level 1 — `drafts.css-houdini.org/css-properties-values-api/`
- W3C CSS Typed OM Level 1 — `drafts.css-houdini.org/css-typed-om/`
- W3C CSS Painting API Level 1 — `drafts.css-houdini.org/css-paint-api/`
- MDN — `@layer` — `developer.mozilla.org/en-US/docs/Web/CSS/@layer`
- MDN — `@scope` — `developer.mozilla.org/en-US/docs/Web/CSS/@scope`
- MDN — `@property` — `developer.mozilla.org/en-US/docs/Web/CSS/@property`
- MDN — CSS Custom Properties — `developer.mozilla.org/en-US/docs/Web/CSS/--*`
- MDN — CSS Typed OM — `developer.mozilla.org/en-US/docs/Web/API/CSS_Typed_OM_API`
- MDN — Houdini APIs — `developer.mozilla.org/en-US/docs/Web/API/Houdini_APIs`
- Frontend Masters — How to `@scope` CSS now that it's Baseline — `frontendmasters.com/blog/how-to-scope-css-now-that-its-baseline/`
- Smashing Magazine — CSS `@scope`: An Alternative to Naming Conventions — `smashingmagazine.com/2026/02/css-scope-alternative-naming-conventions/`