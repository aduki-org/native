# State — Router & Component State Management

**Scope:** Client-side routing state transfers and component-local reactive state.  
**Goal:** Deliver zero-dependency state synchronization using modern, native platform primitives.

---

## 1. Passing State Inside the Client-Side Router

In modern native applications, passing state during navigation is critical for coordinating layout transitions, passing temporary page data, and maintaining tab states.

Our client-side router leverages the browser's native **Navigation API** (Standard in HTML, Baseline Widely Available), falling back to the classic **History API** (`pushState`) in older environments.

### The Navigation API State Architecture

The native `navigation.navigate(url, options)` method supports two distinct ways to pass data during a transition:

```javascript
import { navigate } from 'core/router/index.js';

// Transition navigation
navigate('/posts/42', {
  state: { scrollPosition: 120, tab: 'comments' }, // Persistent State
  info: { animate: 'slide-left', source: 'cta-button' }   // Transient Info
});
```

#### A. Persistent Navigation State (`state`)

- **What it is:** A serializable object that is bound directly to the target history entry.
- **Persistence:** Saved in the browser's session history. If the user navigates away and presses the "Back" button, the state object is restored intact.
- **How to read it:** Available synchronously at any point via the current navigation entry:

  ```javascript
  const state = navigation.currentEntry.getState();
  console.log(state.tab); // 'comments'
  ```

#### B. Transient Navigation Info (`info`)

- **What it is:** An arbitrary, non-serializable JavaScript payload passed only to the immediate navigation transaction event handlers.
- **Persistence:** Exists only for the duration of the current transition event loop. It is never saved to the history history database.
- **Why it's superior:** Perfect for passing DOM elements, active callbacks, or UI animation instructions (e.g. telling the target page to slide left instead of fade) without cluttering the persistent history stack.
- **How to read it:** Intercepted inside the `navigate` event listener:

  ```javascript
  navigation.addEventListener('navigate', (e) => {
    if (e.info?.animate === 'slide-left') {
      // Execute high-speed slide transition
    }
  });
  ```

---

## 2. Legacy Browser Fallback (History API)

For older browsers that do not yet support the Navigation API, our routing facade automatically falls back to standard History manipulation:

### Passing State

```javascript
// Inside router history fallback wrapper
history.pushState({ scrollPosition: 120, tab: 'comments' }, '', '/posts/42');
```

### Reading State on Navigation (popstate)

When the user clicks back or forward, the state is retrieved from the `popstate` event:

```javascript
window.addEventListener('popstate', (e) => {
  const state = e.state; // { scrollPosition: 120, tab: 'comments' }
  console.log('Restored state:', state);
});
```

---

## 3. Component-Local Reactive State

Inside custom elements, state represents the internal reactive properties of the element that drive rendering, accessibility, and visual styling.

Instead of writing complex userland reactivity wrappers, we declare reactive properties inside the component specification. The library automatically bridges changes in state directly to **Custom State Pseudo-Classes** (`:state()`) via the browser's native `ElementInternals.states` API.

### Declarative Local State Spec

```javascript
ui.element('ui-button', {
  props: {
    loading: { type: Boolean, state: true }
  },
  
  mount({ el, internals }) {
    el.addEventListener('click', () => {
      // Setting el.loading automatically synchronizes with ElementInternals.states
      el.loading = true; 
    });
  }
});
```

### Class-Free CSS Styling via Pseudo-Classes

Because the factory automatically synchronizes `state: true` properties to `ElementInternals.states`, developers write CSS to style states cleanly using the native CSS `:state()` selector:

```css
/* src/elements/primitives/button.css */

/* No JS classList.toggle("loading") required! */
:host(:state(loading)) button {
  opacity: 0.6;
  pointer-events: none;
  cursor: wait;
}
```

This keeps the DOM light, fast, and secure, completely avoiding manual class-list manipulations and eliminating UI synchronization bugs.
