## Complete Design Token Architecture Using Native CSS

**Spec:** W3C CSS Custom Properties (MDN); CSS Properties and Values API (Houdini `@property`); W3C DTCG Design Tokens Specification 2025.10 **MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties` **MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@property` **Authority:** MDN Web Docs, W3C Design Tokens Community Group (DTCG), CSS Working Group, web.dev

---

## Overview

A design token is an indivisible, named design decision: a color, a spacing unit, a font size, a shadow, a timing function. Tokens are the single source of truth for a design system's visual language. They are what stands between consistent, rebrandable, theme-aware interfaces and an impossible tangle of hardcoded values scattered through thousands of CSS rules.

In a native web platform architecture, design tokens are implemented entirely in CSS using two browser-native mechanisms:

- **CSS custom properties** (sometimes called CSS variables) — the base layer. Untyped, cascading variables set with `--token-name: value` and consumed with `var(--token-name)`. Available everywhere. The lingua franca of token systems.
- **`@property` registered custom properties** — the typed layer. Adds type constraints, inheritance control, guaranteed initial values, and — critically — the ability for the browser to animate and transition between token values. Available as Baseline 2024 (all modern browsers since July 2024).

The DTCG (Design Tokens Community Group) published its first stable specification version 2025.10 in October 2025. This specification standardises the JSON interchange format for design tokens, enabling tool interoperability (Figma → Style Dictionary → CSS). This document focuses on the CSS runtime layer — what happens once tokens arrive in the browser.

---

## 1. CSS Custom Properties — The Foundation

### Syntax and Cascade Behaviour

Custom properties are declared with a double-dash prefix and are valid on any CSS rule:

```css
:root {
  --color-brand-500: oklch(55% 0.22 250);
  --space-4: 1rem;
  --font-size-body: 1rem;
}
```

The `:root` pseudo-class targets the document root element (`<html>`), giving these declarations the highest specificity in the regular cascade. Tokens declared here are globally available throughout the document.

Custom properties participate in the full CSS cascade — they inherit, they can be overridden by more specific selectors, and they respect `!important`. Inheritance is the mechanism by which a `data-theme="dark"` attribute on a parent element overrides token values for all its descendants:

```css
[data-theme="dark"] {
  --color-surface: oklch(15% 0 0);
  --color-on-surface: oklch(92% 0 0);
}
```

Everything inside a `[data-theme="dark"]` element — regardless of depth or component type — sees the overridden values. This is CSS's cascade working as a design system feature.

**No type checking on unregistered properties:** An unregistered custom property value is stored as a string and substituted verbatim into the `var()` call site. The browser cannot detect a type error — assigning `--space-4: red` does not cause an error; it only fails visibly when `padding: var(--space-4)` is parsed and the value `red` is rejected by the `padding` property itself, at which point the entire declaration is invalidated (not just the custom property reference).

### `var()` Function

The `var()` function substitutes a custom property value. It accepts an optional fallback as a second argument:

```css
color: var(--color-brand-500, #3b82f6);
```

If `--color-brand-500` is not defined or is invalid for the property, the fallback value `#3b82f6` is used. Fallbacks can themselves contain `var()` references:

```css
color: var(--color-interactive, var(--color-brand-500, oklch(55% 0.22 250)));
```

This chaining enables a layered fallback hierarchy: component-level token → semantic token → primitive value.

**`var()` substitution is lazy:** The substitution happens at computed value time, after the cascade resolves which custom property value applies to the element. The browser does not pre-validate token values against their usage context. This is why type-checking via `@property` is important for design-critical tokens.

---

## 2. `@property` — Typed, Registered Custom Properties

**Spec:** CSS Properties and Values API Level 1 (Houdini) **MDN:** `developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@property` **Status:** Baseline 2024 (all modern browsers since July 2024).

`@property` registers a custom property with a type definition, inheritance setting, and initial value. This upgrades the property from an opaque string to a typed CSS value that the browser understands fully.

```css
@property --color-brand-500 {
  syntax: '<color>';
  inherits: true;
  initial-value: oklch(55% 0.22 250);
}
```

