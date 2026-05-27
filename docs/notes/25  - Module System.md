## Import Maps, Module Workers, CSS/JSON Modules — Deep Specification

**Spec:** WHATWG HTML Living Standard (Import Maps, Module Workers); TC39 (Import Attributes / ES2025) **MDN:** `developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap` **MDN:** `developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules` **Authority:** WHATWG Living Standard, TC39, MDN Web Docs, web.dev

---

## Overview

The browser's native module system has matured considerably since ES modules became universally available in 2018. The pieces that enable a production native-web application without a bundler are:

- **Import Maps** — Resolve bare module specifiers (`'lit'`, `'@scope/pkg'`) to URLs, control module versioning, scope resolution to directory paths, and declare SRI hashes for all loaded modules. Baseline 2023.
- **`modulepreload`** — Eagerly fetch and parse modules (and their full dependency graphs) in the HTML `<head>`, eliminating the waterfall latency of deep import chains.
- **Import Attributes / ES2025** — The `with { type: 'json' }` and `with { type: 'css' }` syntax for importing non-JavaScript modules as first-class ES module participants.
- **JSON Modules** — Import `.json` files as ES module default exports. Achieved Baseline via Interop 2025.
- **CSS Module Scripts** — Import `.css` files as `CSSStyleSheet` objects, directly assignable to `adoptedStyleSheets`. Chromium-leading; cross-browser in progress.
- **Module Workers** — Dedicated and Shared Workers that use ES module syntax natively, with `import` / `export` and access to Import Maps.

---

## 1. Import Maps — Deep Specification

### What Problem Import Maps Solve

Native ES modules require each import to resolve to a full URL or a relative path. `import { html } from 'lit'` fails in the browser because `'lit'` is not a URL. The only options before Import Maps were:

1. Bundling — compile-time resolution of all specifiers to relative URLs in a single output file
2. Transpilation shims — runtime speculation about node_modules directory layout
3. Explicit full URLs everywhere — fragile, verbose, breaks on version changes

Import Maps replace all of these for the development and unbundled production case. They are a JSON document that maps module specifier strings to URLs, placed in the HTML before any `<script type="module">` tag.

### Placement and Parsing

There can only be **one** import map per document. It must appear in the HTML before any module script or `modulepreload` link that depends on it. The browser processes the import map before resolving any module imports. An import map placed after a module script that uses its mappings will be ignored for that script.

```html
<script type="importmap">
{
  "imports": { ... },
  "scopes": { ... },
  "integrity": { ... }
}
</script>
<!-- modulepreload links and module scripts follow AFTER the import map -->
<link rel="modulepreload" href="/app/main.js">
<script type="module" src="/app/main.js"></script>
```

The `type="importmap"` attribute identifies the script element as an import map definition. Its text content must be valid JSON.

### The `imports` Object

The top-level `imports` key is a **module specifier map**: a JSON object where each key is a string that may appear in an `import` statement or `import()` expression, and the corresponding value is the URL (absolute or relative) that the key resolves to.

**Bare specifier mapping:**

```json
{
  "imports": {
    "lit": "https://cdn.jsdelivr.net/npm/lit@3/index.js",
    "@lit/reactive-element": "https://cdn.jsdelivr.net/npm/@lit/reactive-element@2/reactive-element.js"
  }
}
```

Now `import { html, css } from 'lit'` resolves to the CDN URL.

**Path prefix mapping** — A key ending with `/` maps all specifiers with that prefix. This is the mechanism for mapping a package's entire subpath structure:

```json
{
  "imports": {
    "lit/": "https://cdn.jsdelivr.net/npm/lit@3/"
  }
}
```

`import { LitElement } from 'lit/index.js'` resolves to `https://cdn.jsdelivr.net/npm/lit@3/index.js`. The trailing `/` on both key and value is required for path prefix mappings.

**Relative URL remapping** — Import maps can remap relative paths as well as bare specifiers:

```json
{
  "imports": {
    "./lib/utils.js": "./lib/utils.v2.js"
  }
}
```

This allows transparent version bumps without changing all import call sites.

