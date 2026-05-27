# Declarative Route-Coupling & Fluent Navigation Transition Architecture

This plan establishes a new native routing paradigm where route patterns and target rendering containers are declared **directly inside the element’s UI metadata**, fully automating mounts and state injection. It also details the new fluent navigation controller (`nav`) for fine-grained programmatic transitions.

---

## 1. Architectural Philosophy

The goal is to eliminate layout boilerplate entirely. Instead of layout shells listening to event streams and matching routes, **components declare where they belong in the URL space**. The platform orchestrates the mounting, property injection, and cleanup:

```
                      +-------------------+
                      |   Router Engine   |
                      +---------+---------+
                                |  (on matching route)
                                v
                      +-------------------+
                      | Platform Router  |
                      |   Orchestrator    |
                      +---------+---------+
                                |  (resolves target container)
                                v
                 +--------------+--------------+
                 |                             |
                 v                             v
       [ Mount new instance ]         [ Update active instance ]
       - document.createElement       - Reactive diffing
       - Map dynamic URL props        - Sync dynamic props
       - Render in spec.container     - Run update() cycles
```

---

## 2. Declarative customElements Route & Container Definition

Custom page elements declare their `url` patterns and their target `container` selector inside their `ui.element(...)` specifications:

```javascript
import { ui } from '@adukiorg/native/ui';

ui.element('user-profile-page', {
  url: '/users/:id',         // Automatically registered with the match engine
  container: '#main-content', // Automatically mounted here on match
  props: {
    id: { type: String, reflect: true }
  },
  mount({ el, ctrl }) {
    // Automatically receives prop 'id' mapped from route parameter :id!
    console.log('UserProfilePage mounted for user id:', el.id);
  }
}, import.meta.url);
```

---

## 3. Platform Router Orchestrator Integration

### Hooking into `ui.element`

When `ui.element(tag, spec, base)` is called:

1. If `spec.url` is declared, the framework automatically invokes `router.register(spec.url, tag, spec.meta)`.
2. It caches the element's target `container` configuration in an internal metadata registry.

### Automatic Mount & Diffing Orchestration

The platform binds a global, lightweight route listener underneath:

```javascript
router.on('found', ({ tag, params }) => {
  const spec = getElementSpec(tag);
  if (!spec || !spec.container) return;

  const containerEl = document.querySelector(spec.container);
  if (!containerEl) {
    console.warn(`Target container "${spec.container}" not found in DOM for element <${tag}>`);
    return;
  }

  // Layout-preserving diffing: Sync if already mounted
  const currentChild = containerEl.querySelector('.page-content');
  if (currentChild && currentChild.tagName.toLowerCase() === tag.toLowerCase()) {
    for (const [key, value] of Object.entries(params)) {
      currentChild[key] = value;
    }
    return;
  }

  // Mount new page component
  const pageEl = document.createElement(tag);
  pageEl.classList.add('page-content');
  for (const [key, value] of Object.entries(params)) {
    pageEl[key] = value;
  }

  containerEl.replaceChildren(pageEl);
});
```

---

## 4. Fluent Programmatic Transition Controller (`nav`)

To afford developers absolute, fine-grained control over specific transitions, the router exposes a fluent navigation manager `nav` offering chainable transition handlers:

```javascript
import { nav } from '@adukiorg/native/router';

// Fluent transition chains
nav.to('/users/42')
  .on('found', ({ tag, params }) => {
    console.log(`Successfully navigated and resolved element <${tag}> with params:`, params);
  })
  .on('notfound', ({ url }) => {
    console.error(`Route path not registered: ${url}`);
  })
  .on('error', (err) => {
    console.error('Transition failed or guard rejected:', err);
  });
```

### Implementing Fluent Navigation under the Hood

`nav.to(url, options)` initiates standard navigation and returns a `TransitionController` instance:

```javascript
class TransitionController {
  constructor(navigationPromise) {
    this.promise = navigationPromise;
    this.listeners = {
      found: [],
      notfound: [],
      error: []
    };

    // Auto-resolve underlying promise and dispatch to callbacks
    this.promise
      .then(async () => {
        const match = await router.match(url);
        if (match) {
          this._dispatch('found', { tag: match.tag, params: match.params });
        } else {
          this._dispatch('notfound', { url });
        }
      })
      .catch((err) => {
        this._dispatch('error', err);
      });
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return this; // Enable fluent chaining
  }

  _dispatch(event, payload) {
    for (const cb of this.listeners[event]) {
      try {
        cb(payload);
      } catch (err) {
        console.error('Transition handler failed:', err);
      }
    }
  }
}
```

---

## 5. Verification Plan

### Automated Test Cases

* Define test declarative elements with `url` and `container` attributes, assert they automatically register on compilation.
* Trigger programmatic navigations and verify the elements render inside their designated target DOM container with dynamic parameters mapped to properties.
* Assert transition chaining on `nav.to(...)` triggers correct callback loops for success, error, and missing paths.