The three required descriptors:

**`syntax`** — A string defining the allowed value type. Supports CSS value syntax notations: `<color>`, `<length>`, `<percentage>`, `<number>`, `<integer>`, `<angle>`, `<time>`, `<resolution>`, `<transform-function>`, `<transform-list>`, `<custom-ident>`, `<string>`, and `<url>`. Multiple types can be combined with `|`. The universal syntax `"*"` accepts any value.

**`inherits`** — `true` or `false`. Controls whether the property's value inherits from parent elements. `true` is correct for colour and typography tokens (they should cascade through the tree). `false` is appropriate for tokens whose value should not propagate to children — for example, a component-internal measurement that should not bleed to child components.

**`initial-value`** — The value used when no other value is defined in the cascade. This is the property's built-in default. Unlike a CSS rule's value, the initial value is guaranteed to be type-correct (the browser validates it at parse time). If `inherits: false`, the initial value is what every element starts with before any cascade override.

### What Registration Unlocks

**Type checking:** If `--space-4` is registered with `syntax: '<length>'`, assigning `--space-4: red` produces an invalid registered custom property value. The browser falls back to `initial-value` rather than substituting the invalid value — a graceful, visible failure mode rather than a silent cascade error.

**Animation and transition:** Unregistered custom properties are opaque strings to the browser's animation engine — it cannot interpolate between `'oklch(55% 0.22 250)'` and `'oklch(80% 0 0)'` because it does not know they are colours. A registered `<color>` property can be transitioned and animated natively, because the browser can interpolate between two colour values in the specified colour space. This enables smooth token-level transitions:

```css
:root {
  transition: --color-surface 250ms ease-out, --color-on-surface 250ms ease-out;
}
```

When `[data-theme]` changes, all elements recompute their token values and the browser smoothly interpolates the surface and text colours across the transition duration. This is the correct, performant mechanism for dark/light mode animated theme switching — no JavaScript, no `requestAnimationFrame`, no class swapping on every element.

**Gradient animation:** Gradients are normally impossible to animate in CSS because the browser treats them as images, not as composites of interpolatable values. By registering the colour stops of a gradient as `@property` values, the individual colour stops become interpolatable, enabling animated gradient transitions.

**JavaScript equivalent:** `CSS.registerProperty()` is the JavaScript equivalent of `@property`. It accepts the same `{ name, syntax, inherits, initialValue }` object. Use it when the registration must happen after CSS parsing (e.g., when the initial value is determined at runtime) or when registering properties in a Web Component's constructor:

```js
CSS.registerProperty({
  name: '--component-accent',
  syntax: '<color>',
  inherits: false,
  initialValue: 'oklch(55% 0.22 250)',
});
```

---

## 3. Token Architecture — Three Layers

The canonical architecture for a production design token system has three layers of abstraction, each with a distinct role.

### Layer 1 — Primitive Tokens

Primitive tokens are the raw, scale-independent values in the design system's vocabulary. They have no semantic meaning in isolation — they are named slots in a scale. A designer filling out a palette does not say "the brand colour is `--color-brand-500`"; they say "oklch(55% 0.22 250)` is the 500 step of the brand palette." Primitives give that value a name.

Primitive tokens do not appear directly in component styles. They exist to populate the semantic layer.