**Key resolution order** — The browser tries each key in the `imports` map in the order that provides the most specific match first (longer keys take priority), so a specific `"lit/directives/repeat.js"` mapping will override a general `"lit/"` prefix mapping.

### The `scopes` Object

The `scopes` key enables **path-scoped module resolution**. Different parts of the application can use different versions of the same package. Each key in `scopes` is a URL path prefix. Import resolution for any module whose URL begins with that prefix uses that scope's specifier map rather than (or in addition to) the top-level `imports` map.

```json
{
  "imports": {
    "lit": "https://cdn.jsdelivr.net/npm/lit@3/index.js"
  },
  "scopes": {
    "/legacy-components/": {
      "lit": "https://cdn.jsdelivr.net/npm/lit@2/index.js"
    }
  }
}
```

Code in `/legacy-components/` resolves `'lit'` to Lit v2. All other code resolves `'lit'` to Lit v3. The scope is matched against the URL of the _importing_ module, not the `window.location`. Scopes can be nested; the browser searches from most-specific to least-specific scope, then falls back to the top-level `imports`.

This is the mechanism for incremental version upgrades in large applications, and for isolating conflicting transitive dependencies.

### The `integrity` Object

Added in Chrome 127 and Safari 18, the `integrity` key maps module URLs to Subresource Integrity (SRI) hash strings. When the browser fetches a module whose URL appears in the integrity map, it validates the fetched content against the declared hash before execution.

```json
{
  "imports": {
    "lit": "https://cdn.jsdelivr.net/npm/lit@3/index.js"
  },
  "integrity": {
    "https://cdn.jsdelivr.net/npm/lit@3/index.js": "sha384-AbC123..."
  }
}
```

This closes a critical security gap: previously, SRI could only be applied to scripts declared with `<script integrity="...">` or `<link rel="modulepreload" integrity="...">`. Dynamic imports and transitive dependency fetches had no integrity check. The `integrity` map in the Import Map applies hash verification to _all_ imports — including deep transitive dependencies and lazy `import()` calls — without requiring every call site to specify the hash individually.

The `es-module-shims` polyfill supports this feature for older browsers that do not have native `integrity` in their import map implementation.

### Import Maps and Content Security Policy

Import maps interact with CSP's `script-src` directive. When `require-sri-for script` or `script-src` with hash sources is in use, the import map's `integrity` object can satisfy the SRI requirement for all dynamically-imported modules. Without the `integrity` key, a CSP that restricts scripts to SRI-verified sources will block dynamic imports even if the map has a valid URL mapping. The import map `integrity` object is the production-ready solution for operating with a strict CSP in a native-module application.

### `es-module-shims` Polyfill

For browsers without native import map support (or without specific features like `integrity`), `es-module-shims` is the reference polyfill. It uses a WASM ES module lexer to scan module source code and rewrite specifiers at runtime, then delegates to the native loader. With import maps now supported natively by all major browsers, `es-module-shims` in polyfill mode passes through 94% of users to the native loader with zero overhead, only activating the shim for the remaining ~4% on older browsers.

---

## 2. `<link rel="modulepreload">`

### The Waterfall Problem

ES modules are loaded lazily by default — the browser fetches a module, parses it, discovers its `import` declarations, then fetches those modules, and so on. For an application with deep import chains (`main.js` → `router.js` → `component.js` → `utils.js`), this sequential discovery creates a loading waterfall: each depth adds at least one network round-trip before execution can begin. On slow connections, a 5-level-deep module tree can add seconds to startup time.

`<link rel="modulepreload">` solves this by declaring modules for eager, parallel fetching before the HTML parser would normally discover them. The browser fetches, parses, and compiles the module (and adds it to the module map) during the document load phase, so that by the time the `<script type="module">` tag executes, all its dependencies are already in the module cache.

```html
<link rel="modulepreload" href="/app/main.js">
<link rel="modulepreload" href="/app/router.js">
<link rel="modulepreload" href="/components/nav.js">
<link rel="modulepreload" href="/components/hero.js">
<script type="module" src="/app/main.js"></script>
```

**Status:** Baseline. Supported in all major browsers since September 2023.

### Preloading Non-JavaScript Modules

