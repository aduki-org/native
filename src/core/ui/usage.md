# Native UI Usage Guide

The Native UI layer defines Custom Elements with Shadow DOM, lifecycle-safe helpers, direct DOM rendering, and Rust-assisted template scanning.

Status: this guide documents the implemented public UI contract: `ui.element`, `ui.container`, `refs`, `tags`, delegated `on`, `on.*.once`, `watch`, scheduling, observers, templates, transitions, and Rust template scanning.

Import from the UI entry point:

```javascript
import { ui } from '@adukiorg/native/ui';
```

## 1. `ui.element`

Use `ui.element` for normal components, pages, and primitives.

```javascript
ui.element('ui-button', {
  template: './index.html',
  style: './style.css',

  props: {
    disabled: { type: Boolean, default: false, state: true },
    variant: { type: String, default: 'primary' },
    clicks: { type: Number, default: 0 }
  },

  mount({ el, ctrl, tags, on, refs, watch, internals }) {
    refs.button.disabled = el.disabled;

    on.click('button', (event, button) => {
      if (el.disabled) return;
      el.clicks++;
      el.dispatchEvent(new CustomEvent('activate', {
        bubbles: true,
        composed: true,
        detail: { clicks: el.clicks }
      }));
    });

    watch.attr(refs.button, 'disabled', (attr, next) => {
      el.toggleAttribute('disabled', next !== null);
    });
  },

  update({ el, name, val, prev, tags, refs }) {
    if (name === 'disabled') {
      refs.button.disabled = Boolean(val);
    }
  }
}, import.meta.url);
```

Always pass `import.meta.url` as the third argument when `template` or `style` is a relative file path.

## 2. Templates and Refs

Component files usually live together:

```text
src/elements/primitives/button/
  index.js
  index.html
  style.css
```

Template:

```html
<button ref="button" id="button" class="btn" type="button">
  <slot></slot>
</button>
<span ref="status" class="status"></span>
```

Use `ref="name"` for stable anchors that component code needs often.

```javascript
mount({ refs }) {
  refs.button.focus();
  refs.status.textContent = 'Ready';
}
```

Rules:

- `refs.name` is O(1) after mount.
- Missing refs return `undefined`.
- Refs are for stable template anchors, not dynamic repeated list items.
- Duplicate refs should be treated as a bug.

## 3. `tags`

`tags` is a cached selector helper scoped to the component shadow root.

```javascript
mount({ tags }) {
  const form = tags.one('form');
  const links = tags.all('a.link');

  tags.each('[data-item]', (item, index) => {
    item.dataset.index = String(index);
  });
}
```

Methods:

```javascript
tags.one(selector)       // Element | null
tags.all(selector)       // Element[]
tags.each(selector, fn)  // void
tags.clear()             // clear cached selector results
```

Use `refs` for named stable anchors and `tags` for selector-based access. Avoid raw `shadowRoot.querySelector` in component code.

## 4. `on`

`on` binds delegated events to the component shadow root and cleans up with `ctrl.signal`.

```javascript
mount({ on }) {
  on.click('button', (event, button) => {
    button.classList.add('active');
  });

  on.input('input[type="search"]', (event, input) => {
    filter(input.value);
  });

  on.submit('form', (event, form) => {
    event.preventDefault();
    save(new FormData(form));
  });

  on['nav:change']('[data-tab]', (event, tab) => {
    activate(tab.dataset.tab);
  });
}
```

Supported call shapes:

```javascript
on.click(selector, handler)
on.click(selector, handler, ctrl.signal)
on.click(selector, handler, { signal: ctrl.signal, passive: true })
on.click.once(selector, handler)
```

Handler:

```javascript
(event, matchedElement) => void
```

Use raw `addEventListener` only for events that cannot be delegated cleanly:

```javascript
refs.scroller.addEventListener('scroll', handleScroll, { signal: ctrl.signal });
```

## 5. `watch`

`watch` observes DOM mutations inside the component shadow root.

### Attributes

```javascript
watch.attr('button', 'disabled', (attr, next, prev, button) => {})
watch.attr('.card', ['aria-expanded', 'data-state'], handler)
watch.attr('.card', '*', handler)
watch.attr(refs.button, 'disabled', handler)
watch.attr.once('details', 'open', handler)
```

### Children

```javascript
watch.kids('ul', ({ added, removed }, list) => {})
watch.kids(refs.list, handler)
watch.kids('ul', { deep: true }, handler)
watch.kids.once('ul', handler)
```