```css
/* colors/primitives.css */
:root {
  /* Brand palette — 12-step perceptual scale in OKLCH */
  --color-brand-50:  oklch(97% 0.05 250);
  --color-brand-100: oklch(92% 0.08 250);
  --color-brand-200: oklch(85% 0.12 250);
  --color-brand-300: oklch(76% 0.16 250);
  --color-brand-400: oklch(66% 0.20 250);
  --color-brand-500: oklch(55% 0.22 250);
  --color-brand-600: oklch(46% 0.20 250);
  --color-brand-700: oklch(38% 0.18 250);
  --color-brand-800: oklch(30% 0.14 250);
  --color-brand-900: oklch(22% 0.10 250);
  --color-brand-950: oklch(14% 0.06 250);

  /* Neutral palette */
  --color-neutral-0:   oklch(100% 0 0);
  --color-neutral-50:  oklch(97% 0 0);
  --color-neutral-100: oklch(94% 0 0);
  --color-neutral-200: oklch(88% 0 0);
  --color-neutral-300: oklch(78% 0 0);
  --color-neutral-400: oklch(64% 0 0);
  --color-neutral-500: oklch(50% 0 0);
  --color-neutral-600: oklch(38% 0 0);
  --color-neutral-700: oklch(27% 0 0);
  --color-neutral-800: oklch(18% 0 0);
  --color-neutral-900: oklch(10% 0 0);
  --color-neutral-950: oklch(6% 0 0);
  --color-neutral-1000: oklch(0% 0 0);

  /* Status palette */
  --color-success-500: oklch(63% 0.19 145);
  --color-warning-500: oklch(75% 0.18 65);
  --color-error-500:   oklch(58% 0.22 25);
  --color-info-500:    oklch(60% 0.18 230);
}
```

**On colour spaces:** OKLCH is the recommended colour space for design token primitives in 2026. It is a perceptually uniform cylindrical colour space where equal numerical differences in lightness correspond to equal perceptual differences in lightness. This makes it practical to define a harmonious 12-step scale without manual eyeballing. OKLCH is natively supported in CSS as of Baseline 2024.

### Layer 2 — Semantic Tokens

Semantic tokens give the primitives meaning. They express _intent_ rather than value. They are what component styles consume. They are what changes between themes.

A semantic token such as `--color-interactive` says "the colour used for interactive controls." Its value is a reference to a primitive — in light mode, `var(--color-brand-500)`; in dark mode, `var(--color-brand-300)`. The component using `--color-interactive` does not know or care which primitive shade is active; it just knows it is getting the correct interactive colour for the current theme.

```css
/* tokens/semantic-light.css — default (light) theme */
:root {
  /* Surface */
  --color-surface-page:      var(--color-neutral-50);
  --color-surface-card:      var(--color-neutral-0);
  --color-surface-elevated:  var(--color-neutral-0);
  --color-surface-overlay:   var(--color-neutral-900) / 0.5; /* or oklch + alpha */
  --color-surface-inverse:   var(--color-neutral-900);

  /* Content (text, icons) */
  --color-content-primary:   var(--color-neutral-900);
  --color-content-secondary: var(--color-neutral-600);
  --color-content-disabled:  var(--color-neutral-400);
  --color-content-inverse:   var(--color-neutral-50);
  --color-content-link:      var(--color-brand-600);
  --color-content-link-visited: var(--color-brand-800);

  /* Interactive */
  --color-interactive:         var(--color-brand-500);
  --color-interactive-hover:   var(--color-brand-600);
  --color-interactive-active:  var(--color-brand-700);
  --color-interactive-focus:   var(--color-brand-500);
  --color-interactive-disabled: var(--color-neutral-300);

  /* Feedback */
  --color-feedback-success: var(--color-success-500);
  --color-feedback-warning: var(--color-warning-500);
  --color-feedback-error:   var(--color-error-500);
  --color-feedback-info:    var(--color-info-500);

  /* Border */
  --color-border-default:  var(--color-neutral-200);
  --color-border-strong:   var(--color-neutral-400);
  --color-border-focus:    var(--color-brand-500);
}
```

```css
/* tokens/semantic-dark.css — applied when [data-theme="dark"] is set */
[data-theme="dark"] {
  --color-surface-page:      var(--color-neutral-950);
  --color-surface-card:      var(--color-neutral-900);
  --color-surface-elevated:  var(--color-neutral-800);
  --color-surface-inverse:   var(--color-neutral-50);

  --color-content-primary:   var(--color-neutral-50);
  --color-content-secondary: var(--color-neutral-400);
  --color-content-disabled:  var(--color-neutral-600);
  --color-content-inverse:   var(--color-neutral-900);
  --color-content-link:      var(--color-brand-300);
  --color-content-link-visited: var(--color-brand-200);

  --color-interactive:         var(--color-brand-400);
  --color-interactive-hover:   var(--color-brand-300);
  --color-interactive-active:  var(--color-brand-200);
  --color-interactive-disabled: var(--color-neutral-700);

  --color-border-default:  var(--color-neutral-800);
  --color-border-strong:   var(--color-neutral-600);
  --color-border-focus:    var(--color-brand-400);
}
```

Switching the theme requires setting or removing the `[data-theme="dark"]` attribute on a container element (typically `<html>` or `<body>`). Every component that consumes semantic tokens updates automatically, driven purely by the CSS cascade. No component-level code is required.

**`prefers-color-scheme` integration:**

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* same overrides as [data-theme="dark"] */
  }
}
```

The `:not([data-theme="light"])` guard ensures that an explicit user override (stored in `localStorage` and applied as `data-theme="light"`) takes precedence over the OS preference.

### Layer 3 — Component Tokens

Component tokens are the final layer. They are scoped to a specific component and map semantic tokens (or occasionally primitives directly) to the component's specific visual properties. They create a component-level API for customisation without exposing implementation details.

Component tokens should be namespaced with the component name to prevent collisions:

```css
/* components/button/button.css */
.button {
  /* Component token declarations — each maps a semantic token to a component role */
  --button-bg:             var(--color-interactive);
  --button-bg-hover:       var(--color-interactive-hover);
  --button-bg-active:      var(--color-interactive-active);
  --button-bg-disabled:    var(--color-interactive-disabled);
  --button-color:          var(--color-neutral-0);
  --button-border-radius:  var(--radius-md);
  --button-font-size:      var(--font-size-sm);
  --button-font-weight:    var(--font-weight-medium);
  --button-padding-block:  var(--space-2);
  --button-padding-inline: var(--space-4);
  --button-gap:            var(--space-2);
  --button-focus-ring:     var(--focus-ring-default);

  /* Consuming the component tokens */
  background-color: var(--button-bg);
  color:            var(--button-color);
  border-radius:    var(--button-border-radius);
  font-size:        var(--button-font-size);
  font-weight:      var(--button-font-weight);
  padding-block:    var(--button-padding-block);
  padding-inline:   var(--button-padding-inline);
  gap:              var(--button-gap);
}

