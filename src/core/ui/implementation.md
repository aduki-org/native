# Native UI Implementation Checklist

This checklist is the execution companion to `plan.md`, `watch.md`, and `usage.md`.

Status after first implementation pass:

- Runtime helpers, lifecycle injection, `watch`, delegated `on.once`, refs fallback, tag cache shape fix, scanner refactor, scanner subcommands, and focused tests are implemented.
- Optional `index.tags.d.ts` output and broader test expansion are still future work.

## Phase 1: Runtime Helpers

Files:

- `src/core/ui/define/proxy.js`
- `src/core/ui/define/element.js`
- optional new `src/core/ui/define/context.js`

Tasks:

- Split `TagsCache` into separate `one` and `all` caches.
- Add `TagsCache.has(selector)` if desired.
- Add descriptor-free `refs` fallback scanning.
- Add duplicate-ref development warnings.
- Add context builder for `{ el, ctrl, tags, on, refs, watch, internals }`.
- Install cache invalidation for `replaceChildren` and `innerHTML`.
- Return stable context objects for mount/update.

Acceptance:

- `tags.one('button')` and `tags.all('button')` can be called in any order.
- `refs` works with and without `.tags.json`.
- Existing `ui.element` components continue to mount.

## Phase 2: Event Delegation

File:

- `src/core/ui/define/proxy.js`

Tasks:

- Replace per-binding root listeners with one root listener per event type.
- Store event registrations in sets keyed by event type.
- Support `on.click(selector, handler)`.
- Support `on.click(selector, handler, signal)`.
- Support `on.click(selector, handler, options)`.
- Support `on.click.once(selector, handler)`.
- Return disposer functions.
- Remove bindings on custom signal abort.
- Remove all bindings on component signal abort.

Acceptance:

- Dynamically added matching elements work without rebinding.
- Multiple click handlers do not create multiple native click listeners on the shadow root.
- `.once` fires once and removes only itself.

## Phase 3: `watch`

File:

- `src/core/ui/define/proxy.js` or new `src/core/ui/define/watch.js`

Tasks:

- Implement `createMutationWatcher(shadowRoot, defaultSignal)`.
- Support `watch.attr`, `watch.kids`, `watch.text`, `watch.tree`.
- Support `.once` on each method.
- Accept selector strings and direct element references.
- Accept custom `AbortSignal` or options object.
- Return disposer functions.
- Recompute observer options from active registrations.
- Dispatch reshaped handler arguments.
- Guard callbacks after lifecycle abort.

Acceptance:

- One `MutationObserver` exists per component instance.
- Attribute, child, text, and tree handlers receive documented arguments.
- Component disconnect clears all registrations.

## Phase 4: Lifecycle Injection

File:

- `src/core/ui/define/element.js`

Tasks:

- Use the context builder after template/style hydration.
- Pass `watch` to `spec.mount`.
- Pass `watch` and `prev` to `spec.update`.
- Preserve `internals` behavior for form-associated elements.
- Keep `spec.unmount` shape stable.

Acceptance:

- Existing components using `{ tags, on, refs }` still work.
- New components can destructure `{ watch }`.
- Updates receive `prev` consistently.

## Phase 5: Rust Scanner

Files:

- `tools/src/extract/html.rs`
- `tools/src/extract/runner.rs`
- `tools/src/watcher/runner.rs`
- `tools/src/main.rs`

Tasks:

- Refactor scanner into `parse_html`, `parse_file`, `emit_descriptor`, and `parse_and_emit`.
- Return `Result` instead of silently swallowing errors.
- Add descriptor `version`.
- Add duplicate-ref diagnostics.
- Keep sorted deterministic output.
- Consider `attrs` and `refTypes` fields.
- Add subcommands or document current flags until subcommands land.
- Regenerate descriptors on HTML watcher events.
- Remove stale descriptors when source HTML is deleted.

Acceptance:

- Build mode emits descriptors for all HTML templates.
- Dev watcher regenerates a changed template descriptor.
- Malformed HTML fragments do not panic.

## Phase 6: Tests

JavaScript tests:

- `tags` cache shapes and invalidation.
- `refs` descriptor and fallback behavior.
- `on` delegation, custom events, once, signal cleanup.
- `watch` attr/kids/text/tree, once, direct refs, selector misses, lifecycle abort.

Rust tests:

- Descriptor parsing.
- Stable JSON ordering.
- Duplicate refs.
- Watcher-triggered regeneration.

## Phase 7: Documentation

Files:

- `src/core/ui/plan.md`
- `src/core/ui/watch.md`
- `src/core/ui/usage.md`
- `src/core/ui/implementation.md`

Tasks:

- Keep `plan.md` as the architectural implementation plan.
- Keep `watch.md` as the `watch` API and internals spec.
- Keep `usage.md` as the public usage guide.
- Keep this file as the execution checklist.

## Done Definition

The work is complete when:

- Runtime injects `refs`, `tags`, `on`, and `watch`.
- All helpers clean up from `ctrl.signal`.
- Rust emits descriptors deterministically.
- Dev watcher keeps descriptors current.
- Usage docs cover every public call shape.
- Tests prove lifecycle cleanup and cache correctness.