As JSON and CSS module support expands, `modulepreload` is also being extended to support `as="json"` and `as="style"` attributes (mirroring `<link rel="preload" as="...">`). This allows JSON and CSS module imports to be pre-fetched and added to the module map before the JavaScript that imports them executes. At the time of writing this is in the WHATWG HTML specification PR stage and Chromium implementation tracking, not yet widely available.

For CSS and JSON assets today, `<link rel="preload" as="style">` and `<link rel="preload" as="json">` can prime the network cache, so the subsequent `import ... with { type: 'css' }` or `import ... with { type: 'json' }` hits the cache rather than the network.

### Integrity on `modulepreload`

```html
<link rel="modulepreload" href="/app/main.js" integrity="sha384-abc...">
```

The `integrity` attribute on a `modulepreload` link validates the fetched module against an SRI hash and registers the hash in the browser's integrity map. All modules preloaded this way are covered by SRI. This was the primary mechanism for SRI on modules before the import map `integrity` key was introduced. Both mechanisms work together and should be used together in a strict-CSP deployment.

---

## 3. Import Attributes (ES2025 / `with` Keyword)

**TC39 Status:** Import attributes are part of ECMAScript 2025. The `with` keyword syntax replaces the earlier `assert` keyword (now deprecated and removed). Chrome updated to `with` as of version 123; `assert` is deprecated.

Import attributes pass metadata to the module loader alongside the module specifier. The `type` attribute is the only standardised attribute. It tells the browser which module type to expect and how to parse the resource.

```js
// Correct current syntax (ES2025):
import config from './config.json' with { type: 'json' };
import sheet from './component.css' with { type: 'css' };

// Old syntax (deprecated, removed from spec):
import config from './config.json' assert { type: 'json' }; // ❌ Do not use
```

Dynamic import supports attributes as a second argument:

```js
const config = await import('./config.json', { with: { type: 'json' } });
```

The `type` attribute is required for JSON and CSS modules. Without it, the browser would refuse to execute a JSON file as a JavaScript module, since the MIME type would not match `text/javascript`.

---

## 4. JSON Modules

**Spec:** WHATWG HTML Living Standard (module type "json") **Status:** Baseline (Newly Available). Achieved Baseline in 2025 via Interop 2025, meaning JSON modules are natively supported in all modern browsers without polyfills.

JSON modules allow `.json` files to be imported as ES modules. The file is parsed as JSON and the parsed object is exported as the default export.

```js
import themeConfig from './theme.json' with { type: 'json' };
console.log(themeConfig.colors.primary);
```

Each import statement results in a network request (once, then cached), so large JSON files that are imported in many places should be split or imported from a single entry-point module that re-exports the values you need.

JSON modules participate fully in the module graph: they are cached in the module map, deduplicated across multiple importers, and can be preloaded with `<link rel="preload" as="json">`.

**Use cases in a native web application:**

- Application configuration: theme seed values, feature flags, route manifests
- Static data: country codes, currency lists, i18n strings (where JSON is the source format)
- Design token raw values (before transformation to CSS custom properties at build or runtime)

The parsed object is **immutable at the module level**: the same JSON object reference is shared across all importers of the same file. Mutating it would affect all importers. Treat imported JSON as read-only. If mutable configuration state is needed, copy the imported object.

---

## 5. CSS Module Scripts

**Spec:** WHATWG HTML Living Standard (module type "css") **Status:** Chromium (Chrome, Edge) since Chrome 93. Safari has positive signals. Firefox in progress. Not yet Baseline.

CSS module scripts allow `.css` files to be imported as `CSSStyleSheet` objects — the same object type created by `new CSSStyleSheet()` (Constructable Stylesheets). The stylesheet is parsed once and the `CSSStyleSheet` instance is the module's default export.

```js
import sheet from './component.css' with { type: 'css' };

class MyComponent extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [sheet];
  }
}
```

**Why this is architecturally important:**

In a Shadow DOM component architecture, each component requires scoped styles. The historical options were either:

1. Injecting a `<style>` element into each shadow root — duplicates parsed stylesheet objects for every component instance, increasing memory usage proportionally to the number of component instances.
2. Constructing a `CSSStyleSheet` from a string — styles defined in JavaScript as template literals lose editor tooling (syntax highlighting, linting, autocomplete).
3. Fetching a `.css` file and calling `sheet.replace(text)` — asynchronous and manual.

CSS module scripts provide a fourth option: the stylesheet is parsed from a `.css` file once, producing a single `CSSStyleSheet` instance that is shared across all shadow roots that adopt it. Memory is linear in the number of stylesheets, not the number of component instances. The `.css` file is a real CSS file with full editor tooling support.

Multiple shadow roots can adopt the same sheet. The browser renders each shadow root with the sheet's rules applied; the parsed stylesheet object is not copied. Dynamic changes to the sheet (`sheet.replaceSync()` or via CSSOM) propagate to all shadow roots that have adopted it.

**Integration with the module system:** A CSS module participates in the module map. The same `.css` file imported from multiple JavaScript modules resolves to the same `CSSStyleSheet` instance (the module cache ensures this). This is the mechanism by which a component library's shared stylesheet is loaded once regardless of how many components on the page need it.

**Preloading:** Until `<link rel="modulepreload" as="style">` is available, CSS modules can be primed with `<link rel="preload" as="style" href="./component.css">` to avoid the waterfall.

**Current limitation:** Without cross-browser support, a conditional fallback is necessary. Feature-detect with:

```js
const supportsCSSModules = HTMLScriptElement.supports('importmap'); 
// This is a rough proxy — there is no direct CSS module support detect
// A more robust approach: attempt import and catch the TypeError
```

For production use today, the pattern is: prefer CSS modules in Chromium, fall back to constructable stylesheets from an inline string for other browsers, and plan to simplify to CSS modules once they achieve Baseline.

---

## 6. Module Workers

### Dedicated Module Workers

**Spec:** WHATWG HTML Living Standard **MDN:** `developer.mozilla.org/en-US/docs/Web/API/Worker` **Status:** Baseline.

A classic Worker (`new Worker('script.js')`) executes a script in a classic (non-module) execution context. It cannot use `import` / `export` syntax natively; it must use `importScripts()`, which is a synchronous, non-module mechanism.

A module Worker is created by passing `{ type: 'module' }` as the second argument:

```js
const worker = new Worker('/workers/data-processor.js', { type: 'module' });
```

The worker script at `/workers/data-processor.js` is loaded as an ES module. It can use static `import` declarations, dynamic `import()`, and `export` (for use as a module by other Workers — though the primary communication mechanism remains `postMessage`). Top-level `await` is also available in module Workers.

**Import Maps in Workers:** Module Workers observe the document's import map. A bare specifier `import { html } from 'lit'` inside a module Worker resolves according to the same import map that governs the document. This is critical: without import map support in Workers, bare specifiers would require full URL rewrites inside every worker file, breaking the single-source-of-truth principle of the import map.

**`modulepreload` and Workers:** `<link rel="modulepreload">` links in the document do not automatically preload modules for Workers. Worker module dependencies are fetched independently. For Workers with deep dependency chains, the initialisation latency can be significant. Strategies to mitigate this: keep worker module graphs shallow, or use `import()` within the worker to lazily load modules after the worker is initialised.

### Shared Workers

`new SharedWorker('/workers/shared.js', { type: 'module' })` creates a module-based Shared Worker. Multiple browsing contexts (tabs, iframes) with the same origin can connect to the same Shared Worker instance, enabling cross-tab state sharing without a server round-trip.

Shared module Workers are particularly useful for:

- A single WebSocket or WebTransport connection multiplexed across multiple tabs
- A shared cache or in-memory database (IndexedDB abstractions, OPFS wrappers)
- Cross-tab broadcast without the overhead of `BroadcastChannel` for large payloads

### Service Workers and Modules

Service Workers do **not** currently support `{ type: 'module' }` syntax. Service Worker scripts must use `importScripts()` for code reuse. This is a known limitation and is tracked by browser vendors, but as of 2026 it has not achieved Baseline. Designing Service Worker scripts to be self-contained or to use `importScripts()` for shared utilities remains the current practice.

---