.button:hover:not(:disabled) {
  background-color: var(--button-bg-hover);
}
```

**Why component tokens?** A consumer of the button can override `--button-bg` on a specific container without touching semantic or primitive layers:

```css
.promotional-section .button {
  --button-bg: var(--color-warning-500);
  --button-bg-hover: oklch(from var(--color-warning-500) calc(l - 0.08) c h);
}
```

The component token is the right customisation surface — it changes the button's appearance within that context without affecting the global design system.

---

## 4. Spacing, Typography, and Motion Tokens

### Spacing Scale

```css
/* tokens/spacing.css */
:root {
  --space-px:  1px;
  --space-0:   0px;
  --space-0-5: 0.125rem;  /* 2px at 16px base */
  --space-1:   0.25rem;   /* 4px */
  --space-1-5: 0.375rem;  /* 6px */
  --space-2:   0.5rem;    /* 8px */
  --space-2-5: 0.625rem;  /* 10px */
  --space-3:   0.75rem;   /* 12px */
  --space-4:   1rem;      /* 16px */
  --space-5:   1.25rem;   /* 20px */
  --space-6:   1.5rem;    /* 24px */
  --space-8:   2rem;      /* 32px */
  --space-10:  2.5rem;    /* 40px */
  --space-12:  3rem;      /* 48px */
  --space-16:  4rem;      /* 64px */
  --space-20:  5rem;      /* 80px */
  --space-24:  6rem;      /* 96px */
  --space-32:  8rem;      /* 128px */
}
```

Spacing tokens are fixed values — they do not scale with viewport or font size. Responsive layout is achieved by using different spacing tokens at different breakpoints, or by using semantic spacing tokens that reference scale tokens (`--gap-component: var(--space-4)`).

### Typography Tokens

```css
/* tokens/typography.css */
:root {
  /* Type scale — modular, 1.25 ratio */
  --font-size-xs:   0.75rem;   /* 12px */
  --font-size-sm:   0.875rem;  /* 14px */
  --font-size-base: 1rem;      /* 16px */
  --font-size-md:   1.125rem;  /* 18px */
  --font-size-lg:   1.25rem;   /* 20px */
  --font-size-xl:   1.5rem;    /* 24px */
  --font-size-2xl:  1.875rem;  /* 30px */
  --font-size-3xl:  2.25rem;   /* 36px */
  --font-size-4xl:  3rem;      /* 48px */
  --font-size-5xl:  3.75rem;   /* 60px */

  /* Font weights */
  --font-weight-light:   300;
  --font-weight-regular: 400;
  --font-weight-medium:  500;
  --font-weight-semibold: 600;
  --font-weight-bold:    700;

  /* Line heights */
  --line-height-tight:   1.25;
  --line-height-snug:    1.375;
  --line-height-normal:  1.5;
  --line-height-relaxed: 1.625;
  --line-height-loose:   2;

  /* Letter spacing */
  --letter-spacing-tight:  -0.025em;
  --letter-spacing-normal:  0;
  --letter-spacing-wide:    0.025em;
  --letter-spacing-wider:   0.05em;
  --letter-spacing-widest:  0.1em;

  /* Font families */
  --font-family-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-family-serif: 'Georgia', 'Times New Roman', serif;
  --font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;
}
```

**Fluid typography:** For responsive type that scales continuously with viewport width rather than at breakpoints, `clamp()` is the correct mechanism:

```css
:root {
  --font-size-hero: clamp(2rem, 4vw + 1rem, 4rem);
}
```

This value is too specific for a primitive scale entry. It belongs in a semantic token: `--font-size-hero: clamp(2rem, 4vw + 1rem, 4rem)`. Fluid sizes are applied at the semantic layer where their context is known.

### Border Radius Tokens

```css
:root {
  --radius-none: 0;
  --radius-sm:   0.125rem;   /* 2px */
  --radius-md:   0.375rem;   /* 6px */
  --radius-lg:   0.5rem;     /* 8px */
  --radius-xl:   0.75rem;    /* 12px */
  --radius-2xl:  1rem;       /* 16px */
  --radius-full: 9999px;     /* pill / circle */
}
```

### Motion Tokens

```css
/* tokens/motion.css */
:root {
  /* Durations */
  --duration-instant:  50ms;
  --duration-fast:     100ms;
  --duration-normal:   200ms;
  --duration-slow:     300ms;
  --duration-slower:   500ms;

  /* Easing functions */
  --ease-default:      cubic-bezier(0.4, 0, 0.2, 1);  /* Material standard */
  --ease-in:           cubic-bezier(0.4, 0, 1, 1);
  --ease-out:          cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out:       cubic-bezier(0.4, 0, 0.6, 1);
  --ease-spring:       cubic-bezier(0.34, 1.56, 0.64, 1); /* Overshoot */
  --ease-linear:       linear;
}
```

**`prefers-reduced-motion` integration:**

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast:   0ms;
    --duration-normal: 0ms;
    --duration-slow:   0ms;
    --duration-slower: 0ms;
  }
}
```

Overriding duration tokens to `0ms` globally disables all transitions and animations that consume them. Components that use `transition-duration: var(--duration-normal)` will have zero-duration transitions automatically. This is the correct pattern for `prefers-reduced-motion` — one override at the token layer, not a component-by-component `@media` rule.

### Shadow Tokens

```css
:root {
  --shadow-xs:  0 1px 2px 0 oklch(0% 0 0 / 0.05);
  --shadow-sm:  0 1px 3px 0 oklch(0% 0 0 / 0.1), 0 1px 2px -1px oklch(0% 0 0 / 0.1);
  --shadow-md:  0 4px 6px -1px oklch(0% 0 0 / 0.1), 0 2px 4px -2px oklch(0% 0 0 / 0.1);
  --shadow-lg:  0 10px 15px -3px oklch(0% 0 0 / 0.1), 0 4px 6px -4px oklch(0% 0 0 / 0.1);
  --shadow-xl:  0 20px 25px -5px oklch(0% 0 0 / 0.1), 0 8px 10px -6px oklch(0% 0 0 / 0.1);
  --shadow-none: 0 0 #0000;
}
```