### Text

```javascript
watch.text('.counter', (next, prev, el) => {})
watch.text(refs.status, handler)
watch.text.once('.status', handler)
```

### Full Subtree

```javascript
watch.tree('.editor', (records, editor) => {})
watch.tree(refs.editor, handler)
watch.tree.once('.editor', handler)
```

All `watch` methods accept a selector or direct element reference, return a disposer, and use `ctrl.signal` by default.

```javascript
const stop = watch.attr(refs.button, 'aria-pressed', handler);
stop();
```

Use `slotchange` for slotted light DOM content. `watch` only observes the component shadow root.

## 6. `ui.container`

Use `ui.container` for router-owned layout slots.

```javascript
ui.container('ui-main', {
  template: './index.html',
  style: './style.css',

  mount({ el, refs, on }) {
    on.click('[data-close]', () => {
      el.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    });
  }
}, import.meta.url);
```

Containers inherit the same `refs`, `tags`, `on`, and `watch` helpers as elements. They additionally register with the router and receive `swapView(newElement, options)` for route transitions.

## 7. Props and Updates

Props map attributes to typed element properties.

```javascript
props: {
  open: { type: Boolean, default: false, state: true },
  count: { type: Number, default: 0 },
  label: { type: String, default: 'Untitled' }
}
```

Types:

- `Boolean`: present attribute means `true`; missing means `false`.
- `Number`: attribute string is cast with `Number(...)`.
- `String`: attribute string is used as-is.

Updates are batched to a frame:

```javascript
update({ name, val, prev, refs }) {
  if (name === 'open') {
    refs.panel.hidden = !val;
  }
}
```

## 8. Form-Associated Elements

When `form: true` is set, the runtime attaches `ElementInternals` and passes it as `internals`.

```javascript
ui.element('ui-field', {
  form: true,
  template: './index.html',
  style: './style.css',

  mount({ refs, internals, on }) {
    on.input('input', (event, input) => {
      internals.setFormValue(input.value);
    });
  }
}, import.meta.url);
```

## 9. Scheduling

Use scheduler helpers for non-trivial work.

```javascript
await ui.schedule(() => {
  renderSecondaryPanel();
});

await ui.scheduleFrame(() => {
  refs.panel.hidden = false;
});

for (let i = 0; i < items.length; i++) {
  renderItem(items[i]);
  if (i % 50 === 0) await ui.yield();
}
```

Exports:

```javascript
ui.schedule(fn, priority?)
ui.scheduleFrame(fn)
ui.yield()
```

Priorities:

```javascript
'user-blocking'
'user-visible'
'background'
```

## 10. Observers

`ui.observe` exposes raw observer wrappers with AbortSignal cleanup.

```javascript
const stopResize = ui.observe.resize(refs.panel, entries => {}, ctrl.signal);
const stopVisible = ui.observe.intersection(refs.sentinel, entries => {}, ctrl.signal);
const stopMutation = ui.observe.mutation(refs.list, records => {}, ctrl.signal, {
  childList: true
});
const stopPerf = ui.observe.performance(['longtask'], list => {}, ctrl.signal);
```

Prefer injected `watch` for component shadow-root mutations. Use `ui.observe.*` for lower-level platform observer access.

## 11. Transitions

`ui.transition` wraps View Transitions and respects reduced-motion preferences.

```javascript
await ui.transition(() => {
  refs.panel.replaceChildren(nextView);
});
```

Use it for visible DOM state swaps that benefit from native View Transitions. For router containers, prefer `swapView`.

## 12. Template Helper

`ui.template` creates cached tagged template fragments.

```javascript
const row = ui.template`
  <li class="row">
    <span class="label"></span>
  </li>
`;

refs.list.appendChild(row);
```

Dynamic data should be assigned through DOM APIs after cloning:

```javascript
const item = ui.template`<li><span ref="label"></span></li>`;
item.querySelector('span').textContent = label;
```

## 13. Rust Template Scanning

The Rust tool scans component HTML and emits `.tags.json` descriptors used by the runtime.

Supported commands:

```bash
native-tools --src src --build
native-tools --src src --port 3000
native-tools scan --src src
native-tools scan --src src --watch
native-tools build --src src --dist dist
native-tools dev --src src --port 3000
```

Generated descriptor:

```json
{
  "refs": ["button", "status"],
  "ids": ["button"],
  "classes": ["btn", "status"],
  "tags": ["button", "span"],
  "compound": ["button.btn", "span.status"]
}
```