## 7. Dynamic Import and Code Splitting

Static `import` declarations are resolved at module evaluation time — they create a synchronous dependency in the module graph. `import()` (dynamic import) is an asynchronous operator that returns a `Promise<module namespace>`, allowing modules to be loaded on demand:

```js
const { default: Router } = await import('/app/router.js');
```

Dynamic imports interact with the import map: the specifier is resolved through the map identically to static imports. They do _not_ benefit from `modulepreload` links unless those links have been declared in HTML. For dynamically-loaded code split chunks, the recommended pattern is to inject `<link rel="modulepreload">` elements dynamically (immediately before calling `import()`) for critical paths, or to accept the latency for non-critical lazy routes.

**Top-level `await`** — Module scripts (and module Workers) support `await` at the top level. The module's execution is paused at the `await` expression, and any module that imports this module waits until the awaited promise resolves before continuing. This enables asynchronous initialisation (fetching config, loading WASM) as part of the module graph without wrapper functions. Use with care — a slow top-level `await` stalls all downstream importers.

---

## 8. `import defer` (TC39 Stage 3)

The `import defer` proposal allows a module to be fetched and linked (its dependencies resolved and downloaded) without being _evaluated_ (its code run). Evaluation is deferred until the first property access on the namespace object.

```js
import defer * as analytics from './heavy-analytics.js';
// Module is fetched and linked at load time, but not executed

// ... much later, only if the user triggers analytics:
analytics.track('event');  // evaluation happens here, lazily
```

This reduces startup cost for rarely-used modules that are nonetheless part of the static import graph (and therefore must be downloaded at startup). The module is available immediately when first accessed, without an `await` — unlike dynamic `import()`, which introduces asynchrony at the call site.

`es-module-shims` polyfills this via syntax stripping for browsers that don't support it natively.

---

## Module System Architecture in a Native Web Application

A production native web application's module system follows this layered structure:

**Layer 1 — Import Map (HTML):** One `<script type="importmap">` in the document `<head>`. Maps all third-party bare specifiers to versioned CDN URLs or self-hosted URLs. Declares SRI hashes in the `integrity` object. This is the only place package versions are defined.

**Layer 2 — Preloading (HTML):** `<link rel="modulepreload">` for the application entry point and its critical-path dependencies. Ensures the above-the-fold render is not gated on module waterfall discovery.

**Layer 3 — Application Modules (JavaScript):** The application's own source modules, using static `import` for dependencies that must be ready before the module runs, and `import()` for route-level or feature-level code splitting. Module Workers for off-main-thread processing.

**Layer 4 — Non-JS Modules (JSON, CSS):** JSON modules for static configuration and token seeds. CSS modules for component styles, consumed via `adoptedStyleSheets`.

**Layer 5 — Module Map (Browser):** The browser's internal module cache ensures each module URL is fetched, parsed, and evaluated at most once per document lifetime, regardless of how many importers reference it.

---

## References

- WHATWG HTML — Import Maps: `html.spec.whatwg.org/multipage/webappapis.html#import-maps`
- MDN — `<script type="importmap">`: `developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap`
- MDN — JavaScript Modules Guide: `developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules`
- MDN — dynamic `import()`: `developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import`
- MDN — Worker with type module: `developer.mozilla.org/en-US/docs/Web/API/Worker/Worker`
- TC39 — Import Attributes Proposal: `github.com/tc39/proposal-import-attributes`
- TC39 — Import Defer Proposal: `github.com/tc39/proposal-defer-import-eval`
- WICG — Import Maps Explainer: `github.com/WICG/import-maps`
- JSPM — ES Module Preloading & Integrity: `guybedford.com/es-module-preloading-integrity`
- JSPM — JS Integrity Manifests with Import Maps: `jspm.org/js-integrity-with-import-maps`
- es-module-shims: `github.com/guybedford/es-module-shims`
- InfoQ — JSON Modules Interop 2025: `infoq.com/news/2025/06/json-module-import-interop-2025`
- CSS Modules & Constructable Stylesheets: `web.dev/articles/css-module-scripts`
- MDN — Using Shadow DOM / adoptedStyleSheets: `developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM`