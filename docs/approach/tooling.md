# Tooling — Rust Dev Pipeline

**Scope:** Development-only. Zero Rust at runtime. Zero bundling at any stage.  
**Goal:** Sub-millisecond hot reload, automatic type generation, and a clean `dist/` output from a single CLI command.

---

## Philosophy

The Rust tool exists in one environment: your local machine during development. Production never sees it. The browser receives the same raw `.js`, `.css`, and `.html` files it always would — the only difference is that your editor now has full type safety and your browser hot-swaps CSS without reloading the page.

The pipeline has three responsibilities and three only:

- **Serve** — static file server for `src/` with correct MIME types and ESM headers
- **Watch** — detect changes and broadcast the minimum update (CSS swap vs. full reload)
- **Extract** — parse element definitions and write `.d.ts` declarations to `dist/types/`

---

## Crates

| Crate | Role | Why |
| -- | -- | -- |
| `axum` | HTTP server | Minimal, tower-compatible, built on tokio |
| `tower-http` `ServeDir` | Static file serving | One line; handles MIME, ETags, range requests |
| `notify` v6 | File system events | Cross-platform; `inotify` on Linux, `FSEvents` on macOS, kernel-level, no polling |
| `tower-livereload` | SSE reload injection | Injects a ~200 byte client snippet; handles reconnect automatically |
| `swc_ecma_parser` | JS AST parser | Parses `.js` files to extract `ui.element()` spec shapes; never emits code |
| `tokio` | Async runtime | Drives watcher + server concurrently on a single thread pool |

No transpilation crates. SWC is used exclusively for AST reading, never for code output.

---

## Structure

```bash
tools/
├── Cargo.toml
└── src/
    ├── main.rs        — CLI entry; wires server, watcher, extractor
    ├── server.rs      — axum router; serves src/ and dist/; injects SSE endpoint
    ├── watcher.rs     — notify listener; debounce; classifies change as css|js|html
    ├── extract.rs     — SWC parser; reads ui.element() calls; writes .d.ts files
    └── types.rs       — shared event enums; ChangeKind; ExtractedSpec
```

---

## Path Resolution — How `style` and `template` Work

You never write a fetch chain. You never write an absolute path. You write paths relative to the current file and pass `import.meta.url` as a third argument to `ui.element()`.

```javascript
// src/elements/primitives/badge.js
import { ui } from 'core/ui/index.js';

ui.element('ui-badge', {
  style: './badge.css',
  template: './badge.html',
  props: {
    variant: { type: String, reflect: true }
  }
}, import.meta.url);
```

The factory receives `import.meta.url` and resolves both paths using the native `URL` constructor — `new URL('./badge.css', base).href`. This is 100% browser-native ESM. No transpilation. No rewriting. Works identically in `src/` during development and in `dist/` after the copy.

When `template` ends in `.html`, the factory fetches the file, parses it via `template.innerHTML` (see below), and caches the compiled `<template>` node. Subsequent instantiations clone it. The fetch happens once per class per page load, not per instance.

The factory signature is:

```javascript
ui.element(tag, spec, base?)
```

`base` is optional. When omitted, paths in `style` and `template` must be absolute.

---

## Why `template.innerHTML`, Not `DOMParser`

`DOMParser.parseFromString()` allocates an entire `Document` object — head, body, doctype, the works — just to extract a fragment. It is measurably slower for this use case because it runs the full document parse pipeline.

`template.innerHTML = html` uses the HTML fragment parsing algorithm directly. The browser parses only the fragment, not a full document. The result lands immediately in `template.content` as a `DocumentFragment`. It is the fastest browser-native method for this exact task — converting an HTML string into a clonable node.

The factory does this once at module evaluation time. Every subsequent `connectedCallback` calls `cloneNode(true)` on the cached `template.content`, which is a memory copy, not a parse. The parse cost is paid exactly once per element class per page load.

---

## Change Classification

The watcher does not treat all file changes equally. The event kind determines what gets broadcast.

| Changed file | Action | Why |
| --- | --- | --- |
| `*.css` | SSE `css` event with file path | Browser can hot-swap without state loss |
| `*.js` | SSE `reload` + re-extract types | Module graph may have changed |
| `*.html` | SSE `reload` | Template markup changed; must re-clone |
| `Cargo.toml` | Ignored | Not a web asset |

The client runtime listens on the SSE endpoint. On a `css` event it replaces the matching `CSSStyleSheet` inside the component's `shadowRoot.adoptedStyleSheets` in-place — no DOM change, no state loss, component stays mounted. On `reload` it calls `location.reload()`.

---

## Type Extraction

When the watcher fires on any `.js` file under `src/elements/` or `src/pages/`, `extract.rs` runs the SWC parser over it. The parser traverses the AST looking for `CallExpression` nodes where the callee matches `ui.element`. It reads:

- First argument — the tag string
- Second argument's `props` object literal — each key, `type`, `reflect`, `default`
- Second argument's `methods` object literal — each key

From this it writes one `.d.ts` per element into `dist/types/`. The global `HTMLElementTagNameMap` augmentation is regenerated in `dist/types/index.d.ts` on every extraction run.

Extraction is additive. Files corresponding to unchanged elements are not rewritten.

---

## dist/ Layout

`dist/` is a fresh copy, not a bundle. The tool performs one file-copy pass from `src/` on startup, then keeps it in sync during watch. No transformation occurs. Every non-type file in `dist/` is byte-identical to its counterpart in `src/`.

```bash
dist/
├── core/
├── elements/
├── pages/
├── styles/
├── tokens/
└── types/            — generated; does not exist in src/
    ├── elements/
    │   ├── badge.d.ts
    │   ├── button.d.ts
    │   └── ...
    ├── pages/
    │   ├── home.d.ts
    │   └── ...
    └── index.d.ts
```

`types/` is the only output the tool authors. Everything else is a direct copy.

---

## Exports

```json
{
  "name": "@adukiorg/native",
  "type": "module",
  "exports": {
    ".": "./core/ui/index.js",
    "./elements/*": "./elements/*",
    "./pages/*": "./pages/*"
  },
  "types": "./types/index.d.ts"
}
```

---

## Commands

```sh
# Dev: starts server + watcher + type extraction
cargo run --manifest-path tools/Cargo.toml -- --src src --port 3000

# Build: copies src/ to dist/, runs extraction once, exits
cargo run --manifest-path tools/Cargo.toml -- --src src --build
```

On startup the server prints the local URL and the count of element definitions extracted. `Ctrl-C` shuts down cleanly.

---

## What Never Happens

- No bundling. `import` statements are never rewritten.
- No minification. Files in `dist/` are identical to `src/`.
- No transpilation. SWC is called only in parse mode, never emit mode.
- No node_modules in the browser path. Import maps resolve bare specifiers.
- No type checking at this stage. `tsc --noEmit` is a separate optional step.

---

## Naming Contract

| Path | Rationale |
| --- | --- |
| `tools/src/server.rs` | One concept: the server |
| `tools/src/watcher.rs` | One concept: the watcher |
| `tools/src/extract.rs` | One concept: the extractor |
| `dist/types/elements/badge.d.ts` | Mirrors `src/elements/primitives/badge.js` |
| `dist/types/index.d.ts` | Top-level re-export |

---

*End of tooling.md*