## 14. Typing Components

The package exports strict TypeScript declarations for `@adukiorg/native/ui`.

```javascript
// @ts-check
import { ui } from '@adukiorg/native/ui';

const props = {
  count: { type: Number, default: 0 },
  open: { type: Boolean, default: false }
};

/** @typedef {{ button: HTMLButtonElement }} Refs */

ui.element('ui-counter', {
  props,

  /** @param {import('@adukiorg/native/ui').MountContext<typeof props, Refs>} ctx */
  mount({ refs, on }) {
    refs.button.disabled = false;
    on.click('button', (_event, button) => {
      button.disabled = true;
    });
  },

  /** @param {import('@adukiorg/native/ui').UpdateContext<typeof props, Refs>} ctx */
  update(ctx) {
    if (ctx.name === 'count') {
      ctx.val.toFixed();
    }
  }
}, import.meta.url);
```

For full typing details, see `src/core/ui/ui.types.md`.

## 15. Escape Hatches

Use platform APIs directly when they are clearer or when delegation is impossible:

```javascript
refs.input.focus();
refs.dialog.showModal();
refs.video.play();
refs.scroller.addEventListener('scroll', onScroll, { signal: ctrl.signal });
```

Rules:

- Always pass `ctrl.signal` to listeners, fetches, and cancellable tasks.
- Use `textContent`, properties, attributes, and class lists for dynamic data.
- Avoid `innerHTML` for dynamic content.
- Dispatch outward with `new CustomEvent(type, { bubbles: true, composed: true, detail })`.

---

## 16. Performance & Memory Optimizations

The `@adukiorg/native` runtime contains advanced optimizations to achieve near-zero visual overhead:

### 16.1. Single-Allocation Symbol Backing Store
Rather than invoking expensive `getAttribute` queries or mapping string properties dynamically, the component runtime caches reflected attributes exactly once using internal `Symbol`-keyed backing fields on the prototype during construction. This prevents layout invalidation flushes when reading or writing component properties.

### 16.2. Visual vs. Non-Visual State Microtask Batching
Properties are batched dynamically before rendering:
- **Non-Visual / ARIA States**: Attributes like `aria-expanded` and custom non-visual properties are scheduled using `queueMicrotask` to instantly apply updates without waiting for the next 16.7ms animation frame tick.
- **Visual Changes**: Traditional visual layout changes continue to use `requestAnimationFrame` for stutter-free paints.

### 16.3. Constructable Stylesheet HMR Memory Leak Protection
Constructable CSS hot swaps use a centralized global map of active HMR style listeners instead of binding listeners to individual elements. This prevents stylesheet memory leaks during iterative saves.

### 16.4. Synchronous Connection Check (First Paint)
In `connectedCallback`, the element checks if its HTML template/CSS styles are already cached or inlined. If so, it mounts and paints **synchronously** to avoid microtask delays, resulting in instantaneous first paints.

### 16.5. Scroll-Blocking Passive Delegator
Delegated event listeners created with `on` are registered with `passive: true` by default. The delegator automatically upgrades the listener to `passive: false` only if the event explicitly calls `preventDefault()`, guaranteeing smooth browser scrolling.

### 16.6. Target-Specific MutationObservers & Scopes
Scoped MutationObservers created with `watch` are bound to target elements with `{ subtree: false }` unless deep structural queries are explicitly requested, minimizing browser tree traversal overhead.

### 16.7. Non-Disruptive Cache Invalidation
Instead of overriding `replaceChildren` and `innerHTML` via prototype monkey-patching, `TagsCache` dynamically registers a lightweight childList MutationObserver on the shadowRoot to cleanly invalidate query caches when child nodes change.

### 16.8. Single-Pass Ref Extraction
Dynamic ref extraction falls back to a single-pass `querySelectorAll('[ref]')` selection, reducing tree lookup complexity from $O(\text{refs} \times \text{DOM Size})$ to $O(\text{DOM Size})$.

---

## 17. Checklist

- Use `ui.element` for components and pages.
- Use `ui.container` only for router-owned layout slots.
- Keep each component's `index.js`, `index.html`, and `style.css` together.
- Pass `import.meta.url` for relative assets.
- Prefer `refs` for stable anchors.
- Prefer `tags` over `querySelector`.
- Prefer `on` over repeated `addEventListener`.
- Prefer `watch` over raw `MutationObserver` inside shadow roots.
- Use scheduler helpers for heavy or deferred rendering.
- Keep cleanup tied to `ctrl.signal`.
