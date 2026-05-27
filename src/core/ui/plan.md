# Native UI Runtime Implementation Plan

This plan turns the existing `tags`, `refs`, `on`, and proposed `watch` APIs into a robust implementation track for `src/core/ui`. It covers the browser-side primitive JavaScript runtime, the Rust template scanner, lifecycle integration, cache invalidation, safety rules, and documentation work.

## 1. Scope

Implement a small native-first component runtime around `ui.element` and `ui.container`:

- `refs`: O(1) named element anchors from `ref="name"`.
- `tags`: cached Shadow DOM selector access.
- `on`: lifecycle-safe delegated event binding.
- `watch`: lifecycle-safe scoped `MutationObserver` binding.
- `native-tools` HTML scan: Rust-generated `.tags.json` descriptors for runtime prewarming and optional type generation.
- `usage.md`: complete public API examples and usage rules.

This is not a virtual DOM. Rendering remains direct DOM mutation inside a component-owned shadow root, scheduled through the existing scheduler when work is not part of initial mount.

## 2. Files Read

Runtime:

- `src/core/ui/base.js`
- `src/core/ui/index.js`
- `src/core/ui/observe.js`
- `src/core/ui/schedule.js`
- `src/core/ui/template.js`
- `src/core/ui/transitions.js`
- `src/core/ui/define/element.js`
- `src/core/ui/define/container.js`
- `src/core/ui/define/proxy.js`
- `src/core/ui/define/utils.js`
- `src/core/ui/define/state.js`
- `src/core/ui/define/orchestrator.js`

Tooling:

- `tools/src/main.rs`
- `tools/src/extract/runner.rs`
- `tools/src/extract/html.rs`
- `tools/src/watcher/runner.rs`
- `tools/src/server/runner.rs`
- `tools/src/types/mod.rs`

Architecture notes consulted:

- `docs/notes/04 - Web Components.md`
- `docs/notes/06 - Rendering.md`
- `docs/notes/07 - Reactivity.md`
- `docs/notes/10 - Event Architecture.md`
- `docs/notes/12 - Performance.md`
- `docs/notes/14 - Memory Management.md`
- `docs/notes/17 - Browser API.md`
- `docs/notes/18 - Limitations, Browser Gaps, and Polyfill Strategy.md`

## 3. Current State

The codebase already has the core skeleton:

| Area | Current state | Required change |
| --- | --- | --- |
| Lifecycle | `BaseElement` creates `this.ctrl` on connect and aborts on disconnect. | Keep. Ensure all injected helpers derive cleanup from this signal. |
| Template/style loading | `preloadResources` fetches HTML, CSS, and optional `.tags.json`. | Keep. Add stricter descriptor validation and inline-template fallback scanning where possible. |
| `refs` | Built in `element.js` from descriptor refs. Frozen after mount. | Support descriptor-free fallback scan and document stable-template semantics. |
| `tags` | `TagsCache` has `one`, `all`, `each`, `prewarmId`, `clear`. | Split single/all caches to avoid selector shape collisions. Add safer invalidation hooks. |
| `on` | Proxy creates a new listener on the shadow root for every call. | Change to one root listener per event type, with registration records per selector. Add `.once` and options support. |
| `watch` | Spec exists in `watch.md`; no runtime helper is injected. | Implement `createMutationWatcher` and inject it into mount/update. |
| Rust scan | `parse_and_emit` emits refs, ids, classes, tags, compound selectors. | Return results/errors, scan more selector hints, add duplicate-ref warnings, optional type output. |
| Watcher | HTML changes trigger `.tags.json` regeneration. | Keep. Add removal cleanup and better debounce result handling. |
| Usage docs | `usage.md` documents element/container/tags/on/scheduler. | Add watch, observe, transition, template, signal/options, direct listener escape hatches. |

## 4. Target Injection Shape

Every `mount` and `update` receives the same base context. Update additionally receives the changed property data.

```javascript
mount({ el, ctrl, tags, on, refs, watch, internals }) {}

update({
  el,
  ctrl,
  tags,
  on,
  refs,
  watch,
  internals,
  name,
  val,
  prev
}) {}

unmount({ el, tags, refs, internals }) {}
```

Implementation rule: build this context once per connected lifecycle and reuse the same helper instances for mount and every scheduled update during that connection.

## 5. Primitive JavaScript Runtime Plan

### 5.1 Context Builder

Create a small internal helper in `src/core/ui/define/proxy.js` or a new `context.js`:

```javascript
export function createComponentContext({ el, shadowRoot, ctrl, descriptor, internals }) {
  const tags = new TagsCache(shadowRoot);
  const refs = createRefs(shadowRoot, descriptor);
  const on = createEventDelegator(shadowRoot, ctrl.signal);
  const watch = createMutationWatcher(shadowRoot, ctrl.signal);

  prewarmTags(tags, shadowRoot, descriptor);
  installInvalidationHooks(shadowRoot, tags, refs, watch);

  return Object.freeze({ el, ctrl, tags, on, refs, watch, internals });
}
```

Why: `element.js` currently constructs each helper inline. A context builder keeps lifecycle setup auditable and makes it harder for `mount` and `update` to drift.

### 5.2 `refs`

Target behavior:

```javascript
refs.submit
refs.email
refs.status
```

Rules:

- `refs` is a plain frozen object.
- Descriptor refs are preferred.
- If no descriptor exists, fallback to `shadowRoot.querySelectorAll('[ref]')`.
- Missing refs return `undefined`.
- Duplicate refs are a development warning; the first element wins.
- Runtime does not remove the `ref` attribute. It remains inspectable in DevTools.

Implementation:

```javascript
function createRefs(root, descriptor) {
  const names = descriptor?.refs;
  const out = Object.create(null);

  if (Array.isArray(names) && names.length) {
    for (const name of names) {
      const found = root.querySelectorAll(`[ref="${CSS.escape(name)}"]`);
      if (found[0]) out[name] = found[0];
      if (found.length > 1) warnDuplicateRef(name, found.length);
    }
  } else {
    for (const node of root.querySelectorAll('[ref]')) {
      const name = node.getAttribute('ref');
      if (name && !(name in out)) out[name] = node;
      else if (name) warnDuplicateRef(name);
    }
  }

  return Object.freeze(out);
}
```

### 5.3 `tags`

Target methods:

```javascript
tags.one(selector)       // Element | null
tags.all(selector)       // Element[]
tags.each(selector, fn)  // void
tags.has(selector)       // boolean, planned convenience
tags.clear()             // internal/public escape hatch
```

Required fix: the current `TagsCache` stores `one()` and `all()` results in the same `Map`. Calling `tags.one('button')` and then `tags.all('button')` can return the wrong shape. Use separate maps or namespace keys:

```javascript
class TagsCache {
  #one = new Map();
  #all = new Map();

  one(selector) {
    if (!this.#one.has(selector)) {
      this.#one.set(selector, this.root.querySelector(selector));
    }
    return this.#one.get(selector);
  }

  all(selector) {
    if (!this.#all.has(selector)) {
      this.#all.set(selector, Array.from(this.root.querySelectorAll(selector)));
    }
    return this.#all.get(selector);
  }
}
```

Invalidation:

- Clear caches after `shadowRoot.replaceChildren(...)`.
- Clear caches after writes to `shadowRoot.innerHTML`.
- Clear caches after appending a full template fragment during first mount is not needed if caches are created after append.
- Clear caches when `watch` observes structural changes caused by component code only if the component opts in, because clearing on every mutation defeats caching for dynamic lists.
- Document that `tags` is best for stable anchors. Dynamic collections should call `tags.all()` after rendering or use delegated `on`.

Prewarming:

- `descriptor.ids`: set `#id` entries using `shadowRoot.getElementById(id)` where available.
- `descriptor.refs`: optionally set `[ref="name"]` entries after refs are built.
- Do not prewarm every class/tag by default. Large templates would do unnecessary work.

### 5.4 `on`

Target usage:

```javascript
on.click('button', handler)
on.click('button', handler, ctrl.signal)
on.click('button', handler, { signal: ctrl.signal, passive: true })
on.click.once('button', handler)
on['nav:change']('[data-tab]', handler)
```

Handler signature:

```javascript
(event, matchedElement) => void
```

Implementation model:

- One native `addEventListener` per event type on the shadow root.
- Each event type has a registry of bindings.
- Each binding stores `{ selector, handler, signal, once, options }`.
- The shared root listener dispatches to matching bindings using `event.target.closest(selector)`.
- The match must satisfy `shadowRoot.contains(match)`.
- If a binding signal aborts, remove only that binding.
- If all bindings for an event type are removed, the root listener can remain until component abort, or be removed for tidiness.

Options:

```javascript
on.click(selector, handler)
on.click(selector, handler, signal)
on.click(selector, handler, {
  signal,
  once,
  capture,
  passive
})
```

Non-delegated escape hatch:

Use raw platform APIs for events that cannot be delegated cleanly, such as `scroll`, `resize`, `load`, and some focus flows:

```javascript
refs.scroller.addEventListener('scroll', handleScroll, { signal: ctrl.signal });
```

### 5.5 `watch`

Implement `createMutationWatcher(shadowRoot, defaultSignal)` as documented in `watch.md`.

Public methods:

```javascript
watch.attr(target, attr, handler, signalOrOptions?)
watch.kids(target, handler, signalOrOptions?)
watch.kids(target, { deep: true }, handler, signalOrOptions?)
watch.text(target, handler, signalOrOptions?)
watch.tree(target, handler, signalOrOptions?)

watch.attr.once(...)
watch.kids.once(...)
watch.text.once(...)
watch.tree.once(...)
```

Core data structure:

```javascript
{
  id,
  kind: 'attr' | 'kids' | 'text' | 'tree',
  target,          // Element
  selector,        // string | null
  attrs,           // Set<string> | '*'
  deep,            // boolean
  handler,
  signal,
  once
}
```

Observer model:

- One `MutationObserver` per component instance.
- Observe the shadow root with the union of options required by all active registrations.
- Recompute observer options when registrations are added or removed.
- Disconnect on lifecycle abort.
- Guard callback with `if (defaultSignal.aborted) return;` because queued mutation callbacks can still run after `disconnect()`.

Matching:

- Selector targets are resolved to element lists at registration time.
- Direct element targets must be inside the shadow root.
- `watch.attr` matches `attributes` records whose target is the watched element or a matching descendant when appropriate.
- `watch.kids` matches `childList` records on the target, or descendants when `{ deep: true }`.
- `watch.text` matches `characterData` records whose parent is the target or inside the target.
- `watch.tree` receives the raw batch after filtering to the target subtree.

### 5.6 Error Behavior

Development:

- Invalid selector: warn and skip registration.
- Direct target outside shadow root: throw `WatchError` / `EventBindingError`.
- Missing target selector: warn and return a no-op disposer.
- Duplicate refs: warn.

Production:

- Invalid bindings return a no-op disposer where possible.
- Do not throw for missing optional DOM. Components may render conditionally.

### 5.7 Disposer Return Values

All `on.*` and `watch.*` calls should return a disposer:

```javascript
const off = on.click('button', handler);
off();

const stop = watch.attr(refs.submit, 'disabled', handler);
stop();
```

This does not replace signal cleanup. It gives component code an explicit way to stop a temporary binding early.

## 6. Rust Tooling Plan

The current Rust scanner lives in `tools/src/extract/html.rs` and is invoked from `extract::run` and the dev watcher.

### 6.1 Make HTML Parsing Testable

Refactor:

```rust
pub fn parse_html(content: &str) -> TagsDescriptor
pub fn parse_file(path: &Path) -> anyhow::Result<TagsDescriptor>
pub fn emit_descriptor(html_path: &Path, descriptor: &TagsDescriptor) -> anyhow::Result<PathBuf>
pub fn parse_and_emit(html_path: &Path) -> anyhow::Result<PathBuf>
```

Why: the current `parse_and_emit` logs and silently returns. Returning `Result` lets build/watch modes surface real compiler feedback.

### 6.2 Descriptor Shape

Keep the current fields and add optional metadata:

```json
{
  "version": 1,
  "refs": ["email", "submit"],
  "ids": ["email"],
  "classes": ["btn", "primary"],
  "tags": ["form", "input", "button"],
  "compound": ["button.btn", "input.field"],
  "attrs": ["aria-expanded", "data-state"],
  "refTypes": {
    "email": "HTMLInputElement",
    "submit": "HTMLButtonElement"
  }
}
```

Required behavior:

- Deterministic sorted arrays.
- HTML5-compliant parsing through `scraper` initially.
- Duplicate ref diagnostics with file path and ref name.
- Invalid ref names diagnostics if the name is not a valid JS property identifier; still emit the descriptor so bracket access can be used in the future.

### 6.3 CLI and Watch Methods

Current binary:

```bash
native-tools --src src --dist dist --build
native-tools --src src --port 3000
```

Target methods:

```bash
native-tools scan --src src
native-tools scan --src src --watch
native-tools build --src src --dist dist
native-tools dev --src src --port 3000
```

If command subcommands are too large for the first pass, keep the current flags but document them clearly in `usage.md`:

```bash
native-tools --src src --build
native-tools --src src --port 3000
```

Watcher requirements:

- On `.html` change: regenerate adjacent `.tags.json`.
- On `.js` change: regenerate element typings.
- On `.css` change: send HMR CSS payload.
- On deleted `.html`: remove stale `.tags.json` if it was generated.
- Debounce per path, not only per batch, to avoid losing rapid save events.

### 6.4 Optional Type Output

Generate `index.tags.d.ts` next to `index.tags.json`:

```typescript
export interface TemplateRefs {
  email: HTMLInputElement;
  submit: HTMLButtonElement;
}
```

This is optional for the runtime but valuable for editor completion.

## 7. Integration Steps

1. Fix `TagsCache` shape caching.
2. Extract context creation from `element.js`.
3. Add descriptor-free `refs` fallback and duplicate diagnostics.
4. Replace `createEventDelegator` internals with a registry per event type.
5. Implement `createMutationWatcher`.
6. Inject `watch` into `mount` and `update`.
7. Add invalidation hooks for `replaceChildren` and `innerHTML`.
8. Refactor Rust `parse_and_emit` into testable methods.
9. Add scanner tests for refs, ids, classes, tags, compound, duplicate refs, and malformed HTML.
10. Add browser tests for `tags`, `refs`, `on`, and `watch`.
11. Update `usage.md` with all supported public usage.

## 8. Test Plan

JavaScript runtime tests:

- `tags.one()` returns an element and caches it.
- `tags.all()` returns an array and does not collide with `one()`.
- `tags.each()` iterates with stable indexes.
- Cache clears after `replaceChildren`.
- `refs` builds from descriptor.
- `refs` falls back to scanning `[ref]`.
- Duplicate refs warn in development.
- `on.click` delegates from child content to the matching ancestor.
- Multiple `on.click` bindings share one root listener.
- `on.click.once` removes itself after first fire.
- Custom signal abort removes only that binding.
- Lifecycle abort removes all bindings.
- `watch.attr` receives `(attr, next, prev, el)`.
- `watch.kids` receives arrays for added/removed nodes.
- `watch.kids({ deep: true })` sees descendant child changes.
- `watch.text` receives text changes.
- `watch.tree` receives raw records.
- `watch.*.once` removes only its registration.
- `watch` ignores queued mutations after lifecycle abort.

Rust tests:

- Parses refs, ids, class names, tag names, and compound selectors.
- Emits sorted deterministic JSON.
- Handles malformed fragments without panicking.
- Warns on duplicate refs.
- Rebuilds descriptors on HTML watcher events.
- Build mode copies source then emits descriptors.

## 9. Usage Documentation Requirements

`usage.md` must cover:

- `ui.element`
- `ui.container`
- `props` and `update`
- `refs`
- `tags.one`, `tags.all`, `tags.each`, `tags.clear`
- `on.event`, custom event names, `.once`, signals/options
- `watch.attr`, `watch.kids`, `watch.text`, `watch.tree`, `.once`, direct refs, custom signals/options
- `ui.schedule`, `ui.scheduleFrame`, `ui.yield`
- `ui.observe.resize`, `intersection`, `mutation`, `performance`
- `ui.transition`
- `ui.template`
- `native-tools` scan/build/dev behavior
- Escape hatches and when to use raw platform APIs

## 10. Non-Goals

- No runtime WASM DOM access. Rust stays in build/dev tooling.
- No virtual DOM.
- No framework-style global reactive auto-tracking in the UI runtime.
- No closed shadow roots.
- No cross-component DOM watching. Components communicate outward with composed `CustomEvent`s and downward through properties or methods.