For dark mode, shadow tokens can be overridden to use lighter or more subtle values, since shadows on dark surfaces behave differently perceptually:

```css
[data-theme="dark"] {
  --shadow-sm: 0 1px 3px 0 oklch(0% 0 0 / 0.3), 0 1px 2px -1px oklch(0% 0 0 / 0.3);
  --shadow-md: 0 4px 6px -1px oklch(0% 0 0 / 0.3), 0 2px 4px -2px oklch(0% 0 0 / 0.3);
}
```

### Z-Index Tokens

```css
:root {
  --z-index-base:     0;
  --z-index-raised:   10;
  --z-index-dropdown: 100;
  --z-index-sticky:   200;
  --z-index-overlay:  300;
  --z-index-modal:    400;
  --z-index-popover:  500;
  --z-index-toast:    600;
  --z-index-tooltip:  700;
}
```

Named z-index tokens eliminate z-index escalation — the tendency for hardcoded z-index values to accrue into the thousands as different developers try to ensure their layer appears above everything else. With named tokens, the layer hierarchy is visible and intentional.

---

## 5. `@property` Registration for Token Tokens

Not all tokens need registration. The tokens most worth registering with `@property` are those that:

1. Need to participate in CSS transitions or animations
2. Are used in gradient definitions (enabling animated gradients)
3. Have critical semantics where a type error should be immediately visible (not silently ignored)

```css
@property --color-interactive {
  syntax: '<color>';
  inherits: true;
  initial-value: oklch(55% 0.22 250);
}

@property --color-surface-page {
  syntax: '<color>';
  inherits: true;
  initial-value: oklch(97% 0 0);
}

@property --space-4 {
  syntax: '<length>';
  inherits: true;
  initial-value: 1rem;
}

@property --duration-normal {
  syntax: '<time>';
  inherits: true;
  initial-value: 200ms;
}
```

Registering the semantic colour tokens enables animated theme transitions without JavaScript. Registering `--duration-normal` as `<time>` means a `0ms` override from the reduced-motion media query is type-checked — no silent failure if someone accidentally sets it to a non-time value.

---

## 6. Theme Switching Architecture

### Applying Themes

```js
// core/theme.js — theme management module
const THEME_KEY = 'app:theme';

export function applyTheme(theme /* 'light' | 'dark' | 'system' */) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  localStorage.setItem(THEME_KEY, theme);
}

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) ?? 'system';
  applyTheme(saved);

  // Respond to OS preference changes when theme is 'system'
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if ((localStorage.getItem(THEME_KEY) ?? 'system') === 'system') {
        // The @media rule in CSS handles this automatically;
        // this handler is needed only for JavaScript-driven responses
      }
    });
}
```

The `data-theme` attribute is the only JavaScript-visible toggle. The CSS cascade does the rest. No component, no module, and no part of the application needs to know the current theme — the tokens abstract it away.

### Animated Theme Transitions

With semantic colour tokens registered via `@property`:

```css
:root {
  transition:
    --color-surface-page 220ms var(--ease-out),
    --color-surface-card 220ms var(--ease-out),
    --color-content-primary 180ms var(--ease-out),
    --color-content-secondary 180ms var(--ease-out),
    --color-interactive 180ms var(--ease-out),
    --color-border-default 180ms var(--ease-out);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    transition: none;
  }
}
```

When `data-theme` changes, the CSS cascade updates the custom property values, and the `transition` on the `:root` element interpolates the colours smoothly. This is a zero-JavaScript animated theme switch.

---

## 7. Token File Organisation

