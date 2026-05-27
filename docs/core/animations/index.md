# Web Animations (WAAPI) Engine Module Documentation

## Purpose and Architectural Position
The `animations` module (`src/core/animations/index.js`) supplies high-performance, GPU-accelerated motion controls. It orchestrates browser `element.animate()` transitions, registers reusable motion templates, schedules staggered sequential delays, and hooks up high-performance scroll/view-driven timelines.

## Public API Surface with Examples

```javascript
import { animations } from 'lib/core/animations/index.js';

// 1. Register Motion Template
animations.register('fade-in', [
  { opacity: 0, transform: 'translateY(10px)' },
  { opacity: 1, transform: 'translateY(0)' }
], { duration: 300, easing: 'ease-out' });

// 2. Play Template on Element
const anim = animations.animate(
  document.getElementById('card'),
  'fade-in',
  { delay: 100 }
);

// 3. Staggered Items Animation
const group = animations.stagger(
  document.querySelectorAll('li.row'),
  'fade-in',
  { staggerDelay: 50 }
);

// Stop group motion
group.cancel();
```

## AbortSignal and Cleanup Contract
* **Memory Leaks Protection**: Always supply an `AbortSignal` inside options (`{ signal: abortCtrl.signal }`). The engine automatically cancels active animations when aborted, releasing DOM node bindings and garbage collecting resources.
* **Staggers**: Return group handlers containing `.cancel()`, `.finish()`, and `.finished` Promises to allow coordinate transitions.

## Known Browser Gaps and Polyfill Strategy
* **Scroll/View Timelines**: Relies on modern standard `ScrollTimeline` and `ViewTimeline` APIs. In legacy browsers, the system falls back to requestAnimationFrame-driven scroll listeners to update animations manually.
