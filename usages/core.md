# Integrating Core Architecture Modules

This guide demonstrates how to combine the platform's core networking, reactivity, eventing, and storage modules into a complete single-page application flow.

---

## 1. Unified Setup Flow

Below is a complete, cohesive example demonstrating how to initialize a reactive store, load remote database values from the network with automatic backoff retry, persist updates in IndexedDB, and broadcast updates across active browser tabs:

```javascript
import { api } from 'core/api';
import { state } from 'core/state';
import { events } from 'core/events';
import { storage } from 'core/storage';

// 1. Define initial state shape
const initialData = {
  user: null,
  theme: 'light',
  notifications: []
};

// 2. Instantiate fine-grained reactive store
const store = state.create(initialData);

// 3. Hydrate state from IndexedDB persistent storage tier
await state.storage.hydrate(store, 'app-profile');

// 4. Automatically persist state mutations inside IndexedDB
await state.storage.persist(store, {
  name: 'app-profile',
  keys: ['theme'] // Only persist the selected keys
});

// 5. Synchronize mutations instantly across active browser tabs
const disposeSync = state.sync(store, ['theme']);

// 6. Listen to theme change events to update visual styles
store.subscribe('theme', (newTheme) => {
  document.documentElement.setAttribute('data-theme', newTheme);
  console.log(`Visual theme switched to: ${newTheme}`);
});
```

---

## 2. Dynamic Fetch and Retry Operations

When synchronizing changes with remote web servers, use the `api` module to execute requests safely with pluggable retries and timeouts:

```javascript
import { api, retry, PlatformError } from 'core/api';

async function fetchUserProfile(userId) {
  // Execute request with exponential backoff retry for transient network anomalies
  try {
    const profile = await retry(async () => {
      return await api.get(`/api/users/${userId}`, {
        priority: 'user-visible',
        timeout: 5000 // 5 seconds timeout limit
      });
    }, { attempts: 3, delay: 1000, backoff: 'exponential' });

    // Update store state safely
    store.set('user', profile);
  } catch (error) {
    if (error instanceof PlatformError) {
      console.error(`Failed to load profile. Error code: ${error.code}, HTTP status: ${error.status}`);
    }
  }
}
```

---

## 3. Composed Event Listeners

Use the composed event pipeline to dispatch and delegate operations cleanly across Shadow DOM boundaries:

```javascript
import { events } from 'core/events';

// Dispatch global event on user state update
store.subscribe('user', (newUser) => {
  if (newUser) {
    events.emit('session:start', { userId: newUser.id });
  }
});

// Await a session event once
events.once(window, 'session:start').then((event) => {
  console.log('App session started for user:', event.detail.userId);
});
```
