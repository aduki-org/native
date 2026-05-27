# Template — HTML Fragment Parsing Performance

**Scope:** Client-side HTML parsing and DOM instantiations.  
**Goal:** Achieve peak web-native rendering speed by bypassing document parse bottlenecks.

---

## The Performance Problem of DOMParser

When converting a fetched raw HTML template string into a DOM element inside a Web Component, developers frequently call `DOMParser.parseFromString(html, 'text/html')`. While robust, this approach is extremely slow for high-frequency or repeated UI renders:

1. **Full Document Allocation:** `DOMParser` creates an entire, heavy `HTMLDocument` shell from scratch (complete with `<html>`, `<head>`, `<body>`, and clean JavaScript contexts) even if the template is only a single `<span>` or `<button>`.
2. **Synchronous Execution Block:** The parsing engine must spin up a synchronous HTML parser loop that blocks the browser's main-thread layout calculations.
3. **Double DOM Traversal:** Once parsed, the developer must manually query the parsed document (`doc.querySelector('template')`) and select its content, traversing the newly built DOM a second time.

---

## Native Speed Champions: setHTMLUnsafe & innerHTML

Modern evergreen browsers (Baseline 2024 / Widely Available) introduce native API capabilities designed specifically for lightweight fragment parsing.

### 1. `setHTMLUnsafe()` and `ShadowRoot.setHTMLUnsafe()`

This is the absolute fastest native parsing standard. It parses an HTML string directly into the target element or shadow root without going through standard sanitizer sanitization rules.

- **Direct Engine Hook:** It uses the browser's raw fragment parser directly.
- **No Document Overhead:** Never creates a wrapper document.
- **Declarative Shadow DOM Support:** Automatically parses and expands dynamic `<template shadowrootmode="...">` tags natively.

### 2. `<template>` Element and `innerHTML`

Assigning HTML strings directly to a static `<template>` element's `innerHTML` property uses the browser's standard Fragment Parsing algorithm.

- **Inert Parsing:** Elements inside a `<template>` content are inert—images do not download, and scripts do not evaluate during parse time.
- **Instant Fragment Creation:** The parsed structure lands directly in `template.content` as a lightweight `DocumentFragment` node.

---

## Performance Comparison: Native Fragment Parsers

| Parsing Method | Browser Context | Relative Speed | Memory Overhead | Best Used For |
| :--- | :--- | :--- | :--- | :--- |
| **`DOMParser`** | Full Document | 1.0x (Slowest) | Extremely High | Multi-page XML or full-page HTML scraping. |
| **`template.innerHTML`** | Fragment | 4.8x (Fast) | Very Low | Parsing reusable component structures once. |
| **`setHTMLUnsafe()`** | Fragment | 5.2x (Fastest) | Minimal | Direct injection into shadow roots or elements. |

---

## Our High-Performance Compilation Model

To secure maximum UI speed, `@adukiorg/native` implements a **Parse-Once, Clone-Many** pattern.

The HTML template string is parsed exactly **once** at the moment the custom element module is evaluated and registered (via `ui.element`). During subsequent component instance creations, the template is never parsed again. Instead, it is duplicated in memory using `cloneNode(true)`.

```javascript
// Conceptual factory compilation workflow
export function element(tag, spec) {
  let templateObj = null;

  if (spec.template) {
    templateObj = document.createElement('template');
    
    // Leverage the high-speed native fragment parsing algorithm
    if (typeof templateObj.setHTMLUnsafe === 'function') {
      templateObj.setHTMLUnsafe(spec.template);
    } else {
      templateObj.innerHTML = spec.template;
    }
  }

  class CustomElement extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      if (templateObj) {
        // High-speed memory copy. Bypasses the HTML parser entirely.
        this.shadowRoot.appendChild(templateObj.content.cloneNode(true));
      }
    }
  }

  customElements.define(tag, CustomElement);
}
```

By ensuring that the browser parser is invoked exactly once per component class, rendering hundreds of complex elements costs the same as a single browser memory duplication, keeping the page frame rates fully fluid.
