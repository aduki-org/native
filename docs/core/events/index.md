# Native Event Architecture Module Documentation

## Purpose and Architectural Position
The `events` module (`src/core/events/index.js`) supplies a performant event corridor. It provides a central `EventBus` for cross-component coordination, Shadow-DOM composed event delegation models to reduce listener memory footprint, and async once-trigger resolvers.

## Public API Surface with Examples

```javascript
import { events } from 'lib/core/events/index.js';

// 1. Central EventBus Subscriber
const dispose = events.on('user:logout', (event) => {
  console.log('Logged out user details:', event.detail);
});

// Dispatch event
events.emit('user:logout', { id: 45 });

// 2. High-Performance Event Delegation inside Shadow DOM
events.delegate(
  this.shadowRoot,
  'li.user-row',
  'click',
  (event, target) => {
    console.log('Clicked row user-id:', target.dataset.id);
  }
);

// 3. Await Event Once
await events.once(document.getElementById('dialog'), 'close');
console.log('Dialog has closed!');
```

## AbortSignal and Cleanup Contract
* **EventBus**: Always bind subscription lifetimes using an `AbortSignal` inside `events.on(type, fn, signal)` or invoke the returned disposer function upon lifecycle completions.
* **Delegation**: The returned disposer removes the delegated listener from the container element.

## Known Browser Gaps and Polyfill Strategy
* **Composed Event Path**: The delegation framework uses standard `.composedPath()` to resolve targeting across Shadow DOM boundaries seamlessly.