```
tokens/
  primitives/
    colors.css         — raw colour palette (brand, neutral, status)
    spacing.css        — spacing scale
    typography.css     — type scale, weights, families
    motion.css         — duration and easing values
    radius.css         — border radius values
    shadow.css         — shadow definitions
    z-index.css        — z-index scale
  semantic/
    light.css          — semantic tokens mapped to primitives (light mode defaults)
    dark.css           — dark mode semantic overrides
    high-contrast.css  — high-contrast theme overrides (WCAG AAA)
  registered/
    colors.css         — @property registrations for animatable colour tokens
    dimensions.css     — @property registrations for animatable size tokens
  index.css            — imports all token files in correct order
```

The `index.css` entry file imports all token layers in dependency order:

```css
/* tokens/index.css */
@import './primitives/colors.css';
@import './primitives/spacing.css';
@import './primitives/typography.css';
@import './primitives/motion.css';
@import './primitives/radius.css';
@import './primitives/shadow.css';
@import './primitives/z-index.css';
/* Registrations must come before semantic tokens that use the same names */
@import './registered/colors.css';
@import './registered/dimensions.css';
/* Semantic tokens reference primitives, so they come last */
@import './semantic/light.css';
@import './semantic/dark.css';
@import './semantic/high-contrast.css';
```

---

## 8. The DTCG Interchange Format

The W3C Design Tokens Community Group specification (stable version 2025.10) standardises a JSON format for exchanging design tokens between tools (Figma, Sketch, Style Dictionary, custom build pipelines). In a native web architecture, this format is the **source of truth** that feeds the CSS layer.

A design token in DTCG JSON format:

```json
{
  "color": {
    "brand": {
      "500": {
        "$value": "oklch(55% 0.22 250)",
        "$type": "color",
        "$description": "Primary brand colour, mid-tone"
      }
    }
  },
  "spacing": {
    "4": {
      "$value": "1rem",
      "$type": "dimension"
    }
  }
}
```

All specification-defined properties are prefixed with `$`. The `$type` field declares the token category. The `$value` field is the token's value. `$description` and `$deprecated` are optional. The format supports multi-file organisation and composite token types (shadows, gradients, typography composites).

**Style Dictionary** (v4+) transforms DTCG JSON into CSS custom property files automatically. The native web platform receives the output CSS; the DTCG JSON is the design-system-level source. Design tools that export DTCG JSON (Figma, Tokens Studio, Penpot) integrate directly into this pipeline without bespoke conversion code.

---

## 9. DevTools and Debugging

Custom properties are fully visible in browser DevTools:

- The **Styles panel** in Chrome/Edge DevTools shows computed variable values inline when hovering over a `var(--name)` reference.
- The **Computed panel** lists all custom properties defined on a selected element (under `Custom properties` in modern DevTools versions).
- `getComputedStyle(element).getPropertyValue('--token-name')` returns the resolved value as a string, usable from the console or in code.
- Registered custom properties (`@property`) show their type in the Styles panel, making it possible to see that a value is being treated as a `<color>` rather than an opaque string.

Testing theme switches in DevTools: set `document.documentElement.setAttribute('data-theme', 'dark')` in the console to toggle themes without page reload.

---

## References

- MDN — Using Custom Properties: `developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties`
- MDN — `@property` at-rule: `developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@property`
- MDN — CSS Properties and Values API: `developer.mozilla.org/en-US/docs/Web/API/CSS_Properties_and_Values_API/guide`
- MDN — CSS.registerProperty(): `developer.mozilla.org/en-US/docs/Web/API/CSS/registerProperty_static`
- web.dev — `@property` Baseline: `web.dev/blog/at-property-baseline`
- web.dev — Custom Properties: `web.dev/learn/css/custom-properties`
- W3C Design Tokens Community Group: `designtokens.org`
- DTCG Specification 2025.10: `designtokens.org/tr/drafts/format/`
- W3C DTCG Announcement (Oct 2025): `w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/`
- Style Dictionary DTCG support: `styledictionary.com/info/dtcg/`
- Penpot — Developer's Guide to Design Tokens: `penpot.app/blog/the-developers-guide-to-design-tokens-and-css-variables/`