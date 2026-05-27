# UI Base Component and Scheduler Module Documentation

## Purpose and Architectural Position
The `ui` module (`src/core/ui/index.js`) supplies the structural base class (`BaseElement`) for all custom elements, and provides cooperative task scheduling algorithms to avoid main-thread freeze. It includes lazy template compilers, element transition drivers, and observer channels.

## Public API Surface with Examples

```javascript
import { ui, BaseElement } from 'lib/core/ui/index.js';

// 1. Defining a Custom Element Primitive
export class CustomAvatar extends BaseElement {
  static get template() {
    return `<div class="avatar"><slot></slot></div>`;
  }
  static get styles() {
    return `.avatar { border-radius: 50%; overflow: hidden; }`;
  }
}
ui.define('ui-avatar', CustomAvatar);

// 2. Cooperative Priority Task Scheduling
await ui.schedule(() => {
  renderComplexLayoutTree();
}, 'user-visible');

// Yield control to let browser render frames
await ui.yield();
```

## AbortSignal and Cleanup Contract
* **Observables**: Dynamic observers (Mutation, Resize, Intersection) return unregister disposers. Always trigger them when the custom element's `disconnectedCallback()` fires to prevent memory bloat.
* **Schedulers**: High-priority jobs run iteratively. Batch DOM manipulations within `scheduleFrame()` to merge paint passes seamlessly.

## Known Browser Gaps and Polyfill Strategy
* **Cooperative Schedulers**: Utilizes native `scheduler.postTask()` if available. Falls back to a custom task queue leveraging microtask micro-ticks, `requestAnimationFrame`, and `requestIdleCallback` structures to guarantee identical priorities ordering.
