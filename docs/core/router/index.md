# Client-Side Routing Module Documentation

## Purpose and Architectural Position
The `router` module (`src/core/router/index.js`) coordinates single-page application navigation. It mounts global event interceptors on native anchor clicks and form actions, matches URL paths against registered route tables, evaluates security guards, and renders layouts inside router outlets.

## Public API Surface with Examples

```javascript
import { router } from 'lib/core/router/index.js';

// 1. Register Route Pattern Handlers
router.on('/dashboard', () => {
  router.render(document.getElementById('app'), '<ui-text>Welcome!</ui-text>');
});

router.on('/users/:id', (params) => {
  console.log('Rendering profile for user:', params.id);
});

// 2. Add Security Guards
router.guard((to) => {
  if (to.pathname.startsWith('/admin') && !hasAdminSession()) {
    return '/login'; // Redirect unmatched sessions
  }
  return true;
});

// 3. Programmatic Navigation
await router.navigate('/dashboard', { history: 'push' });
```

## AbortSignal and Cleanup Contract
* **Navigation Handlers**: Navigation listeners bind globally. Use explicit route unregisters if dynamically altering route structures at runtime.
* **Guards**: Interceptors evaluate in-order asynchronously. All guard blocks must resolve or reject to prevent page lockups.

## Known Browser Gaps and Polyfill Strategy
* **URLPattern API**: Relies on modern standard matching syntax. For older engines, the matcher falls back to regular expressions or string token substitutions.
